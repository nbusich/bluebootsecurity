(function () {
  'use strict';
  const E = window.Evaluation;
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';
  const DAY = E.DAY_END - E.DAY_START;
  const RATE = DAY / 75; // simulated minutes per second at 1x: the workday plays in 75 s
  const SIEM = { x: 650, y: 30, w: 92, h: 350 };
  const pct = t => `${((t - E.DAY_START) / DAY) * 100}%`;
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nodeById = Object.fromEntries(E.nodes.map(n => [n.id, n]));
  // Label placement, chosen so no label sits on an edge or a ring.
  const labelAt = { fw: { y: -26 }, core: { x: -26, y: 5, anchor: 'end' } };

  const state = {
    phase: 'setup', picked: new Set(E.defaultLineup), lineup: [], events: [], cursor: 0,
    t: E.DAY_START, playing: false, speed: 1, focus: null, selected: null
  };
  let idleAt = performance.now();

  /* ---------- Network ---------- */
  const el = (tag, attrs = {}, parent) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };
  const edgeEls = {};
  const nodeEls = {};
  let siemCount, siemBars, particleLayer;
  function drawNetwork() {
    const svg = $('network');
    const edgeLayer = el('g', { class: 'edges' }, svg);
    E.edges.forEach(([a, b]) => {
      edgeEls[[a, b].sort().join('|')] = el('line', { class: 'edge', x1: nodeById[a].x, y1: nodeById[a].y, x2: nodeById[b].x, y2: nodeById[b].y }, edgeLayer);
    });
    const siem = el('g', { class: 'siem' }, svg);
    el('rect', { x: SIEM.x, y: SIEM.y, width: SIEM.w, height: SIEM.h, rx: 8 }, siem);
    el('text', { x: SIEM.x + SIEM.w / 2, y: SIEM.y + 30, class: 'siem-title' }, siem).textContent = 'SIEM';
    siemCount = el('text', { x: SIEM.x + SIEM.w / 2, y: SIEM.y + 78, class: 'siem-count' }, siem);
    el('text', { x: SIEM.x + SIEM.w / 2, y: SIEM.y + 98, class: 'siem-unit' }, siem).textContent = 'logs';
    siemBars = Array.from({ length: 12 }, (_, i) => el('rect', { x: SIEM.x + 12 + i * 5.8, width: 4, y: SIEM.y + SIEM.h - 24, height: 0, class: 'siem-bar' }, siem));
    E.nodes.forEach(n => {
      const g = el('g', { class: `node node-${n.kind}`, transform: `translate(${n.x} ${n.y})`, 'data-node': n.id }, svg);
      if (n.kind !== 'cloud') { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', `${n.label}: show logs`); }
      el('circle', { r: 31, class: 'ring-focus' }, g);
      el('circle', { r: 26, class: 'ring-attack' }, g);
      if (n.kind === 'user') { el('rect', { x: -18, y: -14, width: 36, height: 24, rx: 3, class: 'shape' }, g); el('rect', { x: -23, y: 11, width: 46, height: 4, rx: 2, class: 'shape' }, g); }
      else if (n.kind === 'server') { el('rect', { x: -15, y: -20, width: 30, height: 40, rx: 3, class: 'shape' }, g); el('line', { x1: -9, x2: 9, y1: -8, y2: -8, class: 'detail' }, g); el('line', { x1: -9, x2: 9, y1: 3, y2: 3, class: 'detail' }, g); }
      else if (n.id === 'fw') { el('rect', { x: -19, y: -14, width: 38, height: 28, rx: 3, class: 'shape' }, g); el('line', { x1: -19, x2: 19, y1: 0, y2: 0, class: 'detail' }, g); el('line', { x1: -6, x2: -6, y1: -14, y2: 0, class: 'detail' }, g); el('line', { x1: 7, x2: 7, y1: 0, y2: 14, class: 'detail' }, g); }
      else if (n.kind === 'net') el('circle', { r: 15, class: 'shape' }, g);
      else el('circle', { r: 20, class: 'shape cloud' }, g);
      el('path', { d: 'M0 0H12V7C12 10.6 9.4 13.2 6 14.4C2.6 13.2 0 10.6 0 7Z', class: 'shield', transform: 'translate(15 -33)' }, g);
      const at = labelAt[n.id] || { y: n.kind === 'cloud' ? 38 : 46 };
      el('text', { x: at.x || 0, y: at.y, class: 'node-label', 'text-anchor': at.anchor || 'middle' }, g).textContent = n.label;
      nodeEls[n.id] = g;
    });
    particleLayer = el('g', { class: 'particles' }, svg);
  }

  /* ---------- Particles: one capped, reused pool ---------- */
  const pool = [];
  function initParticles() {
    for (let i = 0; i < 90; i++) pool.push({ el: el('circle', { r: 2, class: 'particle', opacity: 0 }, particleLayer), live: false });
  }
  let siemSlot = 0;
  function spawn(node, attack) {
    if (reducedMotion() || document.hidden) return;
    const p = pool.find(q => !q.live);
    if (!p) return;
    const from = nodeById[node];
    siemSlot = (siemSlot + 1) % 9;
    Object.assign(p, { live: true, x0: from.x, y0: from.y, x1: SIEM.x + 2, y1: SIEM.y + 125 + siemSlot * 22, born: performance.now(), life: attack ? 1300 : 950 });
    p.el.setAttribute('r', attack ? 4.5 : 2.2);
    p.el.setAttribute('class', `particle${attack ? ' attack' : ''}`);
  }
  function stepParticles(now) {
    for (const p of pool) {
      if (!p.live) continue;
      const k = (now - p.born) / p.life;
      if (k >= 1) { p.live = false; p.el.setAttribute('opacity', 0); continue; }
      const e = 1 - Math.pow(1 - k, 2);
      p.el.setAttribute('cx', p.x0 + (p.x1 - p.x0) * e);
      p.el.setAttribute('cy', p.y0 + (p.y1 - p.y0) * e);
      p.el.setAttribute('opacity', k < .1 ? k * 10 : k > .85 ? (1 - k) / .15 : 1);
    }
  }
  function clearParticles() { pool.forEach(p => { p.live = false; p.el.setAttribute('opacity', 0); }); }

  /* ---------- Everything shown is derived from the events up to state.t ---------- */
  const seen = () => state.events.slice(0, state.cursor);
  function renderNetwork() {
    const past = seen();
    const compromised = new Set();
    const attackEdges = new Set();
    for (const e of past) {
      if (e.type !== 'attack') continue;
      const step = E.steps[e.step];
      compromised.add(step.node);
      (step.compromises || []).forEach(n => compromised.add(n));
      const path = step.path || [];
      for (let i = 1; i < path.length; i++) attackEdges.add([path[i - 1], path[i]].sort().join('|'));
    }
    const caught = new Set();
    const responded = new Set();
    if (state.focus) for (const e of past) {
      if (e.soc !== state.focus) continue;
      if (e.type === 'detect') caught.add(e.node);
      if (e.type === 'respond') responded.add(e.node);
    }
    for (const [id, g] of Object.entries(nodeEls)) {
      g.classList.toggle('is-compromised', compromised.has(id));
      g.classList.toggle('is-caught', caught.has(id));
      g.classList.toggle('is-responded', responded.has(id));
      g.classList.toggle('is-selected', state.selected === id);
    }
    for (const [key, line] of Object.entries(edgeEls)) line.classList.toggle('is-attack', attackEdges.has(key));
    const logs = past.filter(e => e.type === 'log' || e.type === 'attack');
    siemCount.textContent = logs.length.toLocaleString('en-US');
    siemBars.forEach((bar, i) => {
      const from = state.t - (12 - i) * 10;
      const count = logs.filter(e => e.t > from && e.t <= from + 10).length;
      const h = Math.min(56, count * 2);
      bar.setAttribute('height', h);
      bar.setAttribute('y', SIEM.y + SIEM.h - 18 - h);
    });
    renderInspector(past);
  }
  function renderInspector(past) {
    const box = $('inspector');
    if (!state.selected) { box.innerHTML = '<span class="inspector-hint">Select a device to see its logs</span>'; return; }
    const node = nodeById[state.selected];
    const lines = past.filter(e => e.node === state.selected && (e.type === 'log' || e.type === 'attack')).slice(-3).reverse();
    box.innerHTML = `<strong>${esc(node.label)}</strong><ol class="log-lines">${lines.length ? lines.map(e => `<li class="${e.type === 'attack' ? 'is-attack' : ''}"><time>${E.clock(e.t)}</time> ${esc(e.text)}</li>`).join('') : '<li class="is-empty">No logs yet</li>'}</ol>`;
  }

  /* ---------- SOC lanes ---------- */
  function buildLanes() {
    $('lane-list').innerHTML = state.lineup.map(id => {
      const soc = E.socs.find(s => s.id === id);
      return `<button class="lane" data-soc="${id}" aria-pressed="false" aria-label="${soc.name}, ${soc.type}: show on the network"><span class="lane-head"><strong>${soc.name}</strong><span>${soc.type}</span><span class="tally" data-tally="${id}"></span></span><span class="lane-track" data-track="${id}"></span></button>`;
    }).join('');
  }
  function renderLanes() {
    const past = seen();
    const ticks = E.steps.filter(s => s.t <= state.t).map(s => `<span class="tick" style="left:${pct(s.t)}"></span>`).join('');
    $('lane-overlay').innerHTML = `${ticks}<span class="playhead" style="left:${pct(state.t)}"></span>`;
    for (const id of state.lineup) {
      const mine = past.filter(e => e.soc === id);
      $('lane-list').querySelector(`[data-track="${id}"]`).innerHTML = mine.map(e => {
        if (e.type === 'detect') { const from = e.t - e.delay; return `<span class="m-bar m-bar-detect" style="left:${pct(from)};width:calc(${pct(e.t)} - ${pct(from)})"></span><span class="m m-detect" style="left:${pct(e.t)}"></span>`; }
        if (e.type === 'respond') { const from = e.t - e.delay; return `<span class="m-bar m-bar-respond" style="left:${pct(from)};width:calc(${pct(e.t)} - ${pct(from)})"></span><span class="m m-respond" style="left:${pct(e.t)}"></span>`; }
        if (e.type === 'miss') return `<span class="m m-miss" style="left:${pct(E.steps[e.step].t)}"></span>`;
        if (e.type === 'false_alarm') return `<span class="m m-fa" style="left:${pct(e.t)}"></span>`;
        return '';
      }).join('');
      const n = type => mine.filter(e => e.type === type).length;
      $('lane-list').querySelector(`[data-tally="${id}"]`).innerHTML = `<span><i class="g g-detect"></i>${n('detect')}</span><span><i class="g g-miss"></i>${n('miss')}</span><span><i class="g g-fa"></i>${n('false_alarm')}</span>`;
    }
    $('lane-list').querySelectorAll('.lane').forEach(lane => lane.setAttribute('aria-pressed', String(lane.dataset.soc === state.focus)));
  }

  /* ---------- Clock and controls ---------- */
  function renderTime() {
    $('clock').textContent = E.clock(state.t);
    $('track-fill').style.width = pct(state.t);
  }
  function renderControls() {
    const running = state.phase === 'run';
    $('console').dataset.phase = state.phase;
    $('play').disabled = !running;
    $('skip').disabled = !running;
    document.querySelectorAll('[data-speed]').forEach(b => { b.disabled = !running; b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === state.speed)); });
    $('play-icon').textContent = state.playing ? 'Ⅱ' : '▶';
    $('play').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    $('setup').hidden = state.phase !== 'setup';
    $('lanes').hidden = state.phase === 'setup';
    $('report').hidden = state.phase !== 'report';
    document.querySelectorAll('.phases li').forEach(li => li.classList.toggle('is-current', li.dataset.phase === state.phase));
  }
  function renderPicks() {
    $('soc-picks').innerHTML = E.socs.map(s => `<button class="soc-pick" data-pick="${s.id}" aria-pressed="${state.picked.has(s.id)}"><strong>${s.name}</strong><span>${s.type}</span></button>`).join('');
    $('start').disabled = state.picked.size < 2;
  }
  function drawTrackTicks() {
    E.steps.forEach(s => { const tick = document.createElement('span'); tick.className = 'track-tick'; tick.style.left = pct(s.t); $('track').appendChild(tick); });
  }

  /* ---------- Phases ---------- */
  function reset() {
    state.t = E.DAY_START; state.cursor = 0; state.focus = null; state.playing = false;
    clearParticles();
  }
  function start(lineup) {
    state.lineup = E.socs.map(s => s.id).filter(id => lineup.includes(id));
    state.events = E.compileTimeline(state.lineup);
    reset();
    state.phase = 'run'; state.playing = true;
    buildLanes();
    renderAll();
    $('console').focus({ preventScroll: true });
    $('announcement').textContent = `Workday started with ${state.lineup.length} SOCs.`;
  }
  function advance(nt, animate = true) {
    while (state.cursor < state.events.length && state.events[state.cursor].t <= nt) {
      const e = state.events[state.cursor++];
      if (animate && (e.type === 'log' || e.type === 'attack')) spawn(e.node, e.type === 'attack');
      if (animate && e.type === 'attack') $('announcement').textContent = `${E.clock(e.t)}: ${E.steps[e.step].name}`;
    }
    state.t = nt;
  }
  function finish() {
    advance(E.DAY_END, false);
    state.phase = 'report'; state.playing = false;
    renderReport();
    renderAll();
    $('report-title').focus({ preventScroll: true });
    if (matchMedia('(max-width: 900px)').matches) $('report').scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  function renderReport() {
    const rows = E.report(state.lineup, state.events);
    const min = key => Math.min(...rows.map(r => r[key] ?? Infinity));
    const best = { detected: Math.max(...rows.map(r => r.detected)), falseAlarms: min('falseAlarms'), mttd: min('mttd'), maxTtd: min('maxTtd'), mttr: min('mttr'), overall: rows[0].overall };
    const cell = (label, text, isBest) => `<td data-label="${label}"${isBest ? ' class="is-best"' : ''}>${text}</td>`;
    $('report-body').innerHTML = rows.map((r, i) => {
      const soc = E.socs.find(s => s.id === r.id);
      return `<tr${i === 0 ? ' class="is-winner"' : ''}>`
        + `<th scope="row"><span class="rank">${i + 1}</span><span><strong>${soc.name}</strong><small>${soc.type}</small></span></th>`
        + cell('Attacks detected', `${r.detected} of ${r.total}`, r.detected === best.detected)
        + cell('False alarms', r.falseAlarms, r.falseAlarms === best.falseAlarms)
        + cell('Mean time to detect', E.duration(r.mttd), r.mttd === best.mttd)
        + cell('Max time to detect', E.duration(r.maxTtd), r.maxTtd === best.maxTtd)
        + cell('Mean time to respond', E.duration(r.mttr), r.mttr === best.mttr)
        + cell('Contained before data left', r.contained ? '<span class="yes">Yes</span>' : '<span class="no">No</span>', r.contained)
        + cell('Overall', `<span class="overall"><span class="overall-bar"><i style="width:${r.overall}%"></i></span>${r.overall}</span>`, r.overall === best.overall)
        + '</tr>';
    }).join('');
  }
  function renderAll() { renderControls(); renderTime(); renderNetwork(); if (state.phase !== 'setup') renderLanes(); }

  /* ---------- Main loop ---------- */
  let last = performance.now();
  let lastCursor = -1;
  function frame(now) {
    const dt = Math.min(now - last, 100) / 1000;
    last = now;
    if (state.phase === 'run' && state.playing) {
      const nt = Math.min(E.DAY_END, state.t + dt * RATE * state.speed);
      advance(nt);
      renderTime();
      if (state.cursor !== lastCursor) { lastCursor = state.cursor; renderNetwork(); renderLanes(); }
      else $('lane-overlay').querySelector('.playhead')?.style.setProperty('left', pct(state.t));
      if (nt >= E.DAY_END) finish();
    }
    stepParticles(now);
    requestAnimationFrame(frame);
  }

  /* ---------- Input ---------- */
  document.addEventListener('click', event => {
    const pick = event.target.closest('[data-pick]');
    if (pick) {
      const id = pick.dataset.pick;
      if (state.picked.has(id)) state.picked.delete(id); else state.picked.add(id);
      renderPicks();
      document.querySelector(`[data-pick="${id}"]`).focus({ preventScroll: true });
      return;
    }
    const lane = event.target.closest('[data-soc]');
    if (lane) { state.focus = state.focus === lane.dataset.soc ? null : lane.dataset.soc; renderNetwork(); renderLanes(); return; }
    const node = event.target.closest('[data-node]');
    if (node && node.getAttribute('role') === 'button') { state.selected = state.selected === node.dataset.node ? null : node.dataset.node; renderNetwork(); return; }
    const speed = event.target.closest('[data-speed]');
    if (speed) { state.speed = Number(speed.dataset.speed); renderControls(); }
  });
  $('start').addEventListener('click', () => start([...state.picked]));
  $('play').addEventListener('click', () => { state.playing = !state.playing; renderControls(); });
  $('skip').addEventListener('click', finish);
  $('swap').addEventListener('click', () => { reset(); state.phase = 'setup'; renderPicks(); renderAll(); $('start').focus({ preventScroll: true }); });
  $('again').addEventListener('click', () => start(state.lineup));
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { $('announcement').textContent = 'Fullscreen is unavailable in this browser.'; }
  });
  document.addEventListener('fullscreenchange', () => $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));
  document.addEventListener('keydown', event => {
    const node = event.target.closest?.('[data-node]');
    if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
    if (event.key === 'Escape' && state.selected) { state.selected = null; renderNetwork(); }
    if (event.key === ' ' && state.phase === 'run' && !/BUTTON|INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) { event.preventDefault(); state.playing = !state.playing; renderControls(); }
  });
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(name => document.addEventListener(name, () => { idleAt = performance.now(); }, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) { state.playing = false; renderControls(); } });
  // Booth attract loop: after 90 s without input on setup or the report, run the day again.
  setInterval(() => {
    if (state.phase === 'run' || reducedMotion() || document.hidden || document.querySelector(':focus-visible')) return;
    if (performance.now() - idleAt < 90000) return;
    idleAt = performance.now();
    start(state.phase === 'report' ? state.lineup : (state.picked.size >= 2 ? [...state.picked] : E.defaultLineup));
  }, 1000);

  drawNetwork();
  initParticles();
  drawTrackTicks();
  renderPicks();
  renderAll();
  requestAnimationFrame(frame);
})();
