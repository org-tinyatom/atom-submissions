/**
 * T07 headless harness: runs app.js in a fake DOM against a fake tinyAtom bridge,
 * then exercises library persist / load / remove, the pure list functions, and the
 * player's async binding. Assertions are printed with pass/fail.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ------------------------------------------------------------- fake DOM --

const listeners = new Map();
function makeEl(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    parentElement: null,
    attributes: {},
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    set innerHTML(html) { this._html = html; this.children = []; },
    get innerHTML() { return this._html || ''; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
    prepend(child) { child.parentElement = this; this.children.unshift(child); return child; },
    remove() { this.parentElement = null; },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) { (this._on ||= {})[type] = fn; },
    dispatch(type) { const fn = this._on && this._on[type]; if (fn) return fn(); },
    focus() {},
    setSelectionRange() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    play() {}, pause() {}, load() {},
    get src() { return this.attributes.src || ''; },
    set src(v) { this.attributes.src = String(v); },
    getContext: () => null,
  };
  return el;
}

const appEl = makeEl('div');
const documentStub = {
  documentElement: makeEl('html'),
  body: makeEl('body'),
  getElementById: (id) => (id === 'app' ? appEl : null),
  createElement: (tag) => makeEl(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (type, fn) => listeners.set(type, fn),
};

// ---------------------------------------------------------- fake bridge --

const disk = new Map();       // path → base64 content
const storage = new Map();    // key → string
const calls = { ffprobe: [], write: [], append: [], del: [], url: [] };
let ffprobeMode = 'ok';       // ok | missing | bad-exit
let writeMode = 'ok';         // ok | denied
let deleteMode = 'ok';        // ok | denied | sidecar-only
let storageMode = 'ok';       // ok | denied
let storageSetMode = 'ok';    // ok | denied
let appendFailAt = 0;         // fail the Nth files.append (0 = never)

const tinyAtom = {
  metadata: async () => ({ ok: true, id: 'rekorder', name: 'rekorder', version: '0.1.0' }),
  storage: {
    get: async (k) => (storageMode === 'denied'
      ? { ok: false, reason: 'capability-denied' }
      : { ok: true, value: storage.has(k) ? storage.get(k) : null }),
    set: async (k, v) => {
      if (storageSetMode === 'denied') return { ok: false, reason: 'capability-denied' };
      storage.set(k, v); return { ok: true };
    },
  },
  files: {
    write: async (path, content, options) => {
      calls.write.push({ path, options, bytes: content.length });
      if (writeMode === 'denied') return { ok: false, reason: 'capability-denied' };
      disk.set(path, content);
      return { ok: true };
    },
    append: async (path, content, options) => {
      calls.append.push({ path, options, bytes: content.length });
      if (appendFailAt && calls.append.length >= appendFailAt) return { ok: false, reason: 'runtime-error' };
      disk.set(path, (disk.get(path) || '') + content);
      return { ok: true };
    },
    exists: async (path) => ({ ok: true, exists: disk.has(path) }),
    delete: async (path) => {
      calls.del.push(path);
      const sidecar = !path.startsWith('resources/recordings/');
      if (deleteMode === 'denied') return { ok: false, reason: 'capability-denied' };
      if (deleteMode === 'sidecar-only' && sidecar) return { ok: false, reason: 'runtime-error' };
      disk.delete(path);
      return { ok: true };
    },
    url: async (path) => {
      calls.url.push(path);
      return disk.has(path)
        ? { ok: true, path, url: `atom-file://${path}` }
        : { ok: false, reason: 'invalid-request' };
    },
    mkdir: async () => ({ ok: true }),
  },
  media: {
    runFfprobe: async (opts) => {
      calls.ffprobe.push(opts);
      if (ffprobeMode === 'missing') return { ok: false, reason: 'runtime-missing' };
      if (ffprobeMode === 'bad-exit') return { ok: true, exitCode: 1, stdout: '', stderr: 'boom' };
      return {
        ok: true, exitCode: 0, stderr: '',
        stdout: JSON.stringify({
          streams: [{ width: 1920, height: 1080 }],
          format: { duration: '12.500000' },
        }),
      };
    },
  },
  camera: { requestAccess: async () => ({ ok: true }) },
  microphone: { requestAccess: async () => ({ ok: true }) },
  screenCapture: { getSources: async () => ({ ok: true, sources: [] }) },
};

// ------------------------------------------------------------- globals --

class FakeBlob {
  constructor(parts, opts = {}) {
    this._buf = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(String(p)))));
    this.type = opts.type || '';
  }
  get size() { return this._buf.length; }
  slice(start, end) {
    const b = new FakeBlob([], {});
    b._buf = this._buf.subarray(start, end);
    return b;
  }
}

let readerFailAt = 0;   // reject the Nth readAsDataURL (0 = never)
let readerCalls = 0;
class FakeFileReader {
  readAsDataURL(blob) {
    readerCalls += 1;
    if (readerFailAt && readerCalls >= readerFailAt) {
      this.error = new Error('slice unreadable');
      queueMicrotask(() => this.onerror && this.onerror());
      return;
    }
    this.result = `data:${blob.type};base64,${Buffer.from(blob._buf).toString('base64')}`;
    queueMicrotask(() => this.onload && this.onload());
  }
}

const windowStub = {
  addEventListener() {},
  tinyAtom,
  location: { href: 'atom://rekorder/' },
};

const sandbox = {
  window: windowStub,
  document: documentStub,
  navigator: { mediaDevices: undefined },
  console,
  crypto: { randomUUID: () => `id-${++sandbox.__n}` },
  __n: 0,
  Blob: FakeBlob,
  get FileReader() { return FakeFileReader; },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => '#000000' }),
  setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => 0 },
  queueMicrotask, Promise, Date, Math, JSON, Number, String,
  Object, Array, Set, Map, Error, isNaN, parseInt, parseFloat, TextEncoder, Buffer,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.createContext(sandbox);
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
vm.runInContext(source, sandbox, { filename: 'app.js' });

const R = sandbox.window.__rekorder;
const { store, library, player, refs, visibleRecordings, formatBytes, isSafeWorkspacePath, isRecordingItem } = R;

const settle = () => new Promise((r) => setTimeout(r, 5));

// ----------------------------------------------------------------- tests --

console.log('\nformatBytes');
check('bytes under 1K', formatBytes(512) === '512 B', formatBytes(512));
check('KB', formatBytes(2048) === '2.0 KB', formatBytes(2048));
check('MB one decimal under 10', formatBytes(5.5 * 1024 * 1024) === '5.5 MB', formatBytes(5.5 * 1024 * 1024));
check('MB rounded over 10', formatBytes(120 * 1024 * 1024) === '120 MB', formatBytes(120 * 1024 * 1024));
check('non-numeric size', formatBytes(undefined) === '0 B', formatBytes(undefined));

console.log('\npersist — happy path with ffprobe');
await settle(); // let boot() finish
store.setState({ recordings: [] });
const blob = new FakeBlob(['x'.repeat(4096)], { type: 'video/webm' });
const persisted = await library.persist({
  blob, thumbnail: 'data:image/jpeg;base64,AA', durationMs: 9000,
  mimeType: 'video/webm;codecs=vp9', extension: 'webm',
});
const item = persisted.item;
check('persist reports the entry reached the index', persisted.indexed === true);
check('file written under resources/recordings', disk.has(item.fileName), item.fileName);
check('fileName carries the derived extension', item.fileName.endsWith('.webm'), item.fileName);
check('write used base64 + createParents',
  calls.write[0].options.encoding === 'base64' && calls.write[0].options.createParents === true);
check('ffprobe duration overrides the clock', item.durationMs === 12500, String(item.durationMs));
check('ffprobe width/height stored', item.width === 1920 && item.height === 1080);
check('size comes from the blob', item.size === 4096, String(item.size));
check('entry is in state', store.state.recordings[0].id === item.id);
check('index persisted to storage', JSON.parse(storage.get('recordings'))[0].id === item.id);

const probeArgs = calls.ffprobe[0];
check('ffprobe cwd is resources', probeArgs.cwd === 'resources', probeArgs.cwd);
check('ffprobe path arg is cwd-relative (no resources/ prefix)',
  probeArgs.args[probeArgs.args.length - 1] === `recordings/${item.id}.webm`,
  probeArgs.args[probeArgs.args.length - 1]);
check('ffprobe passes no inputs (workspace file, not a refId)', probeArgs.inputs === undefined);
check('ffprobe never receives an absolute path',
  !probeArgs.args.some((a) => String(a).startsWith('/') || String(a).includes('..')));

console.log('\npersist — mp4-native host');
const { item: mp4 } = await library.persist({
  blob: new FakeBlob(['y'.repeat(2048)], { type: 'video/mp4' }), thumbnail: '',
  durationMs: 1000, mimeType: 'video/mp4', extension: 'mp4',
});
check('mp4 extension is honored, never hardcoded webm', mp4.fileName.endsWith('.mp4'), mp4.fileName);
check('newest recording is prepended', store.state.recordings[0].id === mp4.id);

console.log('\npersist — ffprobe missing falls back to the clock');
ffprobeMode = 'missing';
const { item: noProbe } = await library.persist({
  blob: new FakeBlob(['z'.repeat(64)], { type: 'video/webm' }), thumbnail: '',
  durationMs: 7777, mimeType: 'video/webm', extension: 'webm',
});
check('persist still succeeds', disk.has(noProbe.fileName));
check('clock duration retained', noProbe.durationMs === 7777, String(noProbe.durationMs));
check('no width/height claimed', noProbe.width === undefined && noProbe.height === undefined);

ffprobeMode = 'bad-exit';
const { item: badProbe } = await library.persist({
  blob: new FakeBlob(['q'.repeat(64)], { type: 'video/webm' }), thumbnail: '',
  durationMs: 4242, mimeType: 'video/webm', extension: 'webm',
});
check('non-zero ffprobe exit does not block persistence', disk.has(badProbe.fileName));
check('non-zero ffprobe exit keeps the clock duration', badProbe.durationMs === 4242);
ffprobeMode = 'ok';

console.log('\npersist — a denied write throws user-ready copy');
writeMode = 'denied';
let threw = null;
try {
  await library.persist({
    blob: new FakeBlob(['a'.repeat(16)], { type: 'video/webm' }), thumbnail: '',
    durationMs: 100, mimeType: 'video/webm', extension: 'webm',
  });
} catch (error) { threw = error; }
writeMode = 'ok';
check('persist throws on a failed write', !!threw);
check('message names Studio Permissions', threw && /Studio Permissions/.test(threw.message), threw && threw.message);
check('no phantom entry was added', !store.state.recordings.some((r) => r.durationMs === 100));

console.log('\nsearch + sort (pure)');
store.setState({
  recordings: [
    { id: 'a', title: 'Alpha demo', createdAt: '2026-07-01T10:00:00Z', size: 300, durationMs: 5000, fileName: 'resources/recordings/a.webm' },
    { id: 'b', title: 'Beta run', createdAt: '2026-07-03T10:00:00Z', size: 100, durationMs: 9000, fileName: 'resources/recordings/b.webm' },
    { id: 'c', title: 'alpha retake', createdAt: '2026-07-02T10:00:00Z', size: 200, durationMs: 1000, fileName: 'resources/recordings/c.webm' },
  ],
  query: '', sortMode: 'recent',
});
const before = store.state.recordings.map((r) => r.id).join('');
check('recent sort', visibleRecordings(store.state).map((r) => r.id).join('') === 'bca');
store.setState({ sortMode: 'largest' });
check('largest sort', visibleRecordings(store.state).map((r) => r.id).join('') === 'acb');
store.setState({ sortMode: 'longest' });
check('longest sort', visibleRecordings(store.state).map((r) => r.id).join('') === 'bac');
check('sort does not mutate state.recordings', store.state.recordings.map((r) => r.id).join('') === before);
store.setState({ query: 'ALPHA', sortMode: 'recent' });
check('search is case-insensitive', visibleRecordings(store.state).map((r) => r.id).join('') === 'ca');
store.setState({ query: '   ' });
check('whitespace query matches everything', visibleRecordings(store.state).length === 3);
store.setState({ query: 'zzz' });
check('no matches', visibleRecordings(store.state).length === 0);
store.setState({ query: '' });

console.log('\nload — self-healing index');
disk.clear();
disk.set('resources/recordings/keep.webm', 'AA');
storage.set('recordings', JSON.stringify([
  { id: 'keep', title: 'Keep', createdAt: '2026-07-01T10:00:00Z', size: 10, durationMs: 1, fileName: 'resources/recordings/keep.webm' },
  { id: 'gone', title: 'Gone', createdAt: '2026-07-01T10:00:00Z', size: 10, durationMs: 1, fileName: 'resources/recordings/gone.webm' },
  { id: 'bad', title: 'Escapes', createdAt: '2026-07-01T10:00:00Z', size: 10, durationMs: 1, fileName: '/etc/passwd' },
  { nope: true },
  'garbage',
]));
store.setState({ recordings: [] });
await library.load();
check('surviving entry kept', store.state.recordings.some((r) => r.id === 'keep'));
check('missing file pruned', !store.state.recordings.some((r) => r.id === 'gone'));
check('entry with an out-of-workspace path rejected', !store.state.recordings.some((r) => r.id === 'bad'));
check('non-object junk rejected', store.state.recordings.length === 1, String(store.state.recordings.length));
check('pruned index written back', JSON.parse(storage.get('recordings')).length === 1);

storage.set('recordings', '{not json');
store.setState({ recordings: [{ id: 'x', title: 'x', createdAt: '', size: 1, durationMs: 1, fileName: 'resources/recordings/x.webm' }] });
await library.load();
check('a corrupt index does not throw or clobber state', store.state.recordings.length === 1);

storage.set('recordings', JSON.stringify({ not: 'an array' }));
await library.load();
check('a non-array index is ignored', store.state.recordings.length === 1);

console.log('\nremove');
refs.indexReadable = true; // the corrupt-index tests above quarantined it on purpose
disk.clear();
storage.clear();
disk.set('resources/recordings/r1.webm', 'A');
disk.set('resources/exports/r1.mp4', 'A');
disk.set('resources/transcripts/r1.vtt', 'A');
disk.set('resources/recordings/r2.webm', 'A');
store.setState({
  recordings: [
    { id: 'r1', title: 'One', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/r1.webm', mp4Path: 'resources/exports/r1.mp4', captionPath: 'resources/transcripts/r1.vtt' },
    { id: 'r2', title: 'Two', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/r2.webm' },
  ],
  selectedRecordingId: 'r1',
  selectedRecordingIds: new Set(['r1']),
});
const res1 = await library.remove(['r1']);
check('remove reports one removed', res1.removed === 1 && res1.failed === 0, JSON.stringify(res1));
check('recording file deleted', !disk.has('resources/recordings/r1.webm'));
check('mp4 sidecar deleted', !disk.has('resources/exports/r1.mp4'));
check('caption sidecar deleted', !disk.has('resources/transcripts/r1.vtt'));
check('untouched recording survives', disk.has('resources/recordings/r2.webm'));
check('index pruned', store.state.recordings.length === 1 && store.state.recordings[0].id === 'r2');
check('selection cleared for the deleted row', store.state.selectedRecordingId === '');
check('checkbox set pruned', store.state.selectedRecordingIds.size === 0);
check('index saved after delete', JSON.parse(storage.get('recordings')).length === 1);

console.log('\nremove — a denied delete keeps the row (no orphaned bytes)');
deleteMode = 'denied';
const res2 = await library.remove(['r2']);
deleteMode = 'ok';
check('reports the failure', res2.removed === 0 && res2.failed === 1, JSON.stringify(res2));
check('row is still listed', store.state.recordings.some((r) => r.id === 'r2'));
check('file still on disk', disk.has('resources/recordings/r2.webm'));

console.log('\nremove — an already-missing file still prunes');
disk.delete('resources/recordings/r2.webm');
const res3 = await library.remove(['r2']);
check('pruned despite the failed delete', res3.removed === 1, JSON.stringify(res3));
check('index empty', store.state.recordings.length === 0);

console.log('\nplayer');
refs.indexReadable = true;
disk.set('resources/recordings/p1.webm', 'A');
store.setState({
  recordings: [{ id: 'p1', title: 'P', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/p1.webm' }],
  selectedRecordingId: 'p1',
});
await player.sync(store.state);
check('src bound from files.url', refs.playerEl.src === 'atom-file://resources/recordings/p1.webm', refs.playerEl.src);
const urlCallsAfterFirst = calls.url.length;
await player.sync(store.state);
check('re-syncing the same file does not refetch (playhead survives)', calls.url.length === urlCallsAfterFirst);

store.setState({ selectedRecordingId: '' });
refs.playerEl.setAttribute('src', refs.playerEl.src);
player.stop();
check('stop() clears the bound path', refs.playerPath === '');
await player.sync(store.state);
check('no selection leaves nothing bound', refs.playerPath === '');

store.setState({
  recordings: [{ id: 'ghost', title: 'G', createdAt: '', size: 1, durationMs: 1, fileName: 'resources/recordings/ghost.webm' }],
  selectedRecordingId: 'ghost',
});
await player.sync(store.state);
check('a missing file resets the path so a retry can rebind', refs.playerPath === '');

// ===================== review fixes (T07 round 2) =====================

console.log('\n[fix 4] path validation rejects traversal');
check('plain leaf accepted', isSafeWorkspacePath('resources/recordings/abc.webm', 'resources/recordings'));
check('parent traversal rejected', !isSafeWorkspacePath('resources/recordings/../../etc/passwd', 'resources/recordings'));
check('embedded .. rejected', !isSafeWorkspacePath('resources/recordings/..', 'resources/recordings'));
check('nested path rejected', !isSafeWorkspacePath('resources/recordings/a/b.webm', 'resources/recordings'));
check('absolute path rejected', !isSafeWorkspacePath('/etc/passwd', 'resources/recordings'));
check('prefix-only sibling rejected', !isSafeWorkspacePath('resources/recordingsevil/x.webm', 'resources/recordings'));
check('backslash rejected', !isSafeWorkspacePath('resources/recordings/..\\x.webm', 'resources/recordings'));
check('non-string rejected', !isSafeWorkspacePath(undefined, 'resources/recordings'));
check('isRecordingItem rejects a traversal fileName',
  !isRecordingItem({ id: 'x', fileName: 'resources/recordings/../../etc/passwd' }));
check('isRecordingItem accepts a normal entry',
  isRecordingItem({ id: 'x', fileName: 'resources/recordings/x.webm' }));

console.log('[fix 4] unsafe sidecar paths are stripped on load');
disk.clear(); storage.clear(); refs.indexReadable = true;
disk.set('resources/recordings/s1.webm', 'A');
storage.set('recordings', JSON.stringify([{
  id: 's1', title: 'S', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1,
  fileName: 'resources/recordings/s1.webm',
  mp4Path: 'resources/exports/../../../etc/passwd',
  captionPath: 'resources/transcripts/ok.vtt',
}]));
store.setState({ recordings: [] });
await library.load();
const loaded = store.state.recordings[0];
check('traversing mp4Path stripped', loaded.mp4Path === undefined, String(loaded.mp4Path));
check('valid captionPath kept', loaded.captionPath === 'resources/transcripts/ok.vtt');

console.log('[fix 4] persist refuses an unsafe file name by construction');
let unsafeThrew = null;
try {
  const origUUID = sandbox.crypto.randomUUID;
  sandbox.crypto.randomUUID = () => '../../escape';
  await library.persist({ blob: new FakeBlob(['x'], { type: 'video/webm' }), thumbnail: '', durationMs: 1, mimeType: 'video/webm', extension: 'webm' });
  sandbox.crypto.randomUUID = origUUID;
} catch (e) { unsafeThrew = e; sandbox.crypto.randomUUID = () => `id-${++sandbox.__n}`; }
check('persist throws on an unsafe id', !!unsafeThrew && /unsafe file name/.test(unsafeThrew.message), unsafeThrew && unsafeThrew.message);
check('nothing was written', !calls.write.some((c) => c.path.includes('..')));

console.log('\n[fix 3] load() does not silently discard the library');
// storage failure
disk.clear(); storage.clear(); refs.indexReadable = true;
storageMode = 'denied';
store.setState({ recordings: [], banners: [] });
await library.load();
storageMode = 'ok';
const lastBanner = () => store.state.banners[store.state.banners.length - 1] || null;
check('a denied storage.get raises a banner', !!lastBanner(), JSON.stringify(store.state.banners));
check('banner names Studio Permissions', /Studio Permissions/.test(lastBanner().message), lastBanner().message);
check('index is quarantined', refs.indexReadable === false);
check('save() refuses to overwrite while quarantined', (await library.save()) === false);
check('storage key untouched', !storage.has('recordings'));

// corrupt JSON
refs.indexReadable = true;
storage.set('recordings', '{not json');
store.setState({ recordings: [], banners: [] });
await library.load();
check('corrupt JSON raises a banner', !!lastBanner() && /corrupt/i.test(lastBanner().message), JSON.stringify(store.state.banners));
check('corrupt index quarantined', refs.indexReadable === false);
await settle();
check('a backup of the damaged index was kept', storage.get('recordings.corrupt') === '{not json');
check('save() refuses to clobber the damaged key', (await library.save()) === false);
check('damaged key still intact', storage.get('recordings') === '{not json');

// non-array
refs.indexReadable = true;
storage.set('recordings', JSON.stringify({ not: 'an array' }));
store.setState({ recordings: [], banners: [] });
await library.load();
check('non-array index raises a banner', !!lastBanner());
check('non-array index quarantined', refs.indexReadable === false);

// a first run is not a failure
refs.indexReadable = true;
storage.delete('recordings');
store.setState({ recordings: [], banners: [] });
await library.load();
check('an absent key is a first run, not an error', store.state.banners.length === 0 && refs.indexReadable === true);

console.log('\n[fix 2] remove() keeps the typed reason');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/d1.webm', 'A');
store.setState({
  recordings: [{ id: 'd1', title: 'D', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/d1.webm' }],
  selectedRecordingIds: new Set(), selectedRecordingId: '',
});
deleteMode = 'denied';
const denied = await library.remove(['d1']);
deleteMode = 'ok';
check('failure carries the typed reason', denied.failures[0].reason === 'capability-denied', JSON.stringify(denied.failures));
check('row kept on a denied delete', store.state.recordings.length === 1);
check('explain() turns it into permission copy',
  /Studio Permissions/.test(R.bridge.explain({ reason: denied.failures[0].reason }, 'fallback', { cap: 'Files' })));

console.log('\n[fix 5] a failed sidecar delete does not block the prune');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/x1.webm', 'A');
disk.set('resources/exports/x1.mp4', 'A');
store.setState({
  recordings: [{ id: 'x1', title: 'X', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/x1.webm', mp4Path: 'resources/exports/x1.mp4' }],
  selectedRecordingIds: new Set(), selectedRecordingId: 'x1',
});
deleteMode = 'sidecar-only';
const partial = await library.remove(['x1']);
deleteMode = 'ok';
check('recording pruned even though the sidecar survived', partial.removed === 1 && store.state.recordings.length === 0);
check('orphaned sidecar reported', partial.orphanedSidecars === 1, String(partial.orphanedSidecars));
check('no delete failure recorded for the recording', partial.failed === 0);
check('orphaned mp4 still on disk (reported, not silently lost)', disk.has('resources/exports/x1.mp4'));

console.log('\n[fix 1 — blocker] the <video> reports failures instead of dying silently');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/e1.webm', 'A');
store.setState({
  recordings: [{ id: 'e1', title: 'E', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/e1.webm' }],
  selectedRecordingId: 'e1', selectedRecordingIds: new Set(),
});
await player.sync(store.state);
check('bound to the file', refs.playerPath === 'resources/recordings/e1.webm');

// file still present but unplayable → an error message, entry kept
let toasted = [];
const realToast = R.notices.toast;
R.notices.toast = (kind, msg) => { toasted.push([kind, msg]); };
await refs.playerEl.dispatch('error');
await settle();
check('corrupt-but-present file toasts a specific error', toasted.some(([k, m]) => k === 'danger' && /corrupt|unsupported/i.test(m)), JSON.stringify(toasted));
check('the entry is kept when the file is still there', store.state.recordings.length === 1);

// file gone → pruned from the library
toasted = [];
refs.playerPath = 'resources/recordings/e1.webm';
disk.delete('resources/recordings/e1.webm');
await refs.playerEl.dispatch('error');
await settle();
check('a vanished file warns the user', toasted.some(([k, m]) => k === 'warn' && /no longer on disk/i.test(m)), JSON.stringify(toasted));
check('the dead row is pruned at runtime, not just at boot', store.state.recordings.length === 0);
check('player unbound after the failure', refs.playerPath === '');

// stop() detaching the source must not be reported as a playback failure
toasted = [];
refs.playerPath = '';
await refs.playerEl.dispatch('error');
check('an error with nothing bound is ignored', toasted.length === 0, JSON.stringify(toasted));
R.notices.toast = realToast;

// ===================== review fixes (T07 round 3) =====================

console.log('\n[r3 fix 1] a cosmetically-corrupt entry is repaired, not dropped, and search cannot throw');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/t1.webm', 'A');
disk.set('resources/recordings/t2.webm', 'A');
storage.set('recordings', JSON.stringify([
  { id: 't1', title: 12345, createdAt: '2026-07-01T10:00:00Z', size: 'huge', durationMs: null, fileName: 'resources/recordings/t1.webm', thumbnail: 42, mimeType: 7 },
  { id: 't2', title: '  ', createdAt: 999, size: 5, durationMs: 5, fileName: 'resources/recordings/t2.webm' },
]));
store.setState({ recordings: [], query: '', sortMode: 'recent' });
await library.load();
check('both entries survived', store.state.recordings.length === 2, String(store.state.recordings.length));
const [r1, r2] = store.state.recordings;
check('numeric title repaired to a string', typeof r1.title === 'string' && r1.title.startsWith('Recording '), r1.title);
check('blank title + bad createdAt falls back', r2.title === 'Untitled recording', r2.title);
check('non-numeric size coerced to 0', r1.size === 0, String(r1.size));
check('null durationMs coerced to 0', r1.durationMs === 0, String(r1.durationMs));
check('non-string mimeType coerced', r1.mimeType === '', JSON.stringify(r1.mimeType));
check('non-string thumbnail coerced', r1.thumbnail === '', JSON.stringify(r1.thumbnail));
store.setState({ query: 'rec' });
let searchThrew = null;
try { visibleRecordings(store.state); } catch (e) { searchThrew = e; }
check('the search box no longer throws on a repaired entry', searchThrew === null, searchThrew && searchThrew.message);
store.setState({ sortMode: 'recent' });
let sortThrew = null;
try { visibleRecordings(store.state); } catch (e) { sortThrew = e; }
check('sorting an entry with no parseable date does not throw', sortThrew === null);
store.setState({ query: '' });
check('an entry with no id is still dropped', !isRecordingItem({ fileName: 'resources/recordings/x.webm' }));

console.log('\n[r3 fix 2] an unindexed recording is not announced as finished');
refs.indexReadable = true;
disk.clear(); storage.clear();
store.setState({ recordings: [] });
const okSave = await library.persist({ blob: new FakeBlob(['x'.repeat(32)], { type: 'video/webm' }), thumbnail: '', durationMs: 1000, mimeType: 'video/webm', extension: 'webm' });
check('a healthy save reports indexed: true', okSave.indexed === true);

refs.indexReadable = false; // as if load() had quarantined the index
const quarantinedSave = await library.persist({ blob: new FakeBlob(['y'.repeat(32)], { type: 'video/webm' }), thumbnail: '', durationMs: 2000, mimeType: 'video/webm', extension: 'webm' });
check('the file still reaches disk', disk.has(quarantinedSave.item.fileName));
check('persist reports indexed: false', quarantinedSave.indexed === false);
check('the stored index was not overwritten', JSON.parse(storage.get('recordings')).length === 1);
refs.indexReadable = true;

console.log('\n[r3 fix 3] quarantine() only promises a backup it actually kept');
disk.clear(); storage.clear(); refs.indexReadable = true;
storage.set('recordings', '{bad');
store.setState({ recordings: [], banners: [] });
await library.load();
check('successful backup is claimed', / copy of the damaged index was kept/.test(lastBanner().message), lastBanner().message);
check('the copy really exists', storage.get('recordings.corrupt') === '{bad');

refs.indexReadable = true;
storage.delete('recordings.corrupt');
storage.set('recordings', '{bad');
store.setState({ recordings: [], banners: [] });
storageSetMode = 'denied';
await library.load();
storageSetMode = 'ok';
check('a failed backup is admitted, not claimed', /could not be backed up/.test(lastBanner().message), lastBanner().message);
check('no phantom backup key', !storage.has('recordings.corrupt'));
check('still quarantined', refs.indexReadable === false);

console.log('\n[r3 fix 4] handleError only claims a removal it performs');
refs.indexReadable = true;
disk.clear(); storage.clear();
store.setState({ recordings: [], selectedRecordingId: '', selectedRecordingIds: new Set() });
let seen = [];
const keepToast = R.notices.toast;
R.notices.toast = (kind, msg) => seen.push([kind, msg]);
refs.playerPath = 'resources/recordings/orphan.webm'; // no matching index entry, file absent
await refs.playerEl.dispatch('error');
await settle();
check('no false removal claim when nothing matches', seen.some(([k, m]) => k === 'warn' && /no longer on disk\.$/.test(m)), JSON.stringify(seen));
check('it does not say "removing it from the library"', !seen.some(([, m]) => /removing it from the library/.test(m)), JSON.stringify(seen));
R.notices.toast = keepToast;

// ===================== review fixes (T07 round 4) =====================

console.log('\n[r4 fix 1] a failed file is not re-bound on every render');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/bad.webm', 'A'); // present, but "unplayable"
store.setState({
  recordings: [{ id: 'bad', title: 'Bad', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/bad.webm' }],
  selectedRecordingId: 'bad', selectedRecordingIds: new Set(), playbackError: '',
});
await player.sync(store.state);
check('bound once', refs.playerPath === 'resources/recordings/bad.webm');

let loopToasts = [];
const savedToast = R.notices.toast;
R.notices.toast = (k, m) => loopToasts.push([k, m]);
await refs.playerEl.dispatch('error');
await settle();
check('the failure is recorded in state', store.state.playbackError === 'resources/recordings/bad.webm', store.state.playbackError);
check('one error toast so far', loopToasts.length === 1, String(loopToasts.length));
check('the row is kept (the file is still there)', store.state.recordings.length === 1);

const urlsBefore = calls.url.length;
for (let i = 0; i < 5; i += 1) await player.sync(store.state); // simulate five repaints
check('no re-bind on later renders', calls.url.length === urlsBefore, `${calls.url.length} vs ${urlsBefore}`);
check('no toast storm', loopToasts.length === 1, String(loopToasts.length));
check('player left unbound', refs.playerPath === '');
R.notices.toast = savedToast;

// selecting another recording clears the failure
disk.set('resources/recordings/good.webm', 'A');
store.setState({ recordings: [...store.state.recordings, { id: 'good', title: 'Good', createdAt: '2026-07-02T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/good.webm' }] });
R.__actions ? null : null;
store.setState({ selectedRecordingId: 'good', playbackError: '' }); // what 'select-recording' does
await player.sync(store.state);
check('a different recording binds normally after a failure', refs.playerPath === 'resources/recordings/good.webm');

// retry re-binds the same file
store.setState({ selectedRecordingId: 'bad', playbackError: 'resources/recordings/bad.webm' });
await player.sync(store.state);
check('the bad file stays unbound while flagged', refs.playerPath === '');
store.setState({ playbackError: '' }); // what 'retry-playback' does
await player.sync(store.state);
check('retry re-binds it', refs.playerPath === 'resources/recordings/bad.webm');

console.log('\n[r4 fix 2] a large recording is streamed to disk in chunks');
refs.indexReadable = true;
disk.clear(); storage.clear(); calls.write.length = 0; calls.append.length = 0;
store.setState({ recordings: [], playbackError: '' });

const small = new FakeBlob([Buffer.alloc(1024, 7)], { type: 'video/webm' });
const { item: smallItem } = await library.persist({ blob: small, thumbnail: '', durationMs: 1, mimeType: 'video/webm', extension: 'webm' });
check('a small blob takes a single write', calls.write.length === 1 && calls.append.length === 0);
check('small blob round-trips exactly',
  Buffer.from(disk.get(smallItem.fileName), 'base64').equals(Buffer.alloc(1024, 7)));

calls.write.length = 0; calls.append.length = 0;
const bytes = Buffer.alloc(3 * 1024 * 1024 * 2 + 5000);
for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251; // non-uniform, so a bad splice shows up
const big = new FakeBlob([bytes], { type: 'video/webm' });
const { item: bigItem } = await library.persist({ blob: big, thumbnail: '', durationMs: 1, mimeType: 'video/webm', extension: 'webm' });
check('one write + two appends for a 6MB+ blob', calls.write.length === 1 && calls.append.length === 2,
  `write=${calls.write.length} append=${calls.append.length}`);
check('chunk boundaries are multiples of 3 (no stray base64 padding)',
  !calls.write[0].options || (Buffer.from(disk.get(bigItem.fileName), 'base64').length === bytes.length));
check('the streamed file is byte-identical to the blob',
  Buffer.from(disk.get(bigItem.fileName), 'base64').equals(bytes));
check('append does not pass createParents', calls.append[0].options.createParents === undefined);
check('append uses base64', calls.append[0].options.encoding === 'base64');

console.log('[r4 fix 2] a failed chunk leaves no truncated file');
calls.write.length = 0; calls.append.length = 0; calls.del.length = 0;
appendFailAt = 2; // second append fails
let chunkThrew = null;
try {
  await library.persist({ blob: new FakeBlob([bytes], { type: 'video/webm' }), thumbnail: '', durationMs: 1, mimeType: 'video/webm', extension: 'webm' });
} catch (e) { chunkThrew = e; }
appendFailAt = 0;
check('persist throws when a chunk fails', !!chunkThrew, chunkThrew && chunkThrew.message);
check('the partial file was deleted', calls.del.length === 1, JSON.stringify(calls.del));
check('no truncated recording left on disk', ![...disk.keys()].some((k) => k.startsWith('resources/recordings/') && k !== smallItem.fileName && k !== bigItem.fileName));
check('no phantom index entry', !store.state.recordings.some((r) => r.id !== smallItem.id && r.id !== bigItem.id));

// ===================== review fixes (T07 round 5) =====================

console.log('\n[r5 fix 1] deleting the bound recording does not race the player into a false report');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/live.webm', 'A');
store.setState({
  recordings: [{ id: 'live', title: 'Live', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/live.webm' }],
  selectedRecordingId: 'live', selectedRecordingIds: new Set(['live']), playbackError: '',
});
await player.sync(store.state);
check('the player is bound to the doomed file', refs.playerPath === 'resources/recordings/live.webm');

let raceToasts = [];
const beforeToast = R.notices.toast;
R.notices.toast = (k, m) => raceToasts.push([k, m]);
const del = await library.remove(['live']);
// the browser would now fire `error` on the element whose source vanished
await refs.playerEl.dispatch('error');
await settle();
R.notices.toast = beforeToast;

check('the recording was deleted', del.removed === 1 && !disk.has('resources/recordings/live.webm'));
check('the player was unbound before the delete', refs.playerPath === '');
check('no false "no longer on disk" toast', !raceToasts.some(([, m]) => /no longer on disk/.test(m)), JSON.stringify(raceToasts));
check('no false "removing it from the library" toast', !raceToasts.some(([, m]) => /removing it from the library/.test(m)));
check('the index has no leftover row', store.state.recordings.length === 0);
check('selection cleared', store.state.selectedRecordingId === '');

console.log('[r5 fix 1] forget() clears a playbackError pointing at the removed file');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/pe.webm', 'A');
store.setState({
  recordings: [{ id: 'pe', title: 'PE', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/pe.webm' }],
  selectedRecordingId: 'pe', selectedRecordingIds: new Set(['pe']),
  playbackError: 'resources/recordings/pe.webm',
});
await library.remove(['pe']);
check('stale playbackError cleared with its row', store.state.playbackError === '', store.state.playbackError);

console.log('\n[r5 fix 2] the error-salvage toast admits an unindexed save');
refs.indexReadable = true;
disk.clear(); storage.clear();
store.setState({ recordings: [], playbackError: '' });

// Drive recorder.finalize() through its salvage path with a quarantined index.
let finalToasts = [];
const keep2 = R.notices.toast;
R.notices.toast = (k, m) => finalToasts.push([k, m]);

const fakeRecorder = { mimeType: 'video/webm', state: 'inactive' };
refs.mediaRecorder = fakeRecorder;
refs.chunks = [Buffer.alloc(64, 3)];
refs.clock = { startedAt: 0, pausedAt: 0, totalPausedMs: 0, timerId: null };
store.setState({ timerMs: 5000 });
refs.indexReadable = false;                       // quarantined
await R.recorder.finalize({ reason: 'Recording stopped unexpectedly' });
await settle();
R.notices.toast = keep2;
refs.indexReadable = true;

const salvage = finalToasts.find(([, m]) => /saved the/.test(m));
check('the salvage toast fired', !!salvage, JSON.stringify(finalToasts));
// ffprobe's 12.5s overrides the 5s clock, which is exactly the normalization T07 exists for.
check('it names the salvaged duration', salvage && /saved the \d\d:\d\d recorded so far/.test(salvage[1]), salvage && salvage[1]);
check('the duration is ffprobe-normalized, not the raw clock', salvage && /saved the 00:12/.test(salvage[1]), salvage && salvage[1]);
check('it admits the take will not be listed', salvage && /will not be listed after a reload/.test(salvage[1]), salvage && salvage[1]);

// and the healthy salvage path stays clean
refs.indexReadable = true;
disk.clear(); storage.clear();
store.setState({ recordings: [], timerMs: 4000 });
finalToasts = [];
R.notices.toast = (k, m) => finalToasts.push([k, m]);
refs.mediaRecorder = { mimeType: 'video/webm', state: 'inactive' };
refs.chunks = [Buffer.alloc(64, 3)];
refs.clock = { startedAt: 0, pausedAt: 0, totalPausedMs: 0, timerId: null };
await R.recorder.finalize({ reason: 'Recording stopped unexpectedly' });
await settle();
R.notices.toast = keep2;
const clean = finalToasts.find(([, m]) => /saved the/.test(m));
check('a healthy salvage does not add the caveat', clean && !/will not be listed/.test(clean[1]), clean && clean[1]);

// ===================== review fixes (T07 round 6) =====================

console.log('\n[r6] load() writes back a cleaned index, so junk does not recur every boot');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/k1.webm', 'A');
storage.set('recordings', JSON.stringify([
  { id: 'k1', title: 55, createdAt: '2026-07-01T10:00:00Z', size: '3', durationMs: 1, fileName: 'resources/recordings/k1.webm', mp4Path: 'resources/exports/../evil' },
  { junk: true },
  'garbage',
]));
store.setState({ recordings: [] });

let boot1 = [];
const t0 = R.notices.toast;
R.notices.toast = (k, m) => boot1.push([k, m]);
await library.load();
R.notices.toast = t0;
check('first boot warns about the junk', boot1.some(([k, m]) => k === 'warn' && /unreadable library/.test(m)), JSON.stringify(boot1));
check('the cleaned index was written back', JSON.parse(storage.get('recordings')).length === 1);
check('the repaired title was persisted', typeof JSON.parse(storage.get('recordings'))[0].title === 'string');
check('the unsafe sidecar was persisted away', JSON.parse(storage.get('recordings'))[0].mp4Path === undefined);
check('the coerced size was persisted', JSON.parse(storage.get('recordings'))[0].size === 3);

// second boot from the now-clean key
store.setState({ recordings: [] });
let boot2 = [];
R.notices.toast = (k, m) => boot2.push([k, m]);
await library.load();
R.notices.toast = t0;
check('second boot is silent — no recurring warning', boot2.length === 0, JSON.stringify(boot2));
check('the entry still loads', store.state.recordings.length === 1);

// a clean index is not rewritten needlessly
const writesBefore = storage.get('recordings');
store.setState({ recordings: [] });
await library.load();
check('a clean index round-trips unchanged', storage.get('recordings') === writesBefore);

// ===================== review fixes (T07 round 7) =====================

console.log('\n[r7 fix A] a FileReader failure mid-stream cleans up the truncated file');
refs.indexReadable = true;
disk.clear(); storage.clear();
calls.write.length = 0; calls.append.length = 0; calls.del.length = 0;
store.setState({ recordings: [], playbackError: '' });

const streamBytes = Buffer.alloc(3 * 1024 * 1024 * 2 + 100, 9);
readerCalls = 0; readerFailAt = 2;   // first slice encodes, second slice throws
let readerThrew = null;
try {
  await library.persist({ blob: new FakeBlob([streamBytes], { type: 'video/webm' }), thumbnail: '', durationMs: 1, mimeType: 'video/webm', extension: 'webm' });
} catch (e) { readerThrew = e; }
readerFailAt = 0; readerCalls = 0;

check('persist propagates the encode failure', !!readerThrew, readerThrew && readerThrew.message);
check('the first chunk had been written', calls.write.length === 1);
check('the truncated file was deleted', calls.del.length === 1, JSON.stringify(calls.del));
check('no recording left on disk', ![...disk.keys()].some((k) => k.startsWith('resources/recordings/')));
check('no index entry was created', store.state.recordings.length === 0);

console.log('[r7 fix A] a failure on the very first chunk leaves nothing to clean');
disk.clear(); calls.write.length = 0; calls.append.length = 0; calls.del.length = 0;
readerCalls = 0; readerFailAt = 1;   // the first slice throws
let firstThrew = null;
try {
  await library.persist({ blob: new FakeBlob([streamBytes], { type: 'video/webm' }), thumbnail: '', durationMs: 1, mimeType: 'video/webm', extension: 'webm' });
} catch (e) { firstThrew = e; }
readerFailAt = 0; readerCalls = 0;
check('persist still throws', !!firstThrew);
check('nothing was written', calls.write.length === 0);
check('no pointless delete of a file that never existed', calls.del.length === 0, JSON.stringify(calls.del));

console.log('\n[r7 fix B] "repaired" is field-based, not key-order-based');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/ko.webm', 'A');

// Same values as persist() writes, but a deliberately different key order.
const shuffled = {
  fileName: 'resources/recordings/ko.webm',
  thumbnail: '',
  size: 10,
  mimeType: 'video/webm',
  durationMs: 1000,
  createdAt: '2026-07-01T10:00:00Z',
  title: 'Reordered',
  id: 'ko',
};
storage.set('recordings', JSON.stringify([shuffled]));
store.setState({ recordings: [] });

const storedBefore = storage.get('recordings');
let reorderToasts = [];
const tk = R.notices.toast;
R.notices.toast = (k, m) => reorderToasts.push([k, m]);
await library.load();
R.notices.toast = tk;

check('the reordered entry loads', store.state.recordings.length === 1 && store.state.recordings[0].id === 'ko');
check('key order alone does not trigger a rewrite', storage.get('recordings') === storedBefore);
check('and no toast', reorderToasts.length === 0, JSON.stringify(reorderToasts));

// a genuinely bad field still counts as repaired
storage.set('recordings', JSON.stringify([{ ...shuffled, size: 'ten' }]));
store.setState({ recordings: [] });
await library.load();
check('a bad field still rewrites', JSON.parse(storage.get('recordings'))[0].size === 0);

// ===================== review fixes (T07 round 8) =====================

console.log('\n[r8] a failing files.url() does not retry-and-toast on every render');
refs.indexReadable = true;
disk.clear(); storage.clear();
// index entry present, file absent → files.url() returns { ok:false }
store.setState({
  recordings: [{ id: 'u1', title: 'U', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/u1.webm' }],
  selectedRecordingId: 'u1', selectedRecordingIds: new Set(), playbackError: '', playbackErrorText: '',
});
let urlToasts = [];
const urlToast = R.notices.toast;
R.notices.toast = (k, m) => urlToasts.push([k, m]);
await player.sync(store.state);
const urlCalls1 = calls.url.length;
check('the failure is flagged in state', store.state.playbackError === 'resources/recordings/u1.webm', store.state.playbackError);
check('and carries a specific message', !!store.state.playbackErrorText, store.state.playbackErrorText);
check('one toast', urlToasts.length === 1, JSON.stringify(urlToasts));

for (let i = 0; i < 5; i += 1) await player.sync(store.state);
check('no further files.url calls', calls.url.length === urlCalls1, `${calls.url.length} vs ${urlCalls1}`);
check('no toast storm', urlToasts.length === 1, String(urlToasts.length));
R.notices.toast = urlToast;

store.setState({ playbackError: '', playbackErrorText: '' }); // retry-playback
disk.set('resources/recordings/u1.webm', 'A');
await player.sync(store.state);
check('retry binds once the file is back', refs.playerPath === 'resources/recordings/u1.webm');

console.log('\n[r8] width/height are repaired like every other rendered field');
refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/d1.webm', 'A');
storage.set('recordings', JSON.stringify([
  { id: 'd1', title: 'D', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/d1.webm', width: '1920', height: 1080.4 },
]));
store.setState({ recordings: [] });
await library.load();
const dims = store.state.recordings[0];
check('string width coerced to a number', dims.width === 1920 && typeof dims.width === 'number', JSON.stringify(dims.width));
check('fractional height rounded', dims.height === 1080, String(dims.height));
check('the repair was persisted', JSON.parse(storage.get('recordings'))[0].width === 1920);

refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/d2.webm', 'A');
storage.set('recordings', JSON.stringify([
  { id: 'd2', title: 'D2', createdAt: '2026-07-01T10:00:00Z', size: 1, durationMs: 1, fileName: 'resources/recordings/d2.webm', width: 'wide', height: -5 },
]));
store.setState({ recordings: [] });
await library.load();
const bad = store.state.recordings[0];
check('a nonsense width is dropped, not printed', bad.width === undefined, JSON.stringify(bad.width));
check('a negative height is dropped', bad.height === undefined, JSON.stringify(bad.height));
check('the entry itself survives', bad.id === 'd2');

refs.indexReadable = true;
disk.clear(); storage.clear();
disk.set('resources/recordings/d3.webm', 'A');
const clean3 = { id: 'd3', title: 'D3', createdAt: '2026-07-01T10:00:00Z', durationMs: 1, size: 1, mimeType: 'video/webm', thumbnail: '', fileName: 'resources/recordings/d3.webm', width: 1280, height: 720 };
storage.set('recordings', JSON.stringify([clean3]));
const before3 = storage.get('recordings');
store.setState({ recordings: [] });
await library.load();
check('valid dimensions do not trigger a rewrite', storage.get('recordings') === before3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
