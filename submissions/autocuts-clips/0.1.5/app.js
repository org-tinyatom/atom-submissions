const ta = window.tinyAtom;

const CLIP_MIN_SEC = 45;
const CLIP_MAX_SEC = 120;
const VIDEO_FILTERS = [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv'] }];
const STAGE_LABELS = {
  imported: 'Imported',
  transcribing: 'Transcribing',
  suggesting: 'Awaiting clips',
  reviewing: 'Reviewing',
  done: 'Done',
};
const STATUS_LABELS = { valid: 'Valid', flagged: 'Flagged', invalid: 'Invalid' };
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const state = {
  ready: false,
  setupError: null,
  atomMeta: null,
  view: 'home',
  index: [],
  corrupted: [],
  project: null,
  segments: null,
  segmentsError: null,
  busy: null,
  error: null,
  notice: null,
  confirmRemoveId: null,
  confirmRerun: false,
  polling: null,
  editClipId: null,
  editDraft: null,
  previewClipId: null,
  playRange: null,
  sourceUrl: null,
  sourceUrlError: null,
  sourceUrlLoading: false,
  clipPlayback: null,
  sourceViaBlob: false,
  cleanupFlow: null,
};

/* ---------- utilities ---------- */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function fmtDate(ts) {
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '';
}

function baseOf(path) {
  return path.split('/').pop();
}

function stderrTail(text) {
  const t = String(text ?? '').trim();
  return t.length > 500 ? `…${t.slice(-500)}` : t;
}

function failText(result, what) {
  const reason = result && result.reason;
  const stderr = result && result.stderr ? `\nDetails: ${stderrTail(result.stderr)}` : '';
  switch (reason) {
    case 'capability-denied':
      return `${what} was blocked because a permission is missing. Open the Studio Permissions tab, make sure this atom's capabilities are granted, then retry.`;
    case 'runtime-missing':
      return `${what} needs a runtime that is not installed yet. Open the Studio Runtime tab, install the missing runtime (FFmpeg, FFprobe, or Whisper), then retry.`;
    case 'runtime-error':
      return `${what} failed inside the host tool. Please retry.${stderr}`;
    case 'invalid-request':
      return `${what} was rejected as an invalid request. This looks like an app bug — please report it.${stderr}`;
    case 'unsupported':
      return `${what} is not supported by this TinyAtom version.`;
    default:
      return `${what} failed${reason ? ` (${reason})` : ''}. Please retry.${stderr}`;
  }
}

function setError(message) {
  state.error = message;
  state.notice = null;
}

function setNotice(message) {
  state.notice = message;
}

/* ---------- database (storage bridge) ---------- */

const INDEX_KEY = 'projects:index';
const projectKey = (id) => `project:${id}`;

function parseJson(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // present but corrupted
  }
}

async function dbRead(key) {
  const res = await ta.storage.get(key);
  if (!res.ok) throw new Error(failText(res, 'Reading app data'));
  return parseJson(res.value);
}

async function dbWrite(key, obj) {
  const res = await ta.storage.set(key, JSON.stringify(obj));
  if (!res.ok) throw new Error(failText(res, 'Saving app data'));
}

async function loadIndex() {
  const parsed = await dbRead(INDEX_KEY);
  state.index = Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === 'string') : [];
  state.index.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function indexSummary(p) {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    stage: p.stage,
    durationSec: p.source?.durationSec ?? null,
    clipTotal: (p.suggestions || []).filter((c) => !c.discarded).length,
    clipExported: (p.suggestions || []).filter((c) => c.export).length,
  };
}

async function saveProject(p) {
  p.updatedAt = Date.now();
  await dbWrite(projectKey(p.id), p);
  const i = state.index.findIndex((e) => e.id === p.id);
  const summary = indexSummary(p);
  if (i >= 0) state.index[i] = summary;
  else state.index.unshift(summary);
  state.index.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  await dbWrite(INDEX_KEY, state.index);
}

async function removeProjectRecord(id) {
  await ta.storage.remove(projectKey(id));
  state.index = state.index.filter((e) => e.id !== id);
  state.corrupted = state.corrupted.filter((c) => c !== id);
  await dbWrite(INDEX_KEY, state.index);
}

/* ---------- transcript handling ---------- */

function normalizeSegments(data) {
  let rows = null;
  if (Array.isArray(data)) rows = data;
  else if (data && Array.isArray(data.segments)) rows = data.segments;
  else if (data && Array.isArray(data.transcription)) rows = data.transcription;
  if (!rows) return [];
  const out = [];
  for (const row of rows) {
    if (!row) continue;
    let start = null;
    let end = null;
    if (Number.isFinite(row.start) && Number.isFinite(row.end)) {
      start = row.start;
      end = row.end;
    } else if (row.offsets && Number.isFinite(row.offsets.from) && Number.isFinite(row.offsets.to)) {
      start = row.offsets.from / 1000;
      end = row.offsets.to / 1000;
    } else if (Number.isFinite(row.startMs) && Number.isFinite(row.endMs)) {
      start = row.startMs / 1000;
      end = row.endMs / 1000;
    }
    const text = String(row.text ?? '').trim();
    if (start === null || end === null || end <= start || text === '') continue;
    out.push({ start, end, text });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

async function loadSegmentsForProject(p) {
  state.segments = null;
  state.segmentsError = null;
  if (!p.transcript) return;
  if (Array.isArray(p.transcript.inlineSegments) && p.transcript.inlineSegments.length > 0) {
    state.segments = p.transcript.inlineSegments;
    return;
  }
  if (!p.transcript.path) {
    state.segmentsError = 'The transcript location is missing from this project. Re-run transcription.';
    return;
  }
  const res = await ta.files.readText(p.transcript.path);
  if (!res.ok) {
    state.segmentsError = failText(res, 'Reading the transcript file');
    return;
  }
  const parsed = parseJson(res.content);
  const segments = normalizeSegments(parsed);
  if (segments.length === 0) {
    state.segmentsError = 'The transcript file could not be parsed into timestamped segments. Re-run transcription.';
    return;
  }
  state.segments = segments;
}

/* ---------- agent handshake ---------- */

function clipsJsonPath(p) {
  return `projects/${p.id}/clips.json`;
}

function agentPrompt(p) {
  const transcriptName = p.transcript?.path ? baseOf(p.transcript.path) : 'the Whisper transcript JSON file';
  const dur = Number.isFinite(p.source.durationSec) ? Math.floor(p.source.durationSec) : null;
  return [
    'You are picking the best short-form clips from a transcribed long video.',
    '',
    `Work inside the Autocuts project folder (projects/${p.id}/ in this atom's artifact workspace). If your current folder already contains "${transcriptName}", you are in the right place.`,
    '',
    `1. Read "${transcriptName}" — a Whisper JSON transcript with timestamps (offsets are milliseconds).`,
    '2. Choose the strongest self-contained moments for vertical social clips: a hook, a payoff, quotable lines.',
    '3. Write your picks to "clips.json" in the same folder, overwriting any existing file.',
    '',
    'clips.json must be a JSON array, best clip first, shaped exactly like:',
    '[',
    '  { "title": "Short punchy title", "start": 123.4, "end": 195.0, "reason": "Why this works as a clip" }',
    ']',
    '',
    'Rules:',
    '- "start" and "end" are seconds from the start of the video (decimals allowed).',
    `- Each clip must run 45 to 120 seconds.${dur ? ` The video is ${dur} seconds long; stay within it.` : ''}`,
    '- Clips must not overlap. 3 to 8 clips is ideal.',
    '- Start and end on sentence boundaries from the transcript whenever possible.',
    '- Output strict JSON only — no comments, no trailing commas. Do not modify any other files.',
  ].join('\n');
}

async function copyAgentPrompt() {
  const p = state.project;
  if (!p) return;
  const res = await ta.clipboard.writeText(agentPrompt(p));
  if (!res.ok) setError(failText(res, 'Copying the prompt'));
  else setNotice('Prompt copied. Paste it into the agent terminal and let the agent write clips.json.');
  render();
}

async function openTerminalForProject(p) {
  let projectPath = p.hostProject && (p.hostProject.path || p.hostProject.projectPath || p.hostProject.dir);
  if (!projectPath) {
    const listed = await ta.projects.list().catch(() => null);
    if (listed && listed.ok && Array.isArray(listed.projects)) {
      const found = listed.projects.find((x) => x && x.id === p.id);
      if (found) {
        p.hostProject = found;
        projectPath = found.path || found.projectPath || found.dir || null;
        saveProject(p).catch(() => {});
      }
    }
  }
  return projectPath
    ? ta.terminal.requestOpen({ projectPath })
    : ta.terminal.requestOpen();
}

async function openAgentTerminal() {
  const p = state.project;
  if (!p) return;
  const res = await openTerminalForProject(p);
  if (!res.ok) {
    setError(failText(res, 'Opening the agent terminal'));
    render();
  }
}

async function autoStartHandshake(p) {
  if (state.project?.id !== p.id) return;
  const copy = await ta.clipboard.writeText(agentPrompt(p)).catch(() => ({ ok: false }));
  const term = await openTerminalForProject(p).catch(() => ({ ok: false }));
  if (copy.ok && term.ok) {
    setNotice('Transcript ready. The terminal is open and the clip-finding prompt is on your clipboard — paste it to the agent to start.');
  } else if (copy.ok) {
    setNotice('Transcript ready and the clip-finding prompt is on your clipboard. Open the terminal and paste it to the agent.');
  } else {
    setNotice('Transcript ready. Use "Copy agent prompt" and paste it to the agent in the terminal.');
  }
}

/* ---------- suggestion validation (FR4: never silently altered) ---------- */

function classifyRange(start, end, durationSec) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { status: 'invalid', statusReason: 'start/end are missing or not numbers' };
  }
  if (start < 0 || (Number.isFinite(durationSec) && durationSec > 0 && end > durationSec + 0.5)) {
    return { status: 'invalid', statusReason: 'outside the video bounds' };
  }
  if (end <= start) {
    return { status: 'invalid', statusReason: 'end is not after start' };
  }
  const d = end - start;
  if (d < CLIP_MIN_SEC) return { status: 'flagged', statusReason: `${Math.round(d)}s — shorter than the 45s target` };
  if (d > CLIP_MAX_SEC) return { status: 'flagged', statusReason: `${Math.round(d)}s — longer than the 120s target` };
  return { status: 'valid', statusReason: '' };
}

