/**
 * T11 harness: the live microphone meter. Fakes an AudioContext/AnalyserNode and a
 * steppable requestAnimationFrame, then feeds real sample buffers through and checks the
 * bars and the silence verdict follow the signal.
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

const meterBars = [];
let statusEl = null;

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
    addEventListener() {}, focus() {}, setSelectionRange() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    play() {}, pause() {}, load() {}, getContext: () => null,
    get src() { return this.attributes.src || ''; }, set src(v) { this.attributes.src = String(v); },
  };
}
const appEl = makeEl();

const documentStub = {
  documentElement: makeEl('html'), body: makeEl('body'),
  getElementById: (id) => (id === 'app' ? appEl : null),
  createElement: makeEl,
  querySelector: (sel) => (sel === '[data-meter-status]' ? statusEl : null),
  querySelectorAll: (sel) => (sel === '[data-meter-bar]' ? meterBars : []),
  addEventListener() {},
};

// -------------------------------------------------------- fake Web Audio --

let audioContexts = [];
let contextStartState = 'running';
let resumeWorks = true;
let constructorThrows = false;

class FakeAnalyser {
  constructor() {
    this.fftSize = 2048;
    this.smoothingTimeConstant = 0;
    this.frequency = null; // Uint8Array the test injects
    this.time = null;
  }
  get frequencyBinCount() { return this.fftSize / 2; }
  getByteFrequencyData(out) { out.set(this.frequency || new Uint8Array(out.length)); }
  getByteTimeDomainData(out) { out.set(this.time || new Uint8Array(out.length).fill(128)); }
}

class FakeAudioContext {
  constructor() {
    if (constructorThrows) throw new Error('AudioContext unavailable');
    this.state = contextStartState;
    this.closed = false;
    this.analyser = null;
    this.sourceStream = null;
    this.sourceDisconnected = false;
    audioContexts.push(this);
  }
  createMediaStreamSource(stream) {
    this.sourceStream = stream;
    const self = this;
    return { connect(node) { self.connectedTo = node; }, disconnect() { self.sourceDisconnected = true; } };
  }
  createAnalyser() { this.analyser = new FakeAnalyser(); return this.analyser; }
  async resume() {
    if (!resumeWorks) throw new Error('blocked');
    this.state = 'running';
  }
  close() { this.closed = true; }
}

// ------------------------------------------------- steppable animation loop --

let frames = [];
const requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
const cancelAnimationFrame = (id) => { frames[id - 1] = null; };
/** Run exactly one queued frame (the loop re-queues itself). */
function stepFrame() {
  const queued = frames;
  frames = [];
  for (const fn of queued) if (fn) fn();
}

let now = 0;

// ------------------------------------------------------- fake media devices --

const stoppedTracks = [];
function makeStream(label) {
  const track = { kind: 'audio', label, enabled: true, stop() { stoppedTracks.push(label); } };
  return { label, getTracks: () => [track], getAudioTracks: () => [track] };
}

let gumCalls = [];
let gumFails = false;
const media = {
  devices: [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in' }, { kind: 'audioinput', deviceId: 'mic-2', label: 'USB' }],
  async enumerateDevices() { return this.devices.slice(); },
  async getUserMedia(constraints) {
    gumCalls.push(constraints);
    if (gumFails) throw Object.assign(new Error('nope'), { name: 'NotFoundError' });
    return makeStream(`gum-${gumCalls.length}`);
  },
};

const tinyAtom = {
  metadata: async () => ({ ok: true, id: 'rekorder', name: 'rekorder', version: '1' }),
  storage: { get: async () => ({ ok: true, value: null }), set: async () => ({ ok: true }) },
  files: { exists: async () => ({ ok: true, exists: false }) },
  camera: { requestAccess: async () => ({ ok: true }) },
  microphone: { requestAccess: async () => ({ ok: true }) },
  screenCapture: { getSources: async () => ({ ok: true, sources: [] }) },
  media: { runFfprobe: async () => ({ ok: false, reason: 'runtime-missing' }) },
  clipboard: { writeText: async () => ({ ok: true }) },
};

const sandbox = {
  window: { addEventListener() {}, tinyAtom },
  document: documentStub,
  navigator: { mediaDevices: media, userAgent: 'Mac' },
  console: { ...console, error() {}, warn() {}, info() {} },
  crypto: { randomUUID: () => 'id-1' },
  Blob: class {}, FileReader: class {}, MediaStream: class {},
  AudioContext: FakeAudioContext,
  requestAnimationFrame, cancelAnimationFrame,
  getComputedStyle: () => ({ getPropertyValue: () => '#000' }),
  setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => now },
  queueMicrotask, Promise, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  Uint8Array, Error, isNaN, parseInt, parseFloat,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), sandbox, { filename: 'app.js' });

