/**
 * T08 headless harness: exercises exporter.ensureMp4 / run / reveal and the media-bridge
 * path rule against a fake tinyAtom bridge.
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
    addEventListener(t, f) { (this._on ||= {})[t] = f; },
    dispatch(t) { const f = this._on && this._on[t]; if (f) return f(); },
    focus() {}, setSelectionRange() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    play() {}, pause() {}, load() {},
    get src() { return this.attributes.src || ''; }, set src(v) { this.attributes.src = String(v); },
    getContext: () => null,
  };
}
const appEl = makeEl();
const documentStub = {
  documentElement: makeEl('html'), body: makeEl('body'),
  getElementById: (id) => (id === 'app' ? appEl : null),
  createElement: makeEl, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {},
};

// ---------------------------------------------------------- fake bridge --

const disk = new Map();
const storage = new Map();
const calls = { ffmpeg: [], mkdir: [], exportFile: [], reveal: [], write: [] };
let ffmpegMode = 'ok';        // ok | missing | bad-exit | denied
let exportMode = 'ok';        // ok | denied | cancelled
let mkdirMode = 'ok';         // ok | denied
let revealMode = 'ok';        // ok | denied
let sidecarMode = 'ok';       // ok | denied

const tinyAtom = {
  metadata: async () => ({ ok: true, id: 'rekorder', name: 'rekorder', version: '1' }),
  storage: {
    get: async (k) => ({ ok: true, value: storage.has(k) ? storage.get(k) : null }),
    set: async (k, v) => { storage.set(k, v); return { ok: true }; },
  },
  files: {
    write: async (path, content, options) => {
      calls.write.push({ path, options });
      if (sidecarMode === 'denied' && path.endsWith('.recforge.json')) return { ok: false, reason: 'capability-denied' };
      disk.set(path, content);
      return { ok: true };
    },
    append: async (path, content) => { disk.set(path, (disk.get(path) || '') + content); return { ok: true }; },
    exists: async (path) => ({ ok: true, exists: disk.has(path) }),
    delete: async (path) => { disk.delete(path); return { ok: true }; },
    url: async (path) => (disk.has(path) ? { ok: true, path, url: `f://${path}` } : { ok: false, reason: 'invalid-request' }),
    mkdir: async (path, options) => {
      calls.mkdir.push({ path, options });
      return mkdirMode === 'denied' ? { ok: false, reason: 'capability-denied' } : { ok: true };
    },
    exportFile: async (path, options) => {
      calls.exportFile.push({ path, options });
      if (exportMode === 'denied') return { ok: false, reason: 'capability-denied' };
      if (exportMode === 'cancelled') return { ok: true, canceled: true };
      return { ok: true };
    },
    reveal: async (path) => {
      calls.reveal.push(path);
      return revealMode === 'denied' ? { ok: false, reason: 'capability-denied' } : { ok: true };
    },
  },
  media: {
    runFfmpeg: async (opts) => {
      calls.ffmpeg.push(opts);
      if (ffmpegMode === 'missing') return { ok: false, reason: 'runtime-missing' };
      if (ffmpegMode === 'denied') return { ok: false, reason: 'capability-denied' };
      if (ffmpegMode === 'bad-exit') return { ok: true, exitCode: 1, stdout: '', stderr: 'x264 error\nEncoder not found' };
      // success: create the output file named by the last arg, relative to cwd
      const out = opts.args[opts.args.length - 1];
      disk.set(`${opts.cwd}/${out}`, 'MP4BYTES');
      return { ok: true, exitCode: 0, stdout: '', stderr: '' };
    },
    runFfprobe: async () => ({ ok: false, reason: 'runtime-missing' }),
  },
  speech: { transcribe: async () => ({ ok: false, reason: 'runtime-missing' }) },
  camera: { requestAccess: async () => ({ ok: true }) },
  microphone: { requestAccess: async () => ({ ok: true }) },
  screenCapture: { getSources: async () => ({ ok: true, sources: [] }) },
};

class FakeBlob {
  constructor(parts, opts = {}) { this._buf = Buffer.concat(parts.map((p) => Buffer.from(String(p)))); this.type = opts.type || ''; }
  get size() { return this._buf.length; }
  slice(s, e) { const b = new FakeBlob([], {}); b._buf = this._buf.subarray(s, e); return b; }
}
class FakeFileReader {
  readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(blob._buf).toString('base64')}`;
    queueMicrotask(() => this.onload && this.onload());
  }
}

const sandbox = {
  window: { addEventListener() {}, tinyAtom },
  document: documentStub,
  navigator: { mediaDevices: undefined },
  console,
  crypto: { randomUUID: () => `id-${++sandbox.__n}` },
  __n: 0,
  Blob: FakeBlob, FileReader: FakeFileReader,
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => '#000' }),
  setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => 0 },
  queueMicrotask, Promise, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  Error, isNaN, parseInt, parseFloat, Buffer,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), sandbox, { filename: 'app.js' });

const R = sandbox.window.__rekorder;
const { store, exporter, notices, timeoutForDuration, isNativeMp4, safeFileStem, refs } = R;
const settle = () => new Promise((r) => setTimeout(r, 5));
await settle();

let toasts = [];
const realToast = notices.toast;
const realBanner = notices.banner;
notices.toast = (k, m) => toasts.push([k, m]);
notices.banner = (k, m) => toasts.push([`banner:${k}`, m]);
const resetToasts = () => { toasts = []; };
const said = (re) => toasts.some(([, m]) => re.test(m));

const webm = (over = {}) => ({
  id: 'r1', title: 'My Recording', createdAt: '2026-07-01T10:00:00Z',
  durationMs: 60000, size: 1000, mimeType: 'video/webm;codecs=vp9',
  fileName: 'resources/recordings/r1.webm', thumbnail: '', ...over,
});
const seed = (item) => {
  disk.clear(); storage.clear(); refs.indexReadable = true;
  disk.set(item.fileName, 'WEBMBYTES');
  store.setState({ recordings: [item], selectedRecordingId: item.id, exportFormat: 'mp4', exportProgress: null });
  calls.ffmpeg.length = 0; calls.mkdir.length = 0; calls.exportFile.length = 0; calls.reveal.length = 0; calls.write.length = 0;
  resetToasts();
};

// ------------------------------------------------------------------ tests --

console.log('\ntimeoutForDuration (LLD §9 timeout rule)');
check('floor applies to a short take', timeoutForDuration(1000, 4, 120000) === 120000);
check('scales past the floor', timeoutForDuration(60000, 4, 120000) === 240000);
check('non-numeric duration falls back to the floor', timeoutForDuration(undefined, 4, 120000) === 120000);

console.log('\nisNativeMp4 / safeFileStem');
check('webm is not native mp4', !isNativeMp4(webm()));
check('mp4 fileName is native', isNativeMp4(webm({ fileName: 'resources/recordings/r1.mp4' })));
check('mp4 mimeType is native', isNativeMp4(webm({ mimeType: 'video/mp4' })));
check('illegal filename chars are stripped', safeFileStem('a/b:c*d?"e<f>g|h') === 'a-b-c-d-e-f-g-h', safeFileStem('a/b:c*d?"e<f>g|h'));
check('an empty title still yields a name', safeFileStem('   ') === 'recording', JSON.stringify(safeFileStem('   ')));

console.log('\nensureMp4 — the media-bridge path rule');
seed(webm());
const mp4Path = await exporter.ensureMp4(store.state.recordings[0]);
check('returns the workspace mp4 path', mp4Path === 'resources/exports/r1.mp4', mp4Path);
check('exports dir created first', calls.mkdir[0].path === 'resources/exports');
check('mkdir uses recursive (not createParents)',
  calls.mkdir[0].options.recursive === true && calls.mkdir[0].options.createParents === undefined,
  JSON.stringify(calls.mkdir[0].options));
check('mkdir happened before ffmpeg', calls.mkdir.length === 1 && calls.ffmpeg.length === 1);

const ff = calls.ffmpeg[0];
check('cwd is resources', ff.cwd === 'resources', ff.cwd);
check('overwrites without prompting (-nostdin would hang on the prompt)', ff.args[0] === '-y', ff.args[0]);
check('input is a cwd-relative workspace arg', ff.args[1] === '-i' && ff.args[2] === 'recordings/r1.webm', ff.args.slice(1, 3).join(' '));
check('output is cwd-relative', ff.args[ff.args.length - 1] === 'exports/r1.mp4', ff.args[ff.args.length - 1]);
check('no `inputs` (that form is only for refIds)', ff.inputs === undefined);
check('no {{input0}} token anywhere', !ff.args.some((a) => String(a).includes('{{input')));
check('no absolute path or traversal', !ff.args.some((a) => String(a).startsWith('/') || String(a).includes('..')));
check('encodes H.264', ff.args.includes('libx264'));
check('encodes AAC', ff.args.includes('aac'));
check('faststart for immediate seek', ff.args.includes('+faststart'));
check('timeout scaled to the 60s take', ff.timeoutMs === 240000, String(ff.timeoutMs));
check('mp4Path stored on the entry', store.state.recordings[0].mp4Path === 'resources/exports/r1.mp4');
check('index saved', JSON.parse(storage.get('recordings'))[0].mp4Path === 'resources/exports/r1.mp4');

console.log('\nensureMp4 — a native-MP4 host skips the transcode entirely');
seed(webm({ fileName: 'resources/recordings/r1.mp4', mimeType: 'video/mp4' }));
const native = await exporter.ensureMp4(store.state.recordings[0]);
check('returns the recording itself', native === 'resources/recordings/r1.mp4', native);
check('ffmpeg never ran', calls.ffmpeg.length === 0);
check('no exports dir created', calls.mkdir.length === 0);

console.log('\nensureMp4 — an existing transcode is reused, a missing one is redone');
seed(webm({ mp4Path: 'resources/exports/r1.mp4' }));
disk.set('resources/exports/r1.mp4', 'MP4BYTES');
const reused = await exporter.ensureMp4(store.state.recordings[0]);
check('reuses the existing mp4', reused === 'resources/exports/r1.mp4' && calls.ffmpeg.length === 0);

seed(webm({ mp4Path: 'resources/exports/r1.mp4' })); // mp4Path recorded but file gone
const redone = await exporter.ensureMp4(store.state.recordings[0]);
check('re-transcodes when the mp4 is gone', redone === 'resources/exports/r1.mp4' && calls.ffmpeg.length === 1);

console.log('\nensureMp4 — failures are explained, never silent');
seed(webm());
ffmpegMode = 'missing';
const missing = await exporter.ensureMp4(store.state.recordings[0]);
ffmpegMode = 'ok';
check('returns no path', missing === '');
check('names the Runtime tab', said(/Runtime tab/), JSON.stringify(toasts));
check('names the ffmpeg runtime', said(/ffmpeg/i));
check('a missing runtime is a persistent banner, not a fleeting toast', toasts.some(([k]) => k.startsWith('banner:')));
check('no mp4Path recorded', store.state.recordings[0].mp4Path === undefined);

seed(webm());
ffmpegMode = 'bad-exit';
const badExit = await exporter.ensureMp4(store.state.recordings[0]);
ffmpegMode = 'ok';
check('non-zero exit returns no path', badExit === '');
check('stderr is surfaced to the user', said(/Encoder not found/), JSON.stringify(toasts));
check('no mp4Path recorded on failure', store.state.recordings[0].mp4Path === undefined);

seed(webm());
mkdirMode = 'denied';
const noDir = await exporter.ensureMp4(store.state.recordings[0]);
mkdirMode = 'ok';
check('a denied mkdir aborts before ffmpeg', noDir === '' && calls.ffmpeg.length === 0);
check('and explains itself', said(/exports folder|Studio Permissions/), JSON.stringify(toasts));

console.log('\nensureMp4 — an unsafe fileName never reaches FFmpeg');
seed(webm());
store.setState({ recordings: [{ ...webm(), fileName: 'resources/recordings/../../etc/passwd' }] });
resetToasts();
const unsafe = await exporter.ensureMp4(store.state.recordings[0]);
check('refuses the export', unsafe === '');
check('ffmpeg was never called', calls.ffmpeg.length === 0);
check('tells the user why', said(/invalid file name/i), JSON.stringify(toasts));

console.log('\nrun() — MP4 export end to end');
seed(webm());
store.setState({ exportFormat: 'mp4' });
await exporter.run(store.state.recordings[0]);
check('the transcoded file is what gets exported', calls.exportFile[0].path === 'resources/exports/r1.mp4', calls.exportFile[0].path);
check('suggested name uses the title + real extension', calls.exportFile[0].options.suggestedName === 'My Recording.mp4', calls.exportFile[0].options.suggestedName);
check('success is reported', said(/Exported as MP4/), JSON.stringify(toasts));
check('progress cleared afterwards', store.state.exportProgress === null);

const sidecar = calls.write.find((w) => w.path.endsWith('.recforge.json'));
check('metadata sidecar written to exports/', sidecar && sidecar.path === 'resources/exports/r1.recforge.json', sidecar && sidecar.path);
check('sidecar creates its parents', sidecar && sidecar.options.createParents === true);
const meta = JSON.parse(disk.get('resources/exports/r1.recforge.json'));
check('sidecar records the title', meta.title === 'My Recording');
check('sidecar records the export format', meta.exportedAs === 'mp4');
check('sidecar records a caption path slot', 'captionPath' in meta);

console.log('\nrun() — WebM export takes no transcode');
seed(webm());
store.setState({ exportFormat: 'webm' });
await exporter.run(store.state.recordings[0]);
check('ffmpeg never ran', calls.ffmpeg.length === 0);
check('the recording itself is exported', calls.exportFile[0].path === 'resources/recordings/r1.webm');
check('suggested name carries .webm', calls.exportFile[0].options.suggestedName === 'My Recording.webm');
check('success names WEBM', said(/Exported as WEBM/), JSON.stringify(toasts));

console.log('\nrun() — cancellation is not success');
seed(webm());
store.setState({ exportFormat: 'webm' });
exportMode = 'cancelled';
await exporter.run(store.state.recordings[0]);
exportMode = 'ok';
check('no success toast', !said(/Exported as/), JSON.stringify(toasts));
check('says it was cancelled', said(/cancelled/i));
check('progress cleared', store.state.exportProgress === null);

console.log('\nrun() — a denied save is explained');
seed(webm());
store.setState({ exportFormat: 'webm' });
exportMode = 'denied';
await exporter.run(store.state.recordings[0]);
exportMode = 'ok';
check('no success toast', !said(/Exported as/));
check('names Studio Permissions', said(/Studio Permissions/), JSON.stringify(toasts));

console.log('\nrun() — a failing transcode stops before the save dialog');
seed(webm());
store.setState({ exportFormat: 'mp4' });
ffmpegMode = 'bad-exit';
await exporter.run(store.state.recordings[0]);
ffmpegMode = 'ok';
check('the save dialog never opened', calls.exportFile.length === 0);
check('no sidecar written for a failed export', !calls.write.some((w) => w.path.endsWith('.recforge.json')));
check('progress cleared even on failure', store.state.exportProgress === null);
check('running flag released', exporter.running === false);

console.log('\nrun() — a failed sidecar never fails the export');
seed(webm());
store.setState({ exportFormat: 'webm' });
sidecarMode = 'denied';
await exporter.run(store.state.recordings[0]);
sidecarMode = 'ok';
check('the video still exported', calls.exportFile.length === 1);
check('success still reported', said(/Exported as/), JSON.stringify(toasts));

console.log('\nrun() — re-entrancy guard');
seed(webm());
store.setState({ exportFormat: 'mp4' });
const first = exporter.run(store.state.recordings[0]);
const second = exporter.run(store.state.recordings[0]); // must be a no-op while busy
await Promise.all([first, second]);
check('only one transcode ran', calls.ffmpeg.length === 1, String(calls.ffmpeg.length));
check('only one save dialog opened', calls.exportFile.length === 1, String(calls.exportFile.length));

console.log('\nrun() — nothing selected is a no-op');
seed(webm());
await exporter.run(null);
check('no ffmpeg, no dialog', calls.ffmpeg.length === 0 && calls.exportFile.length === 0);

console.log('\nreveal()');
seed(webm({ mp4Path: 'resources/exports/r1.mp4' }));
disk.set('resources/exports/r1.mp4', 'MP4BYTES');
await exporter.reveal(store.state.recordings[0]);
check('reveals the mp4 when it exists', calls.reveal[0] === 'resources/exports/r1.mp4', calls.reveal[0]);

seed(webm({ mp4Path: 'resources/exports/r1.mp4' })); // mp4 recorded but gone
await exporter.reveal(store.state.recordings[0]);
check('falls back to the recording', calls.reveal[0] === 'resources/recordings/r1.webm', calls.reveal[0]);

seed(webm());
revealMode = 'denied';
await exporter.reveal(store.state.recordings[0]);
revealMode = 'ok';
check('a denied reveal is explained', said(/Studio Permissions/), JSON.stringify(toasts));

seed(webm());
await exporter.reveal(null);
check('reveal(null) is a no-op', calls.reveal.length === 0);

// ===================== self-review hardening =====================

console.log('\n[self-review] a tampered mp4Path never becomes an export target');
seed(webm());
store.setState({ recordings: [{ ...webm(), mp4Path: 'resources/exports/../../etc/passwd' }] });
resetToasts();
const tampered = await exporter.ensureMp4(store.state.recordings[0]);
check('the unsafe cache is ignored, a real transcode runs', tampered === 'resources/exports/r1.mp4', tampered);
check('the tampered path was never revealed or exported', !calls.exportFile.some((c) => c.path.includes('..')));

seed(webm());
store.setState({ recordings: [{ ...webm(), mp4Path: 'resources/exports/../../etc/passwd' }] });
resetToasts();
await exporter.reveal(store.state.recordings[0]);
check('reveal ignores the unsafe mp4Path', calls.reveal[0] === 'resources/recordings/r1.webm', calls.reveal[0]);

seed(webm());
store.setState({ recordings: [{ ...webm(), fileName: 'resources/recordings/../../etc/passwd' }] });
resetToasts();
await exporter.reveal(store.state.recordings[0]);
check('reveal refuses an unsafe fileName outright', calls.reveal.length === 0);
check('and says why', said(/invalid file name/i), JSON.stringify(toasts));

console.log('\n[self-review] deleting the recording mid-transcode aborts the export');
seed(webm());
store.setState({ exportFormat: 'mp4' });
const exporting = exporter.run(store.state.recordings[0]);
store.setState({ recordings: [] }); // the user deletes it while FFmpeg runs
await exporting;
check('no save dialog for a deleted recording', calls.exportFile.length === 0, String(calls.exportFile.length));
check('no success toast', !said(/Exported as/), JSON.stringify(toasts));
check('the user is told', said(/deleted before the export finished/i));
check('progress cleared', store.state.exportProgress === null);
check('running flag released', exporter.running === false);

console.log('\n[self-review] safeFileStem rejects a name made of dots');
check('dots-only title falls back', safeFileStem('...') === 'recording', safeFileStem('...'));
check('leading dot stripped', safeFileStem('.hidden') === 'hidden', safeFileStem('.hidden'));
check('trailing dots stripped', safeFileStem('name...') === 'name', safeFileStem('name...'));
check('inner dots preserved', safeFileStem('v1.2 take') === 'v1.2 take', safeFileStem('v1.2 take'));

// ===================== review fixes (T08 round 2) =====================

console.log('\n[r2] the WebM export path validates fileName too');
seed(webm());
store.setState({ recordings: [{ ...webm(), fileName: 'resources/recordings/../../etc/passwd' }], exportFormat: 'webm' });
resetToasts();
await exporter.run(store.state.recordings[0]);
check('no save dialog for a tampered path', calls.exportFile.length === 0, JSON.stringify(calls.exportFile));
check('no sidecar written', !calls.write.some((w) => w.path.endsWith('.recforge.json')));
check('the user is told why', said(/invalid file name/i), JSON.stringify(toasts));
check('running flag released', exporter.running === false);

seed(webm());
store.setState({ recordings: [{ ...webm(), fileName: 'resources/recordings/../../etc/passwd' }], exportFormat: 'mp4' });
resetToasts();
await exporter.run(store.state.recordings[0]);
check('the MP4 path refuses it as well', calls.ffmpeg.length === 0 && calls.exportFile.length === 0);

console.log('\n[r2] the sidecar records the container actually written');
seed(webm());
store.setState({ exportFormat: 'webm' });
await exporter.run(store.state.recordings[0]);
check('a real webm records exportedAs webm',
  JSON.parse(disk.get('resources/exports/r1.recforge.json')).exportedAs === 'webm');

// A native-MP4 host: "as recorded" (value 'webm') must not claim the file is WebM.
seed(webm({ fileName: 'resources/recordings/r1.mp4', mimeType: 'video/mp4' }));
store.setState({ exportFormat: 'webm' });
resetToasts();
await exporter.run(store.state.recordings[0]);
const nativeMeta = JSON.parse(disk.get('resources/exports/r1.recforge.json'));
check('"as recorded" on an MP4 host records exportedAs mp4', nativeMeta.exportedAs === 'mp4', nativeMeta.exportedAs);
check('the exported file really is the mp4', calls.exportFile[0].path === 'resources/recordings/r1.mp4');
check('the suggested name matches', calls.exportFile[0].options.suggestedName === 'My Recording.mp4');
check('and the toast does not lie', said(/Exported as MP4/), JSON.stringify(toasts));

seed(webm());
store.setState({ exportFormat: 'mp4' });
await exporter.run(store.state.recordings[0]);
check('a transcode records exportedAs mp4',
  JSON.parse(disk.get('resources/exports/r1.recforge.json')).exportedAs === 'mp4');

notices.toast = realToast;
notices.banner = realBanner;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