function classifySuggestion(raw, durationSec, idx) {
  const start = Number(raw?.start);
  const end = Number(raw?.end);
  const { status, statusReason } = classifyRange(start, end, durationSec);
  return {
    id: `c${idx + 1}-${Date.now().toString(36)}`,
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : `Clip ${idx + 1}`,
    reason: typeof raw?.reason === 'string' ? raw.reason.trim() : '',
    start: Number.isFinite(start) ? start : 0,
    end: Number.isFinite(end) ? end : 0,
    origStart: Number.isFinite(start) ? start : null,
    origEnd: Number.isFinite(end) ? end : null,
    status,
    statusReason,
    discarded: false,
    edited: false,
    export: null,
  };
}

function reclassifyClip(clip, durationSec) {
  const { status, statusReason } = classifyRange(clip.start, clip.end, durationSec);
  clip.status = status;
  clip.statusReason = statusReason;
}

async function acceptClipsJson(p, arr) {
  const clips = arr.map((raw, i) => classifySuggestion(raw, p.source.durationSec, i));
  if (clips.length === 0) return false;
  p.suggestions = clips;
  p.stage = 'reviewing';
  await saveProject(p);
  return true;
}

/* ---------- polling engine ---------- */

function stopPolling() {
  if (state.polling?.timer) clearInterval(state.polling.timer);
  state.polling = null;
}

function startSuggestionPolling(baseline) {
  stopPolling();
  state.polling = {
    startedAt: Date.now(),
    lastCheckedAt: null,
    paused: false,
    statusText: null,
    baseline: typeof baseline === 'string' ? baseline : null,
    inFlight: false,
    timer: setInterval(() => pollOnce(false), POLL_INTERVAL_MS),
  };
  pollOnce(false);
}

async function pollOnce(force) {
  const p = state.project;
  const pol = state.polling;
  if (!p || p.stage !== 'suggesting' || !pol) {
    stopPolling();
    return;
  }
  if ((pol.paused && !force) || pol.inFlight) return;
  pol.inFlight = true;
  try {
    pol.lastCheckedAt = Date.now();
    const res = await ta.files.readText(clipsJsonPath(p));
    if (res.ok) {
      if (pol.baseline !== null && res.content === pol.baseline) {
        pol.statusText = 'clips.json has not been rewritten yet.';
      } else {
        const parsed = parseJson(res.content);
        if (parsed === undefined) {
          pol.statusText = 'clips.json exists but is not valid JSON yet — the agent may still be writing it.';
        } else if (!Array.isArray(parsed)) {
          pol.statusText = 'clips.json is valid JSON but must be an array of clips.';
        } else if (parsed.length === 0) {
          pol.statusText = 'clips.json is an empty list — waiting for the agent to add clips.';
          pol.baseline = res.content;
        } else {
          const ok = await acceptClipsJson(p, parsed);
          if (ok) {
            stopPolling();
            setNotice(`Loaded ${p.suggestions.length} suggested clips from the agent.`);
            render();
            return;
          }
        }
      }
    } else if (res.reason === 'capability-denied') {
      stopPolling();
      setError(failText(res, 'Checking for clips.json'));
      render();
      return;
    } else {
      pol.statusText = null;
    }
    if (!pol.paused && Date.now() - pol.startedAt > POLL_TIMEOUT_MS) {
      pol.paused = true;
      render();
      return;
    }
    updatePollStatus();
  } catch (err) {
    pol.statusText = `Polling hit an unexpected error: ${err?.message || err}`;
    updatePollStatus();
  } finally {
    pol.inFlight = false;
  }
}

function pollStatusHtml() {
  const pol = state.polling;
  if (!pol) return 'Checking is stopped.';
  if (pol.paused) return 'Still waiting after 10 minutes. The agent may need more time — resume checking, or cancel.';
  const ago = pol.lastCheckedAt ? Math.max(0, Math.round((Date.now() - pol.lastCheckedAt) / 1000)) : null;
  const base = `Waiting for clips.json${ago !== null ? ` — last checked ${ago}s ago` : ''}.`;
  return pol.statusText ? `${base}\n${pol.statusText}` : base;
}

function updatePollStatus() {
  const node = document.getElementById('poll-status');
  if (node) node.textContent = pollStatusHtml();
}

/* ---------- review, trim, playback ---------- */

function findClip(id) {
  return (state.project?.suggestions || []).find((c) => c.id === id) || null;
}

function segmentBoundaries() {
  const points = new Set();
  for (const seg of state.segments || []) {
    points.add(Math.round(seg.start * 10) / 10);
    points.add(Math.round(seg.end * 10) / 10);
  }
  return [...points].sort((a, b) => a - b);
}

function snapBoundary(value, dir) {
  const points = segmentBoundaries();
  if (points.length === 0) return value;
  if (dir === 'prev') {
    const prev = points.filter((b) => b < value - 0.05);
    return prev.length ? prev[prev.length - 1] : value;
  }
  const next = points.find((b) => b > value + 0.05);
  return next !== undefined ? next : value;
}

function captionTextInRange(start, end) {
  const parts = (state.segments || [])
    .filter((seg) => seg.end > start && seg.start < end)
    .map((seg) => seg.text);
  return parts.join(' ');
}

async function ensureSourceUrl(p) {
  if (state.sourceUrl || state.sourceUrlError || state.sourceUrlLoading) return;
  state.sourceUrlLoading = true;
  try {
    const res = await ta.files.url(p.source.fullPath);
    console.log('[autocuts] files.url result', p.source.fullPath, res);
    if (res.ok && typeof res.url === 'string' && res.url !== '') {
      state.sourceUrl = res.url;
    } else {
      state.sourceUrlError = failText(res, 'Loading the video player');
    }
  } catch (err) {
    state.sourceUrlError = `Loading the video player failed unexpectedly: ${err?.message || err}`;
  } finally {
    state.sourceUrlLoading = false;
  }
  render();
}

async function openSourceExternally() {
  const p = state.project;
  if (!p) return;
  const res = await ta.files.open(p.source.fullPath);
  if (!res.ok) {
    setError(failText(res, 'Opening the video in the system player'));
    render();
  }
}

/* ---------- blob playback fallback (protocol-vs-file diagnostic) ---------- */

// The host refuses files.read above 10 MB, so larger media can never be blob-played.
const BLOB_MAX_BYTES = 10 * 1024 * 1024;
const blobUrls = new Map();
const blobAttempted = new Set();

function releaseBlobUrls() {
  for (const url of blobUrls.values()) URL.revokeObjectURL(url);
  blobUrls.clear();
  blobAttempted.clear();
}

async function loadBlobUrl(path, label) {
  if (blobUrls.has(path)) return { ok: true, url: blobUrls.get(path) };
  const stat = await ta.files.stat(path).catch(() => null);
  const size = stat?.ok && Number.isFinite(stat.file?.size) ? stat.file.size : null;
  if (size !== null && size > BLOB_MAX_BYTES) {
    return { ok: false, error: `${label} is ${Math.round(size / (1024 * 1024))} MB — larger than the host lets an atom read directly, so in-app playback needs the artifact protocol. Use Open in the system player for now.` };
  }
  const res = await ta.files.read(path, { encoding: 'base64' });
  if (!res.ok) return { ok: false, error: failText(res, `Reading ${label} directly`) };
  const bin = atob(res.content);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  blobUrls.set(path, url);
  return { ok: true, url };
}

