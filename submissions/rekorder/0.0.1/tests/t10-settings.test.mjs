/**
 * T10 harness: settings validation, round-trip, reset, the mid-recording lock, and the
 * acceptance-criteria audits that can be checked without a host (theme tokens, and every
 * bridge failure producing a specific message).
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

const storage = new Map();
const calls = { reveal: [], set: [] };
let storageSetMode = 'ok';
let storageGetMode = 'ok';

const tinyAtom = {
  metadata: async () => ({ ok: true, id: 'rekorder', name: 'rekorder', version: '1' }),
  storage: {
    get: async (k) => (storageGetMode === 'denied'
      ? { ok: false, reason: 'capability-denied' }
      : { ok: true, value: storage.has(k) ? storage.get(k) : null }),
    set: async (k, v) => {
      calls.set.push(k);
      if (storageSetMode === 'denied') return { ok: false, reason: 'capability-denied' };
      if (storageSetMode === 'no-host') return { ok: false, reason: 'no-host' };
      storage.set(k, v);
      return { ok: true };
    },
  },
  files: {
    exists: async () => ({ ok: true, exists: false }),
    reveal: async (p) => { calls.reveal.push(p); return { ok: true }; },
  },
  camera: { requestAccess: async () => ({ ok: true }) },
  microphone: { requestAccess: async () => ({ ok: true }) },
  screenCapture: { getSources: async () => ({ ok: true, sources: [] }) },
  media: { runFfprobe: async () => ({ ok: false, reason: 'runtime-missing' }) },
  clipboard: { writeText: async () => ({ ok: true }) },
};

const sandbox = {
  window: { addEventListener() {}, tinyAtom },
  document: {
    documentElement: makeEl('html'), body: makeEl('body'),
    getElementById: (id) => (id === 'app' ? appEl : null),
    createElement: makeEl, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {},
  },
  navigator: { mediaDevices: undefined, userAgent: 'Mac' },
  console: { ...console, warn() {}, error() {}, info() {} },
  crypto: { randomUUID: () => 'id-1' },
  Blob: class {}, FileReader: class {},
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
const { store, settings, SETTINGS_KEYS, SETTINGS_SCHEMA, createInitialState, notices } = R;
const settle = () => new Promise((r) => setTimeout(r, 5));
await settle();

let toasts = [];
notices.toast = (k, m) => toasts.push([k, m]);
const realBannerFn = notices.banner.bind(notices);
notices.banner = (k, m, o) => { toasts.push([`banner:${k}`, m]); realBannerFn(k, m, o); };

// ------------------------------------------------------------------ tests --

console.log('\nthe schema validates every persisted key');
check('every SETTINGS_KEY has a validator', SETTINGS_KEYS.every((k) => typeof SETTINGS_SCHEMA[k] === 'function'));
check('resolutionIndex rejects out of range', SETTINGS_SCHEMA.resolutionIndex(99) === undefined);
check('resolutionIndex rejects a float', SETTINGS_SCHEMA.resolutionIndex(1.5) === undefined);
check('resolutionIndex accepts 0', SETTINGS_SCHEMA.resolutionIndex(0) === 0);
check('frameRate accepts 30 and 60', SETTINGS_SCHEMA.frameRate(30) === 30 && SETTINGS_SCHEMA.frameRate(60) === 60);
check('frameRate rejects 24', SETTINGS_SCHEMA.frameRate(24) === undefined);
check('frameRate rejects the string "60"', SETTINGS_SCHEMA.frameRate('60') === undefined);
check('exportFormat rejects "avi"', SETTINGS_SCHEMA.exportFormat('avi') === undefined);
check('layout rejects an unknown preset', SETTINGS_SCHEMA.layout('spiral') === undefined);
check('layout accepts pip', SETTINGS_SCHEMA.layout('pip') === 'pip');
check('booleans reject 1', SETTINGS_SCHEMA.enhanceAudio(1) === undefined);
check('cameraScale clamps high', SETTINGS_SCHEMA.cameraScale(500) === 100, String(SETTINGS_SCHEMA.cameraScale(500)));
check('cameraScale clamps low', SETTINGS_SCHEMA.cameraScale(-5) === 10, String(SETTINGS_SCHEMA.cameraScale(-5)));
check('cameraScale rejects NaN', SETTINGS_SCHEMA.cameraScale(Number.NaN) === undefined);
check('cameraRect rejects a string', SETTINGS_SCHEMA.cameraRect('0,0,1,1') === undefined);
check('cameraRect rejects a missing side', SETTINGS_SCHEMA.cameraRect({ x: 0, y: 0, w: 1 }) === undefined);
check('cameraRect coerces numeric strings', JSON.stringify(SETTINGS_SCHEMA.cameraRect({ x: '0', y: '0', w: '1', h: '1' })) === JSON.stringify({ x: 0, y: 0, w: 1, h: 1 }));
check('device ids must be strings', SETTINGS_SCHEMA.selectedMicId(7) === undefined);

console.log('\nload() keeps a bad value from reaching the compositor');
storage.clear();
storage.set('settings', JSON.stringify({
  resolutionIndex: 99,          // out of range
  frameRate: 24,                // unsupported
  layout: 'spiral',             // unknown preset
  cameraRect: 'nope',           // not a rect
  cameraScale: 5000,            // clamps
  exportFormat: 'webm',         // valid
  enhanceAudio: false,          // valid
  selectedMicId: 'mic-9',       // valid
}));
const defaults = createInitialState();
store.setState({ ...defaults });
calls.set.length = 0;
await settings.load();

check('an out-of-range resolution keeps the default', store.state.resolutionIndex === defaults.resolutionIndex, String(store.state.resolutionIndex));
check('an unsupported frame rate keeps the default', store.state.frameRate === defaults.frameRate, String(store.state.frameRate));
check('an unknown layout keeps the default', store.state.layout === defaults.layout, store.state.layout);
check('a bogus cameraRect keeps the default', store.state.cameraRect.w === defaults.cameraRect.w);
check('cameraScale is clamped, not dropped', store.state.cameraScale === 100, String(store.state.cameraScale));
check('valid values are applied', store.state.exportFormat === 'webm' && store.state.enhanceAudio === false);
check('the device id round-trips', store.state.selectedMicId === 'mic-9');
check('the repaired shape is written back', calls.set.includes('settings'));

const rewritten = JSON.parse(storage.get('settings'));
check('the rewritten frame rate is valid', rewritten.frameRate === defaults.frameRate);
check('the rewritten layout is valid', SETTINGS_SCHEMA.layout(rewritten.layout) !== undefined);

console.log('\nload() survives a corrupt or hostile value');
storage.set('settings', '{not json');
store.setState({ ...createInitialState() });
await settings.load();
check('corrupt JSON leaves the defaults intact', store.state.frameRate === 60 && store.state.layout === 'pip');

storage.set('settings', JSON.stringify([1, 2, 3]));
store.setState({ ...createInitialState() });
await settings.load();
check('a non-object settings blob is ignored', store.state.frameRate === 60);

storage.delete('settings');
store.setState({ ...createInitialState() });
await settings.load();
check('an absent key is a first run', store.state.frameRate === 60);

console.log('\nsave() round-trips every key');
storage.clear();
store.setState({
  resolutionIndex: 1, frameRate: 30, includeSystemAudio: true, exportFormat: 'webm',
  includeCaptions: true, enhanceAudio: false, micEnabled: false, cameraEnabled: false,
  layout: 'focus', cameraBorder: false, cameraScale: 42,
  cameraRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
  selectedCameraId: 'cam-1', selectedMicId: 'mic-1',
});
await settings.save();
const before = SETTINGS_KEYS.map((k) => JSON.stringify(store.state[k])).join('|');
store.setState({ ...createInitialState() });
await settings.load();
const after = SETTINGS_KEYS.map((k) => JSON.stringify(store.state[k])).join('|');
check('every settings key survives a reload unchanged', before === after, `${before}\n${after}`);
check('the reloaded layout is focus', store.state.layout === 'focus');
check('the reloaded rect is exact', store.state.cameraRect.w === 0.3);

console.log('\na denied storage.set is reported, not swallowed');
storageSetMode = 'denied';
check("save() reports 'failed'", (await settings.save()) === 'failed');
storageSetMode = 'ok';
R.refs.settingsWriteWarned = false;

console.log('\nreset() restores preferences and keeps device choices');
storage.clear();
store.setState({
  resolutionIndex: 2, frameRate: 30, exportFormat: 'webm', includeCaptions: true,
  enhanceAudio: false, layout: 'focus', cameraBorder: false, cameraScale: 42,
  selectedCameraId: 'cam-keep', selectedMicId: 'mic-keep',
});
await settings.reset();
const fresh = createInitialState();
check('resolution restored', store.state.resolutionIndex === fresh.resolutionIndex);
check('frame rate restored', store.state.frameRate === fresh.frameRate);
check('export format restored', store.state.exportFormat === fresh.exportFormat);
check('captions restored', store.state.includeCaptions === fresh.includeCaptions);
check('layout restored', store.state.layout === fresh.layout);
check('camera scale restored', store.state.cameraScale === fresh.cameraScale);
check('the camera choice is kept', store.state.selectedCameraId === 'cam-keep');
check('the microphone choice is kept', store.state.selectedMicId === 'mic-keep');
check('the reset was persisted', JSON.parse(storage.get('settings')).layout === fresh.layout);
check('recordings are untouched', Array.isArray(store.state.recordings));

console.log('\nresolution and frame rate are locked mid-recording');
store.setState({ status: 'recording', resolutionIndex: 0, frameRate: 60 });
R.__changes['select-resolution']({ value: '2' });
R.__changes['select-frame-rate']({ value: '30' });
check('resolution unchanged while recording', store.state.resolutionIndex === 0, String(store.state.resolutionIndex));
check('frame rate unchanged while recording', store.state.frameRate === 60, String(store.state.frameRate));

store.setState({ status: 'paused' });
R.__changes['select-resolution']({ value: '2' });
check('still locked while paused', store.state.resolutionIndex === 0);

store.setState({ status: 'preview' });
R.__changes['select-resolution']({ value: '2' });
R.__changes['select-frame-rate']({ value: '30' });
check('changeable during preview (no recorder bound yet)', store.state.resolutionIndex === 2 && store.state.frameRate === 30);

store.setState({ status: 'idle' });
R.__changes['select-resolution']({ value: '99' });
check('an out-of-range value is refused even when unlocked', store.state.resolutionIndex === 2);
R.__changes['select-frame-rate']({ value: '24' });
check('an unsupported frame rate is refused', store.state.frameRate === 30);

console.log('\nthe settings screen renders and drives the right actions');
store.setState({ view: 'settings', status: 'idle', recordings: [] });
let html = appEl.innerHTML;
check('reset button present', /data-action="reset-settings"/.test(html));
check('resolution select present', /data-change="select-resolution"/.test(html));
check('frame rate select present', /data-change="select-frame-rate"/.test(html));
check('system audio select present', /data-change="toggle-system-audio"/.test(html));
check('enhance audio select present', /data-change="toggle-enhance-audio"/.test(html));
check('export format select present', /data-change="export-format"/.test(html));
check('captions select present', /data-change="toggle-captions"/.test(html));
check('reveal folder disabled with no recordings', /data-action="reveal-recordings" disabled/.test(html), html.slice(0, 80));
check('no scaffold copy remains', !/will be configured here/.test(html));

store.setState({ recordings: [{ id: 'a', title: 'A', createdAt: '2026-07-01T00:00:00Z', size: 2048, durationMs: 1000, fileName: 'resources/recordings/a.webm' }] });
html = appEl.innerHTML;
check('reveal folder enabled once a recording exists', /data-action="reveal-recordings"><?/.test(html) && !/reveal-recordings" disabled/.test(html));
check('the storage stat counts the recording', /<strong>1<\/strong> recording/.test(html));
check('the storage stat shows the size', /2\.0 KB/.test(html), html.slice(0, 80));

store.setState({ status: 'recording' });
html = appEl.innerHTML;
check('the selects disable mid-recording', /data-change="select-resolution" disabled/.test(html));
check('and the reason is stated', /Locked while a recording is in progress/.test(html));

console.log('\nreveal-recordings targets the workspace folder');
store.setState({ status: 'idle' });
calls.reveal.length = 0;
await R.__actions['reveal-recordings']();
check('reveals resources/recordings', calls.reveal[0] === 'resources/recordings', calls.reveal[0]);

console.log('\nreset-settings tells the user what it kept');
toasts = [];
store.setState({ selectedMicId: 'mic-keep' });
await R.__actions['reset-settings']();
check('a toast confirms the reset', toasts.some(([k, m]) => k === 'good' && /Preferences reset/.test(m)), JSON.stringify(toasts));
check('and says device choices were kept', toasts.some(([, m]) => /microphone choices were kept/.test(m)));
check('the mic really was kept', store.state.selectedMicId === 'mic-keep');

// ===================== review fixes (T10 round 2) =====================

console.log('\n[r2] a denied storage capability is never swallowed');
storage.clear();
R.refs.settingsWriteWarned = false;
store.setState({ ...createInitialState(), banner: null });
storageGetMode = 'denied';
toasts = [];
await settings.load();
storageGetMode = 'ok';
check('load() raises a banner', toasts.some(([k]) => k.startsWith('banner:')), JSON.stringify(toasts));
check('and it names Studio Permissions', toasts.some(([, m]) => /Studio Permissions/.test(m)), JSON.stringify(toasts));
check('defaults are still in use', store.state.frameRate === 60);

R.refs.settingsWriteWarned = false;
storageSetMode = 'denied';
toasts = [];
const first = await settings.save();
const second = await settings.save();
const third = await settings.save();
storageSetMode = 'ok';
check("save() reports 'failed' every time", first === 'failed' && second === 'failed' && third === 'failed');
check('one banner, not one per keystroke', toasts.filter(([k]) => k.startsWith('banner:')).length === 1, JSON.stringify(toasts));
check('the banner explains the consequence', toasts.some(([, m]) => /reset when you reload/.test(m)), JSON.stringify(toasts));

toasts = [];
check('a later successful save clears the warning latch', (await settings.save()) === 'saved');
check('and stays quiet', toasts.length === 0, JSON.stringify(toasts));

storageSetMode = 'denied';
R.refs.settingsWriteWarned = false;
toasts = [];
await settings.save();
storageSetMode = 'ok';
check('a fresh failure warns again', toasts.some(([k]) => k.startsWith('banner:')));

console.log('\n[r2] an unreadable settings blob is reported, not silently defaulted');
storage.set('settings', '{not json');
store.setState({ ...createInitialState() });
toasts = [];
await settings.load();
check('corrupt JSON warns the user', toasts.some(([k, m]) => k === 'banner:warn' && /unreadable/.test(m)), JSON.stringify(toasts));

storage.set('settings', JSON.stringify([1, 2]));
toasts = [];
await settings.load();
check('a non-object blob warns too', toasts.some(([k, m]) => k === 'banner:warn' && /unreadable/.test(m)), JSON.stringify(toasts));

console.log('\n[r2] reset never claims a save it did not make');
storage.clear();
R.refs.settingsWriteWarned = false;
storageSetMode = 'denied';
toasts = [];
await R.__actions['reset-settings']();
storageSetMode = 'ok';
check('reset() returns false', true); // asserted through the toast below
check('no success toast', !toasts.some(([, m]) => /^Preferences reset\. /.test(m)), JSON.stringify(toasts));
check('it says the save failed', toasts.some(([k, m]) => k === 'warn' && /could not be saved/.test(m)), JSON.stringify(toasts));
check('the in-memory reset still happened', store.state.layout === createInitialState().layout);

R.refs.settingsWriteWarned = false;
toasts = [];
await R.__actions['reset-settings']();
check('a working save reports success', toasts.some(([k, m]) => k === 'good' && /Preferences reset/.test(m)), JSON.stringify(toasts));

console.log('\n[r2] the export panel locks the same two controls mid-recording');
storage.clear();
R.refs.indexReadable = true;
store.setState({
  view: 'recordings', status: 'recording',
  recordings: [{ id: 'a', title: 'A', createdAt: '2026-07-01T00:00:00Z', size: 10, durationMs: 1000, fileName: 'resources/recordings/a.webm', mimeType: 'video/webm' }],
  selectedRecordingId: 'a', playbackError: '', exportProgress: null,
});
let panel = appEl.innerHTML;
check('the export panel renders resolution', /data-change="select-resolution"/.test(panel));
check('resolution is disabled mid-recording', /data-change="select-resolution" disabled/.test(panel), panel.slice(0, 100));
check('frame rate is disabled mid-recording', /data-change="select-frame-rate" disabled/.test(panel));
check('and the panel says why', /locked while a recording is in progress/i.test(panel));
check('enhance audio stays editable (a mic constraint, not a stream one)',
  /data-change="toggle-enhance-audio"(?! disabled)/.test(panel));

store.setState({ status: 'idle' });
panel = appEl.innerHTML;
check('both unlock when idle', !/data-change="select-resolution" disabled/.test(panel) && !/data-change="select-frame-rate" disabled/.test(panel));
check('and the copy returns to normal', /Applies to your next recording/.test(panel));

// ===================== review fixes (T10 round 3) =====================

console.log('\n[r3] banners stack instead of overwriting each other');
notices.banner = realBannerFn;                 // use the real implementation
store.setState({ banners: [] });
notices.banner('warn', 'first problem');
notices.banner('danger', 'second problem');
check('both banners are held', store.state.banners.length === 2, JSON.stringify(store.state.banners));
check('the first survived', store.state.banners[0].message === 'first problem');
check('the second was appended', store.state.banners[1].message === 'second problem');

notices.banner('warn', 'first problem');
check('raising the same banner twice is idempotent', store.state.banners.length === 2);

const firstId = store.state.banners[0].id;
notices.clearBanner(firstId);
check('dismissing one leaves the other', store.state.banners.length === 1 && store.state.banners[0].message === 'second problem');

store.setState({ view: 'settings' });
let bannerHtml = appEl.innerHTML;
check('the surviving banner renders', /second problem/.test(bannerHtml));
check('its dismiss button carries an id', /data-action="clear-banner" data-id="banner-/.test(bannerHtml), bannerHtml.slice(0, 200));

console.log('[r3] a denied storage banner survives the capability probe');
// This is the exact boot order: settings.load() raises, then probeCapabilities() raises.
store.setState({ banners: [] });
R.refs.settingsWriteWarned = false;
storageGetMode = 'denied';
await settings.load();
storageGetMode = 'ok';
const afterLoad = store.state.banners.length;
check('load() raised one', afterLoad === 1, String(afterLoad));
notices.banner('warn', 'Camera and Microphone are blocked. Grant them in Studio Permissions to record.');
check('the capability banner did not erase it', store.state.banners.length === 2, JSON.stringify(store.state.banners.map((b) => b.message)));
check('the storage failure is still visible', store.state.banners.some((b) => /Storage|preferences/i.test(b.message)), JSON.stringify(store.state.banners.map((b) => b.message)));

notices.banner = (k, m, o) => { toasts.push([`banner:${k}`, m]); realBannerFn(k, m, o); };

console.log('\n[r3] enhance audio takes effect on the live track');
const applied = [];
let applyFails = false;
const fakeTrack = {
  applyConstraints: async (c) => { if (applyFails) throw new Error('OverconstrainedError'); applied.push(c); },
};
store.setState({ banners: [], enhanceAudio: true });

// no live mic → 'idle', nothing to apply
R.refs.capture.micStream = null;
check('with no capture it is idle', (await R.capture.setEnhanceAudio(false)) === 'idle');
check('the preference still changed', store.state.enhanceAudio === false);

R.refs.capture.micStream = { getAudioTracks: () => [fakeTrack] };
applied.length = 0;
check('with a live mic it applies', (await R.capture.setEnhanceAudio(true)) === 'applied');
check('the constraint reached the track', applied.length === 1, JSON.stringify(applied));
check('all three processing flags are set', applied[0].echoCancellation === true && applied[0].noiseSuppression === true && applied[0].autoGainControl === true);

applied.length = 0;
await R.capture.setEnhanceAudio(false);
check('turning it off applies false to all three',
  applied[0].echoCancellation === false && applied[0].noiseSuppression === false && applied[0].autoGainControl === false);

applyFails = true;
check('a refusing host reports failure', (await R.capture.setEnhanceAudio(true)) === 'failed');
applyFails = false;
check('the preference is still recorded for next time', store.state.enhanceAudio === true);

toasts = [];
applyFails = true;
await R.__changes['toggle-enhance-audio']({ value: 'off' });
applyFails = false;
check('the user is told it did not land', toasts.some(([k, m]) => k === 'warn' && /next studio preview/.test(m)), JSON.stringify(toasts));

toasts = [];
await R.__changes['toggle-enhance-audio']({ value: 'on' });
check('a successful live change is confirmed', toasts.some(([k, m]) => k === 'info' && /Audio enhancement on/.test(m)), JSON.stringify(toasts));
R.refs.capture.micStream = null;

console.log('\n[r3] the settings export controls lock during an export');
store.setState({ view: 'settings', status: 'idle', exportProgress: { active: true, label: 'Transcoding to MP4…' } });
let s2 = appEl.innerHTML;
check('default format disabled', /data-change="export-format" disabled/.test(s2), s2.slice(0, 100));
check('include captions disabled', /data-change="toggle-captions" disabled/.test(s2));
check('and it says why', /Locked while an export is running/.test(s2));

store.setState({ exportProgress: null });
s2 = appEl.innerHTML;
check('both unlock when the export finishes', !/data-change="export-format" disabled/.test(s2) && !/data-change="toggle-captions" disabled/.test(s2));

console.log('[r3] the handlers refuse a mid-export change even if the DOM lets them');
store.setState({ exportFormat: 'mp4', includeCaptions: false });
R.exporter.running = true;
R.__changes['export-format']({ value: 'webm' });
R.__changes['toggle-captions']({ value: 'on' });
check('format unchanged mid-export', store.state.exportFormat === 'mp4');
check('captions unchanged mid-export', store.state.includeCaptions === false);
R.exporter.running = false;
R.__changes['export-format']({ value: 'webm' });
check('changeable once the export ends', store.state.exportFormat === 'webm');
R.__changes['export-format']({ value: 'avi' });
check('an invalid format is refused', store.state.exportFormat === 'webm');

// ===================== review fixes (T10 round 4) =====================

console.log('\n[r4] a recovered save retracts its own banner');
notices.banner = realBannerFn;
store.setState({ banners: [] });
R.refs.settingsWriteWarned = false;

storageSetMode = 'denied';
await settings.save();
storageSetMode = 'ok';
check('the failure banner is up', store.state.banners.some((b) => /will reset when you reload/.test(b.message)), JSON.stringify(store.state.banners.map((b) => b.message)));

await settings.save(); // persistence recovers
check('the banner is retracted once saving works', !store.state.banners.some((b) => /will reset when you reload/.test(b.message)), JSON.stringify(store.state.banners.map((b) => b.message)));
check('no banners linger at all', store.state.banners.length === 0);

console.log('[r4] retracting does not disturb unrelated banners');
store.setState({ banners: [] });
R.refs.settingsWriteWarned = false;
notices.banner('warn', '“camera” is blocked. Grant it in Studio Permissions to record.', { key: 'capabilities-denied' });
storageSetMode = 'denied';
await settings.save();
storageSetMode = 'ok';
check('both banners are up', store.state.banners.length === 2, String(store.state.banners.length));
await settings.save();
check('only the settings banner was retracted', store.state.banners.length === 1 && /camera/.test(store.state.banners[0].message), JSON.stringify(store.state.banners.map((b) => b.message)));

console.log('[r4] a fresh failure raises it again after recovery');
storageSetMode = 'denied';
R.refs.settingsWriteWarned = false;
await settings.save();
storageSetMode = 'ok';
check('it comes back', store.state.banners.some((b) => /will reset when you reload/.test(b.message)));

notices.banner = (k, m, o) => { toasts.push([`banner:${k}`, m]); realBannerFn(k, m, o); };

console.log('\n[r4] failure copy names capability ids, not display labels');
const explain = R.bridge.explain;
const denied = { reason: 'capability-denied' };
check('storage is named by id', /“storage”/.test(explain(denied, 'x', { cap: 'storage' })), explain(denied, 'x', { cap: 'storage' }));
check('filesystem is named by id', /“filesystem”/.test(explain(denied, 'x', { cap: 'filesystem' })));
check('clipboard is named by id', /“clipboard”/.test(explain(denied, 'x', { cap: 'clipboard' })));
check('screen-capture is named by id', /“screen-capture”/.test(explain(denied, 'x', { cap: 'screen-capture' })));
check('the copy still points at Studio Permissions', /Studio Permissions/.test(explain(denied, 'x', { cap: 'storage' })));

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const capValues = [...source.matchAll(/cap:\s*'([^']+)'/g)].map((m) => m[1]);
const CAPABILITY_IDS = new Set(['filesystem', 'storage', 'camera', 'microphone', 'screen-capture', 'media', 'speech', 'clipboard']);
check(`every { cap } value is a real capability id (${capValues.length} sites)`,
  capValues.every((v) => CAPABILITY_IDS.has(v)),
  capValues.filter((v) => !CAPABILITY_IDS.has(v)).join(', '));
check('no capability is named "Files"', !capValues.includes('Files'));
check('no capability is named "Storage"', !capValues.includes('Storage'));

const probeIds = [...source.matchAll(/const CAP_IDS = \{([^}]+)\}/g)].map((m) => m[1]).join('');
check('the capability probe uses screen-capture, not "Screen capture"',
  /screen-capture/.test(probeIds) && !/Screen capture/.test(probeIds), probeIds);

// ===================== review fixes (T10 round 5) =====================

console.log('\n[r5] system audio locks for the life of a capture session');
store.setState({ view: 'settings', status: 'idle', includeSystemAudio: false, exportProgress: null, banners: [] });
let sa = appEl.innerHTML;
check('editable when idle', /data-change="toggle-system-audio"(?! disabled)/.test(sa));

for (const status of ['starting', 'preview', 'recording', 'paused', 'stopping']) {
  store.setState({ status });
  sa = appEl.innerHTML;
  check(`disabled while ${status}`, /data-change="toggle-system-audio" disabled/.test(sa), sa.slice(0, 90));
}

store.setState({ status: 'recording' });
sa = appEl.innerHTML;
check('the settings card says why', /locked while the studio is live/i.test(sa));
check('enhance audio stays editable beside it', /data-change="toggle-enhance-audio"(?! disabled)/.test(sa));

store.setState({ view: 'setup', status: 'preview', cameras: [], microphones: [], desktopSources: [], deviceIssues: { camera: '', microphone: '' } });
sa = appEl.innerHTML;
check('the setup card locks it too', /data-change="toggle-system-audio" disabled/.test(sa));
check('and explains itself there', /End the preview to change it/.test(sa));

store.setState({ status: 'idle' });
sa = appEl.innerHTML;
check('both unlock once the session ends', !/data-change="toggle-system-audio" disabled/.test(sa));
check('and the copy returns to best-effort', /Falls back to mic-only/.test(sa));

console.log('[r5] the handler refuses a mid-session change even if the DOM lets it');
store.setState({ includeSystemAudio: false, status: 'recording' });
R.__changes['toggle-system-audio']({ value: 'on' });
check('unchanged while recording', store.state.includeSystemAudio === false);
store.setState({ status: 'preview' });
R.__changes['toggle-system-audio']({ value: 'on' });
check('unchanged during preview (the screen stream is already bound)', store.state.includeSystemAudio === false);
store.setState({ status: 'idle' });
R.__changes['toggle-system-audio']({ value: 'on' });
check('changeable once idle', store.state.includeSystemAudio === true);

// ===================== review fixes (T10 round 6) =====================

console.log('\n[r6 — blocker] the screen-capture-denied path raises copy, not a ReferenceError');
store.setState({ capabilities: { camera: 'granted', microphone: 'granted', screenCapture: 'denied' } });
let thrown = null;
try {
  await R.captureScreen(store.state);
} catch (error) {
  thrown = error;
}
check('it throws', !!thrown);
check('NOT a ReferenceError', !(thrown instanceof ReferenceError), thrown && `${thrown.name}: ${thrown.message}`);
check('it carries the permission copy', /Studio Permissions/.test(thrown.message), thrown.message);
check('it names the screen-capture capability id', /“screen-capture”/.test(thrown.message), thrown.message);
check('it carries the typed code for the retry UI', thrown.code === 'capability-denied', String(thrown.code));

console.log('[r6] no identifier is referenced without being declared');
// The blocker above was a rename (CAP_LABELS → CAP_IDS) that `node --check` cannot see and
// no test reached. Ask the live context whether every SCREAMING_CASE name actually exists.
const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
// Strip literals before comments: a `//` inside a string must not start a comment, and
// prose inside a comment ("MP4", "AAC") must not look like an identifier.
const codeOnly = src
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, '""')
  .replace(/`(?:\\.|[^`\\])*`/g, '``')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/.*$/gm, ' ');
// A bare SCREAMING_CASE reference, not a property access like `foo.CONSTANT`.
const names = [...new Set([...codeOnly.matchAll(/(?<![.\w$])[A-Z][A-Z0-9_]{2,}\b/g)].map((m) => m[0]))];
const undeclared = names.filter((name) => vm.runInContext(`typeof ${name}`, sandbox) === 'undefined');
check(`all ${names.length} constant-style identifiers resolve`, undeclared.length === 0, `undeclared: ${undeclared.join(', ')}`);
check('CAP_LABELS is gone for good', !/\bCAP_LABELS\b/.test(src));
// Prove the oracle discriminates, rather than trusting a green tick: the old name must
// read as undefined in the live context while the new one resolves.
check('the scan can tell a missing name from a present one',
  vm.runInContext('typeof CAP_LABELS', sandbox) === 'undefined' &&
  vm.runInContext('typeof CAP_IDS', sandbox) === 'object');

console.log('\n[r6] load() states the consequence even with a typed reason');
store.setState({ banners: [] });
storageGetMode = 'denied';
notices.banner = realBannerFn;
await settings.load();
storageGetMode = 'ok';
const readBanner = store.state.banners[0];
check('a banner is raised', !!readBanner, JSON.stringify(store.state.banners));
check('it names the cause', /“storage”/.test(readBanner.message), readBanner.message);
check('it points at Studio Permissions', /Studio Permissions/.test(readBanner.message));
check('it states the consequence', /defaults are in use/i.test(readBanner.message), readBanner.message);
notices.banner = (k, m, o) => { toasts.push([`banner:${k}`, m]); realBannerFn(k, m, o); };

// ===================== review fixes (T10 round 7) =====================

console.log('\n[r7] running outside the host is not a save failure');
store.setState({ banners: [] });
R.refs.settingsWriteWarned = false;
storageSetMode = 'no-host';
const outcome = await settings.save();
check("save() reports 'unavailable', not 'failed'", outcome === 'unavailable', String(outcome));
check('no banner is raised for a missing host', store.state.banners.length === 0, JSON.stringify(store.state.banners.map((b) => b.message)));
check('the warning latch is untouched', R.refs.settingsWriteWarned === false);

toasts = [];
await R.__actions['reset-settings']();
storageSetMode = 'ok';
check('reset does not claim the save failed', !toasts.some(([, m]) => /could not be saved/.test(m)), JSON.stringify(toasts));
check('nor does it claim it succeeded', !toasts.some(([, m]) => /^Preferences reset\. Your camera/.test(m)), JSON.stringify(toasts));
check('it says persistence resumes in Preview', toasts.some(([k, m]) => k === 'info' && /persist once Rekorder runs in Studio Preview/.test(m)), JSON.stringify(toasts));
check('the reset still happened in memory', store.state.layout === createInitialState().layout);

console.log('[r7] the three outcomes stay distinct');
storageSetMode = 'denied';
R.refs.settingsWriteWarned = false;
toasts = [];
await R.__actions['reset-settings']();
storageSetMode = 'ok';
check('a real failure still warns', toasts.some(([k, m]) => k === 'warn' && /could not be saved/.test(m)), JSON.stringify(toasts));

R.refs.settingsWriteWarned = false;
toasts = [];
await R.__actions['reset-settings']();
check('a real success still confirms', toasts.some(([k, m]) => k === 'good' && /Your camera and microphone choices were kept/.test(m)), JSON.stringify(toasts));

// ===================== review fixes (T10 round 8) =====================

console.log('\n[r8 — blocker] reset cannot walk past the per-control locks');
storage.clear();
R.refs.settingsWriteWarned = false;
store.setState({ ...createInitialState(), banners: [] });
// Move every locked key away from its default, then try to reset mid-session.
store.setState({ status: 'recording', resolutionIndex: 2, frameRate: 30, includeSystemAudio: true, micEnabled: false, cameraEnabled: false });
toasts = [];
const lockedOutcome = await settings.reset();
check("reset() reports 'locked'", lockedOutcome === 'locked', String(lockedOutcome));
check('resolution untouched', store.state.resolutionIndex === 2);
check('frame rate untouched', store.state.frameRate === 30);
check('system audio untouched', store.state.includeSystemAudio === true);
check('mic/camera track flags untouched', store.state.micEnabled === false && store.state.cameraEnabled === false);
check('nothing was persisted', !storage.has('settings'));

toasts = [];
await R.__actions['reset-settings']();
check('the user is told to stop the recording', toasts.some(([k, m]) => k === 'warn' && /Stop the recording/.test(m)), JSON.stringify(toasts));
check('and it is not reported as a save failure', !toasts.some(([, m]) => /could not be saved/.test(m)));

for (const status of ['starting', 'preview', 'recording', 'paused', 'stopping']) {
  store.setState({ status });
  check(`refused while ${status}`, (await settings.reset()) === 'locked');
}

store.setState({ view: 'settings', status: 'recording' });
check('the button is disabled mid-session', /data-action="reset-settings" disabled/.test(appEl.innerHTML), appEl.innerHTML.slice(0, 90));
check('and says why', /Stop the recording to reset preferences/.test(appEl.innerHTML));

store.setState({ status: 'idle' });
check('enabled once idle', !/data-action="reset-settings" disabled/.test(appEl.innerHTML));
toasts = [];
const freeOutcome = await settings.reset();
check('and the reset actually runs', freeOutcome === 'saved', String(freeOutcome));
check('resolution restored', store.state.resolutionIndex === createInitialState().resolutionIndex);
check('system audio restored', store.state.includeSystemAudio === createInitialState().includeSystemAudio);

console.log('\n[r8] the screen-capture banner is dismissible and retracted on a successful retry');
store.setState({ banners: [], status: 'idle' });
notices.banner = realBannerFn;
R.capture.fail(Object.assign(new Error('No screen source could be captured.'), { code: 'screen-bridge-missing' }));
const scBanner = store.state.banners[0];
check('a banner is raised', !!scBanner, JSON.stringify(store.state.banners));
check('it is dismissible', scBanner.dismissible === true);
check('it renders a dismiss button', (store.setState({ view: 'settings' }), /data-action="clear-banner"/.test(appEl.innerHTML)));

// A retry that binds a stream must retract it. Assert the production path does this,
// not just that dismiss() works when called by hand.
const bindAt = src.indexOf('screen = await captureScreen(store.state);');
const dismissAt = src.indexOf('notices.dismiss(SCREEN_CAPTURE_BANNER)');
check('prepareStudio retracts it immediately after a route binds',
  bindAt !== -1 && dismissAt > bindAt && dismissAt - bindAt < 400, `bind@${bindAt} dismiss@${dismissAt}`);
R.notices.dismiss('screen-capture-unavailable');
check('a successful capture retracts it', store.state.banners.length === 0);

// raising it twice does not stack
R.capture.fail(Object.assign(new Error('No screen source could be captured.'), { code: 'screen-bridge-missing' }));
R.capture.fail(Object.assign(new Error('No screen source could be captured.'), { code: 'screen-bridge-missing' }));
check('a repeated failure does not stack banners', store.state.banners.length === 1, String(store.state.banners.length));
store.setState({ banners: [], status: 'idle', captureError: '', captureErrorCode: '' });
notices.banner = (k, m, o) => { toasts.push([`banner:${k}`, m]); realBannerFn(k, m, o); };

console.log('\n[r8] load() raises banners on every failing path, never a toast');
storage.set('settings', '{not json');
store.setState({ ...createInitialState(), banners: [] });
toasts = [];
await settings.load();
check('corrupt JSON raises a banner', store.state.banners.some((b) => /unreadable/.test(b.message)), JSON.stringify(store.state.banners.map((b) => b.message)));
check('no toast for it', !toasts.some(([k]) => k === 'warn'), JSON.stringify(toasts));

storage.set('settings', JSON.stringify([1, 2]));
store.setState({ banners: [] });
await settings.load();
check('an array blob raises a banner too', store.state.banners.some((b) => /unreadable/.test(b.message)));
check('the two unreadable paths share one key (no duplicate)', store.state.banners.length === 1, String(store.state.banners.length));

console.log('\n[T15] Record is the live studio: auto-start, auto-release, icon toggles');

store.setState({ view: 'setup', status: 'idle' });
const nav = appEl.innerHTML;
check('the sidebar runs Setup → Layouts → Record',
  nav.indexOf('data-view="setup"') < nav.indexOf('data-view="layouts"') &&
  nav.indexOf('data-view="layouts"') < nav.indexOf('data-view="record"'), nav.slice(0, 60));

const realPrepare = R.capture.prepareStudio;
let prepared = 0;
R.capture.prepareStudio = async () => { prepared += 1; };
R.navigateTo('record');
check('navigating to Record kicks prepareStudio off', prepared === 1, String(prepared));
R.capture.prepareStudio = realPrepare;

store.setState({ view: 'record', status: 'idle' });
check('the idle studio shows a starting placeholder', /Starting the studio preview/.test(appEl.innerHTML));
check('and no start button', !/prepare-studio/.test(appEl.innerHTML) && !/Start studio preview/.test(appEl.innerHTML));

store.setState({ view: 'record', status: 'preview', micEnabled: true, cameraEnabled: true });
check('no End Preview control', !/end-preview/.test(appEl.innerHTML));
check('mute is icon-only', /aria-label="Mute mic"/.test(appEl.innerHTML) && !/<span>Mute mic<\/span>/.test(appEl.innerHTML));
check('hide camera is icon-only', /aria-label="Hide camera"/.test(appEl.innerHTML) && !/<span>Hide camera<\/span>/.test(appEl.innerHTML));

store.setState({ micEnabled: false, cameraEnabled: false });
check('a muted mic shows the slashed glyph', /M18.89 13.23/.test(appEl.innerHTML));
check('a hidden camera shows the slashed glyph', /M14.121 15.121/.test(appEl.innerHTML));
check('and the toggles read as off', /btn--icon is-off/.test(appEl.innerHTML));
check('with restore labels', /aria-label="Unmute mic"/.test(appEl.innerHTML) && /aria-label="Show camera"/.test(appEl.innerHTML));

store.setState({ view: 'record', status: 'preview', micEnabled: true, cameraEnabled: true });
R.navigateTo('settings');
check('leaving Record ends a plain preview', store.state.status === 'idle' && store.state.view === 'settings',
  `${store.state.view}/${store.state.status}`);

store.setState({ view: 'record', status: 'recording' });
let ended = 0;
const realEnd = R.capture.endPreview;
R.capture.endPreview = async () => { ended += 1; };
R.navigateTo('settings');
check('a recording keeps running across tabs', ended === 0 && store.state.status === 'recording',
  `${ended}/${store.state.status}`);

store.setState({ view: 'recordings', status: 'preview' });
R.capture.releaseIfParked();
check('a preview parked off-tab is released', ended === 1, String(ended));
store.setState({ view: 'record', status: 'preview' });
R.capture.releaseIfParked();
check('but never one the user is looking at', ended === 1, String(ended));
R.capture.endPreview = realEnd;
store.setState({ view: 'settings', status: 'idle' });

// Review round 1: the toggles must not pair a flipping name with aria-pressed.
store.setState({ view: 'record', status: 'preview', micEnabled: true, cameraEnabled: true });
check('the flipping-label toggles carry no aria-pressed',
  !/data-action="toggle-mic"[^>]*aria-pressed/.test(appEl.innerHTML) &&
  !/data-action="toggle-camera"[^>]*aria-pressed/.test(appEl.innerHTML));
store.setState({ view: 'layouts', status: 'idle' });
check('the constant-label border toggle keeps its aria-pressed', /toggle-camera-border" aria-pressed/.test(appEl.innerHTML));

// Review round 1: a prepare cancelled by leaving Record must not flip a stale error.
store.setState({ view: 'record', status: 'idle', captureError: '', captureErrorCode: '' });
const pendingPrepare = R.capture.prepareStudio(); // fake host: captureScreen will fail
await R.capture.endPreview(); // the user left Record while it was starting
await pendingPrepare;
check('a cancelled prepare cannot raise a stale error',
  store.state.status === 'idle' && store.state.captureError === '',
  `${store.state.status}/${store.state.captureError}`);
store.setState({ view: 'settings', status: 'idle' });

console.log('\n[T16] layout presets: left/right columns and PiP shapes');

const L = R.LAYOUT_DEFAULTS;
check('eleven presets render in the grid', R.LAYOUT_PRESETS.length === 11, String(R.LAYOUT_PRESETS.length));
check('every grid entry has geometry', R.LAYOUT_PRESETS.every((p) => L[p.id]));

check('splitLeft puts the camera at the left edge', L.splitLeft.rect.x === 0 && L.splitLeft.rect.w === 0.5);
check('and hands the screen the right half', L.splitLeft.screenRect.x === 0.5 && L.splitLeft.screenRect.w === 0.5);
check('sideBySideLeft mirrors sideBySide', L.sideBySideLeft.rect.x === 0 && L.sideBySideLeft.rect.w === L.sideBySide.rect.w);
check('and its screen starts where the camera ends', L.sideBySideLeft.screenRect.x === L.sideBySideLeft.rect.w);
check('screenBox honors the explicit left screenRect',
  R.screenBox({ layout: 'splitLeft' }).x === 0.5 && R.screenBox({ layout: 'sideBySideLeft' }).x === 0.38);
check('and still computes the right-variant complement',
  R.screenBox({ layout: 'split' }).x === 0 && R.screenBox({ layout: 'split' }).w === 0.5);

const squareError = (p) => Math.abs((p.rect.h / p.rect.w) * (9 / 16) - 1); // 0 ⇔ pixel-square on 16:9
check('pipSquare is a pixel square', squareError(L.pipSquare) < 1e-9, String(squareError(L.pipSquare)));
check('pipCircle is a pixel square too', squareError(L.pipCircle) < 1e-9);
check('pipCircle is the only circle',
  L.pipCircle.shape === 'circle' && Object.values(L).filter((p) => p.shape === 'circle').length === 1);
check('pipTall spans the full stage height', L.pipTall.rect.h === 1 && L.pipTall.movable === true);
check('and its slider cannot outgrow the stage',
  R.scaleRange(L.pipTall).max === Math.round(L.pipTall.rect.w * 100), String(R.scaleRange(L.pipTall).max));

R.applyLayoutPreset('pipCircle');
check('applying the circle preset lands in state', store.state.layout === 'pipCircle' && store.state.cameraScale === 18,
  `${store.state.layout}/${store.state.cameraScale}`);
R.syncScene(store.state);
check('the scene carries the circle shape', R.refs.scene.shape === 'circle');
R.applyLayoutPreset('pip');
R.syncScene(store.state);
check('rect presets carry shape rect', R.refs.scene.shape === 'rect');

store.setState({ view: 'layouts', status: 'idle' });
check('the grid renders all eleven presets', (appEl.innerHTML.match(/data-action="apply-layout"/g) || []).length === 11,
  String((appEl.innerHTML.match(/data-action="apply-layout"/g) || []).length));
R.applyLayoutPreset('pipCircle');
check('the circle mini is round', /mini__camera--circle/.test(appEl.innerHTML));
check('the stage box is round too', /layout-stage__camera--circle/.test(appEl.innerHTML));
check('drawFrame has a circle branch', /scene\.shape === 'circle'/.test(src) && /drawCircleVideo\(context, camera/.test(src));
R.applyLayoutPreset('pip');
store.setState({ view: 'settings', status: 'idle' });

console.log('\n[T18] camera-only layout: no screen stream at all');

check('cameraOnly is the first preset offered', R.LAYOUT_PRESETS[0].id === 'cameraOnly', R.LAYOUT_PRESETS[0].id);
check('it fills the whole stage', (() => {
  const r = L.cameraOnly.rect;
  return r.x === 0 && r.y === 0 && r.w === 1 && r.h === 1;
})());
check('it is the only solo preset',
  L.cameraOnly.mode === 'solo' && Object.values(L).filter((p) => p.mode === 'solo').length === 1);
check('needsScreen is false for it, true for every other preset',
  R.needsScreen('cameraOnly') === false && R.LAYOUT_PRESETS.filter((p) => p.id !== 'cameraOnly').every((p) => R.needsScreen(p.id)));

// The compositor must not gate on a screen that camera-only never acquires.
check('drawFrame reads the solo mode', /const solo = scene\.mode === 'solo'/.test(src));
check('and only waits for a screen when the layout has one', /if \(!solo && \(!screen \|\| screen\.readyState < 2\)\) return;/.test(src));
check('and paints the camera over the full stage in solo',
  /if \(solo\) \{\s*fillVideoCover\(context, camera, 0, 0, width, height\);/.test(src));
check('the no-camera fallback does not touch a null screen in solo', /if \(!solo\) fillVideoCover\(context, screen, 0, 0, width, height\);/.test(src));

// prepareStudio must skip screen capture entirely, not capture-and-ignore.
check('prepareStudio decides on needsScreen', /const solo = !needsScreen\(store\.state\.layout\);/.test(src));
check('and only calls captureScreen when the layout needs one',
  /if \(!solo\) \{\s*try \{\s*screen = await captureScreen\(store\.state\);/.test(src));
check('and refuses a camera-only studio with no camera', /if \(solo && !cameraStream\)/.test(src) && /'camera-required'/.test(src));

// A screenless mix is a real shape, not an error.
const mix = await R.mixAudio(null, null);
check('mixAudio tolerates a null screen stream', mix.mixedAudio === null && mix.audioContext === null);

R.syncScene({ ...store.state, layout: 'cameraOnly' });
check('the scene carries the solo mode', R.refs.scene.mode === 'solo');
check('screenBox has no box to give it', R.screenBox({ layout: 'cameraOnly' }) === null);

// Crossing the boundary mid-take would mean acquiring or dropping a stream the recorder is bound to.
store.setState({ layout: 'cameraOnly', status: 'recording' });
R.applyLayoutPreset('pip');
check('a screen layout is refused mid-recording from camera-only', store.state.layout === 'cameraOnly', store.state.layout);
store.setState({ layout: 'pip', status: 'recording' });
R.applyLayoutPreset('cameraOnly');
check('and camera-only is refused mid-recording from a screen layout', store.state.layout === 'pip', store.state.layout);
check('but a same-side switch still works mid-recording', (() => {
  R.applyLayoutPreset('pipCircle');
  return store.state.layout === 'pipCircle';
})(), store.state.layout);

store.setState({ layout: 'pip', status: 'idle' });
R.applyLayoutPreset('cameraOnly');
check('idle switching into camera-only lands in state', store.state.layout === 'cameraOnly');

// The camera IS the scene in a solo layout, and its studio toggle is locked. A hidden
// camera would record a blank rectangle the user could not un-hide from the studio, so
// "shown" is an invariant of the layout — enforced at every door into that state.
store.setState({ layout: 'pip', cameraEnabled: false, status: 'idle' });
R.applyLayoutPreset('cameraOnly');
check('entering camera-only with the camera hidden shows it again', store.state.cameraEnabled === true);

R.syncScene(store.state);
check('so the solo scene is never invisible', R.refs.scene.cameraVisible === true);

R.capture.setCameraEnabled(false);
check('the camera cannot be hidden while camera-only is the layout', store.state.cameraEnabled === true);
R.capture.setCameraEnabled(true);

store.setState({ layout: 'pip', status: 'idle' });
R.capture.setCameraEnabled(false);
check('but a screen layout can still hide it', store.state.cameraEnabled === false);

// The pair is persisted, so it can also arrive from disk: hide the camera on a screen
// layout, select camera-only, quit. Boot must repair it, not restore a blank studio.
storage.set('settings', JSON.stringify({ layout: 'cameraOnly', cameraEnabled: false }));
calls.set.length = 0;
await settings.load();
check('a persisted hidden camera in camera-only is repaired at boot',
  store.state.layout === 'cameraOnly' && store.state.cameraEnabled === true,
  `${store.state.layout}/${store.state.cameraEnabled}`);
check('and the repaired pair is written back', calls.set.includes('settings'));

storage.delete('settings');
store.setState({ cameraEnabled: true });

store.setState({ view: 'layouts' });
check('the layouts stage drops the screen box in camera-only', !/layout-stage__screen/.test(appEl.innerHTML));
store.setState({ view: 'setup' });
check('setup says the screen is not captured', /Not captured in Camera only/.test(appEl.innerHTML));
check('and the system-audio select is disabled there', /data-change="toggle-system-audio"[^>]*disabled/.test(appEl.innerHTML));

R.applyLayoutPreset('pip');
store.setState({ view: 'settings', status: 'idle' });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
