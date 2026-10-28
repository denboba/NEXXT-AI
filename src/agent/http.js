'use strict';

class ProviderError extends Error {
  constructor(code, hint, status = null) {
    super(hint);
    this.name = 'ProviderError';
    this.code = code;
    this.hint = hint;
    this.status = status;
  }
}

const HINTS = {
  throttled: 'The provider is rate-limiting requests. The offline planner can continue.',
  timeout: 'The provider exceeded its time budget. The offline planner can continue.',
  auth: 'Check the configured provider credential and model access in secure settings.',
  model_not_found: 'Check the exact model identifier and regional access; display names are not model IDs.',
  bad_request: 'The provider rejected the request format or configuration.',
  server_error: 'The provider is temporarily unavailable. The offline planner can continue.',
  network: 'The provider connection failed. Check network access and proxy configuration.',
  bad_response: 'The provider returned an unreadable response. The offline planner can continue.',
};

function failure(code, status) {
  return new ProviderError(code, HINTS[code], status);
}

function classify(status, body = {}, header = '') {
  const code = String(body.error?.code || body.error?.type || body.__type || body.type || header);
  const message = String(body.message || body.error?.message || '');
  if (status === 401 || status === 403) return 'auth';
  if (status === 429 || /throttl|rate.?limit/i.test(code)) return 'throttled';
  if (status === 404 || /model.not.found|ResourceNotFound/i.test(code)
    || /model.*(identifier|id).*(invalid|not found)|invalid.*model.*identifier/i.test(message)) return 'model_not_found';
  if (status >= 500) return 'server_error';
  return 'bad_request';
}

function isReset(error) {
  const code = error?.cause?.code || error?.code;
  return ['ECONNRESET', 'ENETRESET', 'EPIPE', 'UND_ERR_SOCKET'].includes(code);
}

async function abortable(operation, signal, timeoutMs) {
  const controller = new AbortController();
  let timer;
  let abort;
  const pending = new Promise((_, reject) => {
    abort = () => {
      controller.abort();
      reject(failure('timeout'));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(abort, timeoutMs);
  });
  try {
    if (signal?.aborted) throw failure('timeout');
    return await Promise.race([operation(controller.signal), pending]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function delay(milliseconds, signal) {
  await abortable(() => new Promise(resolve => setTimeout(resolve, milliseconds)), signal, milliseconds + 25);
}

async function requestJSON(fetchImpl, url, options, settings = {}) {
  const { signal, callTimeoutMs = 20000, deadline = Date.now() + 30000, onEvent = () => {} } = settings;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    const remaining = deadline - started;
    if (remaining <= 0) throw failure('timeout');
    onEvent({ type: 'attempt_start', attempt });
    let retryAfter = 200;
    try {
      const body = await abortable(async callSignal => {
        const response = await fetchImpl(url, { ...options, redirect: 'error', signal: callSignal });
        const status = response.status ?? (response.ok ? 200 : 500);
        let data;
        try { data = await response.json(); }
        catch { if (response.ok) throw failure('bad_response', status); data = {}; }
        if (!response.ok) {
          const advised = Number(response.headers?.get?.('retry-after'));
          if (advised > 0) retryAfter = Math.max(200, advised * 1000);
          const code = classify(status, data, response.headers?.get?.('x-amzn-errortype') || '');
          throw failure(code, status);
        }
        return data;
      }, signal, Math.min(callTimeoutMs, remaining));
      onEvent({ type: 'attempt_end', attempt, ms: Date.now() - started, code: 'ok' });
      return body;
    } catch (error) {
      const normalized = error instanceof ProviderError ? error : failure(signal?.aborted ? 'timeout' : 'network');
      onEvent({ type: 'attempt_end', attempt, ms: Date.now() - started, code: normalized.code });
      const retryable = ['throttled', 'server_error'].includes(normalized.code) || isReset(error);
      const fits = retryAfter <= 1000 && Date.now() + retryAfter < deadline && !signal?.aborted;
      if (attempt === 2 || !retryable || !fits) throw normalized;
      onEvent({ type: 'retry', attempt: 2, code: normalized.code, backoffMs: retryAfter });
      await delay(retryAfter, signal);
    }
  }
}

module.exports = { requestJSON, ProviderError, failure, classify };
