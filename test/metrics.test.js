'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./helpers');
test('admin preserves the funnel and reports agent metrics and confirmation conversion',async t=>{
 const app=await boot();t.after(app.close);const c=app.client();await c.post('/api/journey',{source:'metrics'});await c.post('/api/persona',{persona:'ioana'});
 const turn=await c.post('/api/agent',{text:'medium'});const proposal=turn.data.cards.find(card=>card.type==='plan_proposal').proposal;
 await c.post(`/api/proposals/${proposal.id}/confirm`,{confirmed:true});
 assert.equal((await c.get('/api/admin/agent-metrics')).status,401);
 const metrics=(await c.get('/api/admin/agent-metrics',{'x-admin-token':'secret'})).data;
 assert.equal(metrics.conversations,1);assert.equal(metrics.modeSplit.offline,1);assert.equal(metrics.averageToolCallsPerConversation,7);
 assert.equal(metrics.estimatedModelCostPerActivatedPlanUsd,0);assert.equal(metrics.proposalToConfirmationRate,1);assert.equal(metrics.confirmedPlans,1);
 assert.ok(metrics.topTools.some(tool=>tool.name==='find_savings_capacity'));assert.equal(Object.values(metrics.conversationsPerDay)[0],1);
 assert.equal((await c.get('/api/admin/metrics',{'x-admin-token':'secret'})).data.steps.length,7);
 const filtered=(await c.get('/api/admin/agent-metrics?source=missing',{'x-admin-token':'secret'})).data;assert.equal(filtered.conversations,0);assert.equal(filtered.confirmedPlans,0);
 app.store.db.turns[0].costUsd=null;
 const unknown=(await c.get('/api/admin/agent-metrics',{'x-admin-token':'secret'})).data;assert.equal(unknown.estimatedModelCostPerConversationUsd,null);assert.equal(unknown.unpricedTurns,1);
});
