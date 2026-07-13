/**
 * Device enumeration harness: the label-unlock split, the empty-list diagnosis, and the
 * capture fallback for a host that permits a device but never lists it.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

function makeEl(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(), children: [], parentElement: null,
    attributes: {}, dataset: {}, style: {},
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

// ---------------------------------------------------- fake media devices --

class DomError extends Error {
  constructor(name) { super(name); this.name = name; }
}

const media = {
  // what enumerateDevices() reports
  devices: [],
  // per-kind behaviour of getUserMedia: 'ok' | DOMException name
  audio: 'ok',
  video: 'ok',
  gumCalls: [],
  // a successful gUM for a kind reveals that kind's devices (as Chromium does)
  revealOnGrant: false,

  async enumerateDevices() { return this.devices.slice(); },
  async getUserMedia(constraints) {
    this.gumCalls.push(constraints);
    const wantsAudio = !!constraints.audio;
    const wantsVideo = !!constraints.video;
    if (wantsAudio && this.audio !== 'ok') throw new DomError(this.audio);
    if (wantsVideo && this.video !== 'ok') throw new DomError(this.video);
    if (this.revealOnGrant) {
      if (wantsAudio) this.devices = this.devices.concat([{ kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Mic' }]);
      if (wantsVideo) this.devices = this.devices.concat([{ kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD' }]);
      this.revealOnGrant = false;
    }
    return { getTracks: () => [{ stop() {} }] };
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
  clipboard: {
    writeText: async (text) => {
      clipboardWrites.push(text);
      return clipboardMode === 'denied' ? { ok: false, reason: 'capability-denied' } : { ok: true };
    },
  },
  shell: {
    openExternal: async (url) => {
      openExternalCalls.push(url);
      return openExternalMode === 'ok' ? { ok: true } : { ok: false, reason: 'invalid-request' };
    },
  },
};
const openExternalCalls = [];
let openExternalMode = 'refused';   // the documented behaviour: only http/https/mailto
const clipboardWrites = [];
let clipboardMode = 'ok';

const sandbox = {
  window: { addEventListener() {}, tinyAtom },
  document: {
    documentElement: makeEl('html'), body: makeEl('body'),
    getElementById: (id) => (id === 'app' ? appEl : null),
    createElement: makeEl, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {},
  },
  navigator: { mediaDevices: media, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  console: { ...console, error() {}, warn() {}, info() {} },
  crypto: { randomUUID: () => 'id-1' },
  Blob: class {}, FileReader: class {},
  // The setup mounter starts the mic meter; without this it would throw and latch as failed.
  AudioContext: class {
    constructor() { this.state = 'running'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() {
      return {
        fftSize: 64, smoothingTimeConstant: 0, frequencyBinCount: 32,
        getByteFrequencyData() {}, getByteTimeDomainData() {},
      };
    }
    async resume() {}
    close() {}
  },
  Uint8Array,
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => '#000' }),
  setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => 0 },
  queueMicrotask, Promise, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  Error, isNaN, parseInt, parseFloat,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), sandbox, { filename: 'app.js' });

const R = sandbox.window.__rekorder;
const { store, devices, deviceConstraint, diagnoseDevice, captureMic, captureCamera } = R;
const settle = () => new Promise((r) => setTimeout(r, 5));
await settle();

const reset = (over = {}) => {
  media.devices = over.devices || [];
  media.audio = over.audio || 'ok';
  media.video = over.video || 'ok';
  media.revealOnGrant = !!over.revealOnGrant;
  media.gumCalls = [];
  store.setState({
    capabilities: { camera: 'granted', microphone: 'granted', screenCapture: 'granted' },
    cameras: [], microphones: [], selectedCameraId: '', selectedMicId: '',
    deviceIssues: { camera: '', microphone: '' }, enhanceAudio: true, frameRate: 60,
    banners: [], // a banner raised by an earlier case would render into the next one's HTML
  });
  R.refs.meterFailedKey = '';
};

// ------------------------------------------------------------------ tests --

console.log('\nunlockLabels asks for each kind separately');
// A machine with a working mic and NO camera. The old combined
// getUserMedia({video:true,audio:true}) rejected outright and never unlocked the mic.
reset({
  devices: [{ kind: 'audioinput', deviceId: '', label: '' }],
  video: 'NotFoundError',
  revealOnGrant: false,
});
media.devices = [{ kind: 'audioinput', deviceId: 'mic-1', label: '' }];
await devices.refresh();
const audioOnlyCalls = media.gumCalls.filter((c) => c.audio && !c.video);
check('a mic-only unlock request was made', audioOnlyCalls.length >= 1, JSON.stringify(media.gumCalls));
check('no combined video+audio request', !media.gumCalls.some((c) => c.audio && c.video), JSON.stringify(media.gumCalls));
check('the microphone survives a missing camera', store.state.microphones.length === 1, String(store.state.microphones.length));
check('the camera is reported absent', store.state.deviceIssues.camera === 'absent', store.state.deviceIssues.camera);
check('the microphone has no issue', store.state.deviceIssues.microphone === '', store.state.deviceIssues.microphone);

console.log('\ndiagnoseDevice maps the DOMException, not a guess');
reset({ audio: 'NotAllowedError' });
check('NotAllowedError → blocked', (await diagnoseDevice({ audio: true })) === 'blocked');
reset({ audio: 'NotFoundError' });
check('NotFoundError → absent', (await diagnoseDevice({ audio: true })) === 'absent');
reset({ audio: 'NotReadableError' });
check('NotReadableError → busy', (await diagnoseDevice({ audio: true })) === 'busy');
reset({ audio: 'OverconstrainedError' });
check('OverconstrainedError → absent', (await diagnoseDevice({ audio: true })) === 'absent');
reset({ audio: 'SecurityError' });
check('SecurityError → blocked', (await diagnoseDevice({ audio: true })) === 'blocked');
reset({ audio: 'SomethingNovelError' });
check('an unknown name → error', (await diagnoseDevice({ audio: true })) === 'error');
reset();
check('a working device → no issue', (await diagnoseDevice({ audio: true })) === '');

console.log('\nan empty list is diagnosed, never assumed absent');
reset({ devices: [], audio: 'NotAllowedError', video: 'NotAllowedError' });
await devices.refresh();
check('a blocked mic reads blocked, not "no microphone found"', store.state.deviceIssues.microphone === 'blocked', store.state.deviceIssues.microphone);
check('a blocked camera reads blocked', store.state.deviceIssues.camera === 'blocked');

reset({ devices: [], audio: 'NotReadableError', video: 'NotFoundError' });
await devices.refresh();
check('a busy mic reads busy', store.state.deviceIssues.microphone === 'busy', store.state.deviceIssues.microphone);
check('a genuinely missing camera reads absent', store.state.deviceIssues.camera === 'absent');

console.log('\na successful probe re-enumerates (the permission just landed)');
reset({ devices: [], revealOnGrant: true });
await devices.refresh();
check('the mic appears after the probe grants it', store.state.microphones.length === 1, String(store.state.microphones.length));
check('and carries no issue', store.state.deviceIssues.microphone === '');
check('it is auto-selected', store.state.selectedMicId === 'mic-1', store.state.selectedMicId);

console.log('\npermitted but never listed → "hidden", not "absent"');
reset({ devices: [], revealOnGrant: false }); // gUM succeeds, enumerate stays empty
await devices.refresh();
check('the microphone is reported hidden', store.state.deviceIssues.microphone === 'hidden', store.state.deviceIssues.microphone);
check('the camera is reported hidden', store.state.deviceIssues.camera === 'hidden', store.state.deviceIssues.camera);
check('this is NOT reported as absent', store.state.deviceIssues.microphone !== 'absent');

console.log('\ndeviceConstraint');
check('a named device is requested exactly',
  JSON.stringify(deviceConstraint('mic-1', [{ deviceId: 'mic-1' }], '', { a: 1 })) === JSON.stringify({ deviceId: { exact: 'mic-1' }, a: 1 }));
check('nothing selected while devices are listed → the source is off',
  deviceConstraint('', [{ deviceId: 'mic-1' }], '', { a: 1 }) === null);
check('nothing listed but the probe proved it works → the system default',
  JSON.stringify(deviceConstraint('', [], 'hidden', { a: 1 })) === JSON.stringify({ a: 1 }));
check('nothing listed and the probe said absent → do not ask again',
  deviceConstraint('', [], 'absent', { a: 1 }) === null);
check('nothing listed and the probe said blocked → do not ask again',
  deviceConstraint('', [], 'blocked', { a: 1 }) === null);

console.log('\ncapture falls back to the default device only when the device is hidden');
reset({ devices: [] });
store.setState({
  microphones: [], selectedMicId: '',
  deviceIssues: { camera: 'hidden', microphone: 'hidden' },
  capabilities: { camera: 'granted', microphone: 'granted', screenCapture: 'granted' },
});
media.gumCalls = [];
const micStream = await captureMic(store.state);
check('a stream is still acquired', !!micStream);
const micReq = media.gumCalls[0];
check('no deviceId is named', micReq.audio.deviceId === undefined, JSON.stringify(micReq.audio));
check('the audio tuning is preserved', micReq.audio.echoCancellation === true);
check('video is not requested', micReq.video === false);

const camStream = await captureCamera(store.state);
check('a camera stream is still acquired', !!camStream);
const camReq = media.gumCalls[1];
check('no camera deviceId is named', camReq.video.deviceId === undefined);
check('the frame-rate hint survives', camReq.video.frameRate.ideal === 60);

console.log('\nan absent device is never re-requested (it would throw on every preview)');
reset({ devices: [], audio: 'NotFoundError' });
store.setState({
  microphones: [], selectedMicId: '',
  deviceIssues: { camera: '', microphone: 'absent' },
  capabilities: { camera: 'granted', microphone: 'granted', screenCapture: 'granted' },
});
media.gumCalls = [];
check('captureMic returns null instead of throwing', (await captureMic(store.state)) === null);
check('getUserMedia was never called', media.gumCalls.length === 0, JSON.stringify(media.gumCalls));

console.log('\nan off source stays off');
reset({ devices: [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' }] });
store.setState({ microphones: [{ deviceId: 'mic-1' }], selectedMicId: '' });
media.gumCalls = [];
check('no stream when a listed device is deselected', (await captureMic(store.state)) === null);
check('and getUserMedia was never called', media.gumCalls.length === 0);

console.log('\na denied capability never reaches getUserMedia');
reset();
store.setState({ capabilities: { camera: 'denied', microphone: 'denied', screenCapture: 'granted' } });
media.gumCalls = [];
check('mic capture short-circuits', (await captureMic(store.state)) === null);
check('camera capture short-circuits', (await captureCamera(store.state)) === null);
check('getUserMedia untouched', media.gumCalls.length === 0);

// ===================== macOS privacy pane recovery =====================

const { PRIVACY_LINKS_FOR_TEST } = R; // may be undefined; the action is what matters

console.log('\nthe absent empty state offers a way out');
reset({ devices: [], audio: 'NotFoundError', video: 'NotFoundError' });
await devices.refresh();
check('the mic is absent', store.state.deviceIssues.microphone === 'absent');

// render the setup view and inspect the produced markup
store.setState({ view: 'setup' });
const html = appEl.innerHTML;
check('a Recheck button is offered', /data-action="refresh-devices"/.test(html));
check('an Open Settings button is offered on macOS', /data-action="open-privacy-pane"/.test(html), html.slice(0, 200));
check('it targets the microphone', /data-kind="microphone"/.test(html));
check('and the camera', /data-kind="camera"/.test(html));
check('the copy names the OS device-list behaviour', /empty device list/.test(html));

console.log('\nopen-privacy-pane puts the real deep link on the clipboard');
clipboardWrites.length = 0;
await R.__actions['open-privacy-pane']({ dataset: { kind: 'microphone' } });
check('one clipboard write', clipboardWrites.length === 1, String(clipboardWrites.length));
check('it is the macOS Microphone pane link',
  clipboardWrites[0] === 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  clipboardWrites[0]);

clipboardWrites.length = 0;
await R.__actions['open-privacy-pane']({ dataset: { kind: 'camera' } });
check('the camera pane link', /Privacy_Camera$/.test(clipboardWrites[0]), clipboardWrites[0]);

clipboardWrites.length = 0;
await R.__actions['open-privacy-pane']({ dataset: { kind: 'bogus' } });
check('an unknown kind copies nothing', clipboardWrites.length === 0);

console.log('\na denied clipboard is explained, not silent');
let denied = [];
const keep = R.notices.toast;
R.notices.toast = (k, m) => denied.push([k, m]);
clipboardMode = 'denied';
await R.__actions['open-privacy-pane']({ dataset: { kind: 'microphone' } });
clipboardMode = 'ok';
R.notices.toast = keep;
check('the failure is surfaced', denied.length > 0, JSON.stringify(denied));

console.log('\nthe pane is only offered where it exists');
reset({ devices: [], audio: 'NotAllowedError' });
await devices.refresh();
store.setState({ view: 'setup' });
check('a blocked mic gets Recheck but no Settings link',
  /Microphone blocked/.test(appEl.innerHTML) && !/data-kind="microphone"/.test(appEl.innerHTML),
  appEl.innerHTML.slice(0, 160));

// ===================== startup prompt + open-settings =====================

console.log('\nopen-privacy-pane asks the OS first');
openExternalCalls.length = 0;
clipboardWrites.length = 0;
openExternalMode = 'ok';
let paneToasts = [];
const paneToast = R.notices.toast;
R.notices.toast = (k, m) => paneToasts.push([k, m]);
await R.__actions['open-privacy-pane']({ dataset: { kind: 'microphone' } });
check('it tries shell.openExternal', openExternalCalls.length === 1, JSON.stringify(openExternalCalls));
check('with the real deep link', /Privacy_Microphone$/.test(openExternalCalls[0]), openExternalCalls[0]);
check('and does not touch the clipboard when it worked', clipboardWrites.length === 0);
check('the toast says it is opening', paneToasts.some(([k, m]) => k === 'good' && /Opening System Settings/.test(m)), JSON.stringify(paneToasts));

console.log('a host that refuses the scheme falls back to the clipboard');
openExternalCalls.length = 0;
clipboardWrites.length = 0;
paneToasts = [];
openExternalMode = 'refused';
await R.__actions['open-privacy-pane']({ dataset: { kind: 'microphone' } });
check('it still tried', openExternalCalls.length === 1);
check('then copied the link', clipboardWrites.length === 1 && /Privacy_Microphone$/.test(clipboardWrites[0]), JSON.stringify(clipboardWrites));
check('and explains the fallback', paneToasts.some(([k, m]) => k === 'warn' && /clipboard/.test(m)), JSON.stringify(paneToasts));
check('naming the Electron alias', paneToasts.some(([, m]) => /Electron/.test(m)));

clipboardMode = 'denied';
paneToasts = [];
await R.__actions['open-privacy-pane']({ dataset: { kind: 'microphone' } });
clipboardMode = 'ok';
check('both routes failing is reported', paneToasts.length > 0, JSON.stringify(paneToasts));
R.notices.toast = paneToast;

console.log('\nthe app announces a missing microphone at startup');
store.setState({ banners: [] });
reset({ devices: [], audio: 'NotFoundError' });
await devices.refresh();
const micBanner = store.state.banners.find((b) => b.key === 'microphone-unavailable');
check('a banner is raised', !!micBanner, JSON.stringify(store.state.banners.map((b) => b.key)));
check('it warns that recordings will have no audio', /no audio/.test(micBanner.message), micBanner.message);
check('it explains the empty device list', /empty device list/.test(micBanner.message));
check('it offers Open Settings', micBanner.actions.some((a) => a.action === 'open-privacy-pane'), JSON.stringify(micBanner.actions));
check('and Recheck', micBanner.actions.some((a) => a.action === 'refresh-devices'));

store.setState({ view: 'setup' });
check('the banner renders its action buttons', /banner__actions/.test(appEl.innerHTML) && /data-action="open-privacy-pane"/.test(appEl.innerHTML));

console.log('a blocked capability gets different copy and no OS link');
store.setState({ banners: [] });
reset({ devices: [], audio: 'NotAllowedError' });
await devices.refresh();
const blockedBanner = store.state.banners.find((b) => b.key === 'microphone-unavailable');
check('a banner is raised', !!blockedBanner);
check('it names Studio Permissions', /Studio Permissions/.test(blockedBanner.message), blockedBanner.message);
check('and offers no OS pane (that is TinyAtom permission, not macOS)',
  !blockedBanner.actions.some((a) => a.action === 'open-privacy-pane'), JSON.stringify(blockedBanner.actions));

console.log('the banner copy follows the cause without a manual dismiss');
// blocked → absent → blocked, never touching state.banners: the keyed banner
// must be replaced in place, not frozen on the first cause seen.
reset({ devices: [], audio: 'NotFoundError' });
await devices.refresh();
const nowAbsent = store.state.banners.find((b) => b.key === 'microphone-unavailable');
check('blocked → absent swaps in the OS explanation', /empty device list/.test(nowAbsent.message), nowAbsent.message);
check('and Open Settings appears', nowAbsent.actions.some((a) => a.action === 'open-privacy-pane'), JSON.stringify(nowAbsent.actions));
check('without stacking a second banner',
  store.state.banners.filter((b) => b.key === 'microphone-unavailable').length === 1,
  JSON.stringify(store.state.banners.map((b) => b.key)));
reset({ devices: [], audio: 'NotAllowedError' });
await devices.refresh();
const nowBlocked = store.state.banners.find((b) => b.key === 'microphone-unavailable');
check('absent → blocked swaps in the Studio Permissions copy', /Studio Permissions/.test(nowBlocked.message), nowBlocked.message);
check('and Open Settings is withdrawn', !nowBlocked.actions.some((a) => a.action === 'open-privacy-pane'), JSON.stringify(nowBlocked.actions));

console.log('the banner retracts the moment a microphone appears');
reset({ devices: [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in' }] });
await devices.refresh();
check('a working microphone leaves no banner', !store.state.banners.some((b) => b.key === 'microphone-unavailable'),
  JSON.stringify(store.state.banners.map((b) => b.key)));
check('and the device is listed', store.state.microphones.length === 1);

console.log('\nan explicit refresh clears the meter failure latch');
R.refs.meterFailedKey = 'mic-1';
await devices.refresh();
check('the latch is cleared', R.refs.meterFailedKey === '', R.refs.meterFailedKey);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
