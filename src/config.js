'use strict';
const fs = require('node:fs');
const path = require('node:path');

function loadLocalEnv(file = path.join(__dirname, '../.env'), env = process.env) {
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !(match[1] in env) && match[2]) env[match[1]] = match[2];
  }
  return env;
}

module.exports = { loadLocalEnv };
