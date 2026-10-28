'use strict';
const { requestJSON } = require('./http');
const { merge } = require('./messages');

function messagesFor(messages) {
  return merge(messages.map(message => {
    if (message.role === 'tool') {
      return { role: 'user', content: [{
        type: 'tool_result', tool_use_id: message.toolCallId, content: message.content,
      }] };
    }
    return { role: message.role, content: [
      ...(message.content ? [{ type: 'text', text: message.content }] : []),
      ...(message.toolCalls || []).map(call => ({ type: 'tool_use', id: call.id, name: call.name, input: call.input })),
    ] };
  }));
}

function create({ env, fetchImpl = fetch }) {
  return {
    name: 'anthropic',
    async complete({ system, messages, tools, signal, callTimeoutMs, deadline, onEvent }) {
      const data = await requestJSON(fetchImpl, 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.COACH_MODEL || 'claude-sonnet-4-5-20250929', max_tokens: 800, system,
          messages: messagesFor(messages),
          tools: tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })),
        }),
      }, { signal, callTimeoutMs, deadline, onEvent });
      return {
        text: (data.content || []).filter(block => block.type === 'text').map(block => block.text).join(' '),
        toolCalls: (data.content || []).filter(block => block.type === 'tool_use')
          .map(block => ({ id: block.id, name: block.name, input: block.input })),
        usage: {
          inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0,
          reported: Boolean(data.usage),
        },
      };
    },
  };
}

module.exports = { create };
