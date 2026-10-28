'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, report } = require('../scripts/impact');

test('hypothetical impact compounds conditional funnel rates and separates RON assets from USD model cost', () => {
  const result = calculate({ visitors: 10000, chatRate: .2, accountRate: .5, activationRate: .4,
    monthly: 100, modelCostPerConversation: .03 });
  assert.equal(result.fundedPlans, 400);
  assert.equal(result.fundedPlansPer10000Clicks, 400);
  assert.equal(result.assetsGatheredPerMonthRon, 40000);
  assert.equal(result.modelCostUsd, 60);
  assert.equal(result.modelCostPerActivatedPlanUsd, .15);
  const doubled = calculate({ visitors: 20000, chatRate: .2, accountRate: .5, activationRate: .4,
    monthly: 100, modelCostPerConversation: .03 });
  assert.equal(doubled.fundedPlans, 800);
  assert.equal(doubled.fundedPlansPer10000Clicks, result.fundedPlansPer10000Clicks);
  assert.equal(calculate({ activationRate: 0 }).modelCostPerActivatedPlanUsd, null);
});

test('impact rejects impossible inputs and labels every input and sensitivity as hypothetical', () => {
  for (const input of [{ chatRate: 1.1 }, { monthly: -1 }, { visitors: 0 }, { monthly: Infinity }]) {
    assert.throws(() => calculate(input));
  }
  const output = report({});
  assert.ok(Object.values(output.assumptions).every(value => value.evidence === 'hypothetical'));
  assert.equal(output.sensitivity.length, 10);
  assert.ok(output.status.includes('no production'));
});
