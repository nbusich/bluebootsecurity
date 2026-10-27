/* Evaluation model: one fictional bank, one workday, one attack, four simulated SOCs.
   Pure and deterministic, shared by the page and its tests. Times are minutes since midnight.
   Every score is computed from the compiled event list, so the report can't disagree
   with what the console showed. */
(function (root) {
  'use strict';
  const DAY_START = 9 * 60;
  const DAY_END = 17 * 60;
  const MISS_WINDOW = 90; // an undetected step is shown as missed this long after it ran

  const nodes = [
    { id: 'internet', label: 'Internet', kind: 'cloud', x: 60, y: 70 },
    { id: 'fw', label: 'Firewall', kind: 'net', x: 185, y: 70 },
    { id: 'mail', label: 'Mail', kind: 'server', x: 310, y: 70 },
    { id: 'core', label: 'Core switch', kind: 'net', x: 185, y: 200 },
    { id: 'dc', label: 'Domain controller', kind: 'server', x: 330, y: 200 },
    { id: 'files', label: 'File server', kind: 'server', x: 470, y: 140 },
    { id: 'pay', label: 'Payments', kind: 'server', x: 470, y: 262 },
    { id: 'teller', label: 'Teller', kind: 'user', x: 55, y: 345 },
    { id: 'finance', label: 'Finance', kind: 'user', x: 150, y: 345 },
    { id: 'it', label: 'IT admin', kind: 'user', x: 245, y: 345 },
    { id: 'exec', label: 'Executive', kind: 'user', x: 340, y: 345 }
  ];
  const edges = [
    ['internet', 'fw'], ['fw', 'mail'], ['fw', 'core'], ['core', 'dc'], ['dc', 'files'], ['dc', 'pay'],
    ['core', 'teller'], ['core', 'finance'], ['core', 'it'], ['core', 'exec']
  ];

  // Carbanak-style intrusion against a bank, on the same techniques as the homepage hero.
  const steps = [
    { id: 'T1566', name: 'Phishing email opened', t: 580, node: 'teller', path: ['internet', 'fw', 'mail', 'fw', 'core', 'teller'], compromises: ['teller'], log: 'mail open Invoice_0923.docm from=billing-update.example' },
    { id: 'T1204', name: 'Malicious attachment run', t: 582, node: 'teller', log: 'proc start winword.exe macro=AutoOpen' },
    { id: 'T1059', name: 'PowerShell launched', t: 584, node: 'teller', log: 'proc start powershell.exe -nop -w hidden -enc JABj…' },
    { id: 'T1053', name: 'Scheduled task created', t: 630, node: 'teller', log: 'schtasks /create /tn UpdateCheck /sc hourly' },
    { id: 'T1055', name: 'Process injection', t: 710, node: 'teller', log: 'proc inject target=explorer.exe from=powershell.exe' },
    { id: 'T1003', name: 'Credentials dumped', t: 760, node: 'teller', log: 'proc access lsass.exe from=rundll32.exe' },
    { id: 'T1021', name: 'Lateral move over RDP', t: 810, node: 'pay', path: ['teller', 'core', 'dc', 'pay'], compromises: ['dc', 'pay'], log: 'rdp login ok user=it.admin src=teller-01' },
    { id: 'T1041', name: 'Data exfiltrated', t: 910, node: 'pay', path: ['pay', 'dc', 'core', 'fw', 'internet'], compromises: [], log: 'https POST 412 MB dst=203.0.113.50' }
  ];

  // Simulated SOCs. Per step: minutes to detect (null = missed) and minutes from
  // detection to response (null = no response). Trade-offs, not a ladder.
  const socs = [
    { id: 'a', name: 'SOC A', type: 'Agentic SOC', detect: [1, 1, 1, 2, null, 1, null, 2], respond: [3, 3, 3, 4, null, 5, null, 4],
      falseAlarms: [[560, 'finance'], [600, 'exec'], [615, 'files'], [650, 'it'], [675, 'mail'], [700, 'finance'], [735, 'dc'], [770, 'exec'], [800, 'it'], [840, 'files'], [870, 'finance'], [905, 'mail'], [950, 'exec'], [990, 'it']] },
    { id: 'b', name: 'SOC B', type: 'MDR', detect: [6, null, 8, 12, null, 15, 9, 10], respond: [30, null, 25, 40, null, 35, 20, 15],
      falseAlarms: [[655, 'exec'], [790, 'files'], [945, 'finance']] },
    { id: 'c', name: 'SOC C', type: 'MDR', detect: [20, 25, 22, 40, 50, 35, 60, null], respond: [60, 55, 60, 70, 80, 65, 75, null],
      falseAlarms: [[880, 'it']] },
    { id: 'd', name: 'SOC D', type: 'In-house SOC', detect: [15, null, 18, 30, null, 25, null, null], respond: [45, null, 50, 60, null, 40, null, null],
      falseAlarms: [[600, 'it'], [690, 'exec'], [760, 'finance'], [850, 'files'], [960, 'dc']] }
  ];
  const defaultLineup = ['a', 'b', 'c'];
  const weights = { completeness: 0.35, contained: 0.2, detectSpeed: 0.15, respondSpeed: 0.15, precision: 0.15 };

  // Ordinary activity: a seeded generator, so every run is the same workday.
  const benignTemplates = {
    user: ['auth login ok user={u}', 'file open \\\\files\\branch\\{doc}', 'mail sync {n} msgs', 'web GET intranet/portal', 'proc start excel.exe', 'print job {doc}'],
    server: ['smb read {doc}', 'smb write {doc}', 'kerberos tgt user={u}', 'db backup ok', 'txn batch {n} posted', 'smtp recv from=partner.example'],
    net: ['allow tcp 443 out', 'allow udp 53 out', 'deny tcp 23 in', 'dhcp lease 10.0.4.{n}']
  };
  const users = ['d.lee', 'r.patel', 'm.osei', 'it.admin', 'k.novak'];
  const docs = ['Q3_rates.xlsx', 'loan_0412.pdf', 'branch_hours.docx', 'audit_notes.docx', 'wire_log.csv'];
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  function benignEvents() {
    const rand = seeded(20261026);
    const pick = list => list[Math.floor(rand() * list.length)];
    const loggers = nodes.filter(n => n.kind !== 'cloud');
    const out = [];
    for (let t = DAY_START; t < DAY_END; t++) {
      const busy = t < 720 || t >= 780 ? 1.4 : 0.8; // quieter over lunch
      let count = Math.floor(busy + rand());
      while (count-- > 0) {
        const node = rand() < 0.55 ? pick(loggers.filter(n => n.kind === 'user')) : pick(loggers);
        const text = pick(benignTemplates[node.kind]).replace('{u}', pick(users)).replace('{doc}', pick(docs)).replace('{n}', String(10 + Math.floor(rand() * 89)));
        out.push({ t: t + Math.round(rand() * 59) / 60, type: 'log', node: node.id, text });
      }
    }
    return out;
  }

  function compileTimeline(lineup = defaultLineup) {
    const events = benignEvents();
    steps.forEach((step, i) => {
      events.push({ t: step.t, type: 'attack', node: step.node, step: i, text: step.log });
      lineup.forEach(id => {
        const soc = socs.find(s => s.id === id);
        const d = soc.detect[i];
        if (d === null) { events.push({ t: step.t + MISS_WINDOW, type: 'miss', soc: id, node: step.node, step: i }); return; }
        events.push({ t: step.t + d, type: 'detect', soc: id, node: step.node, step: i, delay: d });
        const r = soc.respond[i];
        if (r !== null) events.push({ t: step.t + d + r, type: 'respond', soc: id, node: step.node, step: i, delay: r });
      });
    });
    lineup.forEach(id => socs.find(s => s.id === id).falseAlarms.forEach(([t, node]) => events.push({ t, type: 'false_alarm', soc: id, node })));
    const order = { log: 0, attack: 1, detect: 2, respond: 3, false_alarm: 4, miss: 5 };
    return events.sort((a, b) => a.t - b.t || order[a.type] - order[b.type] || String(a.soc).localeCompare(String(b.soc)));
  }

  const mean = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  const clamp = v => Math.max(0, Math.min(1, v));
  function score(id, events) {
    const mine = events.filter(e => e.soc === id);
    const detects = mine.filter(e => e.type === 'detect');
    const responds = mine.filter(e => e.type === 'respond');
    const falseAlarms = mine.filter(e => e.type === 'false_alarm').length;
    const lateral = steps.findIndex(s => s.id === 'T1021');
    const exfil = steps.find(s => s.id === 'T1041');
    const containLateral = responds.find(e => e.step === lateral);
    const ttd = detects.map(e => e.delay);
    const ttr = responds.map(e => e.delay);
    const result = {
      id,
      detected: detects.length,
      total: steps.length,
      falseAlarms,
      mttd: mean(ttd),
      maxTtd: ttd.length ? Math.max(...ttd) : null,
      mttr: mean(ttr),
      contained: !!containLateral && containLateral.t < exfil.t,
      precision: detects.length / Math.max(1, detects.length + falseAlarms),
      perStep: steps.map((s, i) => !!detects.find(e => e.step === i))
    };
    result.overall = Math.round(100 * (
      weights.completeness * (result.detected / result.total) +
      weights.contained * (result.contained ? 1 : 0) +
      weights.detectSpeed * clamp(1 - (result.mttd ?? 60) / 60) +
      weights.respondSpeed * clamp(1 - (result.mttr ?? 120) / 120) +
      weights.precision * result.precision));
    return result;
  }
  function report(lineup, events = compileTimeline(lineup)) {
    return lineup.map(id => score(id, events)).sort((a, b) => b.overall - a.overall);
  }

  // Where one attack step stands for one SOC at time t: planned -> executed -> detected ->
  // responded, or missed. A detection with no response by MISS_WINDOW counts as no response.
  function stepFlow(events, id, i, t) {
    const flow = { executedAt: null, detectedAt: null, respondedAt: null, missed: false, noResponse: false };
    for (const e of events) {
      if (e.t > t) break;
      if (e.step !== i) continue;
      if (e.type === 'attack') flow.executedAt = e.t;
      else if (e.soc === id && e.type === 'detect') flow.detectedAt = e.t;
      else if (e.soc === id && e.type === 'respond') flow.respondedAt = e.t;
      else if (e.soc === id && e.type === 'miss') flow.missed = true;
    }
    if (flow.detectedAt !== null && flow.respondedAt === null && t >= flow.detectedAt + MISS_WINDOW) flow.noResponse = true;
    return flow;
  }
  function stepStatus(events, id, i, t) {
    const f = stepFlow(events, id, i, t);
    if (f.executedAt === null) return 'planned';
    if (f.respondedAt !== null) return 'responded';
    if (f.detectedAt !== null) return 'detected';
    return f.missed ? 'missed' : 'waiting';
  }
  function executedCount(t) { return steps.filter(s => s.t <= t).length; }

  const pad = n => String(n).padStart(2, '0');
  function clock(t) { const m = Math.floor(t); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
  function duration(min) {
    if (min === null) return 'n/a';
    if (min < 10) return `${(Math.round(min * 10) / 10).toString()} min`;
    if (min < 60) return `${Math.round(min)} min`;
    const r = Math.round(min);
    return `${Math.floor(r / 60)} h ${r % 60} min`;
  }

  const api = { DAY_START, DAY_END, MISS_WINDOW, nodes, edges, steps, socs, defaultLineup, weights, benignEvents, compileTimeline, score, report, stepFlow, stepStatus, executedCount, clock, duration };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Evaluation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
