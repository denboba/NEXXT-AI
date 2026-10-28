'use strict';

function migrateIoana(store) {
  const db = store.db;
  const targetId = 'persona-ioana';
  const targetAccount = db.accounts['account-' + targetId];
  const legacy = Object.values(db.users).filter(user => user.id !== targetId && user.seed
    && (user.phone === '+40722000111' || user.email === 'ioana.popescu@example.com'));

  for (const user of legacy) {
    const accounts = Object.values(db.accounts).filter(account => account.userId === user.id);
    const records = ['plans', 'proposals', 'ledger'].map(key => [key,
      Object.values(db[key]).filter(record => record.userId === user.id)]);
    db.legacySeedArchive ||= {};
    db.legacySeedArchive[user.id] = structuredClone({ user, accounts, ...Object.fromEntries(records) });

    for (const account of accounts) {
      const opening = db.ledger.find(entry => entry.accountId === account.id && entry.label === 'Opening balance');
      targetAccount.balance += account.balance - (opening?.amount ?? 2500);
      delete db.accounts[account.id];
    }
    for (const journey of Object.values(db.journeys)) if (journey.userId === user.id) journey.userId = targetId;
    for (const request of Object.values(db.loginRequests)) if (request.userId === user.id) request.userId = targetId;
    for (const [id, proposal] of Object.entries(db.proposals)) {
      if (proposal.userId === user.id) db.proposals[id] = Object.freeze({ ...proposal, userId: targetId });
    }
    for (const record of [...Object.values(db.plans), ...db.ledger]) {
      if (record.userId === user.id) {
        record.userId = targetId;
        record.accountId = targetAccount.id;
      }
    }
    delete db.customers[user.id];
    delete db.users[user.id];
  }
}

module.exports = { migrateIoana };
