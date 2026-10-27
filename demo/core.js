/* Small, dependency-free replay state shared by the page and its tests. */
(function (root) {
  'use strict';
  const durations = [20000, 25000, 25000, 25000, 25000];
  const choices = ['a', 'b', 'both', 'more'];
  const responses = ['careful', 'overreacts', 'misses'];
  function initial() { return { step: 0, elapsed: 0, playing: false, choice: null, response: 'careful' }; }
  function reduce(state, event) {
    switch (event.type) {
      case 'reset': return initial();
      case 'goto': return { ...state, step: Math.max(0, Math.min(4, event.step)), elapsed: 0 };
      case 'toggle': return { ...state, playing: !state.playing };
      case 'pause': return { ...state, playing: false };
      case 'choice': return choices.includes(event.value) ? { ...state, choice: event.value, playing: false } : state;
      case 'response': return responses.includes(event.value) ? { ...state, response: event.value, playing: false } : state;
      case 'tick': {
        if (!state.playing || !Number.isFinite(event.ms) || event.ms < 0) return state;
        let next = { ...state, elapsed: state.elapsed + event.ms };
        while (next.elapsed >= durations[next.step]) {
          next.elapsed -= durations[next.step];
          if (next.step === 4) next = { ...initial(), playing: true, elapsed: next.elapsed };
          else next.step++;
        }
        return next;
      }
      default: return state;
    }
  }
  function progress(state) {
    return (durations.slice(0, state.step).reduce((a, b) => a + b, 0) + state.elapsed) / 120000;
  }
  const api = { initial, reduce, progress, durations };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoReplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
