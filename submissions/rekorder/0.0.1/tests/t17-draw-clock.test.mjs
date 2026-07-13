/**
 * T17 harness: the compositor clock. The app composites from a bundled ticker.js Worker so
 * the canvas keeps painting while the studio window is hidden; rAF is the fallback. This
 * fakes the Worker and asserts every failure mode reaches that fallback — a worker that
 * throws at construction, one that fires `error` later, and one that loads but never ticks.
 * A dead clock paints nothing at all, which is worse than the freeze T17 exists to fix.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

// --------------------------------------------------------------- fake DOM --

function makeEl(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(), children: [], parentElement: null,
    attributes: {}, dataset: {}, style: {}, textContent: '',
    classList: { add() {}, remove() {}, contains: () => false },
    set innerHTML(h) { this._h = h; }, get innerHTML() { return this._h || ''; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
    prepend(c) { c.parentElement = this; this.children.unshift(c); return c; },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, focus() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    play() {}, pause() {}, load() {}, getContext: () => null,
  };
}
const appEl = makeEl();

const documentStub = {
  documentElement: makeEl('html'), body: makeEl('body'),
  getElementById: (id) => (id === 'app' ? appEl : null),
  createElement: makeEl,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {},
};

// ------------------------------------------------------------- fake clocks --

// A steppable rAF: the app's fallback path. Nothing runs until pumpFrames() says so.
let rafQueue = new Map();
let rafId = 0;
let rafScheduled = 0;
function requestAnimationFrame(fn) {
  rafId += 1;
  rafScheduled += 1;
  rafQueue.set(rafId, fn);
  return rafId;
}
function cancelAnimationFrame(id) { rafQueue.delete(id); }
function pumpFrames(times = 1) {
  for (let i = 0; i < times; i += 1) {
    const queued = [...rafQueue.values()];
    rafQueue = new Map();
    for (const fn of queued) fn();
  }
}

// A steppable setTimeout: the ticker watchdog's clock. Real timers would make the suite
// wait TICKER_FIRST_TICK_MS; firing them by hand keeps the assertion about the deadline,
// not about wall time.
let timers = new Map();
let timerId = 0;
function setTimeoutStub(fn, ms) {
  timerId += 1;
  timers.set(timerId, { fn, ms });
  return timerId;
}
function clearTimeoutStub(id) { timers.delete(id); }
function fireTimers(predicate = () => true) {
  for (const [id, timer] of [...timers]) {
    if (!predicate(timer)) continue;
    timers.delete(id);
    timer.fn();
  }
}
// The app awaits `settle()` on real time; only the long watchdog timer is faked out.
const isWatchdog = (timer) => timer.ms >= 1000;
const settle = () => new Promise((resolve) => { setTimeout(resolve, 5); });

// -------------------------------------------------------------- fake Worker --

let workers = [];
let workerConstructorThrows = false;

class FakeWorker {
  constructor(url) {
    if (workerConstructorThrows) throw new Error('worker blocked by CSP');
    this.url = url;
    this.messages = [];
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
    workers.push(this);
  }

  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }

  /** The worker's interval firing: one tick, one frame. */
  tick() { if (this.onmessage) this.onmessage('tick'); }
  /** A load/parse/runtime failure: an `error` event, NOT a constructor throw. */
  crash() { if (this.onerror) this.onerror({ message: 'ticker.js failed to load' }); }
}

const tinyAtom = {
  metadata: async () => ({ ok: true, id: 'rekorder', name: 'Rekorder', version: '1' }),
  storage: { get: async () => ({ ok: true, value: null }), set: async () => ({ ok: true }) },
  files: { exists: async () => ({ ok: true, exists: false }) },
  camera: { requestAccess: async () => ({ ok: true }) },
  microphone: { requestAccess: async () => ({ ok: true }) },
  screenCapture: { getSources: async () => ({ ok: true, sources: [] }) },
  media: { runFfprobe: async () => ({ ok: false, reason: 'runtime-missing' }) },
  clipboard: { writeText: async () => ({ ok: true }) },
};