async function tryBlobFallback(path, clipPlayback) {
  console.log('[autocuts] blob fallback: reading', path);
  try {
    const res = await loadBlobUrl(path, clipPlayback ? `Exported clip ${clipPlayback.name}` : 'The source video');
    if (!res.ok) {
      console.log('[autocuts] blob fallback: read failed', path, res.error);
      if (!clipPlayback) state.sourceUrlError = `Direct-read playback could not start: ${res.error}`;
      setError(`Direct-read playback could not start: ${res.error}`);
      render();
      return;
    }
    console.log('[autocuts] blob fallback: playing blob copy of', path);
    setNotice('The tinyatom-artifact:// URL failed, so the player is using a direct-read (blob) copy. If this plays, the file is fine and the artifact protocol delivery is what is broken.');
    if (clipPlayback) {
      state.clipPlayback = { ...clipPlayback, url: res.url, viaBlob: true };
      state.playRange = { start: 0, end: Number.MAX_SAFE_INTEGER };
    } else {
      state.sourceUrl = res.url;
      state.sourceUrlError = null;
      state.sourceViaBlob = true;
    }
  } catch (err) {
    console.log('[autocuts] blob fallback: unexpected failure', path, err?.message || err);
    if (!clipPlayback) state.sourceUrlError = `Direct-read playback failed unexpectedly: ${err?.message || err}`;
    setError(`Direct-read playback failed unexpectedly: ${err?.message || err}`);
  }
  render();
}

function updateEditMeta() {
  const draft = state.editDraft;
  const p = state.project;
  if (!draft || !p) return;
  const { status, statusReason } = classifyRange(draft.start, draft.end, p.source.durationSec);
  const durNode = document.getElementById('edit-duration');
  if (durNode) {
    const d = draft.end - draft.start;
    const label = Number.isFinite(d) && d > 0 ? `${Math.round(d)}s` : '—';
    durNode.textContent = status === 'valid'
      ? `${label} — within the 45–120s target`
      : `${label} — ${statusReason || 'adjust the range'}`;
    durNode.className = `edit-duration ${status}`;
  }
  const capNode = document.getElementById('edit-captions');
  if (capNode) {
    const text = captionTextInRange(draft.start, draft.end);
    capNode.textContent = text || 'No transcript text falls inside this range.';
  }
  const startNode = document.getElementById('edit-start');
  const endNode = document.getElementById('edit-end');
  if (startNode && document.activeElement !== startNode) startNode.value = draft.start.toFixed(1);
  if (endNode && document.activeElement !== endNode) endNode.value = draft.end.toFixed(1);
  const startLabel = document.getElementById('edit-start-label');
  const endLabel = document.getElementById('edit-end-label');
  if (startLabel) startLabel.textContent = fmtDuration(draft.start);
  if (endLabel) endLabel.textContent = fmtDuration(draft.end);
}

async function saveTrim() {
  const p = state.project;
  const clip = findClip(state.editClipId);
  const draft = state.editDraft;
  if (!p || !clip || !draft) return;
  clip.start = draft.start;
  clip.end = draft.end;
  clip.edited = clip.start !== clip.origStart || clip.end !== clip.origEnd;
  reclassifyClip(clip, p.source.durationSec);
  state.editClipId = null;
  state.editDraft = null;
  try {
    await saveProject(p);
  } catch (err) {
    setError(err.message);
  }
  render();
}

async function toggleDiscard(id) {
  const p = state.project;
  const clip = findClip(id);
  if (!p || !clip) return;
  clip.discarded = !clip.discarded;
  if (clip.discarded && state.previewClipId === id) {
    state.previewClipId = null;
    state.clipPlayback = null;
    state.playRange = null;
  }
  try {
    await saveProject(p);
  } catch (err) {
    setError(err.message);
  }
  render();
}

async function rerunSuggestions() {
  const p = state.project;
  if (!p) return;
  state.confirmRerun = false;
  let baseline = null;
  const existing = await ta.files.readText(clipsJsonPath(p)).catch(() => null);
  if (existing && existing.ok) baseline = existing.content;
  p.stage = 'suggesting';
  try {
    await saveProject(p);
  } catch (err) {
    setError(err.message);
    render();
    return;
  }
  startSuggestionPolling(baseline);
  await autoStartHandshake(p).catch(() => {});
  render();
}

/* ---------- export (cut + 9:16 crop + burned captions) ---------- */

const CAPTION_MAX_CHARS = 22;

