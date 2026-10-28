'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {select}=require('../src/agent/provider');
const tool={name:'get_customer_profile',description:'Profile',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false}};
const request={system:'Rules',messages:[{role:'user',content:'Help'}],tools:[tool]};
test('Anthropic and compatible adapters normalize tool calls and usage',async()=>{
  for(const kind of ['anthropic','openai']) {
    let payload;
    const provider=select({env:{LLM_PROVIDER:kind,ANTHROPIC_API_KEY:'fake',COMPAT_API_KEY:'fake',COACH_MODEL:'test-model'},fetchImpl:async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>kind==='anthropic'?{content:[{type:'tool_use',id:'1',name:tool.name,input:{}}],usage:{input_tokens:7,output_tokens:2}}:{choices:[{message:{tool_calls:[{id:'1',function:{name:tool.name,arguments:'{}'}}]}}],usage:{prompt_tokens:7,completion_tokens:2}}};}});
    const result=await provider.complete(request);assert.equal(result.toolCalls[0].name,tool.name);assert.equal(result.usage.inputTokens,7);assert.equal(payload.model,'test-model');
  }
});
test('Bedrock uses a regional Converse endpoint and bearer authentication',async()=>{
  let captured;
  const provider=select({env:{LLM_PROVIDER:'bedrock',AWS_REGION:'eu-west-2',AWS_BEARER_TOKEN_BEDROCK:'test-key',BEDROCK_MODEL_ID:'eu.anthropic.test:0'},fetchImpl:async(url,options)=>{captured={url,options};return {ok:true,json:async()=>({output:{message:{content:[{toolUse:{toolUseId:'a',name:tool.name,input:{}}}]}},usage:{inputTokens:5,outputTokens:2}})};}});
  const result=await provider.complete(request);
  assert.match(captured.url,/bedrock-runtime.eu-west-2.amazonaws.com\/model\/eu.anthropic.test%3A0\/converse$/);
  assert.equal(captured.options.headers.authorization,'Bearer test-key');assert.equal(result.toolCalls[0].name,tool.name);
});
test('missing keys select offline; invalid remote compatible URL cannot receive a key',async()=>{
  assert.equal(select({env:{}}),null);
  const provider=select({env:{LLM_PROVIDER:'openai',COMPAT_API_KEY:'fake',COMPAT_BASE_URL:'http://example.com'},fetchImpl:()=>{throw new Error('Must not fetch');}});
  await assert.rejects(provider.complete(request),/HTTPS/);
});
test('Anthropic and Bedrock combine a tool batch into one user result message',async()=>{
  const messages=[{role:'user',content:'Help me save'},{role:'assistant',content:'',toolCalls:[{id:'a',name:tool.name,input:{}},{id:'b',name:tool.name,input:{}}]},{role:'tool',toolCallId:'a',content:'{"balance":100}'},{role:'tool',toolCallId:'b',content:'{"balance":200}'}];
  for(const kind of ['anthropic','bedrock']) {
    let body;
    const provider=select({env:{LLM_PROVIDER:kind,ANTHROPIC_API_KEY:'fake',AWS_BEARER_TOKEN_BEDROCK:'fake',AWS_REGION:'eu-west-2',BEDROCK_MODEL_ID:'test'},fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>kind==='anthropic'?{content:[{type:'text',text:'Safe saving.'}]}:{output:{message:{content:[{text:'Safe saving.'}]}}}};}});
    await provider.complete({...request,messages});assert.equal(body.messages.length,3);assert.equal(body.messages[2].role,'user');assert.equal(body.messages[2].content.length,2);
  }
});
