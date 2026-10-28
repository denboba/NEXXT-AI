'use strict';
const fs = require('fs');
const path = require('path');

const EMPTY = () => ({
  journeys: {}, users: {}, accounts: {}, plans: {}, ledger: [], events: [],
  onboardings: {}, loginRequests: {}, handoffs: [],
});

// Small JSON-file store. Pass null for an in-memory store (tests).
class Store {
  constructor(file) {
    this.file = file;
    this.db = EMPTY();
    this.timer = null;
    if (file && fs.existsSync(file)) {
      try { this.db = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(file, 'utf8'))); }
      catch (e) { console.error('Could not read database, starting empty:', e.message); }
    }
  }
  save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 150);
    this.timer.unref();
  }
  flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
