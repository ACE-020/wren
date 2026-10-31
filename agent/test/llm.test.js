import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { LLMError, MessageAccumulator, streamCompletion } from '../src/llm.js';
import { startFakeLLM } from './support/fake-llm.js';

/** @type {Awaited<ReturnType<typeof startFakeLLM>>} */
let llm;
before(async () => { llm = await startFakeLLM(); });
after(() => llm.close());

const model = () => ({
  base_url: llm.url, model: 'fake', api_key: 'k', thinking: /** @type {const} */ ('default'),
  reasoning_effort: /** @type {const} */ (''), max_steps: 4, history_budget_tokens: 10000,
});

test('streams reasoning and text, assembles tool calls', async () => {
  llm.push({ reasoning: '想一想', text: '好的', tool_calls: [{ name: 'echo', arguments: { a: 1 } }] });
  const deltas = [];
  const out = await streamCompletion({
    model: model(), messages: [{ role: 'user', content: 'hi' }], onDelta: (d) => deltas.push(d),
  });
  assert.equal(out.message.reasoning_content, '想一想');
  assert.equal(out.message.content, '好的');
  assert.equal(out.message.tool_calls?.[0].function.name, 'echo');
  assert.equal(out.message.tool_calls?.[0].function.arguments, '{"a":1}');
  assert.equal(out.finishReason, 'tool_calls');
  assert.equal(out.usage?.prompt_tokens, 100);
  assert.ok(deltas.some((d) => d.reasoning) && deltas.some((d) => d.text));
});

test('sends thinking and effort only when configured', async () => {
  llm.push({ text: 'a' }, { text: 'b' });
  await streamCompletion({ model: model(), messages: [{ role: 'user', content: 'x' }] });
  await streamCompletion({
    model: { ...model(), thinking: 'disabled', reasoning_effort: 'low' },
    messages: [{ role: 'user', content: 'x' }],
  });
  const [a, b] = llm.requests.slice(-2);
  assert.equal(a.thinking, undefined);
  assert.equal(a.reasoning_effort, undefined);
  assert.deepEqual(b.thinking, { type: 'disabled' });
  assert.equal(b.reasoning_effort, 'low');
});

test('HTTP errors become LLMError with retryable flag', async () => {
  llm.push({ status: 503 }, { status: 401 });
  const run = () => streamCompletion({ model: model(), messages: [{ role: 'user', content: 'x' }] });
  await assert.rejects(run, (e) => e instanceof LLMError && e.retryable === true && e.status === 503);
  await assert.rejects(run, (e) => e instanceof LLMError && e.retryable === false && e.status === 401);
});

test('missing key fails fast', async () => {
  await assert.rejects(
    streamCompletion({ model: { ...model(), api_key: '' }, messages: [] }),
    /API key/,
  );
});

test('accumulator keeps empty reasoning_content when the server sent the field', () => {
  const acc = new MessageAccumulator();
  acc.add({ role: 'assistant', content: 'x', reasoning_content: '' });
  assert.equal(acc.message().reasoning_content, '');
  const plain = new MessageAccumulator();
  plain.add({ content: 'x' });
  assert.equal('reasoning_content' in plain.message(), false);
});
