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
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
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
    if (await evaluate("!!document.querySelector('#scene-title')")) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.match(await text('#scene'), /controlled attack/);
  assert.equal(await evaluate("document.querySelectorAll('.chapter').length"), 5);
  await screenshot('desktop-company');
  await click('#next');
  await click('[data-choice="more"]');
  assert.equal(await evaluate("document.querySelector('[data-choice=more]').getAttribute('aria-pressed')"), 'true');
  assert.equal(await evaluate("document.activeElement.dataset.choice"), 'more');
  await click('#next');
  await click('[data-evidence="discovery"]');
  assert.equal(await evaluate("document.querySelector('#evidence-dialog').open"), true);
  assert.match(await text('#evidence-detail'), /withheld/);
  assert.ok(!(await text('#evidence-detail')).includes('attack simulation'));
  assert.ok(!(await text('#evidence-detail')).includes('Label: malicious'));
  assert.match(await text('#evidence-detail'), /pwd/);
  await screenshot('desktop-evidence');
  await click('#close-dialog');
  await click('#next');
  assert.match(await text('#scene'), /Need more evidence/);
  await click('[data-evidence="discovery"]');
  assert.match(await text('#evidence-detail'), /attack simulation/);
  assert.match(await text('#evidence-detail'), /Execution confirmed/);
  assert.match(await text('#evidence-detail'), /do not prove a unique causal match/);
  await click('#close-dialog');
  await click('#next');
  assert.match(await text('.scorecard'), /Not measured/);
  await click('[data-response="overreacts"]');
  assert.match(await text('.scorecard'), /Disproportionate/);
  await click('[data-response="misses"]');
  assert.match(await text('.scorecard'), /Premature closure/);
  await screenshot('desktop-evaluation');
  await click('#restart');
  await click('[data-step="1"]');
  assert.equal(await evaluate("document.querySelectorAll('[data-choice][aria-pressed=true]').length"), 0);
  await click('[data-step="4"]');
  assert.equal(await evaluate("document.querySelector('[data-response=careful]').getAttribute('aria-pressed')"), 'true');
  await click('#play');
  assert.equal(await evaluate("document.querySelector('#play').getAttribute('aria-label')"), 'Pause automatic replay');
  await click('#lab-button');
  assert.equal(await evaluate("document.querySelector('#play').getAttribute('aria-label')"), 'Start automatic replay');
  await click('#close-dialog');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft' });
  assert.equal(await evaluate("document.querySelector('[aria-current=step]').dataset.step"), '3');
  // Test full looping without waiting two minutes; core transition tests cover timing.
  const loop = await evaluate("DemoReplay.reduce({...DemoReplay.initial(), playing:true, choice:'a', response:'overreacts'}, {type:'tick', ms:120000})");
  assert.equal(loop.step, 0);
  assert.equal(loop.choice, null);
  assert.equal(loop.response, 'careful');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
    for (let chapter = 0; chapter < 5; chapter++) {
      await click(`[data-step="${chapter}"]`);
      const sizes = await evaluate('({viewport:innerWidth, content:document.documentElement.scrollWidth})');
      assert.ok(sizes.content <= sizes.viewport + 1, `Horizontal overflow at ${width}px, chapter ${chapter}: ${JSON.stringify(sizes)}`);
      if (width === 390 && [0, 1, 4].includes(chapter)) await screenshot(`mobile-chapter-${chapter + 1}`);
    }
  }
  await click('[data-step="2"]');
  await click('[data-evidence="installer"]');
  const rect = await evaluate('JSON.stringify(document.querySelector("dialog").getBoundingClientRect().toJSON())');
  const bounds = JSON.parse(rect);
  assert.ok(bounds.left >= 0 && bounds.right <= 321, 'Dialog fits narrow viewport');
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  console.log('Browser checks passed: offline loading, five chapters, vote, focus, answer-key reveal, record explorer, response variants, restart, playback, keyboard navigation and five viewport widths.');
} finally {
  if (targetId) await call('Target.closeTarget', { targetId });
  socket.close();
}
