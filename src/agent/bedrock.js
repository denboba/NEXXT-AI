'use strict';
function create({env,fetchImpl=fetch}) {
  return {name:'bedrock',async complete({system,messages,tools,signal}) {
    const region=env.AWS_REGION;
    if(!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region || '') || !env.BEDROCK_MODEL_ID) throw new Error('Bedrock requires a Region and exact model or inference profile ID');
    const converted=messages.map(message=>message.role==='tool'?{role:'user',content:[{toolResult:{toolUseId:message.toolCallId,content:[{json:JSON.parse(message.content)}]}}]}:{role:message.role,content:[...(message.content?[{text:message.content}]:[]),...(message.toolCalls || []).map(call=>({toolUse:{toolUseId:call.id,name:call.name,input:call.input}}))]});
    const response=await fetchImpl('https://bedrock-runtime.'+region+'.amazonaws.com/model/'+encodeURIComponent(env.BEDROCK_MODEL_ID)+'/converse',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+env.AWS_BEARER_TOKEN_BEDROCK},body:JSON.stringify({system:[{text:system}],messages:require('./messages').merge(converted),inferenceConfig:{maxTokens:800},toolConfig:{tools:tools.map(tool=>({toolSpec:{name:tool.name,description:tool.description,inputSchema:{json:tool.inputSchema}}}))}}),signal});
    if(!response.ok) throw new Error('Provider HTTP '+response.status);
    const data=await response.json(),content=data.output?.message?.content;
    if(!Array.isArray(content)) throw new Error('Empty Bedrock response');
    return {text:content.filter(block=>block.text).map(block=>block.text).join(' '),toolCalls:content.filter(block=>block.toolUse).map(({toolUse})=>({id:toolUse.toolUseId,name:toolUse.name,input:toolUse.input})),usage:{inputTokens:data.usage?.inputTokens || 0,outputTokens:data.usage?.outputTokens || 0,reported:Boolean(data.usage)}};
  }};
}
module.exports={create};
