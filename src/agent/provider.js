'use strict';
const keys={anthropic:'ANTHROPIC_API_KEY',openai:'COMPAT_API_KEY',bedrock:'AWS_BEARER_TOKEN_BEDROCK'};
// Blank LLM_PROVIDER: first configured key in this order wins (anthropic > openai > bedrock > offline).
function select({env=process.env,fetchImpl=fetch}) {
  const explicit=String(env.LLM_PROVIDER||'').trim().toLowerCase();
  const provider=explicit||Object.keys(keys).find(name=>env[keys[name]])||'offline';
  if(!keys[provider] || !env[keys[provider]]) return null;
  return require('./'+provider).create({env,fetchImpl});
}
module.exports={select};