const errors = [];
const sandbox = {
  window: { addEventListener() {}, tinyAtom },
  document: documentStub,
  navigator: { mediaDevices: { enumerateDevices: async () => [], getUserMedia: async () => { throw new Error('no devices'); } }, userAgent: 'Mac' },
  console: { ...console, error(...args) { errors.push(args.join(' ')); }, warn() {}, info() {}, log() {} },
  crypto: { randomUUID: () => 'id-1' },
  Blob: class {}, FileReader: class {}, MediaStream: class {},
  AudioContext: class {},
  Worker: FakeWorker,
  requestAnimationFrame, cancelAnimationFrame,
  getComputedStyle: () => ({ getPropertyValue: () => '#000' }),
  setTimeout: setTimeoutStub, clearTimeout: clearTimeoutStub, setInterval, clearInterval,
  performance: { now: () => 0 },
  queueMicrotask, Promise, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  Uint8Array, Error, isNaN, parseInt, parseFloat,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), sandbox, { filename: 'app.js' });

const R = sandbox.window.__rekorder;
const { store, capture, refs, syncScene } = R;
await settle();

// A canvas that counts composites. The scene is the camera-only preset, so drawFrame does
// not wait on a screen <video> — a real getContext() call means a real frame was painted.
let draws = 0;
function armCanvas() {
  draws = 0;
  refs.canvas = { width: 0, height: 0, getContext: () => { draws += 1; return null; } };
  syncScene({ ...store.state, layout: 'cameraOnly' });
}

function reset() {
  capture.stopDrawLoop();
  workers = [];
  workerConstructorThrows = false;
  timers = new Map();
  rafQueue = new Map();
  rafScheduled = 0;
  errors.length = 0;
  armCanvas();
}

// ------------------------------------------------- 1. the healthy worker clock --

console.log('\nT17 — worker clock (the path a hidden window depends on)');
reset();
capture.startDrawLoop();

check('startDrawLoop constructs the bundled ticker worker', workers.length === 1 && workers[0].url === 'ticker.js');
check('the worker is started at the configured frame rate',
  JSON.stringify(workers[0].messages[0]) === JSON.stringify({ type: 'start', fps: store.state.frameRate }),
  JSON.stringify(workers[0].messages[0]));
check('the loop is marked live', refs.capture.drawing === true);
check('no rAF is scheduled while the worker is the clock', rafScheduled === 0, `rafScheduled=${rafScheduled}`);
check('a watchdog is armed for the first tick', refs.capture.tickerWatchdog !== null);

workers[0].tick();
workers[0].tick();
workers[0].tick();
check('each worker tick paints one frame', draws === 3, `draws=${draws}`);
check('the first tick disarms the watchdog', refs.capture.tickerWatchdog === null);
check('a ticking worker never falls back to rAF', rafScheduled === 0, `rafScheduled=${rafScheduled}`);

// The watchdog must be gone, not merely ignored: a stale one would kill a healthy worker.
fireTimers(isWatchdog);
workers[0].tick();
check('a healthy worker survives past the watchdog deadline',
  refs.capture.ticker === workers[0] && workers[0].terminated === false && draws === 4, `draws=${draws}`);

// -------------------------------------------- 2. frame rate change under a live loop --

console.log('\nT17 — retiming');
store.state.frameRate = 60;
capture.retimeDrawLoop();
check('retimeDrawLoop re-clocks the worker at the new fps',
  JSON.stringify(workers[0].messages.at(-1)) === JSON.stringify({ type: 'start', fps: 60 }),
  JSON.stringify(workers[0].messages.at(-1)));
check('retiming does not spawn a second worker', workers.length === 1);
store.state.frameRate = 30;

// ------------------------------------------------------------ 3. teardown --

