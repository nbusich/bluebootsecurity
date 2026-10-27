(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const replay = window.DemoReplay;
  const data = window.DEMO_EVIDENCE;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = value => new Date(value).toISOString().slice(11, 19) + ' UTC';
  const chapters = ['The company', 'The activity', 'The evidence', 'The answer key', 'The evaluation'];
  const nextLabels = ['See the activity', 'See the evidence', 'Reveal what happened', 'Evaluate the response', 'Start again'];
  const takeaways = [
    'A useful test needs everyday business activity around the attacks.',
    'Suspicious-looking activity can be ordinary work. Ordinary-looking activity can be part of an attack.',
    'An event being visible in a security tool does not mean a SOC recognized the threat.',
    'Known origin and verified outcomes create an answer key. Uncertainty stays visible.',
    'Judge what the SOC understood and did against what actually happened.'
  ];
  const captions = [
    '<strong>One company, two kinds of activity.</strong> Automated employees work while controlled attacks run alongside them.',
    '<strong>Same workstation. Different intent.</strong> These two recorded actions happened during the same experiment.',
    '<strong>The SOC’s view.</strong> Security evidence flows to the team under test. The evaluator’s labels stay separate.',
    '<strong>The evaluator’s view.</strong> Compare observed evidence with the activity record, including execution outcomes.',
    '<strong>Close the loop.</strong> Evaluate the SOC’s response against known activity using an agreed rubric.'
  ];
  const responses = {
    careful: {
      name: 'Uses context',
      quote: 'Review the installer against approved work before escalating. The directory check on employee1 warrants process-lineage investigation. These records alone do not establish compromise; investigate before disruptive containment.',
      rows: [
        ['Threat recognition', 'Partial', 'neutral', 'Flags B for investigation; does not yet identify its attack origin.'],
        ['Unnecessary escalation', 'Appropriate', 'good', 'Verifies A’s business purpose before escalation.'],
        ['Investigation quality', 'Appropriate', 'good', 'Names the workstation and asks for process context.'],
        ['Response quality', 'Appropriate', 'good', 'Recommends proportionate investigation, without claiming compromise.'],
        ['Timeliness', 'Not measured', 'neutral', 'No real SOC submission or response clock in this replay.']
      ]
    },
    overreacts: {
      name: 'Overreacts',
      quote: 'A downloaded script proves this employee is compromised. Isolate employee1 immediately. The directory check looks harmless and can be ignored.',
      rows: [
        ['Threat recognition', 'Missed context', 'bad', 'Dismisses the attack-origin directory check, B.'],
        ['Unnecessary escalation', 'Unnecessary', 'bad', 'Treats authorized setup A as proven compromise.'],
        ['Investigation quality', 'Unsupported', 'bad', 'The installer log alone does not establish compromise.'],
        ['Response quality', 'Disproportionate', 'bad', 'Disruptive containment lacks sufficient supporting evidence.'],
        ['Timeliness', 'Not measured', 'neutral', 'A quick but incorrect response is still incorrect.']
      ]
    },
    misses: {
      name: 'Dismisses both',
      quote: 'These are routine developer commands. Close both items without further investigation.',
      rows: [
        ['Threat recognition', 'Missed context', 'bad', 'Closes attack-origin activity B without investigation.'],
        ['Unnecessary escalation', 'None here', 'good', 'Does not escalate the authorized installer A.'],
        ['Investigation quality', 'Insufficient', 'bad', 'Provides no supporting evidence or lineage review.'],
        ['Response quality', 'Premature closure', 'bad', 'The available ambiguity calls for more context.'],
        ['Timeliness', 'Not measured', 'neutral', 'A real evaluation needs recorded response timestamps.']
      ]
    }
  };
  let state = replay.initial();
  let selectedEvidence = 'installer';
  let returnFocus = null;
  let idleAt = performance.now();
  let lastTick = performance.now();

  function badge(text, example = false) { return `<span class="provenance${example ? ' example' : ''}">${esc(text)}</span>`; }
  function lead(number, title, intro) { return `<h1 id="scene-title">${title}</h1><p class="intro">${intro}</p>`; }
  function evidenceCard(id, title, note) {
    const record = data.records.find(r => r.id === id);
    return `<button class="evidence-card" data-evidence="${id}" aria-haspopup="dialog"><span class="evidence-icon">${record.letter}</span><span><strong>${title}</strong><small>${note}</small></span></button>`;
  }
  function sceneHTML() {
    switch (state.step) {
      case 0: return lead(1, 'A company.<br>A working day.<br><em>A controlled attack.</em>', 'Step inside a virtual business where employees work, systems generate evidence, and attackers operate in the background.') +
        '<div class="feature-list"><div class="feature-row"><strong>Make everyday work feel real</strong><p>People write code, open documents and use business services.</p></div><div class="feature-row"><strong>Introduce known attack activity</strong><p>Run controlled scenarios while ordinary work continues.</p></div><div class="feature-row"><strong>Keep a record of what happened</strong><p>Record actions and outcomes independently of the SOC.</p></div></div>';
      case 1: return lead(2, 'Which one would<br><em>you investigate?</em>', 'Two activities. One workstation. The commands are real excerpts from the same recorded experiment. Their intent is hidden for now.') +
        `<div class="activity-pair"><article class="activity-card"><span class="case-letter">Activity A</span>${badge('Recorded excerpt')}<h2>A script is downloaded and run</h2><p>An online script sets up a developer tool.</p><pre class="command">curl …/install.sh | bash</pre><span class="case-time">20:41:23 UTC</span></article><article class="activity-card"><span class="case-letter">Activity B</span>${badge('Recorded excerpt')}<h2>A directory is checked</h2><p>A shell asks where it is running.</p><pre class="command">sh -c pwd</pre><span class="case-time">20:37:36 UTC</span></article></div><p class="small-note">Excerpts are grouped for comparison, not played in chronological order. The installer command is abbreviated here.</p><p class="question">What deserves a closer look?</p><div class="choices" role="group" aria-label="Choose what to investigate">${[['a', 'Activity A'], ['b', 'Activity B'], ['both', 'Both'], ['more', 'Need more evidence']].map(([v, label]) => `<button class="choice" data-choice="${v}" aria-pressed="${state.choice === v}">${label}</button>`).join('')}</div><p class="choice-note">${state.choice ? 'Choice saved for this replay. This is about context, not guessing the right command.' : 'There is no penalty for asking for more evidence.'}</p>`;
      case 2: return lead(3, 'What does the<br><em>defender see?</em>', 'Sensors record activity. A security platform collects the logs and alerts. The SOC uses that evidence to investigate.') +
        `<div class="evidence-list">${evidenceCard('installer', 'An installer download', 'A process record shows the download tool and script address.')}${evidenceCard('discovery', 'A shell checks its location', 'A process record shows a shell running a directory command.')}${evidenceCard('identity', 'A user identity check', 'Another record shows a command asking “who am I?”')}</div><p class="small-note">${badge('Recorded lab evidence')} Open a card to inspect its timestamp, command and process details.</p><div class="access-divider"><strong>What the SOC under test receives</strong>For a real evaluation: agreed platform access or a supported integration. The private activity labels and scenario markers are excluded.</div>`;
      case 3: return lead(4, 'Now reveal<br><em>what happened.</em>', 'The independent activity record tells us who initiated each action. Execution results tell us what actually ran.') +
        `<div class="truth-list"><div class="truth-card"><strong>A: Authorized employee activity</strong><p>The engineer’s automation ran a developer-tool installer. Recorded output reports an existing installation being updated.</p><button class="text-button" data-evidence="installer">Inspect the supporting records</button></div><div class="truth-card attack"><strong>B: Attack-origin discovery</strong><p>The attack simulation ran the directory check. A completed result returned <code>/opt</code>. This confirms the command ran, not that a breach occurred.</p><button class="text-button" data-evidence="discovery">Inspect the supporting records</button></div></div><p class="prediction">${state.choice ? `You chose: ${esc({ a: 'Activity A', b: 'Activity B', both: 'Both', more: 'Need more evidence' }[state.choice])}. Asking for context is part of good investigation.` : 'Same command, different context. Knowing the origin changes the interpretation.'}</p><div class="access-divider"><strong>Uncertainty stays in the dataset</strong>Log-to-action associations are candidates, not proof of unique causation. Another attack step lacks a completion result and is excluded from executed-activity outcomes.</div>`;
      case 4: {
        const response = responses[state.response];
        return lead(5, 'Did the SOC<br><em>understand it?</em>', 'Compare a response with the known activity. Catching threats matters. So does avoiding unnecessary disruption.') +
          `${badge('Illustrative SOC response', true)}<div class="response-select" role="group" aria-label="Choose an illustrative SOC response">${Object.entries(responses).map(([id, r]) => `<button class="choice" data-response="${id}" aria-pressed="${state.response === id}">${r.name}</button>`).join('')}</div><div class="soc-response"><blockquote>“${esc(response.quote)}”</blockquote></div><table class="scorecard"><caption class="sr-only">Illustrative assessment of the selected example SOC response</caption><tbody>${response.rows.map(([dimension, status, tone, explanation]) => `<tr><th scope="row">${dimension}</th><td><span class="verdict ${tone}">${status}</span> ${explanation}</td></tr>`).join('')}</tbody></table><p class="small-note">Example assessments explain the rubric. They are not measured results or a provider ranking. Without enough SOC-visible context, “investigate” can be the appropriate response.</p>`;
      }
    }
  }

  function render(focus = false) {
    $('chapters').innerHTML = chapters.map((name, index) => `<button class="chapter${index === state.step ? ' active' : index < state.step ? ' complete' : ''}" data-step="${index}"${index === state.step ? ' aria-current="step"' : ''}><span class="chapter-index">${index + 1}</span>${name}</button>`).join('');
    $('scene').innerHTML = sceneHTML();
    $('scene').classList.remove('scene-enter');
    void $('scene').offsetWidth;
    $('scene').classList.add('scene-enter');
    $('takeaway').textContent = takeaways[state.step];
    $('map-caption').innerHTML = captions[state.step];
    $('previous').disabled = state.step === 0;
    $('next').textContent = nextLabels[state.step];
    $('sensor-node').classList.toggle('highlight', state.step === 2);
    $('soc-node').classList.toggle('highlight', state.step === 2 || state.step === 4);
    $('judge-node').classList.toggle('highlight', state.step >= 3);
    renderTransport();
    if (focus) { $('scene').focus({ preventScroll: true }); $('announcement').textContent = `Chapter ${state.step + 1}: ${chapters[state.step]}`; }
  }
  function renderTransport() {
    $('play-icon').textContent = state.playing ? 'Ⅱ' : '▶';
    $('play').setAttribute('aria-label', state.playing ? 'Pause automatic replay' : 'Start automatic replay');
    $('play-label').textContent = state.playing ? 'Automatic replay, loops every 2 minutes' : 'Take it at your pace';
    $('play-detail').textContent = state.playing ? `Chapter ${state.step + 1} of 5, sped up for presentation` : 'Or play a two-minute loop';
    $('progress-fill').style.width = `${replay.progress(state) * 100}%`;
  }
  function dispatch(event, focus = false) {
    const previous = state;
    if (event.type === 'reset') selectedEvidence = 'installer';
    state = replay.reduce(state, event);
    if (previous.step !== state.step || previous.choice !== state.choice || previous.response !== state.response || event.type === 'reset') render(focus);
    else renderTransport();
  }
  function navigate(step) { dispatch({ type: 'pause' }); dispatch({ type: 'goto', step }, true); }
  function openEvidence(id, trigger) {
    dispatch({ type: 'pause' });
    selectedEvidence = id || selectedEvidence;
    returnFocus = trigger;
    renderEvidence();
    if (!$('evidence-dialog').open) $('evidence-dialog').showModal();
  }
  function renderEvidence() {
    $('evidence-tabs').innerHTML = data.records.map(r => `<button class="choice" data-record="${r.id}" aria-pressed="${r.id === selectedEvidence}">Record ${r.letter}${state.step >= 3 ? `: ${r.id === 'discovery' ? 'Attack origin' : 'Authorized'}` : ''}</button>`).join('');
    const r = data.records.find(record => record.id === selectedEvidence);
    const visibleLog = { timestamp: r.log.time, workstation: r.machine, rule: r.log.rule, rule_level: r.log.level, executable: r.log.exe, arguments: r.log.arguments, process_id: r.log.pid, parent_process_id: r.log.ppid };
    $('evidence-detail').innerHTML = `<div class="detail-heading"><h3>Record ${r.letter}: ${state.step >= 3 ? esc(r.title) : { installer: 'Script download', discovery: 'Directory check', identity: 'Identity check' }[r.id]}</h3>${badge('Recorded lab evidence')}</div><div class="record-meta"><span>9 Oct 2026</span><span>${clock(r.log.time)}</span><span>Host ${esc(r.machine)}</span></div><p class="detail-note">${esc(r.log.description)} This is a generic command-execution alert; its existence does not establish malicious intent.</p><div class="code-label">Security-platform record, selected fields</div><pre class="record-code">${esc(JSON.stringify(visibleLog, null, 2))}</pre><p class="provenance-line">Source: ${esc(r.log.source)}<br>Record: ${esc(r.log.ref)}</p>${state.step >= 3 ? `<div class="evaluator-block"><h4>Evaluator-only answer key</h4><p><strong>Origin:</strong> ${esc(r.action.origin)}</p><p><strong>Label:</strong> ${esc(r.action.label)}</p><p><strong>Action recorded:</strong> ${clock(r.action.time)}${r.action.finished ? `. <strong>Finished:</strong> ${clock(r.action.finished)}` : ''}</p><div class="code-label">Action command, scenario marker removed</div><pre class="record-code">${esc(r.action.command)}</pre><div class="code-label">Recorded output excerpt</div><pre class="record-code">${esc(r.action.output)}</pre><p>${esc(r.action.outcome)}</p><p><strong>Association:</strong> ${esc(r.association)}</p><p class="provenance-line">Source: ${esc(r.action.source)}<br>Action: ${esc(r.action.ref)}</p></div><div class="access-divider"><strong>Example of an excluded outcome</strong>${esc(data.exclusion.reason)}</div>` : '<div class="evaluator-locked">The evaluator’s origin labels and execution results are withheld in this view. Continue to chapter 4 to reveal the answer key.</div>'}<p class="small-note">The source experiment contains ${data.counts.actions} recorded actions and ${data.counts.logs} security alerts from ${data.counts.workstations} workstation. The fictional company’s scale is not a measured lab result.</p>`;
  }

  document.querySelectorAll('.endpoint-dots').forEach(el => { el.innerHTML = '<i></i>'.repeat(15); });
  $('next').addEventListener('click', () => state.step === 4 ? dispatch({ type: 'reset' }, true) : navigate(state.step + 1));
  $('previous').addEventListener('click', () => navigate(state.step - 1));
  $('restart').addEventListener('click', () => { if ($('evidence-dialog').open) $('evidence-dialog').close(); dispatch({ type: 'reset' }, true); });
  $('play').addEventListener('click', () => { lastTick = performance.now(); dispatch({ type: 'toggle' }); });
  $('lab-button').addEventListener('click', event => openEvidence(null, event.currentTarget));
  $('close-dialog').addEventListener('click', () => $('evidence-dialog').close());
  $('evidence-dialog').addEventListener('close', () => { idleAt = performance.now(); returnFocus?.focus(); });
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else $('announcement').textContent = 'Use your browser’s fullscreen command for presentation mode.';
    } catch { $('announcement').textContent = 'Fullscreen is unavailable. The demo still works in this window.'; }
  });
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  });
  document.addEventListener('click', event => {
    const el = event.target.closest('button');
    if (!el) return;
    if (el.dataset.step !== undefined) navigate(Number(el.dataset.step));
    if (el.dataset.choice) { const value = el.dataset.choice; dispatch({ type: 'choice', value }); document.querySelector(`[data-choice="${value}"]`).focus({ preventScroll: true }); $('announcement').textContent = 'Choice saved. Continue to explore the evidence.'; }
    if (el.dataset.response) { const value = el.dataset.response; dispatch({ type: 'response', value }); document.querySelector(`[data-response="${value}"]`).focus({ preventScroll: true }); }
    if (el.dataset.evidence) openEvidence(el.dataset.evidence, el);
    if (el.dataset.record) { selectedEvidence = el.dataset.record; renderEvidence(); $('evidence-tabs').querySelector(`[data-record="${selectedEvidence}"]`).focus(); }
  });
  document.addEventListener('keydown', event => {
    if ($('evidence-dialog').open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); if (state.step < 4) navigate(state.step + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigate(state.step - 1); }
  });
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(name => document.addEventListener(name, () => { idleAt = performance.now(); }, { passive: true }));
  document.addEventListener('visibilitychange', () => { lastTick = performance.now(); idleAt = lastTick; if (document.hidden) dispatch({ type: 'pause' }); });
  // After 90 seconds without input, start an attract loop. Dialogs and focused
  // controls remain stable, and reduced-motion users opt into playback explicitly.
  setInterval(() => {
    const now = performance.now();
    const ms = Math.min(now - lastTick, 1500);
    lastTick = now;
    if (document.hidden || $('evidence-dialog').open) return;
    if (!state.playing && now - idleAt > 90000 && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.querySelector(':focus-visible')) {
      dispatch({ type: 'reset' }); dispatch({ type: 'toggle' });
    }
    dispatch({ type: 'tick', ms });
  }, 250);
  render();
})();
