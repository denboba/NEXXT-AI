'use strict';
const { BankError, accountOf } = require('../bank');

function resolve(store, journey) {
  if (journey.userId) {
    const user = store.db.users[journey.userId];
    const customer = store.db.customers[journey.userId];
    const account = accountOf(store, journey.userId);
    if (user && customer && account) return { user, customer, account, preview: false };
  } else if (journey.sampleCustomerId) {
    const customer = store.db.customers[journey.sampleCustomerId];
    if (customer?.synthetic) {
      return { user: null, customer, preview: true,
        account: { id: 'sample-preview', balance: customer.balance, currency: 'RON' } };
    }
  }
  throw new BankError('Synthetic spending history is unavailable. Connect sample data or speak to an adviser.', 409);
}

module.exports = { resolve };