console.log('\nT17 — teardown');
const live = workers[0];
capture.stopDrawLoop();
check('stopDrawLoop terminates the worker', live.terminated === true);
check('stopDrawLoop drops the worker ref', refs.capture.ticker === null);
check('stopDrawLoop clears the watchdog', refs.capture.tickerWatchdog === null && timers.size === 0);
check('stopDrawLoop ends the loop', refs.capture.drawing === false);

const drawsAfterStop = draws;
live.tick(); // a tick already in flight when the loop stopped must not paint
check('a late tick after teardown paints nothing', draws === drawsAfterStop, `draws=${draws}`);

// ------------------------------- 4. failure mode: the worker throws at construction --

console.log('\nT17 — fallback: worker cannot be constructed');
reset();
workerConstructorThrows = true;
capture.startDrawLoop();
check('a construction throw leaves no worker', refs.capture.ticker === null);
check('a construction throw falls back to rAF', rafScheduled === 1, `rafScheduled=${rafScheduled}`);
check('the fallback is logged', errors.some((line) => line.includes('requestAnimationFrame')));

pumpFrames(2);
check('the rAF fallback keeps painting', draws === 2, `draws=${draws}`);
check('the rAF fallback re-schedules itself', rafScheduled === 3, `rafScheduled=${rafScheduled}`);

// ------------------------------- 5. failure mode: the worker fails asynchronously --

console.log('\nT17 — fallback: worker fires error after construction');
reset();
capture.startDrawLoop();
check('the worker is the clock before it fails', refs.capture.ticker === workers[0] && rafScheduled === 0);

workers[0].crash();
check('an async worker error terminates the worker', workers[0].terminated === true);
check('an async worker error drops the worker ref', refs.capture.ticker === null);
check('an async worker error clears the watchdog', refs.capture.tickerWatchdog === null);
check('an async worker error falls back to rAF', rafScheduled === 1, `rafScheduled=${rafScheduled}`);
check('the async failure is logged', errors.some((line) => line.includes('requestAnimationFrame')));

pumpFrames(2);
check('the canvas paints again after the worker failure', draws === 2, `draws=${draws}`);
check('the loop is still live after demotion', refs.capture.drawing === true);

// ------------------------- 6. failure mode: the worker loads but never ticks (silent) --

console.log('\nT17 — fallback: worker constructs but never ticks');
reset();
capture.startDrawLoop();
check('a silent worker paints nothing before the deadline', draws === 0 && rafScheduled === 0);

fireTimers(isWatchdog); // the first-tick deadline expires
check('the watchdog terminates the silent worker', workers[0].terminated === true);
check('the watchdog drops the worker ref', refs.capture.ticker === null);
check('the watchdog falls back to rAF', rafScheduled === 1, `rafScheduled=${rafScheduled}`);
check('the silent worker is logged', errors.some((line) => line.includes('no frames')));

pumpFrames(2);
check('the canvas paints after the watchdog demotion', draws === 2, `draws=${draws}`);

// A demoted worker that wakes up late must not double-drive the loop alongside rAF.
const drawsBeforeZombie = draws;
workers[0].tick();
check('a zombie tick from a demoted worker paints nothing', draws === drawsBeforeZombie, `draws=${draws}`);

// -------------------------------- 7. demotion is idempotent and teardown-safe --

console.log('\nT17 — demotion is safe to repeat');
reset();
capture.startDrawLoop();
const doomed = workers[0];
doomed.crash();
const rafAfterFirst = rafScheduled;
capture.demoteTicker(doomed, 'again', null); // a second error event for the same worker
check('demoting the same worker twice schedules no second rAF chain',
  rafScheduled === rafAfterFirst, `rafScheduled=${rafScheduled}`);

capture.stopDrawLoop();
capture.startDrawLoop();
const fresh = workers.at(-1);
capture.demoteTicker(doomed, 'stale', null); // the old worker's error arriving after a restart
check('a stale demotion cannot unseat the current worker', refs.capture.ticker === fresh && fresh.terminated === false);
capture.stopDrawLoop();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
