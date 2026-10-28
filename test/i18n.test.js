'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./helpers');
const {language,t}=require('../src/i18n');
test('English and Romanian catalogs have matching keys and language selection is bounded',()=>{
 for(const base of ['../public/i18n/','../src/i18n/']) assert.deepEqual(Object.keys(require(base+'en.json')).sort(),Object.keys(require(base+'ro.json')).sort());
 assert.equal(language('ro-RO,ro;q=0.9'),'ro');assert.equal(language('en-GB'),'en');assert.equal(language('../../secret'),'en');
 assert.match(t('ro','bufferFirst',{amount:100,months:6}),/Nu investi încă/);
});
test('Romanian anonymous funnel and persona planning use localized copy',async t=>{
 const app=await boot();t.after(app.close);const c=app.client();
 const initial=await c.post('/api/journey',{language:'ro'});assert.match(initial.data.messages[0].text,/Salut/);
 await c.post('/api/chat',{type:'choice',id:'a500'});await c.post('/api/chat',{type:'choice',id:'fear_loss'});
 const sim=await c.post('/api/chat',{type:'choice',id:'y5'});assert.match(sim.data.messages[0].text,/În 5 ani/);assert.match(sim.data.messages[0].text,/35\.771/);
 const faq=await c.post('/api/chat',{type:'text',text:'Ce comisioane platesc?'});assert.match(faq.data.messages.at(-1).text,/1,2%/);
 await c.post('/api/persona',{persona:'andrei'});
 const result=await c.post('/api/agent',{text:'scazut'});assert.match(result.data.messages[0].text,/Nu investi încă/);assert.equal(result.data.mode,'offline');
 assert.equal((await c.post('/api/language',{language:'en'})).data.language,'en');
 assert.equal((await c.post('/api/language',{language:'../bad'})).status,400);
});
