'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./helpers');
test('HTTP plan creation is available only through explicit proposal confirmation',async t=>{
  const app=await boot();t.after(app.close);const a=app.client(),b=app.client();
  await a.post('/api/journey',{});await a.post('/api/persona',{persona:'ioana'});
  const turn=await a.post('/api/agent',{text:'medium'});assert.equal(turn.status,200);assert.equal(turn.data.mode,'offline');
  assert.equal(Object.keys(app.store.db.plans).length,0);
  const proposal=turn.data.cards.find(card=>card.type==='plan_proposal').proposal;
  await b.post('/api/journey',{});await b.post('/api/persona',{persona:'ioana'});
  assert.equal((await b.post(`/api/proposals/${proposal.id}/confirm`,{confirmed:true})).status,404);
  assert.equal((await a.post(`/api/proposals/${proposal.id}/confirm`,{})).status,400);
  const confirmed=await a.post(`/api/proposals/${proposal.id}/confirm`,{confirmed:true});assert.equal(confirmed.status,200);
  assert.equal(Object.keys(app.store.db.plans).length,1);
  assert.equal((await a.post(`/api/proposals/${proposal.id}/confirm`,{confirmed:true})).data.plan.id,confirmed.data.plan.id);
});
test('agent endpoint rejects oversize messages, strips controls and gates persona demos',async t=>{
  const app=await boot();t.after(app.close);const c=app.client();await c.post('/api/journey',{});await c.post('/api/persona',{persona:'andrei'});
  assert.equal((await c.post('/api/agent',{text:'x'.repeat(501)})).status,400);
  const r=await c.post('/api/agent',{text:'I need\u0000 help saving'});assert.equal(r.status,200);assert.equal(JSON.stringify(r.data.history).includes('\\u0000'),false);
  const prod=await boot({DEMO_MODE:'0'});t.after(prod.close);const p=prod.client();await p.post('/api/journey',{});
  assert.equal((await p.get('/api/personas')).status,403);assert.equal((await p.post('/api/persona',{persona:'ioana'})).status,403);
});
