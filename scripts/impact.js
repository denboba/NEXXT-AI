'use strict';
const DEFAULTS = {
  visitors: 10000,
  chatRate: .15,
  accountRate: .30,
  activationRate: .35,
  monthly: 300,
  modelCostPerConversation: .02,
};

function validate(input) {
  const values = { ...DEFAULTS, ...input };
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(name + ' must be a finite nonnegative number');
    if (name.endsWith('Rate') && value > 1) throw new Error(name + ' must be a fraction from zero to one');
  }
  if (!Number.isInteger(values.visitors) || values.visitors < 1) throw new Error('visitors must be a positive integer');
  return values;
}

function calculate(input) {
  const assumptions = validate(input);
  const { visitors, chatRate, accountRate, activationRate, monthly, modelCostPerConversation } = assumptions;
  const conversations = visitors * chatRate;
  const accounts = conversations * accountRate;
  const fundedPlans = accounts * activationRate;
  const modelCost = conversations * modelCostPerConversation;
  return {
    conversations, accounts, fundedPlans,
    fundedPlansPer10000Clicks: fundedPlans / visitors * 10000,
    assetsGatheredPerMonthRon: fundedPlans * monthly,
    modelCostUsd: modelCost,
    modelCostPerActivatedPlanUsd: fundedPlans ? modelCost / fundedPlans : null,
  };
}

function report(input) {
  const assumptions = validate(input);
  const baseline = calculate(assumptions);
  const sensitivity = [];
  for (const field of ['chatRate', 'accountRate', 'activationRate', 'monthly', 'modelCostPerConversation']) {
    for (const factor of [.8, 1.2]) {
      const value = Math.min(field.endsWith('Rate') ? 1 : Infinity, assumptions[field] * factor);
      sensitivity.push({ changedAssumption: field, factor, hypotheticalValue: value,
        ...calculate({ ...assumptions, [field]: value }) });
    }
  }
  return {
    status: 'HYPOTHETICAL SCENARIO — no production conversion, funding or revenue data',
    assumptions: Object.fromEntries(Object.entries(assumptions).map(([name, value]) => [name, {
      value, evidence: 'hypothetical',
      unit: name.endsWith('Rate') ? 'fraction' : name === 'monthly' ? 'RON/plan/month'
        : name === 'modelCostPerConversation' ? 'USD/conversation' : 'ad clicks',
    }])),
    baseline, sensitivity,
    limits: 'Expected plans may be fractional. Activation is assumed to fund; the demo only confirms a plan. ' +
      'Monthly assets assume all plans fund every month, no churn or withdrawals, no return or exchange-rate assumption. ' +
      'Model cost assumes one conversation per chat visitor and excludes all other operating/acquisition costs. ' +
      'Measured scripted/offline cost is not used as a live-provider price. See docs/IMPACT_MODEL.md.',
  };
}

if (require.main === module) {
  try {
    const input = {};
    for (const argument of process.argv.slice(2)) {
      const match = /^--([A-Za-z]+)=(.+)$/.exec(argument);
      if (!match || !Object.hasOwn(DEFAULTS, match[1])) throw new Error('Unknown option: ' + argument);
      input[match[1]] = Number(match[2]);
    }
    console.log(JSON.stringify(report(input), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { calculate, report };
