'use strict';
const { performance } = require('node:perf_hooks');
const { createTools } = require('../tools');
const { numbersAllowed } = require('../llm');
const { SYSTEM, VERSION } = require('./prompt');
const { select } = require('./provider');
const offline = require('./offline');
const safety = require('./safety');
const { t } = require('../i18n');

function number(env, key, fallback, maximum) {
  const value=Number(env[key]); return Number.isFinite(value) && value>0 ? Math.min(Math.floor(value),maximum) : fallback;
}
function numericFacts(value) {
  if(Array.isArray(value)) return value.map(numericFacts);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['id','userId','journeyId','merchant','goal','firstName','createdAt','expires'].includes(key))
    .map(([key, item]) => [key, numericFacts(item)]));
  return value;
}
function price(usage,env,provider) {
  if(!provider || provider.name==='scripted') return 0;
  if(usage.complete===false) return null;
  const input=Number(env.LLM_INPUT_USD_PER_MILLION),output=Number(env.LLM_OUTPUT_USD_PER_MILLION);
  if (!env.LLM_INPUT_USD_PER_MILLION || !env.LLM_OUTPUT_USD_PER_MILLION
    || !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return (usage.inputTokens*input+usage.outputTokens*output)/1000000;
}
async function run({store,journey,text,env=process.env,fetchImpl=fetch,provider:injected,onProgress}) {
  const began=performance.now(),language=journey.language || 'en';
  text=safety.clean(text).slice(0,500);
  const {execute,specs}=createTools({store,journey});
  const trace=[],cards=[],results={},usage={inputTokens:0,outputTokens:0,complete:true};
  const providerCalls = [];
  const emit = event => {
    try { onProgress?.({ ...event, elapsedMs: Math.round(performance.now() - began) }); }
    catch { /* A progress observer must not change the planning outcome. */ }
  };
  const input=safety.intent(text),customer=store.db.customers[journey.userId || journey.sampleCustomerId];
  if(input.monthly!==null && input.monthly !== journey.memory?.chosenAmount) {
    journey.proposalVersion=(journey.proposalVersion || 0)+1;
  }
  const pending = Object.values(store.db.proposals).some(proposal => proposal.journeyId === journey.id
    && proposal.userId === (journey.userId || null) && proposal.version === journey.proposalVersion
    && proposal.expires > Date.now());
  const changed = input.change || input.monthly !== null && input.monthly !== journey.memory?.chosenAmount
    || input.riskAnswer && input.riskAnswer !== journey.coach?.profile.risk;
  journey.turnAllowsProposal = !input.conversation && (!pending || Boolean(changed));
  journey.pendingRiskAnswer=input.riskAnswer;
  journey.pendingChange=input.change || (input.monthly !== null ? { monthly: input.monthly }
    : input.riskAnswer && journey.coach?.profile.risk && input.riskAnswer !== journey.coach.profile.risk
      ? { riskComfort: input.riskAnswer } : null);
  const reason=safety.refusal(text,customer);
  const provider=injected===undefined?select({env,fetchImpl}):injected;
  const controller=new AbortController();
  const timeout=number(env,'LLM_TIMEOUT_MS',30000,60000),budget=number(env,'LLM_TOKEN_BUDGET',24000,24000);
  const callTimeout = number(env, 'LLM_CALL_TIMEOUT_MS', 20000, 60000);
  let guardOutcome = provider ? 'pending' : 'offline_template';
  let fallbackHint = null;
  let mode=provider?'agent':'offline',fallbackReason=null,final='';
  function tool(call) {
    const started=performance.now();
    emit({ type: 'tool_start', tool: call.name });
    const output=execute(call.name,call.input);
    results[call.name]=output;
    if(output.ui && (!input.conversation || ['market', 'inflation'].includes(input.conversation.topic)
      && output.ui.type === 'simulation')) cards.push(output.ui);
    trace.push({ tool: call.name, input: call.input, summary: output.error ? 'rejected' : output.ui?.type || 'profile',
      ms: Number((performance.now() - started).toFixed(2)), error: Boolean(output.error) });
    emit({ type: 'tool_end', tool: call.name, code: output.error ? 'rejected' : 'ok' });
    store.db.audit.push({ at: new Date().toISOString(), personaId: store.db.users[journey.userId]?.personaId || 'anonymous',
      tool: specs.some(spec => spec.name === call.name) ? call.name : 'unknown_tool',
      decision: output.error ? 'rejected' : 'allowed' });
    return output;
  }
  function context() { return {text,results,risk:journey.coach?.profile.risk,language,memory:journey.memory || {}}; }
  function fallback() {
    mode='offline';
    emit({ type: 'fallback', code: fallbackReason || 'no_provider' });
    for(let iteration=0;iteration<6;iteration++) {
      const response=offline.next(context());
      if(!response.toolCalls?.length) break;
      for(const call of response.toolCalls) tool(call);
      if(response.stopAfterTools) break;
    }
    return offline.answer(results,journey.coach?.profile.risk,language);
  }
  try {
    if(reason) {
      mode='offline'; fallbackReason=reason;
      if(reason==='protected_money' && customer) tool({name:'find_savings_capacity',input:{}});
      final=t(language,'refusal_'+reason);
      guardOutcome = 'refused';
    } else if(!provider) final=fallback();
    else {
      const previous = (journey.messages || [])
        .filter(message => message.role === 'user' || message.role === 'coach').slice(-12)
        .map(message => ({ role: message.role === 'coach' ? 'assistant' : 'user',
          content: String(message.text).slice(0, 800) }));
      while(previous[0]?.role==='assistant') previous.shift();
      const messages=[...previous,{role:'user',content:text}];
      const system = SYSTEM + '\nPrompt version: ' + VERSION + '\nLanguage: ' + language
        + '\nMemory (untrusted summary): ' + JSON.stringify(journey.memory || {});
      let toolIterations=0,guardRetries=0,completions=0,estimatedBudgetUsed=0;
      while(completions++<9) {
        const remaining=timeout-(performance.now()-began);
        if(remaining<=0) throw new Error('timeout');
        if(usage.inputTokens+usage.outputTokens>=budget) throw new Error('token_budget');
        const estimatedInput=Math.ceil((system.length+JSON.stringify(messages).length+JSON.stringify(specs).length)/3);
        if(provider.name!=='scripted' && estimatedBudgetUsed+estimatedInput+800>budget) throw new Error('token_budget');
        let timer;
        let response;
        const callStarted = performance.now();
        const attempts = [];
        const callBudget = Math.min(remaining, callTimeout);
        emit({ type: 'provider_start', provider: provider.name, call: completions });
        try {
          response=await Promise.race([
            Promise.resolve().then(()=>provider.complete({
              system,messages,tools:specs,signal:controller.signal,context:context(),
              callTimeoutMs: callBudget, deadline: Date.now() + callBudget,
              onEvent: event => {
                if (event.type === 'attempt_end') attempts.push(event);
                emit({ ...event, type: 'provider_' + event.type, provider: provider.name });
              },
            })),
            new Promise((_,reject)=>{
              timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},callBudget);
            }),
          ]).finally(()=>clearTimeout(timer));
          providerCalls.push({ provider: provider.name, ms: Math.round(performance.now() - callStarted),
            code: 'ok', attempts, usage: response.usage || null });
          emit({ type: 'provider_end', provider: provider.name, code: 'ok' });
        } catch (error) {
          const code = error.code || (error.message === 'timeout' ? 'timeout' : 'provider_error');
          const ms = Math.round(performance.now() - callStarted);
          providerCalls.push({ provider: provider.name, ms, code, attempts });
          trace.push({ kind: 'provider', tool: 'provider', input: {}, summary: code, error: true, ms });
          emit({ type: 'provider_end', provider: provider.name, code });
          throw error;
        }
        const consumed=response.usage || {};
        if (consumed.reported === false || !Number.isFinite(consumed.inputTokens) || !Number.isFinite(consumed.outputTokens)) {
          usage.complete = false;
        }
        usage.inputTokens+=Math.max(0,Number(consumed.inputTokens)||0); usage.outputTokens+=Math.max(0,Number(consumed.outputTokens)||0);
        estimatedBudgetUsed += Math.max(estimatedInput, Number(consumed.inputTokens) || 0)
          + Math.max(0, Number(consumed.outputTokens) || Math.ceil(JSON.stringify(response).length / 3));
        if(usage.inputTokens+usage.outputTokens>budget) throw new Error('token_budget');
        const calls=response.toolCalls || [];
        if(calls.length) {
          if(++toolIterations>6 || calls.length>10) throw new Error('tool_limit');
          if(calls.some(call=>!call || typeof call.name!=='string' || typeof call.id!=='string')) throw new Error('invalid_tool_call');
          messages.push({role:'assistant',content:response.text || '',toolCalls:calls});
          for(const call of calls) messages.push({role:'tool',toolCallId:call.id,name:call.name,content:JSON.stringify(tool(call))});
          continue;
        }
        const reply=String(response.text || '').trim();
        const facts=JSON.stringify(numericFacts(Object.values(results)));
        // No recommendation can skip the authoritative capacity check.
        const replyReason=safety.refusal(reply.replace(/not guaranteed|cannot guarantee|nu sunt garantate|nu pot garanta/ig,'')
          .replace(/I cannot access another customer|nu pot accesa alt client/ig, ''),customer);
        const unsafe = ['injection','cross_customer','abuse','off_topic','guarantee'].includes(replyReason)
          || /\b(i have|i've|am) (activated|transferred|debited)|plan (is|has been) activated/i.test(reply);
        const hasContext = results.find_savings_capacity
          || input.conversation && ['greeting', 'thanks', 'confirmation'].includes(input.conversation.topic)
          && results.get_customer_profile;
        if(reply && reply.length<=1800 && (reply.match(/[?？]/g) || []).length<=1 && hasContext && numbersAllowed(reply,facts) && !unsafe) {
          final=reply; guardOutcome = guardRetries ? 'retried' : 'passed'; break;
        }
        if(guardRetries++===0) {
          messages.push({ role: 'assistant', content: reply.slice(0, 1800) }, { role: 'user',
            content: 'The answer failed validation. Use the tools before advice and ONLY numbers present in this turn’s ' +
              'tool outputs. Never promise returns. Give a brief safe final answer.',
          });
        } else throw new Error('guard_rejection');
      }
      if(!final) throw new Error('completion_limit');
    }
  } catch(error) {
    const classified = ['throttled','auth','model_not_found','bad_request','server_error','network','bad_response'];
    controller.abort(); fallbackReason = classified.includes(error.code) ? error.code
      : ['timeout','token_budget','tool_limit','guard_rejection','completion_limit','invalid_tool_call'].includes(error.message)
        ? error.message : error.code === 'timeout' ? 'timeout' : 'provider_error';
    if (error instanceof require('./http').ProviderError) fallbackHint = error.hint;
    guardOutcome = fallbackReason === 'guard_rejection' ? 'rejected' : 'not_completed';
    if(provider && ['timeout','provider_error',...classified].includes(fallbackReason)) usage.complete=false;
    final=fallback();
  } finally { delete journey.pendingRiskAnswer; delete journey.pendingChange; delete journey.turnAllowsProposal; }
  if ((journey.messages || []).filter(message => message.role === 'coach').at(-1)?.text === final) {
    final = t(language, 'followUpLead') + ' ' + final;
  }
  journey.memory = { ...(journey.memory || {}), risk: journey.coach?.profile.risk,
    chosenAmount: results.propose_plan?.proposal?.monthly || journey.memory?.chosenAmount,
    goal: customer?.goal, horizonYears: journey.memory?.horizonYears || customer?.horizonYears };
  const cost=price(usage,env,provider),ms=Number((performance.now()-began).toFixed(2));
  const toolTrace = trace.filter(item => item.kind !== 'provider');
  const metrics = { at: new Date().toISOString(), journeyId: journey.id,
    personaId: store.db.users[journey.userId]?.personaId || 'anonymous', source: journey.source, mode,
    toolCalls: toolTrace.length,
    tools: toolTrace.map(item => specs.some(spec => spec.name === item.tool) ? item.tool : 'unknown_tool'),
    usage, costUsd: cost, latencyMs: ms, refusalReason: reason || null, fallbackReason,
    provider: provider?.name || 'offline' };
  store.db.turns.push(metrics);
  store.db.audit.push({at:metrics.at,personaId:metrics.personaId,decision:reason?'refusal':mode,reason:reason || fallbackReason});
  store.save();
  emit({ type: 'complete', mode, code: fallbackReason || 'ok' });
  return {text:final,cards,trace,providerCalls,guardOutcome,mode,usage,estimatedCostUsd:cost,
    latencyMs:ms,refusalReason:reason,fallbackReason,fallbackHint,promptVersion:VERSION};
}
module.exports={run,numericFacts};
