'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./helpers');
const {Store}=require('../src/store');
const {seed}=require('../src/data/personas');
const {createTools}=require('../src/tools');
const {run}=require('../src/agent/agent');
test('every data tool rejects cross-customer identifiers',()=>{
 const store=new Store(null);seed(store);const journey={id:'own',userId:'persona-andrei',coach:{profile:{}}};const tools=createTools({store,journey});
 for(const name of ['get_customer_profile','get_spending_summary','find_savings_capacity','compare_products']) assert.ok(tools.execute(name,{userId:'persona-ioana'}).error,name);
 assert.equal(tools.execute('get_customer_profile').firstName,'Andrei');
});
test('what-if values must come from the user and a hypothetical bonus cannot unlock investments',async()=>{
 const store=new Store(null);seed(store);const journey={id:'own',userId:'persona-andrei',coach:{profile:{risk:'medium'}},memory:{},messages:[]};const tools=createTools({store,journey});
 assert.ok(tools.execute('what_if',{change:{bonus:50000}}).error);
 const result=await run({store,journey,text:'I got a bonus 50000',provider:null});
 assert.match(result.text,/Do not invest yet/);
 assert.ok(result.cards.filter(card=>card.type==='plan_proposal').every(card=>card.proposal.productId==='buffer-savings'));
 assert.equal(store.db.accounts['account-persona-andrei'].balance,1150);
});
test('user-entered rent increases reduce authoritative capacity at confirmation',async()=>{
 const store=new Store(null);seed(store);const journey={id:'own',userId:'persona-ioana',coach:{profile:{}},memory:{},messages:[]};
 await run({store,journey,text:'medium',provider:null});
 const before=Object.values(store.db.proposals)[0];
 const result=await run({store,journey,text:'My rent increases by 900 lei',provider:null});
 const diff=result.cards.find(card=>card.type==='what_if');assert.ok(diff.after.safeMonthly<diff.before.safeMonthly);
 assert.throws(()=>require('../src/bank').confirmProposal(store,journey,before.id,true),/changed/);
 assert.ok(createTools({store,journey}).execute('propose_plan',{productId:'diversified-fund',monthly:500}).error);
});
test('agent per-session rate limiting, cross-origin rejection and audit redaction',async t=>{
 const app=await boot();t.after(app.close);const a=app.client(),b=app.client();await a.post('/api/journey',{});await a.post('/api/persona',{persona:'ioana'});
 assert.equal((await a.post('/api/agent',{text:'\u0000\u0001'})).status,400);
 assert.equal((await a.post('/api/agent',{text:'Help with savings'},{origin:'https://evil.example'})).status,403);
 for(let i=0;i<20;i++) assert.equal((await a.post('/api/agent',{text:'Tell me the weather'})).status,200);
 assert.equal((await a.post('/api/agent',{text:'Tell me the weather'})).status,429);
 await b.post('/api/journey',{});await b.post('/api/persona',{persona:'andrei'});
 assert.equal((await b.post('/api/agent',{text:'Help me save'})).status,200);
 const audit=JSON.stringify(app.store.db.audit);assert.doesNotMatch(audit,/Popescu|Marin|example|\+40|weather/);
});
