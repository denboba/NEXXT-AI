'use strict';
// Simulation engine: the only place investment numbers are produced.
// Convention: contributions are made at the end of each month; cash is
// deflated by inflation from the date of each deposit; the fund compounds monthly.

const DEFAULTS = { inflation: 0.055, fundReturn: 0.072 };
const LIMITS = { minMonthly: 100, maxMonthly: 2000, minYears: 1, maxYears: 30 };

function validate(monthly, years) {
  if (!Number.isFinite(monthly) || monthly < LIMITS.minMonthly || monthly > LIMITS.maxMonthly) {
    throw new RangeError(`monthly must be between ${LIMITS.minMonthly} and ${LIMITS.maxMonthly} lei`);
  }
  if (!Number.isInteger(years) || years < LIMITS.minYears || years > LIMITS.maxYears) {
    throw new RangeError(`years must be a whole number between ${LIMITS.minYears} and ${LIMITS.maxYears}`);
  }
}

function monthlyRate(annual) {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

function simulate({ monthly, years, inflation = DEFAULTS.inflation, fundReturn = DEFAULTS.fundReturn, drop = 0, dropAtMonth = 0 }) {
  validate(monthly, years);
  const mf = monthlyRate(fundReturn);
  let cashReal = 0;
  let fund = 0;
  const series = [{ year: 0, contributed: 0, cashReal: 0, fund: 0 }];
  for (let m = 1; m <= years * 12; m++) {
    fund = fund * (1 + mf) + monthly;
    if (drop && m === dropAtMonth) fund *= 1 - drop;
    cashReal += monthly / Math.pow(1 + inflation, (years * 12 - m) / 12);
    if (m % 12 === 0) {
      series.push({ year: m / 12, contributed: monthly * m, cashReal: Math.round(cashReal), fund: Math.round(fund) });
    }
  }
  const contributed = monthly * years * 12;
  return {
    monthly,
    years,
    contributed,
    cashReal: Math.round(cashReal),
    fund: Math.round(fund),
    advantage: Math.round(fund) - Math.round(cashReal),
    series,
    assumptions: { inflation, fundReturn },
  };
}

// What a lump sum of cash buys after n years (the "money quietly shrinks" chart).
function cashShrink(amount = 10000, years = 5, inflation = DEFAULTS.inflation) {
  const points = [];
  for (let y = 0; y <= years; y++) points.push({ year: y, value: Math.round(amount / Math.pow(1 + inflation, y)) });
  return points;
}

// Worst-timed shock: the fund falls right at the end, just before the money is needed.
function stressTest({ monthly, years, drop = 0.2 }) {
  return simulate({ monthly, years, drop, dropAtMonth: years * 12 });
}

module.exports = { simulate, cashShrink, stressTest, DEFAULTS, LIMITS };
