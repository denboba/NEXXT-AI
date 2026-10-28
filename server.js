'use strict';
const fs = require('fs');
const path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env) && m[2] !== '') process.env[m[1]] = m[2];
  }
}
const { Store } = require('./src/store');
const { createApp } = require('./src/app');

const store = new Store(path.resolve(process.env.DB_PATH || 'data/db.json'));
const port = Number(process.env.PORT || 3000);
const server = createApp({ store });
server.listen(port, () => {
  console.log(`AI Investment Coach running on http://localhost:${port}`);
  console.log(`  Social ad demo:  http://localhost:${port}/ad`);
  console.log(`  Admin metrics:   http://localhost:${port}/admin`);
  console.log(`  Demo client:     +40 722 000 111 (Ioana Popescu)`);
});
const stop = () => { store.flush(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