function sanitizeCaption(text) {
  return String(text)
    .replace(/\\/g, ' ')
    .replace(/'/g, '’')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\.\.+/g, '…')
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function captionChunks(clip) {
  const chunks = [];
  for (const seg of state.segments || []) {
    if (seg.end <= clip.start || seg.start >= clip.end) continue;
    const text = sanitizeCaption(seg.text);
    if (!text) continue;
    const words = text.split(/\s+/);
    const groups = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > CAPTION_MAX_CHARS && current) {
        groups.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) groups.push(current);
    const localStart = Math.max(seg.start, clip.start) - clip.start;
    const localEnd = Math.min(seg.end, clip.end) - clip.start;
    const span = Math.max(0.3, localEnd - localStart);
    const totalChars = groups.reduce((acc, g) => acc + g.length, 0) || 1;
    let t = localStart;
    for (const group of groups) {
      const d = span * (group.length / totalChars);
      chunks.push({ start: t, end: Math.min(t + d, localEnd), text: group });
      t += d;
    }
  }
  return chunks;
}

function captionFilters(clip) {
  return captionChunks(clip).map((c) =>
    `drawtext=expansion=none:text='${c.text}':enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'`
    + `:fontsize=62:fontcolor=white:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-460`);
}

function exportableClips(p) {
  return (p.suggestions || []).filter((c) => !c.discarded && c.status !== 'invalid');
}

async function runClipExport(p, clip, withCaptions) {
  const index = p.suggestions.indexOf(clip) + 1;
  const outName = `clip-${index}.mp4`;
  const duration = clip.end - clip.start;
  const filters = ['scale=1080:1920:force_original_aspect_ratio=increase', 'crop=1080:1920'];
  const runOnce = (vfFilters) => ta.media.runFfmpeg({
    cwd: `projects/${p.id}`,
    args: [
      '-ss', clip.start.toFixed(3), '-i', p.source.fileName, '-t', duration.toFixed(3),
      '-vf', vfFilters.join(','),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '160k',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outName,
    ],
    timeoutMs: 300000,
  });
  const caps = withCaptions ? captionFilters(clip) : [];
  let captioned = caps.length > 0;
  let captionsDropped = false;
  let res = await runOnce(captioned ? [...filters, ...caps] : filters);
  if (!res.ok && res.reason === 'invalid-request' && captioned) {
    res = await runOnce(filters);
    if (res.ok) {
      captioned = false;
      captionsDropped = true;
    }
  }
  if (!res.ok) return { ok: false, error: failText(res, `Exporting "${clip.title}"`) };
  if (res.exitCode !== 0) {
    const stderr = res.stderr || '';
    return {
      ok: false,
      fontIssue: captioned && /font|fontconfig|fontselect|fontfile/i.test(stderr),
      error: `FFmpeg exit code ${res.exitCode}. ${stderrTail(stderr)}`,
    };
  }
  clip.export = { path: `projects/${p.id}/${outName}`, name: outName, exportedAt: Date.now(), captions: captioned };
  return { ok: true, captionsDropped };
}

const exportErrors = new Map();

async function exportClips(clipIds, withCaptions = true) {
  const p = state.project;
  if (!p) return;
  await withBusy('Exporting…', async () => {
    const failures = [];
    const droppedCaptions = [];
    let exported = 0;
    let fontIssue = false;
    let i = 0;
    for (const id of clipIds) {
      const clip = findClip(id);
      if (!clip || clip.discarded || clip.status === 'invalid') continue;
      i += 1;
      state.busy = `Exporting clip ${i} of ${clipIds.length}: ${clip.title}…`;
      render();
      const result = await runClipExport(p, clip, withCaptions);
      if (result.ok) {
        exported += 1;
        exportErrors.delete(clip.id);
        if (result.captionsDropped) droppedCaptions.push(clip.title);
        await saveProject(p);
      } else {
        failures.push(`${clip.title}: ${result.error}`);
        exportErrors.set(clip.id, result);
        if (result.fontIssue) fontIssue = true;
      }
    }
    const captionNote = droppedCaptions.length
      ? `\n\nCaptions were skipped on: ${droppedCaptions.join(', ')} — the host rejected the caption filter as too large for its media argument limit. These clips exported without captions; if the host limit is raised, re-export to get captions back.`
      : '';
    if (failures.length === 0 && exported > 0) {
      setNotice(`Exported ${exported} clip${exported === 1 ? '' : 's'}.${captionNote}`);
    } else if (failures.length > 0) {
      let message = `${exported} exported, ${failures.length} failed.\n${failures.join('\n')}${captionNote}`;
      if (fontIssue) {
        message += '\n\nThe failure looks font-related: this FFmpeg build may not resolve a caption font. Use "Export without captions" on the failed clip, or install a fontconfig-capable FFmpeg runtime.';
      }
      setError(message);
    }
  });
}

async function playExportedClip(id) {
  const clip = findClip(id);
  if (!clip?.export) return;
  const res = await ta.files.url(clip.export.path);
  if (!res.ok) {
    setError(failText(res, 'Loading the exported clip'));
  } else {
    state.clipPlayback = { id: clip.id, url: res.url, name: clip.export.name, title: clip.title, path: clip.export.path };
    state.previewClipId = clip.id;
    state.playRange = { start: 0, end: Number.MAX_SAFE_INTEGER };
  }
  render();
}

/* ---------- full project deletion (records + assisted file cleanup) ---------- */

function cleanupPrompt(id, name) {
  return [
    `Delete all files inside the folder projects/${id}/ — it belongs to the deleted Autocuts project "${name}".`,
    'Remove every file and subfolder inside it, but do not remove or touch anything outside this folder.',
    'When you are done the folder should be empty.',
  ].join('\n');
}

function stopCleanupTimer() {
  if (state.cleanupFlow?.timer) clearInterval(state.cleanupFlow.timer);
  if (state.cleanupFlow) state.cleanupFlow.timer = null;
}

async function checkCleanup(manual) {
  const flow = state.cleanupFlow;
  if (!flow || flow.done || flow.skipped) return;
  if (flow.paused && !manual) return;
  const res = await ta.files.list(`projects/${flow.id}`);
  if (res.ok && Array.isArray(res.files) && res.files.length === 0) {
    flow.done = true;
  } else if (!res.ok && res.reason !== 'capability-denied') {
    flow.done = true; // folder is gone or no longer listable
  }
  if (flow.done) {
    stopCleanupTimer();
    setNotice(`Project "${flow.name}" is fully deleted — records and files.`);
    state.cleanupFlow = null;
    render();
    return;
  }
  if (!flow.paused && Date.now() - flow.startedAt > POLL_TIMEOUT_MS) {
    flow.paused = true;
    render();
    return;
  }
  const node = document.getElementById('cleanup-status');
  if (node) node.textContent = 'The project folder still has files. Ask the agent to delete them, or delete them in Finder, then Check again.';
}

async function deleteProjectFully(id) {
  await withBusy('Deleting project records…', async () => {
    const entry = state.index.find((e) => e.id === id);
    let name = entry ? entry.name : id;
    let projectPath = null;
    if (state.project && state.project.id === id) {
      name = state.project.name;
      projectPath = state.project.hostProject
        && (state.project.hostProject.path || state.project.hostProject.projectPath || state.project.hostProject.dir);
    } else {
      const record = await dbRead(projectKey(id)).catch(() => null);
      if (record && typeof record === 'object') {
        name = record.name || name;
        projectPath = record.hostProject
          && (record.hostProject.path || record.hostProject.projectPath || record.hostProject.dir);
      }
    }
    await removeProjectRecord(id);
    stopPolling();
    stopCleanupTimer();
    state.confirmRemoveId = null;
    state.project = null;
    state.view = 'home';
    state.cleanupFlow = {
      id,
      name,
      projectPath: projectPath || null,
      startedAt: Date.now(),
      paused: false,
      done: false,
      skipped: false,
      timer: setInterval(() => checkCleanup(false), POLL_INTERVAL_MS),
    };
  });
}

async function copyCleanupPrompt() {
  const flow = state.cleanupFlow;
  if (!flow) return;
  const res = await ta.clipboard.writeText(cleanupPrompt(flow.id, flow.name));
  setNotice(res.ok ? 'Cleanup prompt copied — paste it to the agent in the terminal.' : failText(res, 'Copying the cleanup prompt'));
  render();
}

async function openCleanupTerminal() {
  const flow = state.cleanupFlow;
  if (!flow) return;
  const res = flow.projectPath
    ? await ta.terminal.requestOpen({ projectPath: flow.projectPath })
    : await ta.terminal.requestOpen();
  if (!res.ok) {
    setError(failText(res, 'Opening the terminal'));
    render();
  }
}

async function revealCleanupFolder() {
  const flow = state.cleanupFlow;
  if (!flow) return;
  let res = await ta.files.reveal(`projects/${flow.id}`);
  if (!res.ok) {
    const paths = await listDirPaths(`projects/${flow.id}`);
    if (paths.length > 0) res = await ta.files.reveal(paths[0]);
  }
  if (!res.ok) {
    setError(failText(res, 'Revealing the project folder'));
    render();
  }
}

function skipCleanup() {
  const flow = state.cleanupFlow;
  if (!flow) return;
  stopCleanupTimer();
  state.cleanupFlow = null;
  setNotice(`Project "${flow.name}" was removed from the library, but its files remain in projects/${flow.id}/. Delete them any time via Finder or an agent.`);
  render();
}

/* ---------- actions ---------- */

async function withBusy(label, fn) {
  if (state.busy) return;
  state.busy = label;
  state.error = null;
  render();
  try {
    await fn();
  } catch (err) {
    setError(err && err.message ? err.message : String(err));
  } finally {
    state.busy = null;
    render();
  }
}

function newProjectId() {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

const VIDEO_EXT = /\.(mp4|mov|webm|mkv)$/i;

async function listDirPaths(dir) {
  const listed = await ta.files.list(dir).catch(() => null);
  if (!listed || !listed.ok || !Array.isArray(listed.files)) return [];
  return listed.files
    .map((f) => (typeof f === 'string' ? f : f?.path || f?.name))
    .filter((v) => typeof v === 'string' && v !== '')
    .map((v) => (v.includes('/') ? v : `${dir}/${v}`));
}

async function findSourceOnDisk(p) {
  const paths = [
    ...(await listDirPaths(`projects/${p.id}`)),
    ...(await listDirPaths(`projects/${p.id}/source`)),
  ].filter((v) => VIDEO_EXT.test(v));
  if (paths.length === 0) return null;
  return paths.find((v) => v === p.source.fullPath)
    || paths.find((v) => baseOf(v) === p.source.fileName)
    || paths[0];
}

async function runProbe(fullPath) {
  return ta.media.runFfprobe({
    cwd: dirOf(fullPath),
    args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', baseOf(fullPath)],
    timeoutMs: 60000,
  });
}

async function probeSource(p) {
  let probe = await runProbe(p.source.fullPath);
  if (!probe.ok || probe.exitCode !== 0) {
    const actualPath = await findSourceOnDisk(p);
    if (actualPath && actualPath !== p.source.fullPath) {
      p.source.fullPath = actualPath;
      p.source.fileName = baseOf(actualPath);
      probe = await runProbe(actualPath);
    }
  }
  if (!probe.ok || probe.exitCode !== 0) {
    p.source.probed = false;
    p.source.probeError = probe.ok
      ? `FFprobe exited with code ${probe.exitCode}. ${stderrTail(probe.stderr)} (looked for ${p.source.fullPath})`
      : `${failText(probe, 'Inspecting the video')}\n(command: ffprobe … ${p.source.fullPath})`;
    return;
  }
  const info = parseJson(probe.stdout);
  const streams = Array.isArray(info?.streams) ? info.streams : [];
  const video = streams.find((s) => s.codec_type === 'video');
  p.source.durationSec = Number.parseFloat(info?.format?.duration) || null;
  p.source.width = video?.width ?? null;
  p.source.height = video?.height ?? null;
  p.source.hasAudio = streams.some((s) => s.codec_type === 'audio');
  p.source.probed = true;
  p.source.probeError = null;
}

async function createProject() {
  await withBusy('Creating project and importing video…', async () => {
    const id = newProjectId();
    const created = await ta.projects.create(id, 'Autocuts project');
    if (!created.ok) throw new Error(failText(created, 'Creating the project folder'));
    const hostProject = created.project || null;

    const imported = await ta.files.importFile({
      destinationDir: `projects/${id}`,
      filters: VIDEO_FILTERS,
    });
    if (!imported.ok) {
      if (imported.reason && imported.reason !== 'runtime-error') {
        throw new Error(failText(imported, 'Importing the video'));
      }
      setNotice('Video import was cancelled or failed, so no project was created.');
      return;
    }

    const fileName = imported.file?.name || 'source.mp4';
    const baseName = fileName.replace(/\.[^.]+$/, '') || 'Untitled video';
    const hostPath = typeof imported.file?.path === 'string' && imported.file.path.startsWith('projects/')
      ? imported.file.path
      : null;
    const now = Date.now();
    const project = {
      id,
      name: baseName,
      createdAt: now,
      updatedAt: now,
      stage: 'imported',
      source: {
        fileName,
        fullPath: hostPath || `projects/${id}/${fileName}`,
        durationSec: null,
        width: null,
        height: null,
        hasAudio: null,
        probed: false,
        probeError: null,
      },
      transcript: null,
      suggestions: [],
      cleanup: null,
      hostProject,
    };

    await probeSource(project);
    await saveProject(project);
    state.project = project;
    state.segments = null;
    state.segmentsError = null;
    state.view = 'project';
  });
}

async function openProject(id) {
  await withBusy('Opening project…', async () => {
    const parsed = await dbRead(projectKey(id));
    if (parsed === null || parsed === undefined || typeof parsed.id !== 'string') {
      if (!state.corrupted.includes(id)) state.corrupted.push(id);
      throw new Error('This project record is missing or unreadable. You can remove it from the library.');
    }
    const p = parsed;
    if (p.stage === 'transcribing') {
      p.stage = 'imported';
      setNotice('Transcription was interrupted before it finished. Start it again when ready.');
      await saveProject(p);
    }
    stopPolling();
    state.project = p;
    state.confirmRemoveId = null;
    state.confirmRerun = false;
    state.editClipId = null;
    state.editDraft = null;
    state.previewClipId = null;
    state.playRange = null;
    state.sourceUrl = null;
    state.sourceUrlError = null;
    state.sourceUrlLoading = false;
    state.clipPlayback = null;
    state.sourceViaBlob = false;
    releaseBlobUrls();
    exportErrors.clear();
    await loadSegmentsForProject(p);
    state.view = 'project';
    if (p.stage === 'suggesting') startSuggestionPolling(null);
  });
}

function goHome() {
  stopPolling();
  state.view = 'home';
  state.project = null;
  state.segments = null;
  state.segmentsError = null;
  state.error = null;
  state.notice = null;
  state.confirmRemoveId = null;
  state.confirmRerun = false;
  state.editClipId = null;
  state.editDraft = null;
  state.previewClipId = null;
  state.playRange = null;
  state.sourceUrl = null;
  state.sourceUrlError = null;
  state.sourceUrlLoading = false;
  state.clipPlayback = null;
  state.sourceViaBlob = false;
  releaseBlobUrls();
  render();
}

async function retryProbe() {
  const p = state.project;
  if (!p) return;
  await withBusy('Inspecting the video…', async () => {
    await probeSource(p);
    await saveProject(p);
  });
}

async function renameProject(newName) {
  const p = state.project;
  if (!p) return;
  const name = newName.trim();
  if (name === '' || name === p.name) return;
  p.name = name;
  try {
    await saveProject(p);
  } catch (err) {
    setError(err.message);
  }
  render();
}

async function startTranscription() {
  const p = state.project;
  if (!p || p.stage !== 'imported') return;
  if (p.source.hasAudio === false) {
    setError('This video has no audio track, so it cannot be transcribed or clipped by speech.');
    render();
    return;
  }

  await withBusy('Extracting audio and transcribing — long videos can take several minutes…', async () => {
    p.stage = 'transcribing';
    await saveProject(p);
    try {
      const sourceDir = dirOf(p.source.fullPath);
      if (sourceDir !== `projects/${p.id}`) {
        throw new Error('This project uses an older storage layout. Remove it from the library and create it again by re-importing the video.');
      }
      const extract = await ta.media.runFfmpeg({
        cwd: sourceDir,
        args: ['-i', p.source.fileName, '-vn', '-ac', '1', '-ar', '16000', '-y', 'audio.wav'],
        timeoutMs: 600000,
      });
      if (!extract.ok || extract.exitCode !== 0) {
        throw new Error(extract.ok
          ? `Audio extraction failed (FFmpeg exit code ${extract.exitCode}). ${stderrTail(extract.stderr)}`
          : failText(extract, 'Extracting audio'));
      }

      const tr = await ta.speech.transcribe({
        path: `projects/${p.id}/audio.wav`,
        format: 'json',
        timeoutMs: 3600000,
      });
      if (!tr.ok) throw new Error(failText(tr, 'Transcribing the audio'));

      let segments = normalizeSegments(tr.segments);
      if (segments.length === 0) segments = normalizeSegments(parseJson(tr.text));
      if (segments.length === 0) {
        throw new Error('Transcription finished but produced no timestamped segments. The audio may be silent or unsupported.');
      }

      p.transcript = {
        path: tr.outputPath || null,
        segmentCount: segments.length,
        inlineSegments: tr.outputPath ? null : segments,
      };
      p.stage = 'suggesting';
      await saveProject(p);
      state.segments = segments;
      state.segmentsError = null;
      startSuggestionPolling(null);
      await autoStartHandshake(p);
    } catch (err) {
      p.stage = 'imported';
      await saveProject(p).catch(() => {});
      throw err;
    }
  });
}


/* ---------- rendering ---------- */

function bannerHtml() {
  let html = '';
  if (state.error) {
    html += `<div class="banner error"><div class="text">${esc(state.error)}</div><button class="small ghost" data-action="dismiss-error">Dismiss</button></div>`;
  }
  if (state.notice) {
    html += `<div class="banner notice"><div class="text">${esc(state.notice)}</div><button class="small ghost" data-action="dismiss-notice">Dismiss</button></div>`;
  }
  if (state.busy) {
    html += `<div class="busy"><div class="spinner"></div><div>${esc(state.busy)}</div></div>`;
  }
  return html;
}

function stageChip(stage) {
  return `<span class="chip stage-${esc(stage)}">${esc(STAGE_LABELS[stage] || stage)}</span>`;
}

function topbarHtml(backButton) {
  const version = state.atomMeta ? `v${state.atomMeta.version}` : '';
  return `
    <div class="topbar">
      ${backButton ? '<button class="small" data-action="back-home">&larr; Library</button>' : ''}
      <div class="brand">Autocuts <span>Clips</span></div>
      <div class="meta">${esc(version)}</div>
      <div class="spacer"></div>
      ${backButton ? '' : `<button class="primary" data-action="new-project" ${state.busy ? 'disabled' : ''}>New Project</button>`}
    </div>`;
}

const STAGE_RAIL = [
  { key: 'imported', label: 'Import' },
  { key: 'transcribing', label: 'Transcribe' },
  { key: 'suggesting', label: 'Suggest' },
  { key: 'reviewing', label: 'Review' },
  { key: 'done', label: 'Export' },
];

function stageRailHtml(p) {
  const activeIdx = STAGE_RAIL.findIndex((s) => s.key === p.stage);
  const cells = STAGE_RAIL.map((s, i) => {
    const cls = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'todo';
    return `<div class="stage-cell ${cls}"><span class="no">${String(i + 1).padStart(2, '0')}</span><span class="lbl">${s.label}</span></div>`;
  }).join('');
  return `<div class="stage-rail" role="list" aria-label="Pipeline stage">${cells}</div>`;
}

function renderSetup() {
  return `
    <div class="setup">
      <h1>Autocuts Clips needs setup</h1>
      <p>${esc(state.setupError || '')}</p>
      <ul>
        <li>Grant this atom's capabilities in the Studio <strong>Permissions</strong> tab (terminal, clipboard, filesystem, storage, projects, media, speech).</li>
        <li>Install the runtimes in the Studio <strong>Runtime</strong> tab: FFmpeg, FFprobe, Whisper CLI, and the Whisper model.</li>
      </ul>
      <button class="primary" data-action="reload">Reload</button>
    </div>`;
}

function renderHome() {
  const cards = [];
  let reel = 0;
  for (const entry of state.index) {
    if (state.corrupted.includes(entry.id)) continue;
    reel += 1;
    const clips = entry.clipTotal > 0 ? ` &middot; ${entry.clipTotal} clips (${entry.clipExported} exported)` : '';
    cards.push(`
      <div class="project-card" data-action="open-project" data-id="${esc(entry.id)}" role="button" tabindex="0">
        <div class="reel-no">${String(reel).padStart(2, '0')}</div>
        <div class="info">
          <div class="name">${esc(entry.name)}</div>
          <div class="sub">${esc(fmtDate(entry.createdAt))} &middot; ${esc(fmtDuration(entry.durationSec))}${clips}</div>
        </div>
        ${stageChip(entry.stage)}
      </div>`);
  }
  for (const id of state.corrupted) {
    const entry = state.index.find((e) => e.id === id);
    cards.push(`
      <div class="project-card corrupted">
        <div class="info">
          <div class="name">${esc(entry ? entry.name : id)}</div>
          <div class="sub">This project record is unreadable.</div>
        </div>
        <button class="small danger" data-action="remove-project" data-id="${esc(id)}">Remove</button>
      </div>`);
  }

  const body = cards.length > 0
    ? `<div class="project-list">${cards.join('')}</div>`
    : `<div class="empty-state">
         <h2>No projects yet</h2>
         <p>Import a long video and Autocuts will transcribe it, help an agent find the best 45&ndash;120s moments, and export vertical captioned clips.</p>
         <p><button class="primary" data-action="new-project" ${state.busy ? 'disabled' : ''}>Create your first project</button></p>
       </div>`;

  return `${topbarHtml(false)}${bannerHtml()}${cleanupPanelHtml()}${body}<div class="footer">All processing happens locally on this machine.</div>`;
}

function cleanupPanelHtml() {
  const flow = state.cleanupFlow;
  if (!flow) return '';
  const status = flow.paused
    ? 'Still waiting after 10 minutes — resume checking when the files are gone.'
    : 'The project folder still has files. Ask the agent to delete them, or delete them in Finder.';
  return `
    <div class="panel">
      <h3>Finish deleting “${esc(flow.name)}”</h3>
      <p>The project is out of the library. Its media files are still in <code>projects/${esc(flow.id)}/</code> — delete them with the agent or manually.</p>
      <div class="stage-actions">
        <button class="primary" data-action="cleanup-copy">Copy cleanup prompt</button>
        <button data-action="cleanup-terminal">Open terminal</button>
        <button data-action="cleanup-reveal">Reveal folder in Finder</button>
      </div>
      <div class="poll-status" id="cleanup-status">${esc(status)}</div>
      <div class="stage-actions">
        ${flow.paused
          ? '<button class="primary small" data-action="cleanup-resume">Resume checking</button>'
          : '<button class="small" data-action="cleanup-check">Check again</button>'}
        <button class="small ghost" data-action="cleanup-skip">Skip — keep the files</button>
      </div>
    </div>`;
}

function metaCardHtml(p) {
  const s = p.source;
  const resolution = s.width && s.height ? `${s.width}&times;${s.height}` : '—';
  const audio = s.hasAudio === null ? '—' : (s.hasAudio ? 'Yes' : 'No audio track');
  const probePanel = !s.probed ? `
    <div class="banner error" style="margin-top:0.9rem">
      <div class="text">The video could not be inspected.${s.probeError ? `\n${esc(s.probeError)}` : ''}</div>
      <button class="small" data-action="retry-probe" ${state.busy ? 'disabled' : ''}>Retry</button>
    </div>` : '';
  return `
    <div class="panel">
      <h3>Source video</h3>
      <div class="meta-grid">
        <div class="cell"><div class="label">File</div><div class="value">${esc(s.fileName)}</div></div>
        <div class="cell"><div class="label">Duration</div><div class="value">${esc(fmtDuration(s.durationSec))}</div></div>
        <div class="cell"><div class="label">Resolution</div><div class="value">${resolution}</div></div>
        <div class="cell"><div class="label">Audio</div><div class="value">${audio}</div></div>
      </div>
      ${probePanel}
    </div>`;
}

function transcriptPanelHtml(p) {
  if (state.segmentsError) {
    return `<div class="panel"><h3>Transcript</h3><div class="banner error" style="margin:0"><div class="text">${esc(state.segmentsError)}</div></div></div>`;
  }
  if (!state.segments) return '';
  const LIMIT = 400;
  const rows = state.segments.slice(0, LIMIT).map((seg) => `
    <div class="seg">
      <div class="ts">${esc(fmtDuration(seg.start))}</div>
      <div class="tx">${esc(seg.text)}</div>
    </div>`).join('');
  const more = state.segments.length > LIMIT
    ? `<div class="more">&hellip;and ${state.segments.length - LIMIT} more segments</div>`
    : '';
  return `
    <div class="panel">
      <h3>Transcript &middot; ${state.segments.length} segments</h3>
      <div class="transcript">${rows}${more}</div>
    </div>`;
}

function stagePanelHtml(p) {
  if (p.stage === 'imported') {
    const blocked = p.source.hasAudio === false;
    return `
      <div class="panel">
        <h3>Step 1 — Transcribe</h3>
        <p>Autocuts extracts the audio and transcribes it locally with Whisper (timestamps included). The transcript is what the clip-finding agent works from.</p>
        ${blocked ? '<p><strong>This video has no audio track, so it cannot be transcribed.</strong></p>' : ''}
        <div class="stage-actions">
          <button class="primary" data-action="transcribe" ${state.busy || blocked || !p.source.probed ? 'disabled' : ''}>Transcribe video</button>
        </div>
      </div>`;
  }
  if (p.stage === 'transcribing') {
    return `
      <div class="panel">
        <h3>Transcribing&hellip;</h3>
        <p>Extracting audio and running Whisper. Long videos can take several minutes — keep this window open.</p>
      </div>`;
  }
  if (p.stage === 'suggesting') {
    const pol = state.polling;
    const controls = [];
    if (pol && pol.paused) {
      controls.push('<button class="primary" data-action="poll-resume">Resume checking</button>');
    } else if (pol) {
      controls.push('<button class="small" data-action="poll-check-now">Check now</button>');
      controls.push('<button class="small ghost" data-action="poll-cancel">Stop checking</button>');
    } else {
      controls.push('<button class="primary" data-action="poll-start">Start checking for clips.json</button>');
    }
    if ((p.suggestions || []).length > 0) {
      controls.push('<button class="small ghost" data-action="back-to-review">Back to review (keep current clips)</button>');
    }
    return `
      <div class="panel">
        <h3>Step 2 — Let an agent pick the clips</h3>
        <ol class="steps">
          <li>When the transcript finished, the prompt was copied to your clipboard and the terminal opened automatically. (The buttons below redo either step.)</li>
          <li>Paste the prompt to your agent in the terminal — if it opened as a plain shell, start your agent first (for example <code>claude</code>). The agent reads the transcript and writes <code>clips.json</code> into the project folder.</li>
          <li>Autocuts picks the file up automatically and moves to review.</li>
        </ol>
        <div class="stage-actions">
          <button class="primary" data-action="copy-prompt" ${state.busy ? 'disabled' : ''}>Copy agent prompt</button>
          <button data-action="open-terminal" ${state.busy ? 'disabled' : ''}>Open terminal</button>
        </div>
        <div class="poll-status" id="poll-status">${esc(pollStatusHtml())}</div>
        <div class="stage-actions">${controls.join('')}</div>
      </div>`;
  }
  if (p.stage === 'reviewing') {
    return reviewPanelHtml(p);
  }
  if (p.stage === 'done') {
    return donePanelHtml(p);
  }
  return '';
}

function clipStatusChip(clip) {
  if (clip.export) return '<span class="chip status-valid">Exported</span>';
  const label = STATUS_LABELS[clip.status] || clip.status;
  return `<span class="chip status-${esc(clip.status)}" title="${esc(clip.statusReason)}">${esc(label)}</span>`;
}

function trimEditorHtml(clip) {
  const draft = state.editDraft || { start: clip.start, end: clip.end };
  return `
    <div class="trim-editor">
      <div class="trim-row">
        <span class="trim-label">Start</span>
        <button class="small" data-action="snap" data-which="start" data-dir="prev" title="Snap to previous sentence">&#8676;</button>
        <button class="small" data-action="nudge" data-which="start" data-amt="-0.1">&minus;0.1s</button>
        <input id="edit-start" type="number" step="0.1" min="0" value="${draft.start.toFixed(1)}" />
        <button class="small" data-action="nudge" data-which="start" data-amt="0.1">+0.1s</button>
        <button class="small" data-action="snap" data-which="start" data-dir="next" title="Snap to next sentence">&#8677;</button>
        <span class="trim-time" id="edit-start-label">${esc(fmtDuration(draft.start))}</span>
      </div>
      <div class="trim-row">
        <span class="trim-label">End</span>
        <button class="small" data-action="snap" data-which="end" data-dir="prev" title="Snap to previous sentence">&#8676;</button>
        <button class="small" data-action="nudge" data-which="end" data-amt="-0.1">&minus;0.1s</button>
        <input id="edit-end" type="number" step="0.1" min="0" value="${draft.end.toFixed(1)}" />
        <button class="small" data-action="nudge" data-which="end" data-amt="0.1">+0.1s</button>
        <button class="small" data-action="snap" data-which="end" data-dir="next" title="Snap to next sentence">&#8677;</button>
        <span class="trim-time" id="edit-end-label">${esc(fmtDuration(draft.end))}</span>
      </div>
      <div class="edit-duration" id="edit-duration"></div>
      <div class="trim-captions" id="edit-captions"></div>
      <div class="stage-actions">
        <button class="primary small" data-action="trim-save">Save trim</button>
        <button class="small ghost" data-action="trim-cancel">Cancel</button>
      </div>
    </div>`;
}

function clipTcHtml(clip) {
  const no = state.project ? state.project.suggestions.indexOf(clip) + 1 : 0;
  const duration = Math.round(clip.end - clip.start);
  return `
    <div class="clip-tc">
      ${no > 0 ? `<span class="clip-no">CLIP ${String(no).padStart(2, '0')}</span>` : ''}
      <div class="tc-cell"><span>In</span>${esc(fmtDuration(clip.start))}</div>
      <div class="tc-cell"><span>Out</span>${esc(fmtDuration(clip.end))}</div>
      <div class="tc-cell dur"><span>Dur</span>${duration}s</div>
    </div>`;
}

function clipCardHtml(clip) {
  const editing = state.editClipId === clip.id;
  const disabled = state.busy ? 'disabled' : '';
  const exportFailure = exportErrors.get(clip.id);
  const actions = clip.discarded
    ? `<button class="small" data-action="restore-clip" data-id="${esc(clip.id)}" ${disabled}>Restore</button>`
    : [
        `<button class="small" data-action="trim-clip" data-id="${esc(clip.id)}" ${disabled}>Trim</button>`,
        `<button class="small primary" data-action="export-clip" data-id="${esc(clip.id)}" ${clip.status === 'invalid' ? 'disabled' : disabled}>${clip.export ? 'Re-export' : 'Export'}</button>`,
        exportFailure?.fontIssue
          ? `<button class="small" data-action="export-clip-nocap" data-id="${esc(clip.id)}" ${disabled}>Export without captions</button>`
          : '',
        `<button class="small ghost" data-action="discard-clip" data-id="${esc(clip.id)}" ${disabled}>Discard</button>`,
      ].join('');
  const exportedRow = clip.export
    ? `<div class="clip-exported">
         <span class="chip status-valid chip-file">${esc(clip.export.name)}${clip.export.captions ? '' : ' (no captions)'}</span>
         <button class="small" data-action="play-clip" data-id="${esc(clip.id)}" ${disabled}>Play</button>
         <button class="small" data-action="open-clip" data-id="${esc(clip.id)}" ${disabled}>Open</button>
         <button class="small" data-action="reveal-clip" data-id="${esc(clip.id)}" ${disabled}>Reveal</button>
       </div>`
    : '';
  return `
    <div class="clip-card ${clip.discarded ? 'discarded' : ''} ${clip.status}">
      ${clipPreviewHtml(clip, 'preview-clip')}
      <div class="clip-body">
        ${clipTcHtml(clip)}
        <div class="clip-head">
          <div class="clip-title">${esc(clip.title)}${clip.edited ? ' <span class="edited-mark">(trimmed)</span>' : ''}</div>
          ${clipStatusChip(clip)}
        </div>
        ${clip.statusReason ? `<div class="clip-status-reason">${esc(clip.statusReason)}</div>` : ''}
        ${clip.reason ? `<div class="clip-reason">${esc(clip.reason)}</div>` : ''}
        <div class="clip-actions">${actions}</div>
        ${exportedRow}
        ${editing ? trimEditorHtml(clip) : ''}
      </div>
    </div>`;
}

function clipPreviewHtml(clip, playAction) {
  if (state.previewClipId === clip.id && !clip.discarded) {
    const playingExport = state.clipPlayback && state.clipPlayback.id === clip.id;
    const src = playingExport ? state.clipPlayback.url : state.sourceUrl;
    if (src) {
      const viaBlob = playingExport ? state.clipPlayback.viaBlob : state.sourceViaBlob;
      return `
        <div class="clip-preview">
          <video id="player" src="${esc(src)}" controls playsinline preload="metadata"></video>
          <div class="preview-note">${playingExport ? 'exported clip' : 'source, cropped like the export'}${viaBlob ? ' · direct read' : ''}</div>
        </div>`;
    }
    if (state.sourceUrlError && !playingExport) {
      return `
        <div class="clip-preview">
          <div class="preview-error">${esc(state.sourceUrlError)}</div>
          <button class="small" data-action="player-retry">Retry</button>
        </div>`;
    }
    return '<div class="clip-preview"><div class="preview-note">Loading&hellip;</div></div>';
  }
  const disabled = state.busy || clip.discarded || (playAction === 'preview-clip' && clip.status === 'invalid');
  return `
    <div class="clip-preview">
      <button class="clip-preview-ph" data-action="${playAction}" data-id="${esc(clip.id)}" ${disabled ? 'disabled' : ''}>
        <span class="ph-glyph">&#9654;</span>
        <span class="ph-label">${playAction === 'play-clip' ? 'Play' : 'Preview'}</span>
      </button>
    </div>`;
}

function reviewPanelHtml(p) {
  const clips = p.suggestions || [];
  const active = clips.filter((c) => !c.discarded);
  const discarded = clips.filter((c) => c.discarded);
  const exportable = exportableClips(p);
  const exportedCount = clips.filter((c) => c.export).length;
  const rerunBlock = state.confirmRerun
    ? `<div class="inline-confirm">
         <span>Re-running replaces the current suggestions (your trims will be lost) once the agent rewrites clips.json. Continue?</span>
         <button class="small danger" data-action="rerun-confirm">Re-run</button>
         <button class="small ghost" data-action="rerun-cancel">Cancel</button>
       </div>`
    : `<button class="small ghost" data-action="rerun" ${state.busy ? 'disabled' : ''}>Re-run suggestions</button>`;
  return `
    <div class="panel">
      <h3>Step 3 — Review and export</h3>
      <div class="clip-list">
        ${active.map(clipCardHtml).join('') || '<p>No active clips. Restore a discarded clip or re-run suggestions.</p>'}
      </div>
      ${discarded.length ? `<h3 class="discarded-head">Discarded</h3><div class="clip-list">${discarded.map(clipCardHtml).join('')}</div>` : ''}
      <div class="stage-actions">
        <button class="primary" data-action="export-approved" ${state.busy || exportable.length === 0 ? 'disabled' : ''}>Export ${exportable.length} approved clip${exportable.length === 1 ? '' : 's'}</button>
        ${exportedCount > 0 ? `<button data-action="view-done" ${state.busy ? 'disabled' : ''}>View exported (${exportedCount})</button>` : ''}
        ${rerunBlock}
        <button class="small ghost" data-action="open-source" ${state.busy ? 'disabled' : ''}>Open source in system player</button>
      </div>
    </div>`;
}

function donePanelHtml(p) {
  const exported = (p.suggestions || []).filter((c) => c.export);
  const rows = exported.map((clip) => `
    <div class="clip-card valid">
      ${clipPreviewHtml(clip, 'play-clip')}
      <div class="clip-body">
        ${clipTcHtml(clip)}
        <div class="clip-head">
          <div class="clip-title">${esc(clip.title)}</div>
          <span class="chip status-valid chip-file">${esc(clip.export.name)}${clip.export.captions ? '' : ' (no captions)'}</span>
        </div>
        <div class="clip-spec">1080&times;1920 &middot; H.264/AAC${clip.export.captions ? ' &middot; captions burned in' : ''}</div>
        <div class="clip-actions">
          <button class="small" data-action="open-clip" data-id="${esc(clip.id)}" ${state.busy ? 'disabled' : ''}>Open</button>
          <button class="small" data-action="reveal-clip" data-id="${esc(clip.id)}" ${state.busy ? 'disabled' : ''}>Reveal in Finder</button>
        </div>
      </div>
    </div>`).join('');
  return `
    <div class="panel">
      <h3>Exported clips</h3>
      <div class="clip-list">${rows || '<p>No clips exported yet.</p>'}</div>
      <div class="stage-actions">
        <button data-action="back-to-review" ${state.busy ? 'disabled' : ''}>Back to review</button>
      </div>
    </div>`;
}

function renderProject() {
  const p = state.project;
  if (!p) return renderHome();
  const removing = state.confirmRemoveId === p.id;
  const removeBlock = removing
    ? `<div class="inline-confirm">
         <span>Delete this project? Its records are removed immediately, then Autocuts helps you delete the media files (agent or Finder).</span>
         <button class="small danger" data-action="remove-project-confirm" data-id="${esc(p.id)}">Delete project</button>
         <button class="small ghost" data-action="remove-project-cancel">Cancel</button>
       </div>`
    : `<div class="stage-actions"><button class="small danger" data-action="remove-project" data-id="${esc(p.id)}" ${state.busy ? 'disabled' : ''}>Delete project</button></div>`;

  return `
    ${topbarHtml(true)}
    ${bannerHtml()}
    <div class="project-head">
      <input class="name-input" id="project-name" type="text" value="${esc(p.name)}" aria-label="Project name" />
    </div>
    ${stageRailHtml(p)}
    ${metaCardHtml(p)}
    ${stagePanelHtml(p)}
    ${transcriptPanelHtml(p)}
    ${removeBlock}
  `;
}

function render() {
  const app = document.getElementById('app');
  if (!state.ready) {
    app.innerHTML = state.setupError ? renderSetup() : '';
    return;
  }
  app.innerHTML = state.view === 'project' ? renderProject() : renderHome();

  const nameInput = document.getElementById('project-name');
  if (nameInput) {
    nameInput.addEventListener('change', (e) => renameProject(e.target.value));
  }

  const p = state.project;
  if (p && (p.stage === 'reviewing' || p.stage === 'done') && !state.sourceUrl && !state.sourceUrlError) {
    ensureSourceUrl(p);
  }

  const player = document.getElementById('player');
  if (player) {
    player.addEventListener('error', () => {
      const codes = { 1: 'loading aborted', 2: 'network error', 3: 'decode error', 4: 'format or URL not supported' };
      const code = player.error?.code;
      const src = String(player.currentSrc || player.src || '');
      console.log('[autocuts] player error', code, player.error?.message, src);
      const scheme = src.split(':')[0] || '?';
      const detail = `(${codes[code] || 'unknown error'}${player.error?.message ? `: ${player.error.message}` : ''}). URL scheme was "${scheme}".`;
      const playingClip = state.clipPlayback;
      if (scheme === 'blob') {
        if (playingClip) {
          state.clipPlayback = null;
          setError(`Direct-read (blob) playback of ${playingClip.name} also failed ${detail} Protocol and blob both failing means the file itself is not a video this player can decode — check it with Open.`);
        } else {
          state.sourceViaBlob = false;
          state.sourceUrl = null;
          state.sourceUrlError = `Direct-read (blob) playback also failed ${detail} The video file itself appears undecodable here — try "Open source in system player".`;
        }
        render();
        return;
      }
      const artifactPath = playingClip ? playingClip.path : p?.source?.fullPath;
      if (artifactPath && (!blobAttempted.has(artifactPath) || blobUrls.has(artifactPath))) {
        blobAttempted.add(artifactPath);
        if (playingClip) {
          state.clipPlayback = null;
        } else {
          state.sourceUrl = null;
          state.sourceUrlError = 'Protocol playback failed — trying a direct-read (blob) fallback…';
        }
        setNotice('Protocol playback failed — trying a direct-read (blob) fallback…');
        render();
        tryBlobFallback(artifactPath, playingClip);
        return;
      }
      if (playingClip) {
        state.clipPlayback = null;
        setError(`The built-in player could not play the exported clip ${playingClip.name} ${detail} Use Open instead.`);
      } else {
        state.sourceUrl = null;
        state.sourceUrlError = `The built-in player could not load the video ${detail} You can still use "Open source in system player".`;
      }
      render();
    });
    if (state.playRange) {
      const { start, end } = state.playRange;
      state.playRange = null;
      const seek = () => {
        player.currentTime = start;
        player.play().catch((err) => console.log('[autocuts] autoplay blocked', err?.name));
      };
      if (player.readyState >= 1) seek();
      else player.addEventListener('loadedmetadata', seek, { once: true });
      player.addEventListener('timeupdate', () => {
        if (player.currentTime >= end) player.pause();
      });
    }
  }

  for (const which of ['start', 'end']) {
    const input = document.getElementById(`edit-${which}`);
    if (input) {
      input.addEventListener('input', () => {
        const value = Number.parseFloat(input.value);
        if (state.editDraft && Number.isFinite(value)) {
          state.editDraft[which] = value;
          updateEditMeta();
        }
      });
    }
  }
  if (state.editDraft) updateEditMeta();
}

/* ---------- events ---------- */

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  switch (action) {
    case 'new-project': createProject(); break;
    case 'open-project': if (!state.busy) openProject(id); break;
    case 'back-home': goHome(); break;
    case 'transcribe': startTranscription(); break;
    case 'retry-probe': retryProbe(); break;
    case 'remove-project': state.confirmRemoveId = id; render(); break;
    case 'remove-project-confirm': deleteProjectFully(id); break;
    case 'remove-project-cancel': state.confirmRemoveId = null; render(); break;
    case 'cleanup-copy': copyCleanupPrompt(); break;
    case 'cleanup-terminal': openCleanupTerminal(); break;
    case 'cleanup-reveal': revealCleanupFolder(); break;
    case 'cleanup-check': checkCleanup(true); break;
    case 'cleanup-resume': {
      const flow = state.cleanupFlow;
      if (flow) {
        flow.paused = false;
        flow.startedAt = Date.now();
        if (!flow.timer) flow.timer = setInterval(() => checkCleanup(false), POLL_INTERVAL_MS);
        checkCleanup(true);
      }
      render();
      break;
    }
    case 'cleanup-skip': skipCleanup(); break;
    case 'export-clip': exportClips([id], true); break;
    case 'export-clip-nocap': exportClips([id], false); break;
    case 'export-approved': {
      const proj = state.project;
      if (proj) exportClips(exportableClips(proj).map((c) => c.id), true);
      break;
    }
    case 'view-done': {
      const proj = state.project;
      if (proj) {
        proj.stage = 'done';
        state.previewClipId = null;
        state.clipPlayback = null;
        state.playRange = null;
        saveProject(proj).catch((err) => setError(err.message));
        render();
      }
      break;
    }
    case 'play-clip': playExportedClip(id); break;
    case 'open-clip': {
      const clip = findClip(id);
      if (clip?.export) {
        ta.files.open(clip.export.path).then((res) => {
          if (!res.ok) { setError(failText(res, 'Opening the exported clip')); render(); }
        });
      }
      break;
    }
    case 'reveal-clip': {
      const clip = findClip(id);
      if (clip?.export) {
        ta.files.reveal(clip.export.path).then((res) => {
          if (!res.ok) { setError(failText(res, 'Revealing the exported clip')); render(); }
        });
      }
      break;
    }
    case 'dismiss-error': state.error = null; render(); break;
    case 'dismiss-notice': state.notice = null; render(); break;
    case 'reload': window.location.reload(); break;
    case 'copy-prompt': copyAgentPrompt(); break;
    case 'open-terminal': openAgentTerminal(); break;
    case 'poll-start': startSuggestionPolling(null); render(); break;
    case 'poll-check-now': pollOnce(true); break;
    case 'poll-cancel':
      stopPolling();
      setNotice('Stopped checking for clips.json. Start again whenever the agent is done.');
      render();
      break;
    case 'poll-resume': {
      const pol = state.polling;
      if (pol) {
        pol.paused = false;
        pol.startedAt = Date.now();
        pollOnce(true);
      } else {
        startSuggestionPolling(null);
      }
      render();
      break;
    }
    case 'preview-clip': {
      const clip = findClip(id);
      if (clip && clip.status !== 'invalid' && !clip.discarded) {
        state.previewClipId = clip.id;
        state.clipPlayback = null;
        state.playRange = { start: clip.start, end: clip.end };
        render();
      }
      break;
    }
    case 'trim-clip': {
      const clip = findClip(id);
      if (clip) {
        state.editClipId = clip.id;
        state.editDraft = { start: clip.start, end: clip.end };
        render();
      }
      break;
    }
    case 'trim-save': saveTrim(); break;
    case 'trim-cancel': state.editClipId = null; state.editDraft = null; render(); break;
    case 'snap': {
      const { which, dir } = target.dataset;
      if (state.editDraft && (which === 'start' || which === 'end')) {
        state.editDraft[which] = snapBoundary(state.editDraft[which], dir === 'prev' ? 'prev' : 'next');
        updateEditMeta();
      }
      break;
    }
    case 'nudge': {
      const { which, amt } = target.dataset;
      const delta = Number.parseFloat(amt);
      if (state.editDraft && (which === 'start' || which === 'end') && Number.isFinite(delta)) {
        state.editDraft[which] = Math.max(0, Math.round((state.editDraft[which] + delta) * 10) / 10);
        updateEditMeta();
      }
      break;
    }
    case 'discard-clip': toggleDiscard(id); break;
    case 'restore-clip': toggleDiscard(id); break;
    case 'open-source': openSourceExternally(); break;
    case 'player-retry':
      state.sourceUrl = null;
      state.sourceUrlError = null;
      state.sourceUrlLoading = false;
      render();
      break;
    case 'rerun': state.confirmRerun = true; render(); break;
    case 'rerun-confirm': rerunSuggestions(); break;
    case 'rerun-cancel': state.confirmRerun = false; render(); break;
    case 'back-to-review': {
      const proj = state.project;
      if (proj && (proj.suggestions || []).length > 0) {
        stopPolling();
        proj.stage = 'reviewing';
        state.previewClipId = null;
        state.clipPlayback = null;
        state.playRange = null;
        saveProject(proj).catch((err) => setError(err.message));
        render();
      }
      break;
    }
    default: break;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const card = event.target.closest?.('[data-action="open-project"]');
  if (card && !state.busy) openProject(card.dataset.id);
});

/* ---------- init ---------- */

async function init() {
  try {
    const meta = await ta.metadata();
    if (meta && meta.ok !== false) state.atomMeta = meta;
  } catch {
    /* metadata is cosmetic */
  }
  try {
    await loadIndex();
    state.ready = true;
  } catch (err) {
    state.setupError = err && err.message ? err.message : String(err);
  }
  render();
}

init();
