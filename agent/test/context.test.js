import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSystemPrompt, estimateTokens, repairTurn, selectHistory } from '../src/context.js';

const turn = (id, content) => ({
  turn_id: id,
  status: 'done',
  messages: [
    { role: 'user', content: `q${id}` },
    { role: 'assistant', content, reasoning_content: '' },
  ],
});

test('selectHistory keeps newest whole turns within budget', () => {
  const history = [turn(1, 'a'.repeat(400)), turn(2, 'b'.repeat(40)), turn(3, 'c'.repeat(40))];
  const out = selectHistory(history, 60);
  assert.equal(out.keptTurns, 2);
  assert.equal(out.droppedTurns, 1);
  assert.deepEqual(out.messages.map((m) => m.content), ['q2', 'b'.repeat(40), 'q3', 'c'.repeat(40)]);
});

test('selectHistory stops at the first turn that does not fit (no gaps)', () => {
  const history = [turn(1, 'x'), turn(2, 'y'.repeat(4000)), turn(3, 'z')];
  const out = selectHistory(history, 100);
  assert.deepEqual(out.messages.map((m) => m.content), ['q3', 'z']);
});

test('repairTurn answers dangling tool calls after existing results', () => {
  const calls = [
    { id: 'a', type: 'function', function: { name: 't', arguments: '{}' } },
    { id: 'b', type: 'function', function: { name: 't', arguments: '{}' } },
  ];
  const fixed = repairTurn([
    { role: 'user', content: 'q' },
    { role: 'assistant', content: '', tool_calls: calls },
    { role: 'tool', tool_call_id: 'a', content: 'ok' },
  ]);
  assert.deepEqual(fixed.map((m) => [m.role, m.tool_call_id]), [
    ['user', undefined], ['assistant', undefined], ['tool', 'a'], ['tool', 'b'],
  ]);
});

test('buildSystemPrompt skips empty sections in order', () => {
  const ctx = /** @type {any} */ ({ system_prompt: '' });
  const text = buildSystemPrompt(
    [{ id: 'a', render: () => 'A' }, { id: 'b', render: () => null }, { id: 'c', render: () => 'C' }],
    ctx,
  );
  assert.equal(text, 'A\n\nC');
});

test('estimateTokens counts CJK per character', () => {
  assert.equal(estimateTokens('你好'), 2);
  assert.equal(estimateTokens('abcdefgh'), 2);
});
