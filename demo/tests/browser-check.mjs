/* Optional browser check using Chrome's local DevTools endpoint, no dependencies.
 * Start headless Chrome with --remote-debugging-port=9223 and a temporary profile,
 * then run: node demo/tests/browser-check.mjs [screenshot-directory]
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const endpoint = 'http://127.0.0.1:9223';
const version = await (await fetch(`${endpoint}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
});
function call(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
let targetId;
try {
  ({ targetId } = await call('Target.createTarget', { url: 'about:blank' }));
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => call(method, params, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  // Dispatch a real click event: SVG network nodes have no .click() method.
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).innerText`);
  const screenshot = async name => {
    if (!process.argv[2]) return;
    // Capture the settled scene, not the first frame of its short transition.
    await evaluate("new Promise(resolve => setTimeout(resolve, 350))");
    await mkdir(process.argv[2], { recursive: true });
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(path.join(process.argv[2], `${name}.png`), Buffer.from(data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  // A file-based page with all HTTP(S) blocked exercises the offline guarantee.
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../index.html', import.meta.url).href });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate("document.querySelectorAll('[data-pick]').length === 4")) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pressed = () => evaluate("[...document.querySelectorAll('[data-pick][aria-pressed=true]')].map(b => b.dataset.pick).join('')");
  const phase = () => evaluate("document.querySelector('#console').dataset.phase");
  const noOverflow = async label => {
    const sizes = await evaluate('({viewport:innerWidth, content:document.documentElement.scrollWidth})');
    assert.ok(sizes.content <= sizes.viewport + 1, `Horizontal overflow, ${label}: ${JSON.stringify(sizes)}`);
  };

  // 1. Pick SOCs: three by default, at least two required.
  assert.equal(await pressed(), 'abc');
  assert.equal(await evaluate("document.querySelectorAll('.node[role=button]').length"), 10);
  assert.equal(await evaluate("document.querySelectorAll('#queue .q-row').length"), 8, 'the attack plan lists every step');
  assert.equal(await evaluate("[...document.querySelectorAll('#queue-cols span')].map(s => s.textContent).join('')"), 'ABC', 'a status column per picked SOC');
  assert.equal(await evaluate("document.querySelectorAll('#queue [data-state=planned].st').length"), 24, 'all steps planned before the day starts');
  assert.equal(await evaluate("document.querySelector('.pip[data-state=next] text').textContent"), '1', 'the first step is marked next on the network');
  await screenshot('desktop-setup');
  await click('[data-pick="b"]');
  await click('[data-pick="c"]');
  assert.equal(await evaluate("document.querySelector('#start').disabled"), true, 'one SOC cannot start');
  await click('[data-pick="b"]');
  await click('[data-pick="d"]');
  assert.equal(await pressed(), 'abd');

  // 2. Run the workday. Catch the first attack step as it lands.
  await click('#start');
  assert.equal(await phase(), 'run');
  assert.equal(await evaluate("document.querySelectorAll('.lane').length"), 3);
  for (let i = 0; i < 300 && (await text('#attack-count')) === '0'; i++) await wait(20);
  await wait(250);
  await click('#play');
  assert.equal(await text('#attack-count'), '1');
  assert.equal(await evaluate("document.querySelector('.callout').getAttribute('opacity')"), '1', 'the step is named on the network');
  assert.match(await evaluate("document.querySelector('.callout').textContent"), /Phishing email opened/);
  assert.equal(await evaluate("document.querySelectorAll('.pip[data-state=done]').length"), 1);
  assert.equal(await evaluate("+document.querySelector('.token').getAttribute('opacity') + +document.querySelector('.pulse').getAttribute('opacity') > 0"), true, 'the attack is moving on the network');
  assert.equal(await evaluate("document.querySelector('.q-row[data-step=\"0\"]').dataset.state"), 'current');
  await screenshot('desktop-step');
  await click('#play');
  await click('[data-speed="4"]');
  for (let i = 0; i < 300 && Number(await text('#attack-count')) < 6; i++) await wait(100);
  await wait(1500);
  const clock = await text('#clock');
  assert.ok(clock > '12:40' && clock < '17:00', `clock advanced: ${clock}`);
  assert.ok(await evaluate("document.querySelectorAll('.node.is-compromised').length") >= 1, 'attack visible on the network');
  assert.ok(await evaluate("document.querySelectorAll('.m-detect').length") >= 3, 'detections on the lanes');
  await click('[data-node="teller"]');
  assert.match(await text('#inspector'), /Teller/);
  assert.ok(await evaluate("document.querySelectorAll('#inspector .log-lines li').length") >= 1);
  await click('[data-soc="b"]');
  assert.equal(await evaluate("document.querySelector('[data-soc=b]').getAttribute('aria-pressed')"), 'true');
  assert.ok(await evaluate("document.querySelectorAll('.node.is-caught').length") >= 1, 'focused SOC shown on the network');
  const count = Number(await text('#attack-count'));
  assert.ok(count >= 5, `attack steps counted: ${count}`);
  const shown = await evaluate("[...document.querySelectorAll('.q-row[data-step=\"0\"] .st')].map(s => s.dataset.state).join()");
  const model = await evaluate("(() => { const ev = Evaluation.compileTimeline(['a','b','d']); const t = Evaluation.steps[0].t + 1000; return ['a','b','d'].map(id => Evaluation.stepStatus(ev, id, 0, t)).join(); })()");
  assert.equal(shown, model, 'step 1 statuses match the model');
  assert.equal(await evaluate("document.querySelectorAll('#flow-grid .fs-soc').length"), 3, 'the flow card has a row per SOC');
  await click('.q-row[data-step="3"]');
  assert.equal(await text('#flow-name'), 'Scheduled task created');
  assert.equal(await evaluate("document.querySelector('#follow').hidden"), false);
  await click('#follow');
  assert.equal(await evaluate("document.querySelector('.q-row[aria-pressed=true]')"), null, 'Follow live unpins');
  await click('#play');
  const paused = await text('#clock');
  await wait(600);
  assert.equal(await text('#clock'), paused, 'pause holds the clock');
  await screenshot('desktop-run');

  // 3. Report: one row per SOC, computed from the same model.
  await click('#skip');
  assert.equal(await phase(), 'report');
  const rows = await evaluate("[...document.querySelectorAll('#report-body tr')].map(r => r.querySelector('th strong').textContent)");
  const expected = await evaluate("Evaluation.report(['a','b','d']).map(r => Evaluation.socs.find(s => s.id === r.id).name)");
  assert.deepEqual(rows, expected);
  assert.equal(rows[0], 'SOC B');
  assert.match(await text('#report-body'), /6 of 8/);
  await screenshot('desktop-report');
  await click('#swap');
  assert.equal(await phase(), 'setup');
  assert.equal(await pressed(), 'abd', 'Swap SOCs keeps the selection');

  // Reduced motion: no travelling token or pulse, but the step is still named and counted.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await click('#start');
  for (let i = 0; i < 300 && (await text('#attack-count')) === '0'; i++) await wait(20);
  await click('#play');
  assert.equal(await evaluate("document.querySelector('.token').getAttribute('opacity')"), '0');
  assert.equal(await evaluate("document.querySelector('.callout').getAttribute('opacity')"), '1');
  assert.equal(await evaluate("document.querySelectorAll('.node.is-compromised').length"), 1);
  await click('#skip');
  await click('#swap');
  await send('Emulation.setEmulatedMedia', { features: [] });

  for (const [w, h] of [[1440, 900], [1280, 800]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await click('#start');
    await click('[data-speed="4"]');
    await wait(5000);
    await click('#play');
    const bottom = await evaluate("Math.round(document.querySelector('.legend').getBoundingClientRect().bottom)");
    console.log(`${w}x${h}: console ends at ${bottom}px`);
    await screenshot(`fit-${w}x${h}`);
    await click('#skip');
    await click('#swap');
  }

  for (const width of [1440, 1024, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await noOverflow(`${width}px setup`);
    if (width === 390) await screenshot('mobile-setup');
    await click('#start');
    await click('[data-speed="4"]');
    await wait(width === 390 ? 9000 : 400);
    await noOverflow(`${width}px run`);
    if (width === 390) await screenshot('mobile-run');
    await click('#skip');
    await noOverflow(`${width}px report`);
    if (width === 390) await screenshot('mobile-report');
    await click('#swap');
  }
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  console.log('Browser checks passed: offline loading, SOC picking, workday run, pause, node logs, SOC focus, report ranking, swap, and five viewport widths.');
} finally {
  if (targetId) await call('Target.closeTarget', { targetId });
  socket.close();
}
