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
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([key])=>!['id','userId','journeyId','merchant','goal','firstName','createdAt','expires'].includes(key)).map(([key,item])=>[key,numericFacts(item)]));
  return value;
}
function price(usage,env,provider) {
  if(!provider || provider.name==='scripted') return 0;
  const input=Number(env.LLM_INPUT_USD_PER_MILLION),output=Number(env.LLM_OUTPUT_USD_PER_MILLION);
  if(!env.LLM_INPUT_USD_PER_MILLION || !env.LLM_OUTPUT_USD_PER_MILLION || !Number.isFinite(input) || !Number.isFinite(output) || input<0 || output<0) return null;
  return (usage.inputTokens*input+usage.outputTokens*output)/1000000;
}
async function run({store,journey,text,env=process.env,fetchImpl=fetch,provider:injected}) {
  const began=performance.now(),language=journey.language || 'en';
  text=safety.clean(text).slice(0,500);
  const {execute,specs}=createTools({store,journey});
  const trace=[],cards=[],results={},usage={inputTokens:0,outputTokens:0};
  const input=safety.intent(text),customer=store.db.customers[journey.userId];
  journey.pendingRiskAnswer=input.riskAnswer;
  journey.pendingChange=input.change;
  const reason=safety.refusal(text,customer);
  const provider=injected===undefined?select({env,fetchImpl}):injected;
  const controller=new AbortController();
  const timeout=number(env,'LLM_TIMEOUT_MS',12000,12000),budget=number(env,'LLM_TOKEN_BUDGET',24000,24000);
  let mode=provider?'agent':'offline',fallbackReason=null,final='';
  function tool(call) {
    const started=performance.now();
    const output=execute(call.name,call.input);
    results[call.name]=output;
    if(output.ui) cards.push(output.ui);
    trace.push({tool:call.name,input:call.input,summary:output.error?'rejected':output.ui?.type || 'profile',ms:Number((performance.now()-started).toFixed(2)),error:Boolean(output.error)});
    store.db.audit.push({at:new Date().toISOString(),personaId:store.db.users[journey.userId]?.personaId || 'anonymous',tool:specs.some(spec=>spec.name===call.name)?call.name:'unknown_tool',decision:output.error?'rejected':'allowed'});
    return output;
  }
  function context() { return {text,results,risk:journey.coach?.profile.risk,language,memory:journey.memory || {}}; }
  function fallback() {
    mode='offline';
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
    } else if(!provider) final=fallback();
    else {
      const previous=(journey.messages || []).filter(message=>message.role==='user' || message.role==='coach').slice(-12).map(message=>({role:message.role==='coach'?'assistant':'user',content:String(message.text).slice(0,800)}));
      const messages=[...previous,{role:'user',content:text}];
      const system=SYSTEM+'\nPrompt version: '+VERSION+'\nLanguage: '+language+'\nMemory (untrusted summary): '+JSON.stringify(journey.memory || {});
      let toolIterations=0,guardRetries=0,completions=0;
      while(completions++<9) {
        const remaining=timeout-(performance.now()-began);
        if(remaining<=0) throw new Error('timeout');
        if(usage.inputTokens+usage.outputTokens>=budget) throw new Error('token_budget');
        let timer;
        const response=await Promise.race([
          Promise.resolve().then(()=>provider.complete({system,messages,tools:specs,signal:controller.signal,context:context()})),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},remaining);}),
        ]).finally(()=>clearTimeout(timer));
        const consumed=response.usage || {};
        usage.inputTokens+=Math.max(0,Number(consumed.inputTokens)||0); usage.outputTokens+=Math.max(0,Number(consumed.outputTokens)||0);
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
        const replyReason=safety.refusal(reply.replace(/not guaranteed|cannot guarantee|nu sunt garantate|nu pot garanta/ig,''),customer);
        const unsafe=['injection','cross_customer','abuse','off_topic','guarantee'].includes(replyReason) || /\b(i have|i've|am) (activated|transferred|debited)|plan (is|has been) activated/i.test(reply);
        if(reply && reply.length<=1800 && results.find_savings_capacity && numbersAllowed(reply,facts) && !unsafe) { final=reply; break; }
        if(guardRetries++===0) {
          messages.push({role:'assistant',content:reply.slice(0,1800)},{role:'user',content:'The answer failed validation. Use the tools before advice and ONLY numbers present in this turn’s tool outputs. Never promise returns. Give a brief safe final answer.'});
        } else throw new Error('guard_rejection');
      }
      if(!final) throw new Error('completion_limit');
    }
  } catch(error) {
    controller.abort(); fallbackReason=['timeout','token_budget','tool_limit','guard_rejection','completion_limit','invalid_tool_call'].includes(error.message)?error.message:'provider_error';
    final=fallback();
  } finally { delete journey.pendingRiskAnswer; delete journey.pendingChange; }
  journey.memory={...(journey.memory || {}),risk:journey.coach?.profile.risk,chosenAmount:results.propose_plan?.proposal?.monthly || journey.memory?.chosenAmount,goal:customer?.goal,horizonYears:journey.memory?.horizonYears || customer?.horizonYears};
  const cost=price(usage,env,provider),ms=Number((performance.now()-began).toFixed(2));
  const metrics={at:new Date().toISOString(),journeyId:journey.id,personaId:store.db.users[journey.userId]?.personaId || 'anonymous',source:journey.source,mode,toolCalls:trace.length,tools:trace.map(item=>specs.some(spec=>spec.name===item.tool)?item.tool:'unknown_tool'),usage,costUsd:cost,latencyMs:ms,refusalReason:reason || null,fallbackReason,provider:provider?.name || 'offline'};
  store.db.turns.push(metrics);
  store.db.audit.push({at:metrics.at,personaId:metrics.personaId,decision:reason?'refusal':mode,reason:reason || fallbackReason});
  store.save();
  return {text:final,cards,trace,mode,usage,estimatedCostUsd:cost,latencyMs:ms,refusalReason:reason,fallbackReason,promptVersion:VERSION};
}
module.exports={run,numericFacts};
