'use strict';
const AS_OF = '2026-02-28';
const DEFINITIONS = [
  { id: 'ioana', firstName: 'Ioana', lastName: 'Popescu', ageBand: '30–39', segment: 'individual', incomePattern: 'salaried', goal: 'apartment down payment', horizonYears: 7, balance: 18400, income: 7200, expenses: { rent: 2100, utilities: 300, groceries: 700, transport: 200, health: 100, subscriptions: 100, dining: 600, shopping: 700, travel: 400, transfers: 1000 }, obligations: [], description: 'Salaried · apartment in 7 years' },
  { id: 'andrei', firstName: 'Andrei', lastName: 'Marin', ageBand: '20–29', segment: 'individual', incomePattern: 'part-time', goal: 'first emergency buffer', horizonYears: 1, balance: 1150, income: 2300, expenses: { rent: 900, utilities: 120, groceries: 500, transport: 120, health: 60, subscriptions: 320, dining: 180, shopping: 50 }, obligations: [], description: 'Student · build a buffer first' },
  { id: 'mihai', firstName: 'Mihai', lastName: 'Dumitru', ageBand: '40–49', segment: 'individual', incomePattern: 'irregular', goal: 'flexibility and tax reserve', horizonYears: 5, balance: 31000, income: [4000, 15000, 6000, 9000, 5000, 11000, 7000, 13000, 4500, 10000, 6500, 12000], expenses: { rent: 1600, utilities: 350, groceries: 650, transport: 250, health: 150, subscriptions: 100, dining: 500, shopping: 600, travel: 700, transfers: 2300 }, obligations: [{ label: 'March tax reserve (demo, not tax advice)', amount: 12000, due: '2026-03-20', category: 'tax' }], description: 'Freelancer · reserve March tax' },
  { id: 'elena', firstName: 'Elena', lastName: 'Radu', ageBand: '40–49', segment: 'business', incomePattern: 'seasonal', goal: 'bakery cash flow and payroll', horizonYears: 1, balance: 95000, income: [32000, 34000, 30000, 28000, 26000, 24000, 29000, 35000, 38000, 40000, 26000, 24000], expenses: { rent: 3000, utilities: 1000, groceries: 3500, transport: 500, health: 0, subscriptions: 200, shopping: 800, transfers: 14000, tax: 1000 }, obligations: [{ label: 'Payroll on the 10th', amount: 14000, due: '2026-03-10', category: 'payroll' }], description: 'Bakery owner · protect payroll' },
];
const CATEGORIES = ['rent', 'utilities', 'groceries', 'transport', 'dining', 'subscriptions', 'health', 'travel', 'shopping', 'income', 'tax', 'transfers'];
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
function generate(definition, seed = 2026) {
  const next = random(seed + definition.id.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0));
  const transactions = [];
  for (let month = 0; month < 12; month++) {
    const date = new Date(Date.UTC(2025, 2 + month, 1)).toISOString().slice(0, 7);
    const income = Array.isArray(definition.income) ? definition.income[month] : definition.income;
    transactions.push({ date: date + '-01', amount: income, category: 'income', merchant: definition.segment === 'business' ? 'Synthetic bakery sales' : 'Synthetic income', recurring: !Array.isArray(definition.income), account: 'demo-current' });
    for (const [category, amount] of Object.entries(definition.expenses)) {
      if (!amount) continue;
      const recurring = ['rent', 'utilities', 'subscriptions', 'transfers'].includes(category);
      if (category === 'subscriptions') {
        for (const [merchant, share] of [['StreamBox', .5], ['GamePass Demo', .25], ['CloudPlus Demo', .25]]) transactions.push({ date: date + '-05', amount: -amount * share, category, merchant, recurring: true, account: 'demo-current' });
      } else transactions.push({ date: date + '-' + (recurring ? '10' : String(12 + Math.floor(next() * 14))), amount: -amount, category, merchant: 'Demo ' + category, recurring, account: 'demo-current' });
    }
  }
  const net = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const { income, expenses, balance, ...profile } = definition;
  return { ...profile, synthetic: true, asOf: AS_OF, openingBalance: balance - net, balance, transactions };
}
function personas() { return DEFINITIONS.map(definition => generate(definition)); }
function seed(store) {
  store.db.customers ||= {};
  for (const customer of personas()) {
    const id = 'persona-' + customer.id;
    if (!store.db.customers[id]) store.db.customers[id] = customer;
    if (!store.db.users[id]) store.db.users[id] = { id, personaId: customer.id, firstName: customer.firstName, lastName: customer.lastName, kind: 'existing', synthetic: true, email: customer.id + '@example.test', phone: '+40700000' + String(DEFINITIONS.findIndex(p => p.id === customer.id) + 1).padStart(3, '0') };
    if (!store.db.accounts['account-' + id]) store.db.accounts['account-' + id] = { id: 'account-' + id, userId: id, iban: 'RO00DEMO' + customer.id.toUpperCase().padEnd(16, '0'), balance: customer.balance, currency: 'RON', card: { type: 'Demo virtual card', last4: '0000', wallets: ['Apple Pay', 'Google Pay'] } };
  }
  Object.assign(store.db.users['persona-ioana'], {
    seed: true,
    phone: '+40722000111',
    email: 'ioana.popescu@example.com',
  });
  require('./migrate').migrateIoana(store);
}
module.exports = { AS_OF, CATEGORIES, DEFINITIONS, generate, personas, seed };
