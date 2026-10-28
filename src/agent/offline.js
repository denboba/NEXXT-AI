'use strict';
const { intent } = require('./safety');
const { t } = require('../i18n');
function next({ text, results, risk, memory = {} }) {
  const input = intent(text);
  if (!results.get_customer_profile) return { toolCalls: [call('get_customer_profile'),call('get_spending_summary'),call('find_savings_capacity')] };
  if (results.get_customer_profile.error) return results.request_authentication ? {text:''} : { toolCalls: [call('request_authentication',{kind:'login'})], stopAfterTools:true };
  const missing=['get_spending_summary','find_savings_capacity'].filter(name=>!results[name]);
  if(missing.length) return {toolCalls:missing.map(name=>call(name))};
  if(input.clarify) { results.clarification=input.clarify;return {text:''}; }
  if (input.handoff && !results.handoff_to_adviser) return { toolCalls:[call('handoff_to_adviser',{reason:'Customer requested an adviser.'})], stopAfterTools:true };
  if (input.change && !results.what_if) return { toolCalls:[call('what_if',{change:input.change})] };
  const profile=results.get_customer_profile;
  const horizon=results.what_if?.horizonYears || memory.horizonYears || profile.horizonYears;
  const effectiveRisk=input.riskAnswer || risk;
  if (input.riskAnswer && !results.set_risk_profile) return { toolCalls:[call('set_risk_profile',{answer:input.riskAnswer})] };
  if (!results.compare_products) return { toolCalls:[call('compare_products',{goal:profile.goal,horizonYears:horizon,needsLiquidity:profile.incomePattern==='irregular',riskComfort:effectiveRisk || 'medium'})] };
  const cap=results.find_savings_capacity;
  const currentCap=results.what_if?.after || cap;
  const requested=input.monthly ?? memory.chosenAmount ?? cap.safeMonthly;
  if(input.monthly!==null && input.monthly<100) { results.amountRejected=true;return {text:''}; }
  const amount=!cap.bufferReady ? cap.microSaving : Math.min(requested,cap.safeMonthly,currentCap.safeMonthly);
  const product=results.compare_products.products?.find(p=>p.eligible);
  if (effectiveRisk && product && amount>=100 && !results.propose_plan) {
    const toolCalls=[call('propose_plan',{productId:product.id,monthly:amount})];
    if (amount<=2000 && horizon>=1) toolCalls.unshift(call('simulate',{monthly:amount,years:Math.floor(horizon),productId:product.id}));
    return {toolCalls};
  }
  return {text:answer(results,effectiveRisk)};
}
const call = (name,input={}) => ({id:'script-'+name,name,input});
function answer(results,risk,language='en') {
  if(results.amountRejected) return t(language,'amountOutside');
  if(results.clarification) return t(language,results.clarification==='bonus'?'clarifyBonus':'clarifyRent');
  if(results.request_authentication) return t(language,'needHistory');
  if(results.handoff_to_adviser) return t(language,'handoffDone');
  const p=results.get_customer_profile,cap=results.find_savings_capacity;
  if(!p || p.error || !cap || cap.error) return t(language,'unavailable');
  let text;
  if(!cap.bufferReady) text=t(language,cap.microSaving?'bufferFirst':'bufferDeficit',{amount:cap.microSaving,months:cap.readyInMonths});
  else if(p.segment==='business') text=t(language,'businessPlan',{payroll:cap.obligationTotal});
  else if(p.incomePattern==='irregular') text=t(language,'irregularPlan',{tax:cap.obligationTotal,months:cap.bufferMonths,amount:cap.safeMonthly});
  else {
    const product=results.compare_products?.products?.find(item=>item.eligible);
    text=t(language,product?.id==='term-deposit' || product?.id==='buffer-savings'?'healthyShort':risk==='low'?'healthyConservative':'healthyPlan',{months:cap.bufferMonths,amount:cap.safeMonthly});
  }
  if(results.what_if) text+=' '+t(language,'changeExplained',{years:results.what_if.horizonYears,amount:results.what_if.after.safeMonthly});
  if(results.propose_plan?.proposal) text+=' '+t(language,'confirmRequired');
  else if(results.propose_plan?.error) text+=' '+t(language,'proposalBlocked');
  else if(!risk) text+=' '+t(language,cap.bufferReady?'riskQuestion':'savingQuestion');
  return text;
}
module.exports={next,answer};
