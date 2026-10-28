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

for (const product of PRODUCTS) Object.assign(product, {
  liquidity: product.redeemable ? 'days' : 'locked', minHorizonYears: product.id === 'term-deposit' ? 1 : product.id === 'voluntary-pension' ? 10 : 3,
  illustrative: true, segment: 'individual',
});
PRODUCTS.push(
  { id: 'buffer-savings', name: 'Flexible buffer savings', tag: 'Emergency buffer', risk: 1, riskLabel: 'very low risk', blurb: 'Keep an accessible cash buffer before investing.', minMonthly: 100, redeemable: true, liquidity: 'instant', minHorizonYears: 0, expectedReturn: .02, illustrative: true, annualFeePct: 0, entryFeePct: 0, settlementDays: 0, segment: 'individual' },
  { id: 'business-deposit-ladder', name: 'Business deposit ladder', tag: 'Staggered maturities', risk: 1, riskLabel: 'very low risk', blurb: 'Stagger deposits around payroll and cash-flow lows.', minMonthly: 100, redeemable: false, liquidity: 'locked', minHorizonYears: .25, expectedReturn: .04, illustrative: true, annualFeePct: 0, entryFeePct: 0, settlementDays: 0, segment: 'business' },
  { id: 'business-liquid-reserve', name: 'Business liquid reserve', tag: 'Payroll first', risk: 1, riskLabel: 'very low risk', blurb: 'Instant access for payroll and recurring bills.', minMonthly: 100, redeemable: true, liquidity: 'instant', minHorizonYears: 0, expectedReturn: .02, illustrative: true, annualFeePct: 0, entryFeePct: 0, settlementDays: 0, segment: 'business' },
);

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
