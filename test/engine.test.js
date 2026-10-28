'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const e = require('../src/engine');

test('matches the figures in the product overview', () => {
  const s = e.simulate({ monthly: 500, years: 5 });
  assert.equal(s.contributed, 30000);
  assert.equal(s.cashReal, 26379);
  assert.equal(s.fund, 35771);
  assert.equal(s.advantage, 9392);
  assert.equal(e.cashShrink(10000, 5)[5].value, 7651);
});

test('series has one point per year and ends at the totals', () => {
  const s = e.simulate({ monthly: 300, years: 10 });
  assert.equal(s.series.length, 11);
  assert.equal(s.series[10].fund, s.fund);
  assert.equal(s.series[10].cashReal, s.cashReal);
});

test('rejects out-of-range input', () => {
  assert.throws(() => e.simulate({ monthly: 50, years: 5 }), RangeError);
  assert.throws(() => e.simulate({ monthly: 2001, years: 5 }), RangeError);
  assert.throws(() => e.simulate({ monthly: 500, years: 0 }), RangeError);
  assert.throws(() => e.simulate({ monthly: NaN, years: 5 }), RangeError);
  assert.throws(() => e.simulate({ monthly: 500, years: 2.5 }), RangeError);
});

test('stress test ends below the base case', () => {
  const base = e.simulate({ monthly: 500, years: 5 });
  assert.ok(e.stressTest({ monthly: 500, years: 5 }).fund < base.fund);
});