const R = sandbox.window.__rekorder;
const { store, micMeter, refs, timeDomainRms, spectrumBars, describe, setupMicBody } = R;
const settle = () => new Promise((r) => setTimeout(r, 5));
await settle();

function mountMeter() {
  meterBars.length = 0;
  for (let i = 0; i < 14; i += 1) meterBars.push(makeEl('span'));
  statusEl = makeEl('p');
}

/**
 * setState() renders, and the `setup` mounter starts the meter on its own — exactly as it
 * does in the app. So: apply state, let that in-flight sync finish, tear it down, and only
 * then zero the counters. Otherwise every assertion counts the mounter's work too.
 */
const reset = async (over = {}) => {
  gumFails = false;
  contextStartState = 'running';
  resumeWorks = true;
  constructorThrows = false;

  refs.capture.micStream = over.captureStream || null;
  store.setState({
    view: 'setup',
    capabilities: { camera: 'granted', microphone: 'granted', screenCapture: 'granted' },
    microphones: [{ deviceId: 'mic-1' }, { deviceId: 'mic-2' }],
    selectedMicId: over.micId || 'mic-1',
    deviceIssues: { camera: '', microphone: '' },
    enhanceAudio: true,
    ...over.state,
  });
  await settle();
  micMeter.stop();

  mountMeter();
  audioContexts = [];
  frames = [];
  gumCalls = [];
  stoppedTracks.length = 0;
  now = 0;
  refs.meter = null;
  refs.meterFailedKey = ''; // the failure latch is per-source and must not leak between cases
  refs.meterPendingKey = '';
};

/** A tone: non-128 samples ⇒ non-zero RMS. */
const loudTime = (amplitude = 60) => Uint8Array.from({ length: 64 }, (_, i) => 128 + (i % 2 ? amplitude : -amplitude));
const silentTime = () => new Uint8Array(64).fill(128);

// ------------------------------------------------------------------ tests --

console.log('\ntimeDomainRms — amplitude, not spectrum, tells you sound arrived');
check('silence is zero', timeDomainRms(silentTime()) === 0);
check('a tone is above the silence threshold', timeDomainRms(loudTime()) > 0.01, String(timeDomainRms(loudTime())));
check('a whisper sits below it', timeDomainRms(loudTime(1)) < 0.01, String(timeDomainRms(loudTime(1))));
check('full scale approaches 1', timeDomainRms(loudTime(127)) > 0.9);

console.log('\nspectrumBars');
const flat = new Uint8Array(32).fill(0);
const bars0 = spectrumBars(flat, 14);
check('produces one bar per slot', bars0.length === 14);
check('silence still shows a floor, not a gap', bars0.every((b) => b === 6), JSON.stringify(bars0));
const full = new Uint8Array(32).fill(255);
check('a full spectrum clamps at 100', spectrumBars(full, 14).every((b) => b === 100));
const half = new Uint8Array(32).fill(128);
check('a mid signal lands between', spectrumBars(half, 14).every((b) => b > 6 && b < 100));

console.log('\nthe meter reflects the real signal');
await reset();
await micMeter.sync(store.state);
check('a stream was opened', gumCalls.length === 1, JSON.stringify(gumCalls));
check('an AudioContext was created', audioContexts.length === 1);
check('the analyser is wired to the source, not the speakers',
  audioContexts[0].connectedTo === audioContexts[0].analyser, 'must never connect to destination');
check('fftSize is small enough for 14 bars', audioContexts[0].analyser.fftSize === 64);

const analyser = audioContexts[0].analyser;
analyser.frequency = new Uint8Array(32).fill(200);
analyser.time = loudTime();
stepFrame();
check('bars rise with the signal', meterBars.every((b) => parseInt(b.style.height, 10) > 6), meterBars.map((b) => b.style.height).join(','));
check('the status reports sound', /Picking up sound/.test(statusEl.textContent), statusEl.textContent);
check('and is toned as good', statusEl.dataset.tone === 'good');

analyser.frequency = new Uint8Array(32).fill(0);
analyser.time = silentTime();
stepFrame();
check('bars fall to the floor on silence', meterBars.every((b) => b.style.height === '6%'), meterBars[0].style.height);
check('but it does not cry silence immediately', /Picking up sound/.test(statusEl.textContent), statusEl.textContent);

console.log('\nsilence is detected only after it persists');
now = 1999;
stepFrame();
check('still quiet-but-fine at 1999 ms', /Picking up sound/.test(statusEl.textContent), statusEl.textContent);
now = 2001;
stepFrame();
check('after 2 s it says no sound was detected', /No sound detected/.test(statusEl.textContent), statusEl.textContent);
check('and is toned as a warning', statusEl.dataset.tone === 'warn');

