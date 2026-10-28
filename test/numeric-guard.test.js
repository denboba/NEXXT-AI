'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { numbersAllowed, ask } = require('../src/llm');

test('numeric guard accepts equivalent English and Romanian grouping and decimals', () => {
  const facts = 'Monthly 500 lei; years 5; fund 35771 lei; return 7.5%; fee 1234.5 lei.';
  for (const reply of [
    'În 5 ani: 35.771 lei, cu 500 lei lunar și 7,5%.',
    'Total 35 771 lei.', 'Total 35\u00a0771 lei.', 'Total 35\u202f771 lei.',
    'Total 35,771 lei. Return 7.50%.',
    'Comision: 1.234,50 lei.', 'Fee: 1,234.50 lei.',
  ]) assert.equal(numbersAllowed(reply, facts), true, reply);
});

test('numeric guard rejects invented Romanian amounts, rates, and single digits', () => {
  const facts = 'Monthly 500 lei; years 5; fund 35771 lei; return 7.5%.';
  for (const reply of ['35.772 lei', '35 772 lei', '7,6%', '9 ani', '-500 lei', '5000 lei', '35.771,01 lei']) {
    assert.equal(numbersAllowed(reply, facts), false, reply);
  }
});

test('numeric guard rejects malformed grouping instead of splitting permitted figures', () => {
  const facts = '35 lei; 771 lei; 500 lei; 1 lei; 7.5 percent.';
  for (const reply of ['35 771 lei', '35,77,1 lei', '500 1 lei', '7,5,1%']) {
    assert.equal(numbersAllowed(reply, facts), false, reply);
  }
});

test('numeric guard applies the same normalization to Romanian source facts', () => {
  assert.equal(numbersAllowed('35,771 lei and 7.5%', '35.771 lei și 7,5%'), true);
  assert.equal(numbersAllowed('35,772 lei and 7.6%', '35.771 lei și 7,5%'), false);
  assert.equal(numbersAllowed('Nu pot garanta un câștig.', '500 lei'), true);
});

test('leading-zero decimal assumptions cannot become thousand-grouped claims', () => {
  assert.equal(numbersAllowed('72 lei', '0.072 annual return'),false);
  assert.equal(numbersAllowed('55%', '0.055 inflation'),false);
  assert.equal(numbersAllowed('0,072', '0.072'),true);
});

test('provider reply with invented Romanian figures falls back', async () => {
  const fetchImpl = async () => ({ok:true, json:async () => ({content:[{type:'text',text:'Vei avea 35.999 lei la 7,9%.'}]})});
  assert.equal(await ask({text:'Cât voi avea?', facts:'35771 lei; 7.5%', env:{ANTHROPIC_API_KEY:'test'},fetchImpl}), null);
});
