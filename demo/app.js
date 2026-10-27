(function () {
  'use strict';
  const E = window.Evaluation;
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';
  const DAY = E.DAY_END - E.DAY_START;
  const RATE = DAY / 75; // simulated minutes per second at 1x: the workday plays in 75 s
  // Each attack step gets its own beat: the clock slows to SLOW_RATE for SLOW_WINDOW
  // simulated minutes. Every effect below is a function of the simulated clock, so the
  // network, the attack plan and the lanes always show the same moment.
  const SLOW_RATE = 1;
  const SLOW_WINDOW = 1.6;
  const TOKEN = 1.2; // the attack token's trip along its path
  const PULSE = 1.4;
  const CALLOUT = 25;
  const SIEM = { x: 650, y: 30, w: 92, h: 350 };
  const pct = t => `${((t - E.DAY_START) / DAY) * 100}%`;
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nodeById = Object.fromEntries(E.nodes.map(n => [n.id, n]));
  const socById = Object.fromEntries(E.socs.map(s => [s.id, s]));
  const letter = id => socById[id].name.replace('SOC ', '');
  // Placement chosen so labels, pips and callouts don't sit on edges or rings.
  const labelAt = { fw: { y: -26 }, core: { x: -26, y: 5, anchor: 'end' } };
  const pipAt = { teller: k => ({ x: -50 + k * 20, y: 66 }), pay: k => ({ x: 36, y: -10 + k * 21 }) };
  const calloutAt = { teller: { x: -25, y: -84, anchor: 'start' }, pay: { x: 30, y: -66, anchor: 'end' } };

  const state = {
    phase: 'setup', picked: new Set(E.defaultLineup), lineup: [], events: [], cursor: 0,
    t: E.DAY_START, playing: false, speed: 1, focus: null, selected: null, pin: null
  };
  let idleAt = performance.now();
  const columns = () => (state.phase === 'setup' ? E.socs.map(s => s.id).filter(id => state.picked.has(id)) : state.lineup);
  const current = () => E.executedCount(state.t) - 1; // latest attack step that has run, or -1
  const activeStep = () => state.pin ?? Math.max(0, current());

  /* ---------- Network ---------- */
  const el = (tag, attrs = {}, parent) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };
  const edgeKey = (a, b) => [a, b].sort().join('|');
  const edgeEls = {};
  const nodeEls = {};
  const pipEls = [];
  let siemCount, siemBars, particleLayer, token, pulse, callout;
  function drawNetwork() {
    const svg = $('network');
    const edgeLayer = el('g', { class: 'edges' }, svg);
    E.edges.forEach(([a, b]) => {
      edgeEls[edgeKey(a, b)] = el('line', { class: 'edge', x1: nodeById[a].x, y1: nodeById[a].y, x2: nodeById[b].x, y2: nodeById[b].y }, edgeLayer);
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
    // One numbered pip per attack step, on the device it ran on, filling in as the attack advances.
    const pipLayer = el('g', { class: 'pips', 'aria-hidden': 'true' }, svg);
    const perNode = {};
    E.steps.forEach((s, i) => {
      const k = (perNode[s.node] = (perNode[s.node] ?? -1) + 1);
      const p = pipAt[s.node](k);
      const g = el('g', { class: 'pip', transform: `translate(${nodeById[s.node].x + p.x} ${nodeById[s.node].y + p.y})` }, pipLayer);
      el('circle', { r: 8.5 }, g);
      el('text', { y: 3.8 }, g).textContent = i + 1;
      pipEls.push(g);
    });
    particleLayer = el('g', { class: 'particles' }, svg);
    const fx = el('g', { class: 'fx', 'aria-hidden': 'true' }, svg);
    pulse = el('circle', { class: 'pulse', r: 0 }, fx);
    token = el('circle', { class: 'token', r: 7 }, fx);
    callout = el('g', { class: 'callout' }, fx);
    el('rect', { height: 26, rx: 4, y: -18 }, callout);
    el('circle', { r: 8, cy: -5 }, callout);
    el('text', { class: 'callout-num', y: -1.6 }, callout);
    el('text', { class: 'callout-name', y: -0.6 }, callout);
  }

  /* ---------- Attack effects: all derived from the simulated clock ---------- */
  let calloutFor = null;
  function placeCallout(i) {
    const s = E.steps[i];
    const n = nodeById[s.node];
    const at = calloutAt[s.node];
    const name = callout.querySelector('.callout-name');
    callout.querySelector('.callout-num').textContent = i + 1;
    name.textContent = s.name;
    const width = 38 + name.getComputedTextLength();
    const left = at.anchor === 'end' ? n.x + at.x - width : n.x + at.x;
    callout.setAttribute('transform', `translate(${left} ${n.y + at.y})`);
    callout.querySelector('rect').setAttribute('width', width);
    callout.querySelector('circle').setAttribute('cx', 15);
    callout.querySelector('.callout-num').setAttribute('x', 15);
    name.setAttribute('x', 29);
    calloutFor = i;
  }
  function pointOnPath(path, k) {
    const pts = path.map(id => nodeById[id]);
    const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    let d = k * lens.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) { const f = d / lens[i]; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f, seg: i }; }
      d -= lens[i];
    }
    const end = pts[pts.length - 1];
    return { x: end.x, y: end.y, seg: lens.length };
  }
  function renderFx() {
    const cur = current();
    const still = reducedMotion();
    const attackEdges = new Set();
    const compromised = new Set();
    let tokenAt = null;
    for (let i = 0; i <= cur; i++) {
      const s = E.steps[i];
      const age = state.t - s.t;
      const path = s.path || [];
      const inFlight = i === cur && path.length && age < TOKEN && !still;
      const reached = inFlight ? pointOnPath(path, age / TOKEN) : { seg: path.length };
      for (let j = 1; j < path.length && j <= reached.seg; j++) attackEdges.add(edgeKey(path[j - 1], path[j]));
      if (inFlight) tokenAt = reached;
      else { compromised.add(s.node); (s.compromises || []).forEach(n => compromised.add(n)); }
    }
    for (const [key, line] of Object.entries(edgeEls)) line.classList.toggle('is-attack', attackEdges.has(key));
    for (const [id, g] of Object.entries(nodeEls)) g.classList.toggle('is-compromised', compromised.has(id));
    token.setAttribute('opacity', tokenAt ? 1 : 0);
    if (tokenAt) { token.setAttribute('cx', tokenAt.x); token.setAttribute('cy', tokenAt.y); }
    // Pulse on the target as the step lands.
    const s = cur >= 0 ? E.steps[cur] : null;
    const landedAge = s ? state.t - s.t - (s.path && !still ? TOKEN : 0) : -1;
    const pulsing = s && !still && landedAge >= 0 && landedAge < PULSE;
    pulse.setAttribute('opacity', pulsing ? 1 - landedAge / PULSE : 0);
    if (pulsing) { pulse.setAttribute('cx', nodeById[s.node].x); pulse.setAttribute('cy', nodeById[s.node].y); pulse.setAttribute('r', 26 + 34 * (landedAge / PULSE)); }
    // Callout names the step: the pinned one, or the latest for a while after it runs.
    const show = state.pin ?? (s && state.t - s.t < CALLOUT ? cur : null);
    if (show !== null && show !== calloutFor) placeCallout(show);
    callout.setAttribute('opacity', show === null || (state.pin === null && show > cur) ? 0 : 1);
    pipEls.forEach((pip, i) => {
      pip.dataset.state = i <= cur ? 'done' : i === cur + 1 ? 'next' : 'planned';
      pip.classList.toggle('is-focus', i === activeStep() && (state.pin !== null || i <= cur));
    });
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

  /* ---------- Everything else shown is derived from the events up to state.t ---------- */
  const seen = () => state.events.slice(0, state.cursor);
  function renderNetwork() {
    const past = seen();
    const caught = new Set();
    const responded = new Set();
    if (state.focus) for (const e of past) {
      if (e.soc !== state.focus) continue;
      if (e.type === 'detect') caught.add(e.node);
      if (e.type === 'respond') responded.add(e.node);
    }
    for (const [id, g] of Object.entries(nodeEls)) {
      g.classList.toggle('is-caught', caught.has(id));
      g.classList.toggle('is-responded', responded.has(id));
      g.classList.toggle('is-selected', state.selected === id);
    }
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
    box.classList.toggle('is-open', !!state.selected);
    if (!state.selected) { box.innerHTML = '<span class="inspector-hint">Select a device to see its logs</span>'; return; }
    const node = nodeById[state.selected];
    const lines = past.filter(e => e.node === state.selected && (e.type === 'log' || e.type === 'attack')).slice(-3).reverse();
    box.innerHTML = `<strong>${esc(node.label)}</strong><ol class="log-lines">${lines.length ? lines.map(e => `<li class="${e.type === 'attack' ? 'is-attack' : ''}"><time>${E.clock(e.t)}</time> ${esc(e.text)}</li>`).join('') : '<li class="is-empty">No logs yet</li>'}</ol>`;
  }

  /* ---------- Attack plan: built once per lineup, updated in place ---------- */
  function buildQueue() {
    const ids = columns();
    $('queue-panel').style.setProperty('--socs', ids.length);
    $('queue-cols').innerHTML = `<span></span>${ids.map(id => `<span>${letter(id)}</span>`).join('')}`;
    $('queue').innerHTML = E.steps.map((s, i) => `<li><button class="q-row" data-step="${i}" aria-pressed="false"><span class="q-num">${i + 1}</span><time>${E.clock(s.t)}</time><span class="q-name">${esc(s.name)}</span>${ids.map(id => `<span class="st" data-soc-st="${id}" data-state="planned"></span>`).join('')}</button></li>`).join('');
    $('count-bar').innerHTML = E.steps.map(() => '<i></i>').join('');
    $('attack-total').textContent = E.steps.length;
  }
  function renderQueue() {
    const cur = current();
    const events = state.events;
    $('attack-count').textContent = cur + 1;
    $('count-bar').querySelectorAll('i').forEach((seg, i) => { seg.className = i <= cur ? 'is-done' : i === cur + 1 ? 'is-next' : ''; });
    $('queue').querySelectorAll('.q-row').forEach(row => {
      const i = Number(row.dataset.step);
      row.dataset.state = i < cur ? 'done' : i === cur ? 'current' : i === cur + 1 ? 'next' : 'planned';
      row.setAttribute('aria-pressed', String(state.pin === i));
      row.classList.toggle('is-active', i === activeStep());
      row.querySelectorAll('[data-soc-st]').forEach(st => {
        const status = state.phase === 'setup' ? 'planned' : E.stepStatus(events, st.dataset.socSt, i, state.t);
        st.dataset.state = status;
        st.setAttribute('title', `${socById[st.dataset.socSt].name}: ${status}`);
      });
      const statuses = [...row.querySelectorAll('[data-soc-st]')].map(st => `${socById[st.dataset.socSt].name} ${st.dataset.state}`).join(', ');
      row.setAttribute('aria-label', `Step ${i + 1}, ${E.clock(E.steps[i].t)}, ${E.steps[i].name}. ${statuses}`);
    });
    renderFlow();
  }
  function renderFlow() {
    const i = activeStep();
    const s = E.steps[i];
    $('flow-num').textContent = i + 1;
    $('flow-num').dataset.state = i <= current() ? 'done' : 'planned';
    $('flow-name').textContent = s.name;
    $('flow-meta').textContent = `${nodeById[s.node].label}, ${E.clock(s.t)}`;
    $('follow').hidden = state.pin === null;
    const mins = m => `+${E.duration(m)}`;
    const cell = (kind, mark, text = '') => `<span class="fs fs-${kind}"><i class="fm fm-${mark}"></i><small>${text}</small></span>`;
    const rows = columns().map(id => {
      const f = state.phase === 'setup' ? { executedAt: null } : E.stepFlow(state.events, id, i, state.t);
      const ran = f.executedAt !== null;
      const executed = ran ? cell('done', 'attack', E.clock(f.executedAt)) : cell('wait', 'attack-wait', E.clock(s.t));
      let detected;
      if (f.detectedAt !== null) detected = cell('done', 'detect', mins(f.detectedAt - f.executedAt));
      else if (f.missed) detected = cell('miss', 'miss', 'Missed');
      else detected = ran ? cell('active', 'pending') : cell('off', 'off');
      let responded;
      if (f.respondedAt !== null) responded = cell('done', 'respond', mins(f.respondedAt - f.detectedAt));
      else if (f.noResponse) responded = cell('off', 'off', 'None');
      else if (f.detectedAt !== null) responded = cell('active', 'pending');
      else responded = cell('off', 'off');
      return `<span class="fs-soc">${socById[id].name}</span>${cell('done', 'planned')}${executed}${detected}${responded}`;
    }).join('');
    $('flow-grid').innerHTML = `<span></span><span class="fs-label">Planned</span><span class="fs-label">Executed</span><span class="fs-label">Detected</span><span class="fs-label">Responded</span>${rows}`;
  }

  /* ---------- SOC lanes ---------- */
  function buildLanes() {
    $('lane-list').innerHTML = state.lineup.map(id => {
      const soc = socById[id];
      return `<button class="lane" data-soc="${id}" aria-pressed="false" aria-label="${soc.name}, ${soc.type}: show on the network"><span class="lane-head"><span class="lane-name"><strong>${soc.name}</strong> <span>${soc.type}</span></span><span class="tally" data-tally="${id}"></span></span><span class="lane-track" data-track="${id}"></span></button>`;
    }).join('');
  }
  function renderLanes() {
    const past = seen();
    const focusStep = state.phase === 'setup' ? -1 : activeStep();
    $('lane-ticks').innerHTML = E.steps.map((s, i) => (s.t <= state.t ? `<span class="tick${i === focusStep ? ' is-focus' : ''}" style="left:${pct(s.t)}"></span>` : '')).join('');
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
    $('playhead').style.left = pct(state.t);
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
    state.t = E.DAY_START; state.cursor = 0; state.focus = null; state.playing = false; state.pin = null;
    clearParticles();
  }
  function start(lineup) {
    state.lineup = E.socs.map(s => s.id).filter(id => lineup.includes(id));
    state.events = E.compileTimeline(state.lineup);
    reset();
    state.phase = 'run'; state.playing = true;
    buildLanes();
    buildQueue();
    renderAll();
    $('console').focus({ preventScroll: true });
    $('announcement').textContent = `Workday started with ${state.lineup.length} SOCs.`;
  }
  let marks = 0; // non-log events seen: the queue, flow card and lanes only change when this does
  function advance(nt, animate = true) {
    while (state.cursor < state.events.length && state.events[state.cursor].t <= nt) {
      const e = state.events[state.cursor++];
      if (e.type !== 'log') marks++;
      if (animate && (e.type === 'log' || e.type === 'attack')) spawn(e.node, e.type === 'attack');
      if (animate && e.type === 'attack') $('announcement').textContent = `${E.clock(e.t)}: attack step ${e.step + 1} of ${E.steps.length}, ${E.steps[e.step].name}`;
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
      const soc = socById[r.id];
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
  function renderAll() {
    renderControls(); renderTime(); renderNetwork(); renderFx(); renderQueue();
    if (state.phase !== 'setup') renderLanes();
  }

  /* ---------- Main loop ---------- */
  let last = performance.now();
  let lastCursor = -1;
  let lastMarks = -1;
  function frame(now) {
    const dt = Math.min(now - last, 100) / 1000;
    last = now;
    if (state.phase === 'run' && state.playing) {
      const cur = current();
      const slow = cur >= 0 && state.t - E.steps[cur].t < SLOW_WINDOW;
      let nt = Math.min(E.DAY_END, state.t + dt * (slow ? SLOW_RATE : RATE * state.speed));
      const next = E.steps[cur + 1];
      if (next && next.t <= nt) nt = next.t; // land exactly on the step; its slow beat starts next frame
      advance(nt);
      renderTime();
      renderFx();
      if (state.cursor !== lastCursor) { lastCursor = state.cursor; renderNetwork(); }
      if (marks !== lastMarks) { lastMarks = marks; renderQueue(); renderLanes(); }
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
      buildQueue();
      renderQueue();
      document.querySelector(`[data-pick="${id}"]`).focus({ preventScroll: true });
      return;
    }
    const row = event.target.closest('[data-step]');
    if (row) { const i = Number(row.dataset.step); state.pin = state.pin === i ? null : i; renderFx(); renderQueue(); if (state.phase !== 'setup') renderLanes(); return; }
    const lane = event.target.closest('[data-soc]');
    if (lane) { state.focus = state.focus === lane.dataset.soc ? null : lane.dataset.soc; renderNetwork(); renderLanes(); return; }
    const node = event.target.closest('[data-node]');
    if (node && node.getAttribute('role') === 'button') { state.selected = state.selected === node.dataset.node ? null : node.dataset.node; renderNetwork(); return; }
    const speed = event.target.closest('[data-speed]');
    if (speed) { state.speed = Number(speed.dataset.speed); renderControls(); }
  });
  $('follow').addEventListener('click', () => { state.pin = null; renderFx(); renderQueue(); if (state.phase !== 'setup') renderLanes(); });
  $('start').addEventListener('click', () => start([...state.picked]));
  $('play').addEventListener('click', () => { state.playing = !state.playing; renderControls(); });
  $('skip').addEventListener('click', finish);
  $('swap').addEventListener('click', () => { reset(); state.phase = 'setup'; renderPicks(); buildQueue(); renderAll(); $('start').focus({ preventScroll: true }); });
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
  buildQueue();
  renderAll();
  requestAnimationFrame(frame);
})();