analyser.time = loudTime();
now = 2100;
stepFrame();
check('sound returns it to normal', /Picking up sound/.test(statusEl.textContent), statusEl.textContent);

console.log('\nteardown releases what it owns');
micMeter.stop();
check('the frame loop is cancelled', frames.every((f) => f === null), String(frames.filter(Boolean).length));
check('the source is disconnected', audioContexts[0].sourceDisconnected === true);
check('the AudioContext is closed', audioContexts[0].closed === true);
check('the microphone it opened is stopped', stoppedTracks.length === 1, JSON.stringify(stoppedTracks));
check('refs are cleared', refs.meter === null);

console.log('\na live capture session is reused, never re-opened');
const captureStream = makeStream('capture-mic');
await reset({ captureStream });
await micMeter.sync(store.state);
check('no second getUserMedia', gumCalls.length === 0, JSON.stringify(gumCalls));
check('the analyser reads the capture stream', audioContexts[0].sourceStream === captureStream);
check('the meter knows it does not own it', refs.meter.owned === false);

micMeter.stop();
check('stopping the meter does NOT stop the recording microphone', stoppedTracks.length === 0, JSON.stringify(stoppedTracks));
check('but it still closes its own context', audioContexts[0].closed === true);

console.log('\nswitching device re-points the meter');
await reset();
await micMeter.sync(store.state);
const firstContext = audioContexts[0];
await micMeter.sync(store.state); // same device: no restart
check('re-syncing the same device is a no-op', audioContexts.length === 1 && gumCalls.length === 1);

store.setState({ selectedMicId: 'mic-2' }); // render → setup mounter → micMeter.sync
await settle();
check('a new device restarts the graph', audioContexts.length === 2, String(audioContexts.length));
check('the old context was closed', firstContext.closed === true);
check('the old microphone was released', stoppedTracks.length === 1, JSON.stringify(stoppedTracks));
check('a fresh stream was opened', gumCalls.length === 2);
micMeter.stop();

console.log('\nit refuses to start where it cannot');
await reset({ state: { capabilities: { camera: 'granted', microphone: 'denied', screenCapture: 'granted' } } });
await micMeter.sync(store.state);
check('a denied microphone opens nothing', gumCalls.length === 0 && audioContexts.length === 0);
check('and no meter is held', refs.meter === null);

await reset({ state: { microphones: [], selectedMicId: '', deviceIssues: { camera: '', microphone: 'absent' } } });
await micMeter.sync(store.state);
check('an absent microphone opens nothing', gumCalls.length === 0 && audioContexts.length === 0);

await reset({ state: { microphones: [], selectedMicId: '', deviceIssues: { camera: '', microphone: 'hidden' } } });
await micMeter.sync(store.state);
check('a hidden-but-working microphone still meters', gumCalls.length === 1, JSON.stringify(gumCalls));
check('using the system default (no deviceId)', gumCalls[0].audio.deviceId === undefined, JSON.stringify(gumCalls[0]));
micMeter.stop();

console.log('\nevery microphone the meter opens has a meter rendered for it');
// An open microphone lights the OS recording indicator. If `key()` opens one, the Setup
// card must show the bars it is painting into, or the indicator is unexplainable.
const bodyFor = (issue, microphones = []) =>
  setupMicBody({
    ...store.state,
    microphones,
    selectedMicId: microphones.length ? 'mic-1' : '',
    capabilities: { camera: 'granted', microphone: 'granted', screenCapture: 'granted' },
    deviceIssues: { camera: '', microphone: issue },
  });

const hiddenBody = bodyFor('hidden');
check('the hidden empty state renders the meter bars', (hiddenBody.match(/data-meter-bar/g) || []).length === 14);
check('and the meter status line', /data-meter-status/.test(hiddenBody));
check('and still explains why no device is listed', /not listed/i.test(hiddenBody), hiddenBody.slice(0, 120));

const absentBody = bodyFor('absent');
check('an absent microphone renders no meter (it opens none)', !/data-meter-bar/.test(absentBody));
check('a listed microphone renders the meter', (bodyFor('', [{ deviceId: 'mic-1' }]).match(/data-meter-bar/g) || []).length === 14);

console.log('\nconcurrent renders open the microphone once, not once per render');
await reset();
// Both syncs race through the `await captureMic()` window, where `refs.meter` is still null.
await Promise.all([micMeter.sync(store.state), micMeter.sync(store.state), micMeter.sync(store.state)]);
check('three concurrent syncs issue one getUserMedia', gumCalls.length === 1, JSON.stringify(gumCalls));
check('and build one AudioContext', audioContexts.length === 1, String(audioContexts.length));
check('and no stream was opened then discarded', stoppedTracks.length === 0, JSON.stringify(stoppedTracks));
check('the pending latch is released once open', refs.meterPendingKey === '');
micMeter.stop();

