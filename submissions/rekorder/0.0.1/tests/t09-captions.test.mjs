/**
 * T09 headless harness: captions.ensure() (audio extract → whisper → sidecar), its
 * failure paths, and the export integration that must never let a caption failure cost
 * the user their video.
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

const disk = new Map();
const storage = new Map();
const calls = { ffmpeg: [], mkdir: [], transcribe: [], del: [], exportFile: [], reveal: [] };

let extractMode = 'ok';    // ok | missing | bad-exit
let whisperMode = 'ok';    // ok | missing | error | silent | stray-path | no-file
let mkdirTmpMode = 'ok';   // ok | denied
let exportMode = 'ok';     // ok | cancel-video | cancel-captions
let existsMode = 'ok';     // ok | error

const VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello there.\n';
const EMPTY_VTT = 'WEBVTT\n\n';

const tinyAtom = {
  metadata: async () => ({ ok: true, id: 'rekorder', name: 'rekorder', version: '1' }),
  storage: {
    get: async (k) => ({ ok: true, value: storage.has(k) ? storage.get(k) : null }),
    set: async (k, v) => { storage.set(k, v); return { ok: true }; },
  },
  files: {
    write: async (p, c) => { disk.set(p, c); return { ok: true }; },
    append: async (p, c) => { disk.set(p, (disk.get(p) || '') + c); return { ok: true }; },
    exists: async (p) => (existsMode === 'error'
      ? { ok: false, reason: 'runtime-error' }
      : { ok: true, exists: disk.has(p) }),
    delete: async (p) => { calls.del.push(p); disk.delete(p); return { ok: true }; },
    url: async (p) => (disk.has(p) ? { ok: true, url: `f://${p}` } : { ok: false, reason: 'invalid-request' }),
    mkdir: async (p, o) => {
      calls.mkdir.push({ path: p, options: o });
      if (p === 'resources/tmp' && mkdirTmpMode === 'denied') return { ok: false, reason: 'capability-denied' };
      return { ok: true };
    },
    exportFile: async (p, o) => {
      calls.exportFile.push({ path: p, options: o });
      if (exportMode === 'cancel-video' && !p.endsWith('.vtt')) return { ok: true, canceled: true };
      if (exportMode === 'cancel-captions' && p.endsWith('.vtt')) return { ok: true, canceled: true };
      return { ok: true };
    },
    reveal: async (p) => { calls.reveal.push(p); return { ok: true }; },
  },
  media: {
    runFfmpeg: async (opts) => {
      calls.ffmpeg.push(opts);
      const out = opts.args[opts.args.length - 1];
      if (out.endsWith('.wav')) {
        if (extractMode === 'missing') return { ok: false, reason: 'runtime-missing' };
        if (extractMode === 'bad-exit') return { ok: true, exitCode: 1, stdout: '', stderr: 'noise\nNo audio stream found' };
      }
      disk.set(`${opts.cwd}/${out}`, 'BYTES');
      return { ok: true, exitCode: 0, stdout: '', stderr: '' };
    },
    runFfprobe: async () => ({ ok: false, reason: 'runtime-missing' }),
  },
  speech: {
    transcribe: async (opts) => {
      calls.transcribe.push(opts);
      if (whisperMode === 'missing') return { ok: false, reason: 'runtime-missing' };
      if (whisperMode === 'error') return { ok: false, reason: 'runtime-error', stderr: 'model load failed' };
      if (whisperMode === 'silent') {
        disk.set('resources/transcripts/r1.vtt', EMPTY_VTT);
        return { ok: true, format: 'vtt', text: EMPTY_VTT, outputPath: 'resources/transcripts/r1.vtt' };
      }
      if (whisperMode === 'stray-path') {
        disk.set('resources/transcripts/r1.vtt', VTT);
        return { ok: true, format: 'vtt', text: VTT, outputPath: '../../etc/passwd' };
      }
      if (whisperMode === 'no-file') {
        return { ok: true, format: 'vtt', text: VTT, outputPath: 'resources/transcripts/r1.vtt' }; // never written
      }
      disk.set('resources/transcripts/r1.vtt', VTT);
      return { ok: true, format: 'vtt', text: VTT, outputPath: 'resources/transcripts/r1.vtt' };
    },
  },
  camera: { requestAccess: async () => ({ ok: true }) },
  microphone: { requestAccess: async () => ({ ok: true }) },
  screenCapture: { getSources: async () => ({ ok: true, sources: [] }) },
};

class FakeBlob {
  constructor(parts, o = {}) { this._buf = Buffer.concat(parts.map((p) => Buffer.from(String(p)))); this.type = o.type || ''; }
  get size() { return this._buf.length; }
  slice(s, e) { const b = new FakeBlob([], {}); b._buf = this._buf.subarray(s, e); return b; }
}
class FakeFileReader {
  readAsDataURL(b) { this.result = `data:;base64,${Buffer.from(b._buf).toString('base64')}`; queueMicrotask(() => this.onload && this.onload()); }
}

const sandbox = {
  window: { addEventListener() {}, tinyAtom },
  document: documentStub, navigator: { mediaDevices: undefined }, console,
  crypto: { randomUUID: () => `id-${++sandbox.__n}` }, __n: 0,
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
const { store, exporter, captions, notices, refs, hasCues, timeoutForDuration } = R;
const settle = () => new Promise((r) => setTimeout(r, 5));
await settle();

let toasts = [];
const realToast = notices.toast;
const realBanner = notices.banner;
notices.toast = (k, m) => toasts.push([k, m]);
notices.banner = (k, m) => toasts.push([`banner:${k}`, m]);
const said = (re) => toasts.some(([, m]) => re.test(m));

const rec = (over = {}) => ({
  id: 'r1', title: 'My Recording', createdAt: '2026-07-01T10:00:00Z',
  durationMs: 120000, size: 1000, mimeType: 'video/webm',
  fileName: 'resources/recordings/r1.webm', thumbnail: '', ...over,
});
const seed = (item = rec(), opts = {}) => {
  disk.clear(); storage.clear(); refs.indexReadable = true;
  disk.set(item.fileName, 'WEBM');
  store.setState({
    recordings: [item], selectedRecordingId: item.id,
    exportFormat: opts.format || 'webm', includeCaptions: opts.captions !== false,
    exportProgress: null,
  });
  for (const k of Object.keys(calls)) calls[k].length = 0;
  toasts = [];
};
const noop = () => {};

// ------------------------------------------------------------------ tests --

console.log('\nhasCues');
check('a real VTT has cues', hasCues(VTT));
check('a header-only VTT has none', !hasCues(EMPTY_VTT));
check('empty text has none', !hasCues(''));
check('undefined has none', !hasCues(undefined));

console.log('\ncaptions.ensure — the happy path');
seed();
const path = await captions.ensure(store.state.recordings[0], noop);
check('returns the transcript path', path === 'resources/transcripts/r1.vtt', path);
check('tmp dir created recursively', calls.mkdir[0].path === 'resources/tmp' && calls.mkdir[0].options.recursive === true);
check('createParents is not passed to mkdir', calls.mkdir[0].options.createParents === undefined);

const ff = calls.ffmpeg[0];
check('overwrites without prompting', ff.args[0] === '-y');
check('input is a cwd-relative workspace arg', ff.args[1] === '-i' && ff.args[2] === 'recordings/r1.webm', ff.args.slice(1, 3).join(' '));
check('drops the video stream', ff.args.includes('-vn'));
check('mono', ff.args[ff.args.indexOf('-ac') + 1] === '1');
check('16 kHz', ff.args[ff.args.indexOf('-ar') + 1] === '16000');
check('writes the wav under tmp/', ff.args[ff.args.length - 1] === 'tmp/r1.wav', ff.args[ff.args.length - 1]);
check('cwd is resources', ff.cwd === 'resources');
check('no `inputs` — a workspace file is not a refId', ff.inputs === undefined);
check('no {{input0}} token', !ff.args.some((a) => String(a).includes('{{input')));
check('no absolute path or traversal', !ff.args.some((a) => String(a).startsWith('/') || String(a).includes('..')));
check('extract timeout scales (factor 1, floor 60s)', ff.timeoutMs === 120000, String(ff.timeoutMs));

const tr = calls.transcribe[0];
check('transcribes the workspace wav by path', tr.path === 'resources/tmp/r1.wav', tr.path);
check('no refId is passed for a workspace file', tr.refId === undefined);
check('asks for vtt', tr.format === 'vtt');
check('transcribe timeout scales (factor 6, floor 300s)', tr.timeoutMs === 720000, String(tr.timeoutMs));

check('the scratch wav is deleted', calls.del.includes('resources/tmp/r1.wav'), JSON.stringify(calls.del));
check('captionPath stored on the entry', store.state.recordings[0].captionPath === 'resources/transcripts/r1.vtt');
check('index saved', JSON.parse(storage.get('recordings'))[0].captionPath === 'resources/transcripts/r1.vtt');

console.log('\ncaptions.ensure — an existing transcript is reused');
seed(rec({ captionPath: 'resources/transcripts/r1.vtt' }));
disk.set('resources/transcripts/r1.vtt', VTT);
const reused = await captions.ensure(store.state.recordings[0], noop);
check('returns the cached path', reused === 'resources/transcripts/r1.vtt');
check('no ffmpeg run', calls.ffmpeg.length === 0);
check('no transcription run', calls.transcribe.length === 0);

console.log('\ncaptions.ensure — a recorded-but-missing transcript is regenerated');
seed(rec({ captionPath: 'resources/transcripts/r1.vtt' })); // file absent
const regen = await captions.ensure(store.state.recordings[0], noop);
check('regenerates it', regen === 'resources/transcripts/r1.vtt' && calls.transcribe.length === 1);

console.log('\ncaptions.ensure — a tampered cached path is not trusted');
seed(rec({ captionPath: 'resources/transcripts/../../etc/passwd' }));
const tampered = await captions.ensure(store.state.recordings[0], noop);
check('ignores the unsafe cache and transcribes afresh', tampered === 'resources/transcripts/r1.vtt');
check('never revealed or exported the unsafe path', !calls.exportFile.some((c) => c.path.includes('..')));

console.log('\ncaptions.ensure — whisper reporting an out-of-workspace outputPath');
seed();
whisperMode = 'stray-path';
const strayed = await captions.ensure(store.state.recordings[0], noop);
whisperMode = 'ok';
check('falls back to the conventional transcripts path', strayed === 'resources/transcripts/r1.vtt', strayed);
check('the traversal path is never stored', store.state.recordings[0].captionPath === 'resources/transcripts/r1.vtt');

console.log('\ncaptions.ensure — failures');
seed();
mkdirTmpMode = 'denied';
const noTmp = await captions.ensure(store.state.recordings[0], noop);
mkdirTmpMode = 'ok';
check('a denied tmp mkdir returns nothing', noTmp === '');
check('and never runs ffmpeg', calls.ffmpeg.length === 0);
check('and explains itself', said(/Studio Permissions|temporary folder/), JSON.stringify(toasts));

seed();
extractMode = 'missing';
const noFfmpeg = await captions.ensure(store.state.recordings[0], noop);
extractMode = 'ok';
check('missing ffmpeg returns nothing', noFfmpeg === '');
check('names the Runtime tab', said(/Runtime tab/), JSON.stringify(toasts));
check('a missing runtime is a persistent banner', toasts.some(([k]) => k.startsWith('banner:')));
check('whisper is never called', calls.transcribe.length === 0);
check('the scratch wav is still cleaned up', calls.del.includes('resources/tmp/r1.wav'));

seed();
extractMode = 'bad-exit';
const badExtract = await captions.ensure(store.state.recordings[0], noop);
extractMode = 'ok';
check('a non-zero extract exit returns nothing', badExtract === '');
check('stderr reaches the user', said(/No audio stream found/), JSON.stringify(toasts));
check('scratch cleaned up after a failed extract', calls.del.includes('resources/tmp/r1.wav'));

seed();
whisperMode = 'missing';
const noWhisper = await captions.ensure(store.state.recordings[0], noop);
whisperMode = 'ok';
check('missing whisper returns nothing', noWhisper === '');
check('names whisper-cli', said(/whisper-cli/), JSON.stringify(toasts));
check('as a persistent banner', toasts.some(([k]) => k.startsWith('banner:')));
check('no captionPath recorded', store.state.recordings[0].captionPath === undefined);
check('scratch cleaned up', calls.del.includes('resources/tmp/r1.wav'));

seed();
whisperMode = 'error';
const whisperErr = await captions.ensure(store.state.recordings[0], noop);
whisperMode = 'ok';
check('a runtime-error returns nothing', whisperErr === '');
check('the user is told', toasts.length > 0);

seed();
whisperMode = 'silent';
const silent = await captions.ensure(store.state.recordings[0], noop);
whisperMode = 'ok';
check('a cue-less transcript is not stored', silent === '');
check('and says no speech was found', said(/No speech was found/), JSON.stringify(toasts));
check('no captionPath recorded for silence', store.state.recordings[0].captionPath === undefined);

seed();
whisperMode = 'no-file';
const ghost = await captions.ensure(store.state.recordings[0], noop);
whisperMode = 'ok';
check('a reported-but-absent transcript is refused', ghost === '');
check('and says so', said(/could not be found/), JSON.stringify(toasts));

console.log('\ncaptions — progress labels');
seed();
const labels = [];
await captions.ensure(store.state.recordings[0], (l) => labels.push(l));
check('extraction is announced', labels.includes('Extracting audio…'), JSON.stringify(labels));
check('transcription is announced', labels.includes('Transcribing…'), JSON.stringify(labels));

console.log('\nexport integration — captions off');
seed(rec(), { captions: false });
await exporter.run(store.state.recordings[0]);
check('no ffmpeg, no whisper', calls.ffmpeg.length === 0 && calls.transcribe.length === 0);
check('exactly one save dialog (the video)', calls.exportFile.length === 1, String(calls.exportFile.length));

console.log('\nexport integration — captions on');
seed(rec(), { captions: true });
await exporter.run(store.state.recordings[0]);
check('two dialogs: video then captions', calls.exportFile.length === 2, String(calls.exportFile.length));
check('video first', calls.exportFile[0].path === 'resources/recordings/r1.webm');
check('captions second', calls.exportFile[1].path === 'resources/transcripts/r1.vtt');
check('caption suggested name uses the title', calls.exportFile[1].options.suggestedName === 'My Recording.vtt', calls.exportFile[1].options.suggestedName);
check('both successes reported', said(/Exported as WEBM/) && said(/Captions exported as VTT/), JSON.stringify(toasts));

console.log('\nexport integration — a caption failure never costs the video');
seed(rec(), { captions: true });
whisperMode = 'missing';
await exporter.run(store.state.recordings[0]);
whisperMode = 'ok';
check('the video still exported', calls.exportFile.length === 1 && calls.exportFile[0].path === 'resources/recordings/r1.webm');
check('the video success is still reported', said(/Exported as WEBM/), JSON.stringify(toasts));
check('the whisper problem is also reported', said(/whisper-cli/));
check('progress cleared', store.state.exportProgress === null);

console.log('\nexport integration — cancelling the video skips the caption dialog');
seed(rec(), { captions: true });
exportMode = 'cancel-video';
await exporter.run(store.state.recordings[0]);
exportMode = 'ok';
check('only the video dialog opened', calls.exportFile.length === 1, String(calls.exportFile.length));
check('cancellation reported', said(/Export cancelled/), JSON.stringify(toasts));
check('no success toast', !said(/Exported as/));

console.log('\nexport integration — cancelling only the caption dialog');
seed(rec(), { captions: true });
exportMode = 'cancel-captions';
await exporter.run(store.state.recordings[0]);
exportMode = 'ok';
check('the video still succeeded', said(/Exported as WEBM/), JSON.stringify(toasts));
check('the caption cancel points at Reveal captions', said(/Reveal captions/), JSON.stringify(toasts));
check('captions remain on disk', disk.has('resources/transcripts/r1.vtt'));

console.log('\nrevealCaptions');
seed(rec({ captionPath: 'resources/transcripts/r1.vtt' }));
await exporter.revealCaptions(store.state.recordings[0]);
check('reveals the caption file', calls.reveal[0] === 'resources/transcripts/r1.vtt', calls.reveal[0]);

seed(rec({ captionPath: 'resources/transcripts/../../etc/passwd' }));
await exporter.revealCaptions(store.state.recordings[0]);
check('refuses an unsafe caption path', calls.reveal.length === 0);

seed(rec());
await exporter.revealCaptions(store.state.recordings[0]);
check('no captions, no reveal', calls.reveal.length === 0);
await exporter.revealCaptions(null);
check('revealCaptions(null) is a no-op', calls.reveal.length === 0);

console.log('\nsidecar carries the caption path');
seed(rec(), { captions: true });
await exporter.run(store.state.recordings[0]);
const meta = JSON.parse(disk.get('resources/exports/r1.recforge.json'));
check('sidecar records the generated captionPath', meta.captionPath === 'resources/transcripts/r1.vtt', JSON.stringify(meta.captionPath));

// ===================== review fixes (T09 round 2) =====================

console.log('\n[r2] a cue-less transcript leaves no orphan .vtt behind');
seed();
whisperMode = 'silent';
const orphaned = await captions.ensure(store.state.recordings[0], noop);
whisperMode = 'ok';
check('nothing is stored', orphaned === '');
check('the header-only transcript was deleted', calls.del.includes('resources/transcripts/r1.vtt'), JSON.stringify(calls.del));
check('and it is really gone', !disk.has('resources/transcripts/r1.vtt'));
check('the scratch wav is gone too', calls.del.includes('resources/tmp/r1.wav'));
check('the user is told why', said(/No speech was found/), JSON.stringify(toasts));

console.log('\n[r2] the "not found" guard fires when files.exists itself fails');
seed();
whisperMode = 'no-file';           // whisper claims a path it never wrote
existsMode = 'error';              // and the probe cannot tell us either way
const unproven = await captions.ensure(store.state.recordings[0], noop);
existsMode = 'ok';
whisperMode = 'ok';
check('an unprovable transcript is refused', unproven === '', unproven);
check('and says so', said(/could not be found/), JSON.stringify(toasts));
check('no captionPath is recorded on a guess', store.state.recordings[0].captionPath === undefined);

console.log('\n[r2] a cached transcript is only reused when its presence is proven');
seed(rec({ captionPath: 'resources/transcripts/r1.vtt' }));
disk.set('resources/transcripts/r1.vtt', VTT);
existsMode = 'error';              // the file IS there, but the probe fails
const notProven = await captions.ensure(store.state.recordings[0], noop);
existsMode = 'ok';
check('it transcribes again rather than trusting an unreadable probe', calls.transcribe.length === 1, String(calls.transcribe.length));
// With files.exists broken nothing can be proven, so it refuses rather than hand an
// unverified path to a save dialog. A broken probe means no captions, not wrong captions.
check('it refuses to return an unverified path', notProven === '', notProven);
check('and says the file could not be found', said(/could not be found/), JSON.stringify(toasts));

seed(rec({ captionPath: 'resources/transcripts/r1.vtt' }));
disk.set('resources/transcripts/r1.vtt', VTT);
const proven = await captions.ensure(store.state.recordings[0], noop);
check('a proven cache is reused with no work', proven === 'resources/transcripts/r1.vtt' && calls.transcribe.length === 0);

notices.toast = realToast;
notices.banner = realBanner;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
