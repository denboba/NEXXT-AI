'use strict';
const { requestJSON, ProviderError, failure } = require('./http');
const { merge } = require('./messages');

function validModel(value) {
  if (!value || value.length > 2048) return false;
  if (!value.startsWith('arn:')) return /^[A-Za-z0-9._:-]+$/.test(value);
  const prefix = /^arn:aws(?:-gov|-cn)?:bedrock:[a-z0-9-]+:\d{0,12}:/;
  const resource = /^(foundation-model|inference-profile|application-inference-profile)\/[A-Za-z0-9._:-]+$/;
  return prefix.test(value) && resource.test(value.replace(prefix, ''));
}

function messagesFor(messages) {
  return merge(messages.map(message => {
    if (message.role === 'tool') return { role: 'user', content: [{ toolResult: {
      toolUseId: message.toolCallId, content: [{ json: JSON.parse(message.content) }],
    } }] };
    return { role: message.role, content: [
      ...(message.content ? [{ text: message.content }] : []),
      ...(message.toolCalls || []).map(call => ({ toolUse: { toolUseId: call.id, name: call.name, input: call.input } })),
    ] };
  }));
}

function create({ env, fetchImpl = fetch }) {
  return {
    name: 'bedrock', model: env.BEDROCK_MODEL_ID || null,
    async complete({ system, context, messages, tools, signal, callTimeoutMs, deadline, onEvent }) {
      if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(env.AWS_REGION || '')) throw failure('bad_request');
      const modelHint = 'Check BEDROCK_MODEL_ID: use a foundation model ID or inference profile ID/ARN, not a display name.';
      if (!validModel(env.BEDROCK_MODEL_ID)) throw new ProviderError('model_not_found', modelHint);
      const url = 'https://bedrock-runtime.' + env.AWS_REGION + '.amazonaws.com/model/'
        + encodeURIComponent(env.BEDROCK_MODEL_ID) + '/converse';
      let data;
      try {
        data = await requestJSON(fetchImpl, url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.AWS_BEARER_TOKEN_BEDROCK },
          body: JSON.stringify({
            system: [{ text: context ? system + '\n' + context : system }], messages: messagesFor(messages), inferenceConfig: { maxTokens: 800 },
            toolConfig: { tools: tools.map(tool => ({ toolSpec: {
              name: tool.name, description: tool.description, inputSchema: { json: tool.inputSchema },
            } })) },
          }),
        }, { signal, callTimeoutMs, deadline, onEvent });
      } catch (error) {
        if (error.code === 'model_not_found') throw new ProviderError(error.code, modelHint, error.status);
        throw error;
      }
      const content = data.output?.message?.content;
      if (!Array.isArray(content)) throw failure('bad_response');
      return {
        text: content.filter(block => block.text).map(block => block.text).join(' '),
        toolCalls: content.filter(block => block.toolUse).map(({ toolUse }) => ({
          id: toolUse.toolUseId, name: toolUse.name, input: toolUse.input,
        })),
        usage: {
          inputTokens: data.usage?.inputTokens || 0, outputTokens: data.usage?.outputTokens || 0,
          reported: Boolean(data.usage),
        },
      };
    },
  };
}

module.exports = { create, validModel };
