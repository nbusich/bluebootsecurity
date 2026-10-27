const { test } = require('node:test');
const assert = require('node:assert/strict');
const replay = require('../core.js');

test('120-second playback loops and clears the visitor choice and response', () => {
  let state = replay.initial();
  state = replay.reduce(state, { type: 'choice', value: 'a' });
  state = replay.reduce(state, { type: 'response', value: 'overreacts' });
  state = replay.reduce(state, { type: 'toggle' });
  state = replay.reduce(state, { type: 'tick', ms: 119999 });
  assert.equal(state.step, 4);
  assert.equal(state.choice, 'a');
  state = replay.reduce(state, { type: 'tick', ms: 1 });
  assert.deepEqual(state, { ...replay.initial(), playing: true });
});

test('choosing an activity or example response pauses playback', () => {
  let state = replay.reduce(replay.initial(), { type: 'toggle' });
  state = replay.reduce(state, { type: 'choice', value: 'more' });
  assert.equal(state.playing, false);
  assert.equal(state.choice, 'more');
  assert.deepEqual(replay.reduce(state, { type: 'tick', ms: 25000 }), state);
  state = replay.reduce(state, { type: 'toggle' });
  state = replay.reduce(state, { type: 'response', value: 'misses' });
  assert.equal(state.playing, false);
  assert.equal(state.response, 'misses');
});

test('restart discards prior answers, chapter, progress and playback', () => {
  let state = replay.reduce(replay.initial(), { type: 'goto', step: 4 });
  state = replay.reduce(state, { type: 'choice', value: 'both' });
  state = replay.reduce(state, { type: 'response', value: 'misses' });
  state = replay.reduce(state, { type: 'toggle' });
  state = replay.reduce(state, { type: 'tick', ms: 6000 });
  assert.deepEqual(replay.reduce(state, { type: 'reset' }), replay.initial());
});

test('chapter navigation stays within the replay and resets chapter timing', () => {
  let state = replay.reduce(replay.initial(), { type: 'goto', step: 20 });
  assert.equal(state.step, 4);
  state = replay.reduce(state, { type: 'toggle' });
  state = replay.reduce(state, { type: 'tick', ms: 2000 });
  state = replay.reduce(state, { type: 'goto', step: -1 });
  assert.equal(state.step, 0);
  assert.equal(state.elapsed, 0);
  assert.equal(replay.progress(state), 0);
});

test('invalid choices and ticks cannot corrupt replay state', () => {
  const state = replay.reduce(replay.initial(), { type: 'toggle' });
  for (const event of [
    { type: 'choice', value: 'unknown' }, { type: 'response', value: '<script>' },
    { type: 'tick', ms: -1 }, { type: 'tick', ms: NaN }, { type: 'tick', ms: Infinity }
  ]) assert.deepEqual(replay.reduce(state, event), state);
});
