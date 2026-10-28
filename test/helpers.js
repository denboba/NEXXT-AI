'use strict';
const { Store } = require('../src/store');
const { createApp } = require('../src/app');

async function boot(env = {}) {
  const store = new Store(null);
  const server = createApp({ store, env: { DEMO_MODE: '1', ADMIN_TOKEN: 'secret', ...env }, fetchImpl: env.fetchImpl });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    const call = async (method, path, body, headers = {}) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie && { cookie }), ...headers }, body: body ? JSON.stringify(body) : undefined });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data, headers: res.headers };
    };
    return { get: (p, h) => call('GET', p, null, h), post: (p, b, h) => call('POST', p, b || {}, h) };
  };
  return { store, server, base, client, close: () => new Promise((r) => server.close(r)) };
}

// Walk the web chat to the simulation.
async function chatToSim(c, { amount = 'a500', worry = 'fear_loss', years = 'y5' } = {}) {
  await c.post('/api/journey', { source: 'instagram', campaign: 'cash-loses' });
  await c.post('/api/chat', { type: 'choice', id: amount });
  await c.post('/api/chat', { type: 'choice', id: worry });
  return c.post('/api/chat', { type: 'choice', id: years });
}

async function signUp(c, over = {}) {
  const d = { firstName: 'Maria', lastName: 'Ionescu', email: 'maria@example.com', phone: '+40 733 111 222', ...over };
  let r = await c.post('/api/signup/details', d); if (r.status !== 200) return r;
  r = await c.post('/api/signup/id', { idNumber: 'RX123456' });
  r = await c.post('/api/signup/selfie', { captured: true });
  const otp = await c.post('/api/signup/otp/request');
  return c.post('/api/signup/otp/verify', { code: otp.data.demoCode });
}

module.exports = { boot, chatToSim, signUp };
