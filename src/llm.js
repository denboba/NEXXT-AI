'use strict';
// Optional: lets the coach answer free-text questions with Claude. Without ANTHROPIC_API_KEY the coach
// uses its scripted answers only. Guardrail: any reply containing a figure that is not in FACTS is discarded.

const SYSTEM = `You are the Raiffeisen AI Investment Coach in a demo. You talk to customers about starting to invest.
Rules:
- Plain words, friendly, 1 to 3 short sentences, no jargon, no markdown.
- Use ONLY numbers that appear in FACTS. Never invent returns, fees, dates or percentages.
- Never promise or guarantee returns. Say results are a simulation when you mention figures.
- Never give tax or legal advice; for complex or personal questions suggest talking to a Raiffeisen adviser.
- Stay on topic: saving, inflation, investing basics, the Raiffeisen products listed in FACTS.`;

const numbersIn = (s) => (String(s).replace(/(\d),(\d)/g, '$1$2').match(/\d+(?:\.\d+)?/g) || []);

function numbersAllowed(reply, facts) {
  const allowed = new Set(numbersIn(facts));
  return numbersIn(reply).every((n) => n.length < 2 || allowed.has(n));
}

async function ask({ text, facts, fetchImpl = fetch, env = process.env }) {
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.COACH_MODEL || 'claude-sonnet-5-5',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: `FACTS:\n${facts}\n\nCustomer says: ${String(text).slice(0, 500)}` }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    if (!reply || reply.length > 800 || !numbersAllowed(reply, facts)) return null;
    return reply;
  } catch (e) {
    return null;
  }
}

module.exports = { ask, numbersAllowed };
