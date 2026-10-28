'use strict';
function select({env=process.env,fetchImpl=fetch}) {
  const provider=env.LLM_PROVIDER || (env.AWS_BEARER_TOKEN_BEDROCK?'bedrock':env.ANTHROPIC_API_KEY?'anthropic':env.COMPAT_API_KEY?'openai':'offline');
  const keys={bedrock:'AWS_BEARER_TOKEN_BEDROCK',anthropic:'ANTHROPIC_API_KEY',openai:'COMPAT_API_KEY'};
  if(!keys[provider] || !env[keys[provider]]) return null;
  return require('./'+provider).create({env,fetchImpl});
}
module.exports={select};
