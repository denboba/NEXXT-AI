'use strict';
// Product shelf. risk: 1 (very low) .. 5 (high). Fees and settlement times are DEMO values
// and must be replaced with the product team's confirmed figures before launch.
const PRODUCTS = [
  { id: 'diversified-fund', name: 'Raiffeisen Diversified Fund', tag: 'Monthly fund plan', risk: 3, riskLabel: 'medium risk',
    blurb: 'Spread across many markets. Withdraw anytime.', minMonthly: 100, redeemable: true,
    expectedReturn: 0.072, annualFeePct: 1.2, entryFeePct: 0, settlementDays: 3 },
  { id: 'bond-fund', name: 'Conservative bond fund', tag: 'Steadier ride', risk: 2, riskLabel: 'low risk',
    blurb: 'Smaller ups and downs.', minMonthly: 100, redeemable: true,
    expectedReturn: 0.045, annualFeePct: 0.8, entryFeePct: 0, settlementDays: 3 },
  { id: 'term-deposit', name: 'Term deposit', tag: 'Fixed interest', risk: 1, riskLabel: 'very low risk',
    blurb: 'Fixed interest for a fixed period.', minMonthly: 100, redeemable: false,
    expectedReturn: 0.04, annualFeePct: 0, entryFeePct: 0, settlementDays: 0 },
  { id: 'voluntary-pension', name: 'Voluntary pension', tag: 'Long term', risk: 3, riskLabel: 'medium risk',
    blurb: 'Long term and tax-deductible.', minMonthly: 100, redeemable: false,
    expectedReturn: 0.065, annualFeePct: 1.0, entryFeePct: 0, settlementDays: 0 },
  { id: 'stocks-etfs', name: 'Stocks & ETFs', tag: 'Trade in the app', risk: 5, riskLabel: 'high risk',
    blurb: 'Higher highs and lower lows. You choose each trade.', minMonthly: 100, redeemable: true,
    expectedReturn: null, annualFeePct: 0, entryFeePct: 0.5, settlementDays: 2 },
];

// Suitability: the comfort level a customer expressed caps the risk of products we offer.
const RISK_CAP = { low: 2, medium: 3, high: 5 };

function byId(id) { return PRODUCTS.find((p) => p.id === id); }

function allowedFor(risk) {
  const cap = RISK_CAP[risk] || 0;
  return PRODUCTS.filter((p) => p.risk <= cap);
}

function recommend(profile) {
  const risk = profile.risk || 'medium';
  if (risk === 'low') return byId('bond-fund');
  return byId('diversified-fund');
}

module.exports = { PRODUCTS, RISK_CAP, byId, allowedFor, recommend };
