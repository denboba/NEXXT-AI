'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { personas, generate, DEFINITIONS, CATEGORIES, seed } = require('../src/data/personas');
const { Store } = require('../src/store');
test('synthetic data is deterministic, covers twelve months and balances exactly', () => {
  assert.deepEqual(personas(), personas());
  assert.notDeepEqual(generate(DEFINITIONS[0], 1).transactions, generate(DEFINITIONS[0], 2).transactions);
  for (const customer of personas()) {
    assert.equal(new Set(customer.transactions.map(t => t.date.slice(0, 7))).size, 12);
    assert.equal(customer.openingBalance + customer.transactions.reduce((sum, t) => sum + t.amount, 0), customer.balance);
    assert.ok(customer.transactions.every(t => CATEGORIES.includes(t.category)));
    assert.ok(customer.transactions.some(t => t.recurring && t.category === 'rent'));
    assert.ok(customer.transactions.filter(t => t.recurring && t.category === 'subscriptions').length >= 12);
    assert.equal(customer.synthetic, true);
  }
});
test('persona seeding is additive and repeatable', () => {
  const store = new Store(null); seed(store);
  const original = JSON.stringify(store.db); seed(store);
  assert.equal(JSON.stringify(store.db), original);
  assert.equal(Object.keys(store.db.customers).length, 4);
});
