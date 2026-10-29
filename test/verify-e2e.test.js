'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runE2E } = require('../scripts/verify');

test('jury end-to-end scenario passes every check over real HTTP', async () => {
  const checks = await runE2E();
  assert.ok(checks.length >= 8, 'expected the full scenario, got ' + checks.length + ' checks');
  for (const item of checks) assert.ok(item.ok, item.name + ': ' + item.detail);
});
