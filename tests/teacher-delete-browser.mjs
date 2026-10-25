import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// This test performs real deletions against synthetic sessions on loopback only.
const base = new URL(process.env.ENVIEDU_TEST_URL || 'http://127.0.0.1:4173').origin;
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Deletion browser tests require a local test server.');
const prefix = 'DELETE-UI-' + Date.now();
const artifacts = new URL('../.artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'enviedu-delete-browser-'));
const browserPath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!browserPath) throw new Error('Set CHROME_PATH to a local Chromium browser.');
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
const pending = new Map(), exceptions = [];
let socket, sequence = 0, failNextDelete = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let attempt = 0; attempt < 80; attempt++) { if (await check()) return; await sleep(100); }
  throw new Error('Timed out: ' + label);
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 12000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function fill(selector, value) {
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const selected = () => evaluate('document.querySelector(".teacher-selection [role=status]")?.textContent');
const ready = selector => until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), selector);
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(new URL(name + '.png', artifacts), Buffer.from(result.data, 'base64'));
}
async function seed(code, classId) {
  const response = await fetch(base + '/api/student/sessions', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId: code, classId }) });
  assert.equal(response.status, 201);
  return response.json();
}
async function matchingRows() {
  return evaluate(`(async () => { const response = await fetch('/api/teacher/submissions/selection?search=' + ${JSON.stringify(prefix)}); return (await response.json()).submissions; })()`);
}
try {
  let port;
  await until(async () => { try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); return !!port; } catch { return false; } }, 'browser debug port');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      if (failNextDelete && request.method === 'DELETE') {
        failNextDelete = false;
        void call('Fetch.fulfillRequest', { requestId, responseCode: 500, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: 'Simulated deletion failure.' })).toString('base64') });
      } else void call('Fetch.continueRequest', { requestId });
    }
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  for (let index = 0; index < 27; index++) await seed(prefix + '-A' + index, 'A');
  for (let index = 0; index < 3; index++) await seed(prefix + '-B' + index, 'B');
  await call('Page.navigate', { url: base + '/dev/teacher-signin' });
  await ready('.teacher-dashboard'); await ready('.teacher-table');
  assert.equal(await evaluate('document.querySelectorAll(".teacher-dashboard footer").length'), 0, 'Requested footer removed');
  await fill('.teacher-filters input', prefix);
  await until(() => evaluate('document.querySelector(".teacher-results .pill")?.textContent === "30 matching sessions"'), 'test filter');
  assert.equal(await evaluate('document.querySelector(".teacher-selection .teacher-danger").disabled'), true);
  await click('.teacher-selection input');
  assert.equal(await selected(), '25 selected');
  await click('.teacher-select-column input');
  assert.equal(await selected(), '24 selected');
  assert.equal(await evaluate('document.querySelector(".teacher-selection input").indeterminate'), true);
  await click('.teacher-select-column input');
  assert.equal(await selected(), '25 selected');
  await click('.teacher-pagination button:last-child');
  await until(() => evaluate('document.querySelectorAll(".teacher-table tbody tr").length === 5'), 'second page');
  await click('.teacher-select-column input');
  assert.equal(await selected(), '26 selected', 'Selection persists across pages');
  await evaluate('Array.from(document.querySelectorAll(".teacher-selection button")).find(button => button.textContent === "Clear selection").click()');
  assert.equal(await selected(), '0 selected');
  await evaluate('Array.from(document.querySelectorAll(".teacher-selection button")).find(button => button.textContent.startsWith("Select all 30")).click()');
  await until(async () => await selected() === '30 selected', 'all matching pages');
  await fill('.teacher-filters label:last-child select', 'separate');
  await until(() => evaluate('document.querySelector(".teacher-results .pill")?.textContent === "3 matching sessions"'), 'class B filter');
  assert.equal(await selected(), '0 selected', 'Changing filters clears prior selection');
  await click('.teacher-selection input');
  await click('.teacher-selection .teacher-danger');
  await ready('dialog[open]');
  assert.equal(await evaluate('document.querySelectorAll(".teacher-delete-codes li").length'), 3);
  assert.equal(await evaluate('document.activeElement.textContent'), 'Cancel', 'Confirmation starts on Cancel');
  await click('.teacher-delete-actions .outline');
  await until(() => evaluate('!document.querySelector("dialog").open'), 'cancel dialog');
  assert.equal((await matchingRows()).length, 30, 'Cancel keeps every submission');
  await fill('.teacher-filters label:last-child select', 'guided');
  await until(() => evaluate('document.querySelector(".teacher-results .pill")?.textContent === "27 matching sessions"'), 'class A filter');
  await click('.teacher-table .text-btn'); await ready('.teacher-detail');
  await evaluate('Array.from(document.querySelectorAll(".teacher-selection button")).find(button => button.textContent.startsWith("Select all 27")).click()');
  await until(async () => await selected() === '27 selected', 'class A selection');
  await click('.teacher-selection .teacher-danger'); await ready('dialog[open]');
  assert.equal(await evaluate('document.querySelectorAll(".teacher-delete-codes li").length'), 27);
  const late = await seed(prefix + '-LATE', 'A');
  assert.ok(!(await evaluate('Array.from(document.querySelectorAll(".teacher-delete-codes li")).map(row => row.textContent)')).includes(late.participantId));
  await screenshot('teacher-delete-desktop');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Dashboard fits mobile');
  assert.ok(await evaluate('document.querySelector("dialog").getBoundingClientRect().width <= innerWidth'), 'Dialog fits mobile');
  await screenshot('teacher-delete-mobile');
  await call('Fetch.enable', { patterns: [{ urlPattern: '*/api/teacher/submissions', requestStage: 'Request' }] });
  failNextDelete = true;
  await click('.teacher-delete-actions .teacher-danger');
  await until(() => evaluate('document.querySelector("dialog [role=alert]")?.textContent.includes("Simulated deletion failure")'), 'error recovery');
  assert.equal(await evaluate('document.querySelector("dialog").open'), true);
  assert.equal((await matchingRows()).length, 31, 'Failed request removes no records');
  await call('Fetch.disable');
  await click('.teacher-delete-actions .teacher-danger');
  await until(() => evaluate('document.querySelector(".alert.success")?.textContent === "27 sessions deleted."'), 'delete acknowledgement');
  await until(() => evaluate('document.querySelector(".teacher-results .pill")?.textContent === "1 matching sessions"'), 'updated class totals');
  assert.equal(await selected(), '0 selected');
  assert.equal(await evaluate('document.querySelectorAll(".teacher-detail").length'), 0);
  assert.equal(await evaluate('document.querySelector("dialog").open'), false);
  const remaining = await matchingRows();
  assert.equal(remaining.length, 4);
  assert.ok(remaining.some(row => row.id === late.sessionId), 'New arrival is preserved');
  assert.equal(remaining.filter(row => row.participant_code.includes('-B')).length, 3, 'Other class is preserved');
  const protocol = JSON.parse(await readFile(new URL('../src/config/study.json', import.meta.url), 'utf8'));
  const storageKey = 'enviedu:stock-flow:' + protocol.version;
  const savedSession = () => evaluate('JSON.parse(localStorage.getItem(' + JSON.stringify(storageKey) + '))');
  await call('Page.navigate', { url: base + '/' }); await ready('.setup-form');
  await fill('#participant-id', prefix + '-EXPIRE'); await fill('#class-id', 'A');
  await evaluate('document.querySelector(".setup-form").requestSubmit()');
  await until(async () => (await savedSession())?.stage === 'pretest', 'student session starts');
  const beforeExpiry = await savedSession();
  // Manual removal exercises the same 410 response and restart UI as idle expiry.
  const removed = await evaluate(`(async () => { const response = await fetch('/api/teacher/submissions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [${JSON.stringify(beforeExpiry.sessionId)}] }) }); return response.status; })()`);
  assert.equal(removed, 200);
  await evaluate('localStorage.setItem("legacy:stock-flow:pilot-draft-4-collection-en", localStorage.getItem(' + JSON.stringify(storageKey) + '))');
  await call('Page.reload'); await ready('.student-expired');
  assert.equal(await evaluate('document.querySelectorAll(".study-sidebar,.study-topline,.active-session").length'), 0, 'Expired sessions have no active journey UI');
  await screenshot('student-session-expired');
  await click('.student-expired .btn'); await ready('.setup-form');
  assert.equal(await savedSession(), null);
  assert.equal(await evaluate('localStorage.getItem("legacy:stock-flow:pilot-draft-4-collection-en")'), null);
  assert.equal(await evaluate('document.querySelector("#participant-id").value'), beforeExpiry.participantId);
  await evaluate('document.querySelector(".setup-form").requestSubmit()');
  await until(async () => (await savedSession())?.stage === 'pretest', 'fresh session starts with the same participant code');
  assert.notEqual((await savedSession()).sessionId, beforeExpiry.sessionId);
  const secondSession = await savedSession();
  await evaluate(`fetch('/api/teacher/submissions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [${JSON.stringify(secondSession.sessionId)}] }) })`);
  await call('Page.reload'); await ready('.student-expired');
  await evaluate('Array.from(document.querySelectorAll(".site-header nav button")).find(button => button.textContent === "Overview").click()');
  await ready('.setup-form');
  await evaluate('document.querySelector(".setup-form").requestSubmit()');
  await until(async () => (await savedSession())?.stage === 'pretest', 'Overview also starts with a fresh upload queue');
  await until(() => evaluate('document.querySelector(".submission-sync")?.textContent.includes("Progress saved.")'), 'fresh upload acknowledged');
  assert.deepEqual(exceptions, []);
  console.log('PASS: row/page/all-matching selection, filter reset, Cancel, error recovery, exact deletion, totals, new arrivals, footer removal, desktop/mobile, expired-session recovery and fresh registration.');
} finally {
  if (socket?.readyState === 1) { try { await call('Browser.close'); } catch {} socket.close(); }
  browser.kill();
}
