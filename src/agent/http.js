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

// Line reader over a fetch body (ReadableStream or async iterable). Dispatches one {event, data}
// per blank-line-terminated SSE block. `next` is wrapped by the caller so it can race an idle timer.
async function readSSE(body, next, dispatch) {
  if (!body) throw failure('bad_response');
  const reader = body.getReader ? body.getReader() : body[Symbol.asyncIterator]();
  const decoder = new TextDecoder();
  let buffer = '', event = '', data = [], done = false;
  const flush = () => {
    if (data.length) dispatch({ event: event || 'message', data: data.join('\n') });
    event = ''; data = [];
  };
  const line = raw => {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (text === '') return flush();
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  };
  try {
    while (true) {
      const chunk = await next(reader);
      if (chunk.done) { done = true; break; }
      buffer += typeof chunk.value === 'string' ? chunk.value : decoder.decode(chunk.value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, index)); buffer = buffer.slice(index + 1); }
    }
    buffer += decoder.decode();
    if (buffer) line(buffer);
    flush();
  } finally {
    if (!done) {
      try { await (reader.cancel ? reader.cancel() : reader.return?.()); } catch { /* best effort */ }
    }
  }
}

// Streaming variant of requestJSON. Same retry/deadline/abort semantics, plus an idle timer:
// if no SSE event arrives within idleMs of sending the request, or between two events, the call
// is aborted with failure('timeout'). A retry is only attempted before any event was received.
async function requestStream(fetchImpl, url, options, settings = {}) {
  const { signal, callTimeoutMs = 20000, deadline = Date.now() + 30000, onEvent = () => {},
    idleMs = 6000, onData } = settings;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    const remaining = deadline - started;
    if (remaining <= 0) throw failure('timeout');
    onEvent({ type: 'attempt_start', attempt });
    let retryAfter = 200, received = false;
    try {
      await abortable(async callSignal => {
        const inner = new AbortController();
        let timer, stalled;
        const stall = new Promise((_, reject) => { stalled = reject; });
        stall.catch(() => {});
        // Outer abort (client, deadline): end the read loop now instead of waiting for the idle timer.
        const stop = () => { inner.abort(); stalled(failure('timeout')); };
        callSignal.addEventListener('abort', stop, { once: true });
        const arm = () => {
          clearTimeout(timer);
          timer = setTimeout(() => { inner.abort(); stalled(failure('timeout')); }, idleMs);
        };
        try {
          arm();
          const response = await Promise.race([
            fetchImpl(url, { ...options, redirect: 'error', signal: inner.signal }), stall]);
          const status = response.status ?? (response.ok ? 200 : 500);
          if (!response.ok) {
            clearTimeout(timer);
            let data;
            try { data = await response.json(); } catch { data = {}; }
            const advised = Number(response.headers?.get?.('retry-after'));
            if (advised > 0) retryAfter = Math.max(200, advised * 1000);
            throw failure(classify(status, data || {}, response.headers?.get?.('x-amzn-errortype') || ''), status);
          }
          await readSSE(response.body, reader => Promise.race([reader.next ? reader.next() : reader.read(), stall]),
            item => { received = true; arm(); onData(item); });
        } finally {
          clearTimeout(timer);
          callSignal.removeEventListener('abort', stop);
        }
      }, signal, Math.min(callTimeoutMs, remaining));
      onEvent({ type: 'attempt_end', attempt, ms: Date.now() - started, code: 'ok' });
      return;
    } catch (error) {
      const normalized = error instanceof ProviderError ? error : failure(signal?.aborted ? 'timeout' : 'network');
      onEvent({ type: 'attempt_end', attempt, ms: Date.now() - started, code: normalized.code });
      const retryable = !received && (['throttled', 'server_error'].includes(normalized.code) || isReset(error));
      const fits = retryAfter <= 1000 && Date.now() + retryAfter < deadline && !signal?.aborted;
      if (attempt === 2 || !retryable || !fits) throw normalized;
      onEvent({ type: 'retry', attempt: 2, code: normalized.code, backoffMs: retryAfter });
      await delay(retryAfter, signal);
    }
  }
}

module.exports = { requestJSON, requestStream, ProviderError, failure, classify };
