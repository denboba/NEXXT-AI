'use strict';
// Funnel events. Each journey records a stage once; the first time wins.
const STAGES = [
  ['ad_click', 'Ad click'],
  ['chat_started', 'Chat started'],
  ['questions_answered', '3 questions answered'],
  ['account_ready', 'Account opened / logged in'],
  ['plan_activated', 'Plan activated'],
  ['first_debit_executed', 'First debit executed'],
];

function track(store, journey, type, extra = {}) {
  const db = store.db;
  if (db.events.some((e) => e.journeyId === journey.id && e.type === type)) return false;
  db.events.push({ journeyId: journey.id, type, at: new Date().toISOString(), source: journey.source, campaign: journey.campaign, ...extra });
  store.save();
  return true;
}

function funnel(store, { source } = {}) {
  const events = store.db.events.filter((e) => !source || e.source === source);
  const reached = {};
  for (const [type] of STAGES) reached[type] = new Set();
  for (const e of events) if (reached[e.type]) reached[e.type].add(e.journeyId);
  const top = reached.ad_click.size || 0;
  let prev = null;
  const steps = STAGES.map(([type, label]) => {
    const count = reached[type].size;
    const step = { type, label, count, ofPrevious: prev === null ? null : prev ? count / prev : 0, ofTop: top ? count / top : 0 };
    prev = count;
    return step;
  });
  const accountEvents = events.filter((e) => e.type === 'account_ready');
  const sources = [...new Set(store.db.events.map((e) => e.source).filter(Boolean))];
  return {
    steps,
    sources,
    newCustomers: accountEvents.filter((e) => e.kind === 'new').length,
    existingClients: accountEvents.filter((e) => e.kind === 'existing').length,
    handoffs: store.db.handoffs.length,
  };
}

function agentMetrics(store, {source} = {}) {
  const journeys=Object.values(store.db.journeys).filter(journey=>!source || journey.source===source);
  const ids=new Set(journeys.map(journey=>journey.id));
  const turns=store.db.turns.filter(turn=>ids.has(turn.journeyId));
  const groups=new Map();
  for(const turn of turns) {const group=groups.get(turn.journeyId) || [];group.push(turn);groups.set(turn.journeyId,group);}
  const conversationsPerDay={};
  for(const journey of journeys.filter(item=>item.messages?.some(message=>message.role==='user'))) {const day=journey.createdAt.slice(0,10);conversationsPerDay[day]=(conversationsPerDay[day] || 0)+1;}
  const proposals=Object.values(store.db.proposals).filter(proposal=>ids.has(proposal.journeyId));
  const proposalIds=new Set(proposals.map(proposal=>proposal.id));
  const confirmed = Object.entries(store.db.confirmations).filter(([id]) => proposalIds.has(id));
  const activated=Object.values(store.db.plans).filter(plan=>proposalIds.has(plan.proposalId)).length;
  const costKnown=turns.every(turn=>turn.costUsd!==null);
  const totalCost=costKnown?turns.reduce((sum,turn)=>sum+turn.costUsd,0):null;
  const tools={},refusals={};
  for(const turn of turns) for(const name of turn.tools || []) tools[name]=(tools[name] || 0)+1;
  for(const turn of turns) if(turn.refusalReason) refusals[turn.refusalReason]=(refusals[turn.refusalReason] || 0)+1;
  const rank=counts=>Object.entries(counts).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  const modeSplit={agent:0,offline:0};
  for(const group of groups.values()) modeSplit[group.at(-1).mode]++;
  return {conversations:groups.size,conversationsPerDay,modeSplit,modeSplitDefinition:'Most recent agent-endpoint turn per conversation; percentages sum to one.',answeredTurns:{agent:turns.filter(turn=>turn.mode==='agent').length,offline:turns.filter(turn=>turn.mode==='offline').length},averageToolCallsPerConversation:groups.size?turns.reduce((sum,turn)=>sum+turn.toolCalls,0)/groups.size:0,estimatedModelCostPerConversationUsd:groups.size && totalCost!==null?totalCost/groups.size:null,estimatedModelCostPerActivatedPlanUsd:activated && totalCost!==null?totalCost/activated:null,totalEstimatedModelCostUsd:totalCost,unpricedTurns:turns.filter(turn=>turn.costUsd===null).length,proposals:proposals.length,confirmedPlans:activated,proposalToConfirmationRate:proposals.length?(confirmed.length || activated)/proposals.length:null,topTools:rank(tools),topRefusalReasons:rank(refusals),audit:source?[]:store.db.audit.slice(-100).reverse()};
}

module.exports = { STAGES, track, funnel, agentMetrics };
