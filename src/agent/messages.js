'use strict';
// Tool batches produce several neutral tool messages; wire APIs expect their
// results together in a single user message between assistant turns.
function merge(messages) {
  const output=[];
  for(const message of messages) {
    const previous=output.at(-1);
    if(previous?.role===message.role) previous.content.push(...message.content);
    else output.push({role:message.role,content:[...message.content]});
  }
  return output;
}
module.exports={merge};
