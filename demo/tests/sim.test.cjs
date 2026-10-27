const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../core.js');

const all = ['a', 'b', 'c', 'd'];
const byId = rows => Object.fromEntries(rows.map(r => [r.id, r]));

test('the workday is deterministic and the attack runs in order', () => {
  assert.deepEqual(E.compileTimeline(all), E.compileTimeline(all));
  E.steps.forEach((s, i) => {
    assert.ok(s.t > E.DAY_START && s.t < E.DAY_END, s.id);
    if (i) assert.ok(s.t > E.steps[i - 1].t, `${s.id} after ${E.steps[i - 1].id}`);
  });
  const events = E.compileTimeline(all);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].t >= events[i - 1].t);
  assert.ok(events.filter(e => e.type === 'log').length > 400, 'a busy day of ordinary activity');
});

test('scores match the hand-computed values for every SOC', () => {
  const r = byId(E.report(all));
  const expect = {
    a: { detected: 6, falseAlarms: 14, mttd: 8 / 6, maxTtd: 2, mttr: 22 / 6, contained: false, overall: 60 },
    b: { detected: 6, falseAlarms: 3, mttd: 10, maxTtd: 15, mttr: 27.5, contained: true, overall: 80 },
    c: { detected: 7, falseAlarms: 1, mttd: 36, maxTtd: 60, mttr: 465 / 7, contained: false, overall: 56 },
    d: { detected: 4, falseAlarms: 5, mttd: 22, maxTtd: 30, mttr: 48.75, contained: false, overall: 43 }
  };
  for (const [id, want] of Object.entries(expect)) {
    for (const [key, value] of Object.entries(want)) {
      if (typeof value === 'number' && !Number.isInteger(value)) assert.ok(Math.abs(r[id][key] - value) < 1e-9, `${id}.${key}`);
      else assert.equal(r[id][key], value, `${id}.${key}`);
    }
  }
});

test('fastest is not best: the quickest detector does not win overall', () => {
  const rows = E.report(all);
  const fastest = rows.reduce((a, b) => (b.mttd < a.mttd ? b : a));
  assert.equal(rows[0].id, 'b');
  assert.notEqual(fastest.id, rows[0].id);
});

test('the report is derived from the events the console shows', () => {
  const events = E.compileTimeline(['b', 'd']);
  assert.ok(!events.some(e => e.soc === 'a' || e.soc === 'c'), 'only the selected SOCs take part');
  const before = E.score('b', events);
  const withoutOne = events.filter(e => !(e.soc === 'b' && e.type === 'detect' && e.step === 0));
  assert.equal(E.score('b', withoutOne).detected, before.detected - 1);
  const misses = events.filter(e => e.type === 'miss' && e.soc === 'd').length;
  assert.equal(misses, E.steps.length - E.score('d', events).detected);
});

test('the homepage hero shows SOC B from this model', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const rows = [...html.matchAll(/<li style="--i:\d+"><time>([\d:]+)<\/time><code>(T\d+)<\/code><span>([^<]+)<\/span><span class="res res-(hit|miss)">/g)];
  const b = E.score('b', E.compileTimeline(['b']));
  assert.equal(rows.length, E.steps.length);
  rows.forEach(([, time, id, name, res], i) => {
    assert.equal(time, E.clock(E.steps[i].t), `${id} time`);
    assert.equal(id, E.steps[i].id);
    assert.equal(name, E.steps[i].name);
    assert.equal(res === 'hit', b.perStep[i], `${id} detected`);
  });
  const foot = [...html.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)].map(m => m[2]);
  assert.deepEqual(foot, [`${b.detected} of ${b.total}`, E.duration(b.mttd), E.duration(b.mttr)]);
});

test('time formatting', () => {
  assert.equal(E.clock(580), '09:40');
  assert.equal(E.clock(910.9), '15:10');
  assert.equal(E.duration(8 / 6), '1.3 min');
  assert.equal(E.duration(27.5), '28 min');
  assert.equal(E.duration(465 / 7), '1 h 6 min');
  assert.equal(E.duration(null), 'n/a');
});

test('the demo stays self-contained', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.ok(!/^https?:|^\/\//.test(target), `External resource: ${target}`);
    if (!target.startsWith('#')) assert.ok(fs.existsSync(path.resolve(root, target.split(/[?#]/)[0])), target);
  }
  // Versioned URLs stop a browser pairing a new page with cached old scripts after a deploy.
  for (const asset of ['demo.css', 'core.js', 'app.js']) assert.match(html, new RegExp(`"${asset.replace('.', '\\.')}\\?v=\\d{8}"`), `${asset} is versioned`);
  const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8') + fs.readFileSync(path.join(root, 'core.js'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|new WebSocket/.test(js));
  assert.ok(!/https?:\/\//.test(fs.readFileSync(path.join(root, 'demo.css'), 'utf8')));
  assert.match(html, /Simulated SOCs, fictional bank/);
});
