'use strict';
const offline=require('./offline');
function create(sequence) {
  let index=0;
  return {name:'scripted',model:'scripted',async complete(request) {
    if(sequence) {
      const item=sequence[index++];
      if(typeof item==='function') return item(request);
      if(!item) return {text:'',toolCalls:[],usage:{inputTokens:0,outputTokens:0}};
      return {...item,usage:item.usage || {inputTokens:0,outputTokens:0}};
    }
    const result=offline.next(request.state);
    if(!result.toolCalls?.length || result.stopAfterTools) {
      if (!result.toolCalls?.length) return {
        text: offline.answer(request.state.results, request.state.risk, request.state.language),
        toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
    return {...result,usage:{inputTokens:0,outputTokens:0}};
  }};
}
module.exports={create};