await reset();
// A device change mid-flight must not be blocked by the previous source's pending latch.
const first = micMeter.sync(store.state);
store.setState({ selectedMicId: 'mic-2' });
await Promise.all([first, micMeter.sync(store.state)]);
check('a different source during the open window is not swallowed', gumCalls.length === 2, JSON.stringify(gumCalls));
check('and the meter ends up on the newest source', refs.meter && refs.meter.key === 'mic-2', refs.meter && refs.meter.key);
micMeter.stop();
check('stopping clears the pending latch', refs.meterPendingKey === '');

console.log('\nfailures are stated, not shown as a flat meter');
await reset();
gumFails = true;
await micMeter.sync(store.state);
check('a failed getUserMedia opens no context', audioContexts.length === 0);
check('and says the microphone could not be opened', /could not be opened/.test(statusEl.textContent), statusEl.textContent);

await reset();
constructorThrows = true;
await micMeter.sync(store.state);
constructorThrows = false;
check('a failed AudioContext releases the stream it opened', stoppedTracks.length === 1, JSON.stringify(stoppedTracks));
check('and says the meter could not start', /could not start/.test(statusEl.textContent), statusEl.textContent);

console.log('\na suspended AudioContext is resumed');
await reset();
contextStartState = 'suspended';
await micMeter.sync(store.state);
check('it resumed to running', audioContexts[0].state === 'running');
check('and the loop is running', frames.length > 0, String(frames.length));
micMeter.stop();

await reset();
contextStartState = 'suspended';
resumeWorks = false;
await micMeter.sync(store.state);
resumeWorks = true;
check('a context that will not run reports it', /Audio is blocked/.test(statusEl.textContent), statusEl.textContent);
check('and does not spin a frame loop', frames.length === 0, String(frames.length));
micMeter.stop();

console.log('\nconsole diagnostics survive the host stringifier');
check('a DOMException renders name and message',
  describe(Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' })) === 'NotFoundError: Requested device not found',
  describe(Object.assign(new Error('x'), { name: 'NotFoundError' })));
check('a constraints object renders as JSON', describe({ audio: true }) === '{"audio":true}', describe({ audio: true }));
check('null and undefined survive', describe(null) === 'null' && describe(undefined) === 'undefined');
check('a plain string passes through', describe('hi') === 'hi');
check('no value becomes [object Object]', !/\[object/.test(describe({ a: 1 })));
const cyclic = {};
cyclic.self = cyclic;
check('a cyclic object does not throw', typeof describe(cyclic) === 'string', describe(cyclic));
check('a cyclic object does not become [object Object]', !/\[object/.test(describe(cyclic)), describe(cyclic));
check('a cyclic object names its constructor', describe(cyclic) === '<unserializable Object>', describe(cyclic));
const bare = Object.create(null);
bare.self = bare;
check('a null-prototype cycle still renders', describe(bare) === '<unserializable object>', describe(bare));

// ============ regression: the retry storm seen in Preview (2026-07-09) ============
// settings.load() restores the last-used mic id before devices.refresh() clears it, so
// the meter asked for an absent device by exact deviceId on every single render.

console.log('\nthe meter never chases a device that is not listed');
await reset({ state: { microphones: [], selectedMicId: 'mic-from-storage', deviceIssues: { camera: '', microphone: 'absent' } } });
await micMeter.sync(store.state);
check('a stale selected id with an empty device list opens nothing', gumCalls.length === 0, JSON.stringify(gumCalls));
check('and no AudioContext is built', audioContexts.length === 0);
check('no meter is held', refs.meter === null);

await reset({ state: { microphones: [{ deviceId: 'mic-1' }], selectedMicId: 'mic-gone', deviceIssues: { camera: '', microphone: '' } } });
await micMeter.sync(store.state);
check('a selected id absent from the list is not requested', gumCalls.length === 0, JSON.stringify(gumCalls));

console.log('a source that fails is tried once, not once per repaint');
await reset();
gumFails = true;
await micMeter.sync(store.state);
check('the first attempt happened', gumCalls.length === 1);
check('and it latched', refs.meterFailedKey === 'mic-1', refs.meterFailedKey);
check('the status names the real error', /NotFoundError/.test(statusEl.textContent), statusEl.textContent);

for (let i = 0; i < 5; i += 1) await micMeter.sync(store.state); // five repaints
check('five more renders issue no further getUserMedia', gumCalls.length === 1, `${gumCalls.length} calls`);

gumFails = false;
refs.meterFailedKey = ''; // what devices.refresh() does when the user asks again
await micMeter.sync(store.state);
check('clearing the latch lets it try again', gumCalls.length === 2, String(gumCalls.length));
check('and it now runs', refs.meter !== null);
micMeter.stop();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
