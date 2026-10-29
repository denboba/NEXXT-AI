'use strict';
// Test-only helpers: replay recorded Anthropic SSE fixtures through a fake fetch response whose
// body is a ReadableStream delivering the bytes in awkward chunk sizes.
const fs = require('node:fs');
const path = require('node:path');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name + '.sse'), 'utf8');

// stallAfter: stop delivering (never close) after that many bytes; gapMs: wait before each chunk.
function sseResponse(text, { chunk = 7, stallAfter = Infinity, gapMs = 0 } = {}) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (offset >= stallAfter) return new Promise(() => {});
      if (gapMs) await new Promise(resolve => setTimeout(resolve, gapMs));
      if (offset >= bytes.length) return controller.close();
      const end = Math.min(offset + chunk, bytes.length, stallAfter);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
  return { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body };
}

module.exports = { fixture, sseResponse };
