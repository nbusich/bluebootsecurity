const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'evidence.js'), 'utf8'), context);
const data = context.window.DEMO_EVIDENCE;

test('recorded fixture preserves source provenance and separate origin labels', () => {
  assert.equal(data.counts.workstations, 1);
  assert.equal(data.records.length, 3);
  const installer = data.records.find(r => r.id === 'installer');
  const discovery = data.records.find(r => r.id === 'discovery');
  assert.equal(installer.action.label, 'benign');
  assert.match(installer.action.output, /nvm is already installed/);
  assert.equal(discovery.action.label, 'malicious');
  assert.equal(discovery.action.output, '/opt');
  assert.ok(discovery.action.finished);
  assert.equal(discovery.log.arguments.a2, discovery.action.command);
  for (const record of data.records) {
    assert.ok(record.action.ref && record.log.ref);
    assert.match(record.action.source, /actions\.jsonl$/);
    assert.match(record.log.source, /siem_logs\.jsonl$/);
    assert.match(record.association, /do not prove a unique causal match/);
    assert.ok(!record.action.command.includes('ghosts-scenario'));
    assert.ok(!JSON.stringify(record.log).includes('benign'));
    assert.ok(!JSON.stringify(record.log).includes('malicious'));
    assert.ok(!JSON.stringify(record.log).includes('origin'));
  }
  assert.equal(Object.keys(data.source_hashes).length, 2);
  for (const hash of Object.values(data.source_hashes)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.match(data.exclusion.reason, /excluded/);
});

test('demo assets are local and do not require a server or external library', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = match[1];
    assert.ok(!/^https?:|^\/\//.test(target), `External resource: ${target}`);
    if (!target.startsWith('#')) assert.ok(fs.existsSync(path.resolve(root, target.split('#')[0])), target);
  }
  const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|new WebSocket/.test(js));
  assert.ok(!/https?:\/\//.test(fs.readFileSync(path.join(root, 'demo.css'), 'utf8')));
});

test('the public presentation uses generic descriptions and labels its boundaries', () => {
  const content = ['index.html', 'app.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.ok(!/\bcaldera\b|\bghosts\b|\bAEL\b|\bwazuh\b/i.test(content));
  assert.match(content, /240/);
  assert.match(content, /one recorded lab workstation/);
  assert.match(content, /Illustrative SOC response/i);
  assert.match(content, /Not measured/);
  assert.match(content, /not a connected SOC/);
});
