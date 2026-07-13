// ============================================================================
// Rekorder — app.js
// T01 foundation: central store + render loop, router, sidebar, inline SVG
// icons, and the toast/banner notice system. T02 bridge + capability probes.
// T03 setup/devices. T04 capture engine + canvas compositor. T05 record
// transport. Later tickets fill in the layouts UI, library persistence,
// exporter, and settings screens.
//
// One ES module. No framework, no bundler, no remote assets (CSP-safe).
// ============================================================================

// ------------------------------------------------------------------ icons --
// Inline SVG strings replacing lucide-react. Every path uses currentColor so
// icons inherit the surrounding text color.

const ICON_PATHS = {
  // nav
  sliders:
    '<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/>',
  video:
    '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  grid:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  film:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
  // devices
  camera:
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  monitor:
    '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  mic:
    '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>',
  'mic-off':
    '<line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" y1="19" x2="12" y2="22"/>',
  'camera-off':
    '<line x1="2" y1="2" x2="22" y2="22"/><path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/><path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5"/><path d="M14.121 15.121A3 3 0 1 1 9.88 10.88"/>',
  volume:
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  // transport
  record: '<circle cx="12" cy="12" r="6"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause:
    '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  // library / export
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  trash:
    '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  // notices
  check: '<path d="M20 6 9 17l-5-5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
};

/** Render an inline SVG icon string. Unknown names render nothing. */
function icon(name, { size = 20 } = {}) {
  const paths = ICON_PATHS[name];
  if (!paths) return '';
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
    `stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
  );
}

// ------------------------------------------------------------------ utils --

/** Escape text for safe interpolation into innerHTML templates. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/**
 * The host console stringifies each argument, so an object arrives as "[object Object]"
 * and a DOMException as "[object DOMException]" — useless in a bug report. Render the
 * value ourselves before it crosses that boundary.
 */
function describe(value) {
  if (value === null || value === undefined) return String(value);
  // DOMException and Error both carry name+message; DOMException is not an Error subclass.
  if (typeof value.name === 'string' && typeof value.message === 'string') {
    return value.message ? `${value.name}: ${value.message}` : value.name;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      // Cyclic or otherwise unserializable; never emit the banned "[object ...]" form.
      return `<unserializable ${value.constructor?.name || 'object'}>`;
    }
  }
  return String(value);
}

function formatLog(label, parts) {
  return parts.length ? `${label} — ${parts.map(describe).join(' | ')}` : String(label);
}

const logError = (label, ...parts) => console.error(formatLog(label, parts));
const logWarn = (label, ...parts) => console.warn(formatLog(label, parts));
const logInfo = (label, ...parts) => console.info(formatLog(label, parts));

// ---------------------------------------------------------------- layouts --
// The presets, and the only place preset geometry lives. `rect` is the camera box
// in canvas-relative units (0..1); `movable` gates drag/resize (T06); `mode` selects
// the compositor branch; `shape: 'circle'` clips the overlay camera to a circle (T16).
// Fixed presets are drawn straight from `rect`, so a preset and its drawn output
// cannot drift apart. Columns presets with the camera on the LEFT carry an explicit
// `screenRect` — the computed complement in screenBox() assumes camera-right.
// A 16:9 canvas makes h/w = 16/9 (0.32/0.18) a PIXEL square; square and circle hold it.

const LAYOUT_DEFAULTS = {
  // The one layout with no screen in it. `solo` is not just a compositing mode: the studio
  // reads it and never acquires a screen stream at all, so a webcam take needs no share prompt.
  cameraOnly: { rect: { x: 0, y: 0, w: 1, h: 1 }, movable: false, mode: 'solo' },
  pip: { rect: { x: 0.67, y: 0.07, w: 0.27, h: 0.3 }, movable: true, mode: 'overlay' },
  pipTall: { rect: { x: 0.72, y: 0, w: 0.28, h: 1 }, movable: true, mode: 'overlay' },
  pipSquare: { rect: { x: 0.76, y: 0.06, w: 0.18, h: 0.32 }, movable: true, mode: 'overlay' },
  pipCircle: { rect: { x: 0.76, y: 0.06, w: 0.18, h: 0.32 }, movable: true, mode: 'overlay', shape: 'circle' },
  splitLeft: {
    rect: { x: 0, y: 0, w: 0.5, h: 1 },
    screenRect: { x: 0.5, y: 0, w: 0.5, h: 1 },
    movable: false,
    mode: 'columns',
  },
  split: { rect: { x: 0.5, y: 0, w: 0.5, h: 1 }, movable: false, mode: 'columns' },
  sideBySideLeft: {
    rect: { x: 0, y: 0, w: 0.38, h: 1 },
    screenRect: { x: 0.38, y: 0, w: 0.62, h: 1 },
    movable: false,
    mode: 'columns',
  },
  sideBySide: { rect: { x: 0.62, y: 0, w: 0.38, h: 1 }, movable: false, mode: 'columns' },
  camera: {
    rect: { x: 0, y: 0, w: 1, h: 1 },
    screenRect: { x: 0.05, y: 0.08, w: 0.28, h: 0.27 },
    movable: false,
    mode: 'inset',
  },
  focus: { rect: { x: 0.2, y: 0.12, w: 0.6, h: 0.68 }, movable: true, mode: 'scrim' },
};

// The camera box may not shrink past a legible pip or grow past the stage.
const CAMERA_SCALE_MIN = 10;
const CAMERA_SCALE_MAX = 100;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function layoutPreset(layout) {
  return LAYOUT_DEFAULTS[layout] || LAYOUT_DEFAULTS.pip;
}

/**
 * Does this layout put a screen in the frame? The `solo` (camera-only) preset does not, and
 * `prepareStudio` skips screen capture entirely for it — no picker, no share prompt, no system
 * audio. Crossing this line therefore means re-acquiring streams, not just repainting (T18).
 */
function needsScreen(layout) {
  return layoutPreset(layout).mode !== 'solo';
}

/** `cameraScale` IS the camera box width, as a percentage of stage width. */
function presetScale(preset) {
  return Math.round(preset.rect.w * 100);
}

/**
 * The camera box in 0..1 stage units. On movable presets the size slider (T06)
 * drives the width through `cameraScale` and the drag sets `cameraRect.x/y`, so
 * both reach the compositor through this one function. Fixed presets ignore
 * both and take their geometry from the preset.
 */
function cameraBox(state) {
  const preset = layoutPreset(state.layout);
  if (!preset.movable) return preset.rect;

  const aspect = preset.rect.h / preset.rect.w; // hold the preset's box shape
  const w = clamp(state.cameraScale, CAMERA_SCALE_MIN, CAMERA_SCALE_MAX) / 100;
  const h = Math.min(w * aspect, 1);
  const rect = state.cameraRect || preset.rect;
  return { x: clamp(rect.x, 0, 1 - w), y: clamp(rect.y, 0, 1 - h), w, h };
}

/** The screen box in 0..1 stage units, or `null` to fill the stage. */
function screenBox(state) {
  const preset = layoutPreset(state.layout);
  if (preset.screenRect) return preset.screenRect;
  if (preset.mode !== 'columns') return null;
  return { x: 0, y: 0, w: 1 - preset.rect.w, h: 1 }; // the camera's complement
}

const FULL_RECT = { x: 0, y: 0, w: 1, h: 1 };

// The only two modes whose `drawFrame` branch honors `cameraBorder` — a border
// control on any other preset would promise an outline the composite never draws.
const BORDER_MODES = new Set(['overlay', 'scrim']);

/** The size slider's bounds: stop where `w * aspect` would outgrow the stage height. */
function scaleRange(preset) {
  const aspect = preset.rect.h / preset.rect.w;
  return { min: CAMERA_SCALE_MIN, max: Math.floor(CAMERA_SCALE_MAX / aspect) };
}

/**
 * Apply a preset's camera rect + size. The compositor picks it up on the next frame — except
 * across the camera-only boundary (T18), where the two layouts do not run on the same streams:
 * a screen layout holds a screen stream, camera-only never acquires one. Crossing it under a
 * live studio means rebuilding the capture, and mid-take that is not possible at all.
 */
function applyLayoutPreset(layout) {
  const preset = LAYOUT_DEFAULTS[layout];
  if (!preset) return;

  const state = store.state;
  const crossing = ACTIVE_STATUSES.has(state.status) && needsScreen(state.layout) !== needsScreen(layout);

  if (crossing && RECORD_LOCKED_STATUSES.has(state.status)) {
    notices.toast(
      'warn',
      needsScreen(layout)
        ? 'A screen layout needs a screen stream, which can’t be acquired mid-recording. Stop the recording first.'
        : 'Camera only drops the screen, which can’t be released mid-recording. Stop the recording first.',
    );
    return;
  }

  const panelWasOpen = state.layoutPanelOpen;
  store.setState({
    layout,
    cameraRect: { ...preset.rect },
    cameraScale: presetScale(preset),
    // A camera-only layout with the camera hidden records a blank rectangle, and its
    // "Show camera" toggle is locked — so the user could not undo it from the studio.
    // Entering a solo layout shows the camera; the locked toggle is always locked ON.
    ...(needsScreen(layout) ? {} : { cameraEnabled: true }),
  });
  settings.save();

  // Preview only: rebuild the studio on the streams the new layout actually needs.
  if (crossing) capture.restartStudio({ layoutPanelOpen: panelWasOpen });
}

// ------------------------------------------------------------------ store --
// Central state object (mirrors LLD §2). Mutated only via setState(); every
// change runs the single render() through the subscriber list.

/** @returns the initial state (full model so later tickets extend, not redefine). */
function createInitialState() {
  return {
    view: 'setup',
    status: 'idle', // idle|starting|preview|recording|paused|stopping|error

    // devices & sources
    desktopSources: [],
    cameras: [],
    microphones: [],
    selectedSourceId: '',
    selectedCameraId: '',
    selectedMicId: '',

    // layout
    layout: 'pip',
    cameraRect: { ...LAYOUT_DEFAULTS.pip.rect },
    cameraScale: presetScale(LAYOUT_DEFAULTS.pip),
    cameraBorder: true,

    // capture options
    includeSystemAudio: false,
    micEnabled: true,
    cameraEnabled: true,
    resolutionIndex: 0,
    frameRate: 60,

    // export options
    exportFormat: 'mp4',
    includeCaptions: false,
    enhanceAudio: true,

    // recording / library
    timerMs: 0,
    recordings: [],
    selectedRecordingId: '',
    query: '',
    sortMode: 'recent',
    selectionMode: false,
    selectedRecordingIds: new Set(),
    confirmDelete: false, // deleting is irreversible, so the button arms an inline confirm
    playbackError: '', // fileName that failed to play; the pane shows it instead of a dead <video>
    playbackErrorText: '', // why it failed, in the user's words

    // ui
    layoutPanelOpen: false,
    exportProgress: null,
    banners: [], // [{ id, key, kind, message, dismissible }] — they stack, never overwrite
    meta: null, // { id, name, version } once the host answers

    // host capability probe results (T02): unknown|granted|denied|error|unsupported
    capabilities: { camera: 'unknown', microphone: 'unknown', screenCapture: 'unknown' },
    // why a device kind enumerated nothing: ''|blocked|absent|busy|unsupported|error
    deviceIssues: { camera: '', microphone: '' },
    setupLoading: false,

    // capture (T04)
    captureError: '', // message shown by the studio error state
    captureErrorCode: '', // its `code`, so the error state can offer the right action
    systemAudioActive: false, // whether the screen stream really carries audio
  };
}

const store = {
  state: createInitialState(),
  listeners: new Set(),

  setState(patch) {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    Object.assign(this.state, next);
    for (const fn of this.listeners) fn(this.state);
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
};

/** An empty capture bundle. Streams/videos/AudioContext live here, never in state. */
function emptyCapture() {
  return {
    screenStream: null,
    cameraStream: null,
    micStream: null,
    audioContext: null,
    audioNodes: null, // { sources, destination, inputStreams } — held so the mix graph is not collected
    mixedAudio: null,
    screenVideo: null,
    cameraVideo: null,
    drawing: false, // the compositor loop is live; the loop itself reads this to stop
    ticker: null, // ticker.js Worker driving the loop (see capture.startDrawLoop)
    tickerWatchdog: null, // setTimeout handle: demotes a worker that never sends a first tick
    animationId: null, // rAF handle; only used on the fallback path
  };
}

/** Wall-clock bookkeeping for the recording timer. `pausedAt` also freezes it. */
function emptyClock() {
  return { startedAt: 0, pausedAt: 0, totalPausedMs: 0, timerId: null };
}

// Non-serializable runtime handles (never rendered) — the LLD §2 `refs` bundle.
const refs = {
  previewCameraEl: null, // persistent <video> for the Setup camera preview
  previewStream: null, // its getUserMedia stream
  previewDeviceId: '', // camera id currently bound to the preview

  // live microphone meter (T11)
  meter: null, // { key, audioContext, source, analyser, stream, owned, raf, … }
  meterToken: 0, // invalidates an in-flight micMeter.sync()
  meterFailedKey: '', // a source that failed; do not retry it on every repaint
  meterPendingKey: '', // a source being opened; do not open it twice
  mountedView: null, // last view whose imperative mounter ran
  canvas: null, // persistent studio <canvas>; survives re-renders
  capture: emptyCapture(),
  scene: null, // snapshot the draw loop reads instead of touching the store
  prepareToken: 0, // invalidates an in-flight prepareStudio()
  endingPreview: false, // endPreview() in flight; releaseIfParked() must not re-enter

  // transport (T05)
  mediaRecorder: null,
  canvasStream: null, // canvas.captureStream(); only its video track is ours to stop
  chunks: [], // ondataavailable buffer
  clock: emptyClock(),
  stopResolvers: [], // settle recorder.stop() callers once onstop has finalized

  // library (T07)
  playerEl: null, // persistent <video> for the Recordings detail pane
  playerPath: '', // fileName currently bound to it
  indexReadable: true, // false once load() quarantines an index it could not parse

  // settings (T10)
  settingsWriteWarned: false, // one banner per run of failures, not one per keystroke
  bannerSeq: 0, // banners stack; each needs a stable id for its dismiss button
};

// Capture resolutions (used by the camera card pill; configured in Settings, T10).
const RESOLUTIONS = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '1440p', width: 2560, height: 1440 },
];

// How long the compositor waits for the frame ticker's first tick before deciding the
// worker is dead and re-clocking from rAF. Two orders of magnitude above a 30fps tick,
// so a slow worker start is never mistaken for a broken one.
const TICKER_FIRST_TICK_MS = 2000;

// ----------------------------------------------------------------- notices --
// Transient toasts (managed imperatively, outside the render loop) + a
// persistent inline banner (lives in state, so render() paints it).

const TOAST_ICON = { good: 'check', warn: 'alert', danger: 'alert', info: 'info' };

const notices = {
  /** Show an auto-dismissing toast. kind: good|warn|danger|info. */
  toast(kind, message, { timeout = 3600 } = {}) {
    const slot = document.getElementById('toast-slot');
    if (!slot) return () => {};
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
    el.innerHTML =
      `<span class="toast__icon">${icon(TOAST_ICON[kind] || 'info', { size: 16 })}</span>` +
      `<span class="toast__msg"></span>`;
    el.querySelector('.toast__msg').textContent = message;
    slot.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      el.classList.remove('is-in');
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 220);
    };
    if (timeout) setTimeout(remove, timeout);
    return remove;
  },

  /**
   * Raise a persistent inline banner. kind: info|warn|danger|success.
   *
   * Banners stack. A single slot meant that whichever subsystem booted last silently
   * overwrote the others — a denied `storage` capability would be erased by the capability
   * probe a moment later, and the failure we promised to surface was never seen.
   * `key` (the message by default) makes an identical raise idempotent; a raise with
   * different content replaces the entry in place, so a keyed banner tracks the current
   * cause (blocked ↔ absent) instead of freezing on the first one seen.
   */
  banner(kind, message, { dismissible = true, key = message, actions = [] } = {}) {
    const banners = store.state.banners;
    const existing = banners.find((entry) => entry.key === key);
    if (existing) {
      const unchanged =
        existing.kind === kind &&
        existing.message === message &&
        existing.dismissible === dismissible &&
        JSON.stringify(existing.actions) === JSON.stringify(actions);
      if (unchanged) return;
      store.setState({
        banners: banners.map((entry) =>
          entry.key === key ? { id: entry.id, key, kind, message, dismissible, actions } : entry,
        ),
      });
      return;
    }
    refs.bannerSeq += 1;
    store.setState({
      banners: [...banners, { id: `banner-${refs.bannerSeq}`, key, kind, message, dismissible, actions }],
    });
  },

  clearBanner(id) {
    store.setState({ banners: store.state.banners.filter((entry) => entry.id !== id) });
  },

  /** Retract a banner once the condition that raised it is gone. */
  dismiss(key) {
    const banners = store.state.banners.filter((entry) => entry.key !== key);
    if (banners.length !== store.state.banners.length) store.setState({ banners });
  },
};

// ------------------------------------------------------------------ bridge --
// The single owner of window.tinyAtom access (LLD §4). Every call is awaited
// and returns the host's { ok } result; a failure never throws. bridge.fail()
// maps a typed reason to specific, actionable copy and raises a notice.
// Nothing in views/* touches window.tinyAtom directly (T02 acceptance).

const host = typeof window !== 'undefined' ? window.tinyAtom : undefined;

/** Invoke a host method by dotted path ('files.write'); never throws. */
async function invoke(path, args) {
  if (!host) return { ok: false, reason: 'no-host' };
  const parts = path.split('.');
  let owner = host;
  for (let i = 0; i < parts.length - 1; i += 1) owner = owner && owner[parts[i]];
  const fn = owner && owner[parts[parts.length - 1]];
  if (typeof fn !== 'function') return { ok: false, reason: 'unsupported' };
  try {
    const result = await fn.call(owner, ...args);
    return result && typeof result === 'object' ? result : { ok: false, reason: 'runtime-error' };
  } catch (error) {
    logError(`bridge ${path} threw`, error);
    return { ok: false, reason: 'runtime-error', error: String((error && error.message) || error) };
  }
}

function lastLine(text) {
  return String(text || '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-1)[0] || '';
}

/** Map a failed { ok:false } result to user copy (LLD §4). Pure; no side effects. */
function explainFailure(result, fallback, ctx = {}) {
  switch (result && result.reason) {
    case 'capability-denied':
      return ctx.cap
        ? `“${ctx.cap}” access is blocked. Grant it in Studio Permissions, then try again.`
        : 'A required permission is blocked. Grant it in Studio Permissions.';
    case 'runtime-missing':
      return ctx.runtime
        ? `The “${ctx.runtime}” runtime isn’t installed. Install it from the Studio Runtime tab, then try again.`
        : 'A required runtime isn’t installed. Install it from the Studio Runtime tab.';
    case 'runtime-error': {
      const detail = lastLine(result.stderr);
      return detail ? `The host tool failed: ${detail}` : fallback || 'A host tool failed. Please try again.';
    }
    case 'invalid-request':
      logError('bridge invalid-request', ctx, result);
      return fallback || 'That request couldn’t be completed.';
    case 'unsupported':
      return fallback || 'That feature isn’t available in this host yet.';
    case 'ref-not-found':
    case 'ref-offline':
    case 'ref-changed':
    case 'ref-revoked':
    case 'no-access':
      return 'A linked file is unavailable. Relink it and try again.';
    case 'no-host':
      return 'The TinyAtom host isn’t available. Open Rekorder in Studio Preview.';
    default:
      return fallback || 'Something went wrong. Please try again.';
  }
}

const bridge = {
  available: () => !!host,

  metadata: () => invoke('metadata', []),

  storage: {
    get: (key) => invoke('storage.get', [key]),
    set: (key, value) => invoke('storage.set', [key, value]),
    remove: (key) => invoke('storage.remove', [key]),
    keys: () => invoke('storage.keys', []),
  },

  files: {
    write: (path, content, options) => invoke('files.write', [path, content, options]),
    append: (path, content, options) => invoke('files.append', [path, content, options]),
    read: (path, options) => invoke('files.read', [path, options]),
    exists: (path) => invoke('files.exists', [path]),
    delete: (path, options) => invoke('files.delete', [path, options]),
    mkdir: (path, options) => invoke('files.mkdir', [path, options]),
    list: (path) => invoke('files.list', [path]),
    stat: (path) => invoke('files.stat', [path]),
    url: (path) => invoke('files.url', [path]),
    exportFile: (path, options) => invoke('files.exportFile', [path, options]),
    open: (path) => invoke('files.open', [path]),
    reveal: (path) => invoke('files.reveal', [path]),
  },

  camera: { requestAccess: () => invoke('camera.requestAccess', []) },
  microphone: { requestAccess: () => invoke('microphone.requestAccess', []) },
  screenCapture: { getSources: () => invoke('screenCapture.getSources', []) },

  clipboard: { writeText: (text) => invoke('clipboard.writeText', [text]) },
  shell: { openExternal: (url) => invoke('shell.openExternal', [url]) },

  media: {
    requestAccess: () => invoke('media.requestAccess', []),
    runFfmpeg: (options) => invoke('media.runFfmpeg', [options]),
    runFfprobe: (options) => invoke('media.runFfprobe', [options]),
  },

  speech: { transcribe: (options) => invoke('speech.transcribe', [options]) },

  /** Pure reason→copy mapper (LLD §4). */
  explain: explainFailure,

  /** Map a failure to copy AND raise a notice. Returns the message. */
  fail(result, fallback, ctx = {}) {
    const message = explainFailure(result, fallback, ctx);
    const soft = result && (result.reason === 'capability-denied' || result.reason === 'runtime-missing');
    const kind = ctx.kind || (soft ? 'warn' : 'danger');
    if (ctx.persistent) notices.banner(kind, message, { dismissible: ctx.dismissible !== false });
    else notices.toast(kind, message);
    return message;
  },
};

// The identifiers Studio Permissions lists, not prettified display names — a user
// hunting for "Screen capture" in that tab will not find it; it is `screen-capture`.
const CAP_IDS = { camera: 'camera', microphone: 'microphone', screenCapture: 'screen-capture' };

/**
 * Startup capability probes (LLD §4 / T02): request camera + microphone access
 * (unlocks device labels before enumeration in T03) and smoke-check screen
 * sources. Records a status per capability and names any that are blocked,
 * rather than crashing.
 */
async function probeCapabilities() {
  if (!host) return;
  const results = await Promise.all([
    bridge.camera.requestAccess(),
    bridge.microphone.requestAccess(),
    bridge.screenCapture.getSources(),
  ]);
  const keys = ['camera', 'microphone', 'screenCapture'];
  const capabilities = { ...store.state.capabilities };
  const denied = [];
  results.forEach((result, i) => {
    const key = keys[i];
    if (result.ok) {
      capabilities[key] = 'granted';
    } else if (result.reason === 'capability-denied') {
      capabilities[key] = 'denied';
      denied.push(CAP_IDS[key]);
    } else {
      capabilities[key] = result.reason === 'unsupported' ? 'unsupported' : 'error';
    }
  });
  store.setState({ capabilities });
  if (denied.length) {
    const many = denied.length > 1;
    const quoted = denied.map((id) => `“${id}”`).join(' and ');
    notices.banner(
      'warn',
      `${quoted} ${many ? 'are' : 'is'} blocked. Grant ${many ? 'them' : 'it'} in Studio Permissions to record.`,
      { key: 'capabilities-denied' },
    );
  }
}

// ----------------------------------------------------------------- settings --
// Minimal persistence over the `settings` storage key (LLD §3). T10 adds the
// full Settings screen; T03 needs load-on-boot + save of device selections.

// Stored settings are data on disk, and they reach the compositor, the MediaRecorder,
// and FFmpeg. Each key validates itself; a value that fails keeps the in-memory default
// rather than propagating a bad frame rate or a NaN camera rectangle.
const asBool = (value) => (typeof value === 'boolean' ? value : undefined);
const asString = (value) => (typeof value === 'string' ? value : undefined);
const oneOf = (...allowed) => (value) => (allowed.includes(value) ? value : undefined);

function asRect(value) {
  if (!value || typeof value !== 'object') return undefined;
  const keys = ['x', 'y', 'w', 'h'];
  if (!keys.every((key) => Number.isFinite(Number(value[key])))) return undefined;
  const rect = {};
  for (const key of keys) rect[key] = Number(value[key]);
  return rect;
}

const SETTINGS_SCHEMA = {
  resolutionIndex: (v) => (Number.isInteger(v) && v >= 0 && v < RESOLUTIONS.length ? v : undefined),
  frameRate: oneOf(30, 60),
  includeSystemAudio: asBool,
  exportFormat: oneOf('mp4', 'webm'),
  includeCaptions: asBool,
  enhanceAudio: asBool,
  micEnabled: asBool,
  cameraEnabled: asBool,
  layout: (v) => (typeof v === 'string' && LAYOUT_DEFAULTS[v] ? v : undefined),
  cameraBorder: asBool,
  cameraScale: (v) => (Number.isFinite(v) ? clamp(Math.round(v), CAMERA_SCALE_MIN, CAMERA_SCALE_MAX) : undefined),
  cameraRect: asRect,
  selectedCameraId: asString,
  selectedMicId: asString,
};

const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMA);

// A device id is bound to the machine, not to the user's preferences: resetting should
// not silently unpick the camera they are looking at.
const DEVICE_KEYS = new Set(['selectedCameraId', 'selectedMicId']);

// A stable key, so the "cannot save" banner can be retracted when a save succeeds. The
// message text carries the typed reason and is not a reliable handle.
const SETTINGS_WRITE_BANNER = 'settings-write-failed';
const SETTINGS_READ_BANNER = 'settings-read-failed';

const settings = {
  async load() {
    const res = await bridge.storage.get('settings');
    if (!res.ok) {
      if (res.reason !== 'no-host') {
        // Silently running on defaults would leave the user wondering why every
        // preference resets. Name the reason (FR18/AC11) — and, as save() does, the
        // consequence, since a typed reason replaces the fallback sentence entirely.
        const cause = bridge.explain(res, 'Your saved preferences could not be read.', { cap: 'storage' });
        notices.banner('warn', `${cause} The defaults are in use.`, { key: SETTINGS_READ_BANNER });
      }
      return;
    }
    if (res.value == null) return; // a first run, not a failure

    let saved;
    try {
      saved = typeof res.value === 'string' ? JSON.parse(res.value) : res.value;
    } catch (error) {
      logError('settings parse failed', error);
      // A banner, like the denied-capability path beside it: an unreadable blob means every
      // preference is silently back to default, which outlives a toast.
      notices.banner('warn', 'Your saved preferences were unreadable, so the defaults are in use.', {
        key: SETTINGS_READ_BANNER,
      });
      return;
    }
    // An array is `typeof 'object'` too, and would silently yield no keys at all.
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      // A banner, like the denied-capability path beside it: an unreadable blob means every
      // preference is silently back to default, which outlives a toast.
      notices.banner('warn', 'Your saved preferences were unreadable, so the defaults are in use.', {
        key: SETTINGS_READ_BANNER,
      });
      return;
    }

    const patch = {};
    const rejected = [];
    for (const key of SETTINGS_KEYS) {
      if (!(key in saved)) continue;
      const value = SETTINGS_SCHEMA[key](saved[key]);
      if (value === undefined) rejected.push(key);
      else patch[key] = value;
    }

    if (rejected.length) logWarn('settings ignored invalid values', rejected);

    // Each key is valid on its own, but the pair (solo layout, camera hidden) is not: it
    // would boot the studio into a blank recording with the "Show camera" toggle locked
    // off. Hiding the camera on a screen layout and then selecting Camera only persists
    // exactly that pair. Repair it here, where the two keys first meet.
    const layout = 'layout' in patch ? patch.layout : store.state.layout;
    const cameraEnabled = 'cameraEnabled' in patch ? patch.cameraEnabled : store.state.cameraEnabled;
    let repaired = false;
    if (!needsScreen(layout) && !cameraEnabled) {
      patch.cameraEnabled = true;
      repaired = true;
      logWarn('settings repaired: the camera cannot be hidden in a camera-only layout', { layout });
    }

    if (Object.keys(patch).length) store.setState(patch);
    if (rejected.length || repaired) await this.save(); // write the repaired shape back
  },

  /** 'saved' | 'unavailable' (no host to persist to) | 'failed'. */
  async save() {
    const payload = {};
    for (const key of SETTINGS_KEYS) payload[key] = store.state[key];
    const res = await bridge.storage.set('settings', JSON.stringify(payload));

    if (res.ok) {
      // Retract the warning as well as the latch: a banner that outlives the failure it
      // describes keeps telling the user their preferences will be lost after they are not.
      refs.settingsWriteWarned = false; // a later failure is news again
      notices.dismiss(SETTINGS_WRITE_BANNER);
      return 'saved';
    }
    // Outside Studio Preview there is nothing to persist to. That is the environment, not
    // a failure, and the startup banner already says so.
    if (res.reason === 'no-host') return 'unavailable';

    logError('settings save failed', res);
    // save() runs on every control change, so a toast per keystroke would be noise. One
    // persistent banner, raised once, until a save succeeds again.
    if (!refs.settingsWriteWarned) {
      refs.settingsWriteWarned = true;
      // explain() names the cause; the consequence is ours to add — a typed reason like
      // capability-denied replaces the fallback entirely.
      const cause = bridge.explain(res, 'Preferences could not be saved.', { cap: 'storage' });
      notices.banner('warn', `${cause} Your preferences will reset when you reload.`, {
        key: SETTINGS_WRITE_BANNER,
      });
    }
    return 'failed';
  },

  /**
   * Preferences back to their defaults. Device selections are left alone.
   *
   * Refuses while a capture session is live. Every guard the individual controls enforce —
   * resolution and frame rate are bound into `captureStream()`, system audio into
   * `getDisplayMedia` — would be walked straight past by a bulk write, and `micEnabled`/
   * `cameraEnabled` would desync the UI from the tracks they describe. Returns 'locked'.
   */
  async reset() {
    if (ACTIVE_STATUSES.has(store.state.status)) return 'locked';
    const defaults = createInitialState();
    const patch = {};
    for (const key of SETTINGS_KEYS) if (!DEVICE_KEYS.has(key)) patch[key] = defaults[key];
    store.setState(patch);
    return this.save(); // the caller must not claim a save that did not happen
  },
};

// ------------------------------------------------------------------ devices --
// Cameras/mics come from navigator.mediaDevices (standard browser APIs unlocked
// by the capability probe); only screen sources go through the bridge.

function hasMediaDevices() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices;
}

async function enumerate() {
  if (!hasMediaDevices() || !navigator.mediaDevices.enumerateDevices) return [];
  try {
    return await navigator.mediaDevices.enumerateDevices();
  } catch (error) {
    logError('enumerateDevices failed', error);
    return [];
  }
}

/**
 * One-shot getUserMedia so enumerateDevices returns real device labels. Each kind is
 * requested on its own: asking for `{ video: true, audio: true }` together means one
 * missing or blocked camera rejects the whole call and the microphone never unlocks.
 */
async function unlockLabels({ video, audio }) {
  if (!hasMediaDevices() || !navigator.mediaDevices.getUserMedia) return;
  const attempts = [];
  if (video) attempts.push({ video: true });
  if (audio) attempts.push({ audio: true });
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      // Denied or absent — diagnoseDevice() below names the reason for the UI.
    }
  }
}

// A DOMException name is the only place the real cause of an empty device list shows up.
const DEVICE_ISSUE = {
  NotAllowedError: 'blocked',
  PermissionDeniedError: 'blocked',
  SecurityError: 'blocked',
  NotFoundError: 'absent',
  DevicesNotFoundError: 'absent',
  OverconstrainedError: 'absent',
  NotReadableError: 'busy',
  TrackStartError: 'busy',
  AbortError: 'busy',
};

/**
 * An empty list is not the same as "no device". Chromium hides audioinput entries
 * entirely when the permission is blocked, so the setup card must ask why rather than
 * report a missing microphone the user is looking straight at.
 * Returns '' when the device is actually usable.
 */
async function diagnoseDevice(constraints) {
  if (!hasMediaDevices() || !navigator.mediaDevices.getUserMedia) return 'unsupported';
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((track) => track.stop());
    return '';
  } catch (error) {
    logError('device probe failed', constraints, error);
    return DEVICE_ISSUE[error && error.name] || 'error';
  }
}

/** Keep the current device id if still present, else pick a fallback. */
function resolveId(list, current, fallback) {
  if (current && list.some((d) => d.deviceId === current)) return current;
  return fallback(list);
}

/** Prefer the current source if present, else a full-screen source, else the first. */
function resolveSource(sources, current) {
  if (current && sources.some((s) => s.id === current)) return current;
  if (!sources.length) return '';
  const screen = sources.find((s) => /screen|entire|display/i.test(s.name));
  return (screen || sources[0]).id;
}

const MIC_BANNER = 'microphone-unavailable';

/**
 * A recorder that cannot hear should say so on the way in, not after a take. Raised once
 * per run of the problem, retracted the moment a microphone appears, and carrying the
 * actions that fix it rather than describing them.
 */
function announceMicrophoneIssue(state) {
  if (state.microphones.length) {
    notices.dismiss(MIC_BANNER);
    return;
  }
  const issue = state.deviceIssues.microphone;
  const blocked = issue === 'blocked' || state.capabilities.microphone === 'denied';
  if (!blocked && issue !== 'absent') return; // busy/hidden/error: the setup card explains it

  const actions = [{ label: 'Recheck', action: 'refresh-devices', icon: 'refresh' }];
  if (!blocked && isMacHost()) {
    actions.unshift({ label: 'Open Settings', action: 'open-privacy-pane', kind: 'microphone', icon: 'settings', variant: 'primary' });
  }

  notices.banner(
    'warn',
    blocked
      ? 'Rekorder cannot use the microphone: the “microphone” capability is blocked. Grant it in Studio Permissions, then recheck. Recordings will have no audio.'
      : 'Rekorder cannot see a microphone. macOS gives an unauthorized app an empty device list, so this usually means it has not been granted microphone access. Recordings will have no audio.',
    { key: MIC_BANNER, actions },
  );
}

const devices = {
  async refresh() {
    store.setState({ setupLoading: true });
    refs.meterFailedKey = ''; // an explicit refresh is the user asking us to try again

    // Screen/window sources (bridge).
    let desktopSources = [];
    const src = await bridge.screenCapture.getSources();
    if (src.ok && Array.isArray(src.sources)) {
      desktopSources = src.sources.map((s) => ({
        id: s.id,
        name: s.name || s.title || 'Source',
        thumbnail: s.thumbnail || s.thumbnailDataUrl || '',
      }));
    } else if (!src.ok && src.reason !== 'no-host') {
      bridge.fail(src, 'Could not list screen sources.', { cap: 'screen-capture' });
    }

    // Cameras/mics (navigator). Unlock labels once if any are blank.
    let list = await enumerate();
    const blankVideo = list.some((d) => d.kind === 'videoinput' && !d.label);
    const blankAudio = list.some((d) => d.kind === 'audioinput' && !d.label);
    if (blankVideo || blankAudio) {
      await unlockLabels({ video: blankVideo, audio: blankAudio });
      list = await enumerate();
    }
    let cameras = list.filter((d) => d.kind === 'videoinput');
    let microphones = list.filter((d) => d.kind === 'audioinput');

    // A kind that enumerated nothing gets asked directly why. A blocked permission hides
    // its devices from enumerateDevices, so "empty" alone cannot be read as "absent".
    const deviceIssues = { camera: '', microphone: '' };
    if (!microphones.length) deviceIssues.microphone = await diagnoseDevice({ audio: true });
    if (!cameras.length) deviceIssues.camera = await diagnoseDevice({ video: true });

    // A probe that succeeded just granted the permission: the devices are visible now.
    if ((!microphones.length && !deviceIssues.microphone) || (!cameras.length && !deviceIssues.camera)) {
      list = await enumerate();
      cameras = list.filter((d) => d.kind === 'videoinput');
      microphones = list.filter((d) => d.kind === 'audioinput');
    }

    // The probe opened a real stream, yet the device still is not listed. The hardware is
    // there and permitted; the host is not enumerating it. Say that, rather than blame
    // the user's missing microphone.
    if (!microphones.length && !deviceIssues.microphone) deviceIssues.microphone = 'hidden';
    if (!cameras.length && !deviceIssues.camera) deviceIssues.camera = 'hidden';

    logInfo('Rekorder devices', {
      cameras: cameras.length,
      microphones: microphones.length,
      sources: desktopSources.length,
      issues: deviceIssues,
    });
    announceMicrophoneIssue({ ...store.state, microphones, deviceIssues });

    const firstId = (arr) => (arr[0] ? arr[0].deviceId : '');
    store.setState({
      desktopSources,
      cameras,
      microphones,
      deviceIssues,
      selectedCameraId: resolveId(cameras, store.state.selectedCameraId, firstId),
      selectedMicId: resolveId(microphones, store.state.selectedMicId, firstId),
      selectedSourceId: resolveSource(desktopSources, store.state.selectedSourceId),
      setupLoading: false,
    });
  },
};

// ------------------------------------------------------------ camera preview --
// A single persistent <video> kept in refs so it survives innerHTML re-renders.
// The Setup mounter re-parents it into the card and syncs the stream to the
// selected camera, restarting only when the chosen device actually changes.

// The views that host the persistent preview <video>: Setup's camera card and the
// Layouts stage. Record uses the compositor's canvas, not this element.
const PREVIEW_VIEWS = new Set(['setup', 'layouts']);

const cameraPreview = {
  ensureEl() {
    if (!refs.previewCameraEl) {
      const el = document.createElement('video');
      el.className = 'cam-preview__video';
      el.autoplay = true;
      el.muted = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      refs.previewCameraEl = el;
    }
    return refs.previewCameraEl;
  },

  async sync(state) {
    const wantId = state.selectedCameraId;
    const usable =
      state.capabilities.camera !== 'denied' && state.cameras.length && wantId && hasMediaDevices();
    if (!usable) {
      this.stop();
      return;
    }
    if (refs.previewDeviceId === wantId && refs.previewStream) return; // already live
    this.stop();
    refs.previewDeviceId = wantId;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: wantId } },
        audio: false,
      });
      // The selection or the view may have changed while awaiting.
      if (!PREVIEW_VIEWS.has(store.state.view) || store.state.selectedCameraId !== wantId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      refs.previewStream = stream;
      this.ensureEl().srcObject = stream;
    } catch (error) {
      logError('camera preview failed', error);
      refs.previewDeviceId = '';
      notices.toast('warn', 'Could not start the camera preview.');
    }
  },

  stop() {
    if (refs.previewStream) {
      refs.previewStream.getTracks().forEach((track) => track.stop());
      refs.previewStream = null;
    }
    refs.previewDeviceId = '';
    if (refs.previewCameraEl) refs.previewCameraEl.srcObject = null;
  },
};

// --------------------------------------------------------------- mic meter --
// A real level meter. The old one was a CSS animation that waved whether or not the
// microphone was capturing anything, which is precisely the claim the user needs checked.

const METER_BARS = 14;
const METER_SILENCE_RMS = 0.01; // ≈ -40 dBFS
const METER_SILENCE_MS = 2000;
const METER_FLOOR = 6; // a bar never fully disappears, so the meter reads as "live, quiet"

/** RMS of a byte time-domain buffer, where 128 is silence. */
function timeDomainRms(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const sample = (bytes[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / bytes.length);
}

/** Average `bins` into `count` buckets, as percentages. */
function spectrumBars(bins, count) {
  const bars = new Array(count);
  const width = Math.max(1, Math.floor(bins.length / count));
  for (let i = 0; i < count; i += 1) {
    let sum = 0;
    for (let j = 0; j < width; j += 1) sum += bins[i * width + j] || 0;
    bars[i] = Math.min(100, Math.max(METER_FLOOR, Math.round((sum / width / 255) * 140)));
  }
  return bars;
}

const micMeter = {
  /**
   * Which stream the meter is bound to, so a device change restarts it.
   * `selectedMicId` alone is not enough: `settings.load()` restores the last-used id
   * before `devices.refresh()` has had a chance to clear it, and asking for an absent
   * device by `deviceId: { exact }` throws NotFoundError on every render.
   */
  key(state) {
    if (refs.capture.micStream) return 'capture';
    if (state.selectedMicId && state.microphones.some((d) => d.deviceId === state.selectedMicId)) {
      return state.selectedMicId;
    }
    // Permitted but unlisted (T03): nothing to name, so meter the system default.
    if (!state.microphones.length && state.deviceIssues.microphone === 'hidden') return 'default';
    return '';
  },

  async sync(state) {
    const wanted = this.key(state);
    if (!wanted || state.capabilities.microphone === 'denied' || !hasMediaDevices()) {
      this.stop();
      return;
    }
    if (refs.meter && refs.meter.key === wanted) return; // already running on this source
    // A source that already failed must not be retried on every repaint.
    if (refs.meterFailedKey === wanted) return;
    // Nor may a repaint during the `await captureMic()` window below open a second stream
    // for the source the first sync() is already opening: `refs.meter` is still null then,
    // so nothing else here would stop it.
    if (refs.meterPendingKey === wanted) return;
    this.stop();

    const token = (refs.meterToken += 1);
    // A live session already holds the microphone. Opening a second one is wasteful, and
    // some hosts refuse the second capture outright.
    const shared = refs.capture.micStream;
    let stream = shared;
    if (!stream) {
      refs.meterPendingKey = wanted;
      try {
        stream = await captureMic(state);
      } catch (error) {
        logError('mic meter capture failed', error);
        refs.meterFailedKey = wanted; // latch: one attempt per source, not one per repaint
        this.status(`The microphone could not be opened — ${describe(error)}`, 'warn');
        return;
      } finally {
        // Only if a newer sync() has not already claimed the slot for its own source.
        if (refs.meterPendingKey === wanted) refs.meterPendingKey = '';
      }
    }
    if (!stream) return;
    if (token !== refs.meterToken || store.state.view !== 'setup') {
      if (!shared) stopStream(stream); // we opened it and nobody wants it now
      return;
    }

    let audioContext;
    try {
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser); // analyser only — never to the destination, or the user hears themselves
      refs.meter = {
        key: wanted,
        audioContext,
        source,
        analyser,
        stream,
        owned: !shared,
        raf: 0,
        lastSoundAt: performance.now(),
        frequency: new Uint8Array(analyser.frequencyBinCount),
        time: new Uint8Array(analyser.fftSize),
      };
    } catch (error) {
      logError('mic meter graph failed', error);
      closeAudioContext(audioContext);
      if (!shared) stopStream(stream);
      refs.meterFailedKey = wanted;
      this.status('The microphone meter could not start.', 'warn');
      return;
    }

    // A suspended context reports a live-but-silent signal, which would read as "no sound".
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        logError('mic meter resume failed', error);
      }
    }
    if (token !== refs.meterToken) return; // torn down while awaiting
    if (audioContext.state !== 'running') {
      this.status('Audio is blocked in this window — the meter cannot run.');
      return;
    }
    this.tick();
  },

  /** Paint straight to the DOM: a setState per animation frame would rebuild the view. */
  tick() {
    const meter = refs.meter;
    if (!meter) return;
    meter.raf = requestAnimationFrame(() => this.tick());

    meter.analyser.getByteFrequencyData(meter.frequency);
    meter.analyser.getByteTimeDomainData(meter.time);

    const bars = spectrumBars(meter.frequency, METER_BARS);
    const nodes = document.querySelectorAll('[data-meter-bar]');
    nodes.forEach((node, i) => {
      node.style.height = `${bars[i] === undefined ? METER_FLOOR : bars[i]}%`;
    });

    const rms = timeDomainRms(meter.time);
    const now = performance.now();
    if (rms >= METER_SILENCE_RMS) meter.lastSoundAt = now;
    const silent = now - meter.lastSoundAt > METER_SILENCE_MS;
    this.status(
      silent
        ? 'No sound detected — say something, or pick another microphone.'
        : 'Picking up sound.',
      silent ? 'warn' : 'good',
    );
  },

  status(message, tone = '') {
    const el = document.querySelector('[data-meter-status]');
    if (!el) return;
    if (el.textContent !== message) el.textContent = message;
    el.dataset.tone = tone;
  },

  stop() {
    const meter = refs.meter;
    refs.meter = null;
    refs.meterToken += 1; // invalidate any sync() still awaiting
    refs.meterPendingKey = '';
    if (!meter) return;
    if (meter.raf) cancelAnimationFrame(meter.raf);
    try {
      meter.source.disconnect();
    } catch (error) {
      logError('mic meter teardown failed', error);
    }
    closeAudioContext(meter.audioContext);
    if (meter.owned) stopStream(meter.stream); // never stop the capture session's microphone
  },
};

// ------------------------------------------------------------------ capture --
// Acquires the screen, camera, and microphone streams, mixes the audio, and
// hands the compositor a pair of <video> elements to draw from (LLD §5, §6).

// A live studio session. `stopping` belongs here: the stage (and the canvas the
// recorder is still flushing) must stay mounted while the blob is finalized.
const ACTIVE_STATUSES = new Set(['starting', 'preview', 'recording', 'paused', 'stopping']);

// Stable banner keys, so the condition that raised one can also retract it.
const SCREEN_CAPTURE_BANNER = 'screen-capture-unavailable';

// Resolution resizes the canvas that `captureStream()` is already bound to, and the frame
// rate is baked into that stream when recording starts. Neither may change mid-take —
// wherever those two controls are rendered.
const RECORD_LOCKED_STATUSES = new Set(['recording', 'paused', 'stopping']);

/** The §6 route-4 outcome: no route could bind a capturable screen stream. */
const SCREEN_BRIDGE_MESSAGE =
  'Rekorder could not capture a screen in this host. Binding a chosen source to a stream needs a ' +
  'TinyAtom platform bridge — please report this. Nothing was recorded.';

function captureFailure(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function errorText(error) {
  return (error && (error.message || error.name)) || 'Unknown error';
}

function stopStream(stream) {
  if (stream) stream.getTracks().forEach((track) => track.stop());
}

/**
 * `close()` reports an already-closed context by REJECTING, not throwing, so a bare
 * `context.close()` turns a diagnosable failure into an unhandled rejection.
 */
function closeAudioContext(context) {
  if (!context) return;
  try {
    const closing = context.close();
    if (closing && typeof closing.catch === 'function') {
      closing.catch((error) => logError('audio context close failed', error));
    }
  } catch (error) {
    logError('audio context close failed', error);
  }
}

/** A muted, playing <video> bound to a stream, resolved once it has metadata. */
async function createVideoElement(stream) {
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  if (video.readyState < 1) {
    await new Promise((resolve) => {
      const done = () => {
        video.removeEventListener('loadedmetadata', done);
        resolve();
      };
      video.addEventListener('loadedmetadata', done);
      setTimeout(done, 5000); // never hang the studio on a silent track
    });
  }
  await video.play().catch(() => undefined);
  return video;
}

const desktopSourceConstraint = (sourceId, extra = {}) => ({
  mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, ...extra },
});

/**
 * Ordered screen-capture fallback (LLD §6):
 *   1. getUserMedia bound to the exact chosen source id (Chromium desktop capture).
 *   2. getDisplayMedia — the host's own source picker.
 *   3. Either route retries without system audio before giving up on it.
 *   4. No route yields a stream → a platform-bridge failure the caller surfaces.
 * Returns { stream, systemAudio, route }.
 */
async function captureScreen(state) {
  // Ask first. Otherwise a denied capability yields no sources (route 1 skipped) and a
  // host-refused getDisplayMedia (route 2), whose NotAllowedError would be renamed into
  // "Screen sharing was cancelled" — blaming the user for a picker they never saw.
  if (state.capabilities.screenCapture === 'denied') {
    throw captureFailure(
      explainFailure({ reason: 'capability-denied' }, null, { cap: CAP_IDS.screenCapture }),
      'capability-denied',
    );
  }
  if (!hasMediaDevices() || !navigator.mediaDevices.getUserMedia) {
    throw captureFailure('This host has no media devices.', 'no-media-devices');
  }

  const resolution = RESOLUTIONS[state.resolutionIndex] || RESOLUTIONS[0];
  const audioFirst = state.includeSystemAudio ? [true, false] : [false];
  const failures = [];

  // Route 1 (+3): the exact source the user picked, no OS prompt.
  if (state.selectedSourceId) {
    for (const withAudio of audioFirst) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: withAudio ? desktopSourceConstraint(state.selectedSourceId) : false,
          video: desktopSourceConstraint(state.selectedSourceId, {
            maxWidth: resolution.width,
            maxHeight: resolution.height,
            maxFrameRate: state.frameRate,
          }),
        });
        return { stream, systemAudio: stream.getAudioTracks().length > 0, route: 'source-id' };
      } catch (error) {
        failures.push(`source-id${withAudio ? '+audio' : ''}: ${errorText(error)}`);
      }
    }
  }

  // Route 2 (+3): the host picker. A cancel here is the user's choice, not a failure.
  if (navigator.mediaDevices.getDisplayMedia) {
    for (const withAudio of audioFirst) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
            frameRate: { ideal: state.frameRate },
          },
          audio: withAudio,
        });
        return { stream, systemAudio: stream.getAudioTracks().length > 0, route: 'display-media' };
      } catch (error) {
        // Chromium raises NotAllowedError both when the user cancels the picker AND
        // when the *audio* half of the request is refused (the macOS system-audio
        // case). Only the audio-free attempt can be read as a real cancel; on the
        // audio-on attempt, fall through to route 3 and ask again without it.
        if (error && error.name === 'NotAllowedError') {
          if (!withAudio) throw captureFailure('Screen sharing was cancelled or blocked.', 'cancelled');
          notices.toast('warn', 'System audio was refused — asking again for screen video only.');
        }
        failures.push(`display-media${withAudio ? '+audio' : ''}: ${errorText(error)}`);
      }
    }
  }

  // Route 4.
  logError('screen capture: every route failed', failures);
  throw captureFailure(SCREEN_BRIDGE_MESSAGE, 'screen-bridge-missing');
}

/** Camera/mic are optional: a failure degrades the studio instead of aborting it. */
/**
 * Pick the constraint for a source:
 *  - a chosen device is requested by id;
 *  - nothing chosen while devices *are* listed means the user turned the source off;
 *  - nothing chosen and nothing listed is only worth a default-device attempt when the
 *    probe proved the device works (`hidden`). On `absent` the probe already threw
 *    NotFoundError, and asking again would throw again on every preview start.
 */
function deviceConstraint(selectedId, listed, issue, tuning) {
  if (selectedId) return { deviceId: { exact: selectedId }, ...tuning };
  if (listed.length) return null;
  return issue === 'hidden' ? tuning : null;
}

async function captureCamera(state) {
  if (state.capabilities.camera === 'denied') return null;
  const video = deviceConstraint(state.selectedCameraId, state.cameras, state.deviceIssues.camera, {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: state.frameRate },
  });
  if (!video) return null;
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

async function captureMic(state) {
  if (state.capabilities.microphone === 'denied') return null;
  const audio = deviceConstraint(state.selectedMicId, state.microphones, state.deviceIssues.microphone, {
    echoCancellation: state.enhanceAudio,
    noiseSuppression: state.enhanceAudio,
    autoGainControl: state.enhanceAudio,
  });
  if (!audio) return null;
  return navigator.mediaDevices.getUserMedia({ video: false, audio });
}

async function optional(promise, label) {
  try {
    return await promise;
  } catch (error) {
    logError(`${label} capture failed`, error);
    notices.toast('warn', `Could not open the ${label}. Continuing without it.`);
    return null;
  }
}

/**
 * Mix screen audio + mic into one stream the recorder (T05) can consume.
 *
 * The graph never reaches `audioContext.destination` (we record it, we do not play
 * it), so the spec's liveness rules do not keep it alive: an unreferenced
 * MediaStreamAudioSourceNode is collectable and Chromium does collect it. Every node
 * and its wrapper stream is handed back for `refs.capture` to hold until teardown —
 * dropping them mid-take yields a live-but-silent track, and `mixedAudio` stays
 * truthy so the "Recording without audio" warning never fires.
 */
async function mixAudio(screenStream, micStream) {
  const screenAudio = screenStream ? screenStream.getAudioTracks() : []; // null on camera-only

  const micAudio = micStream ? micStream.getAudioTracks() : [];
  if (!screenAudio.length && !micAudio.length) {
    return { audioContext: null, audioNodes: null, mixedAudio: null };
  }

  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const inputStreams = [];
  const sources = [];
  for (const tracks of [screenAudio, micAudio]) {
    if (!tracks.length) continue;
    const stream = new MediaStream(tracks);
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(destination);
    inputStreams.push(stream);
    sources.push(source);
  }

  // A suspended context still emits a live-but-silent track, so the recorder's
  // "no audio" warning would never fire and the silence surfaces only after the take.
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (error) {
      logError('audio context resume failed', error);
    }
  }
  if (audioContext.state !== 'running') {
    notices.toast('warn', 'Audio could not start — this recording may be silent.');
  }
  return { audioContext, audioNodes: { sources, destination, inputStreams }, mixedAudio: destination.stream };
}

const capture = {
  /** Acquire everything and start the preview. Safe to call from a Retry click. */
  async prepareStudio() {
    if (ACTIVE_STATUSES.has(store.state.status)) {
      store.setState({ view: 'record', layoutPanelOpen: false });
      return;
    }

    const token = (refs.prepareToken += 1);
    this.reset();
    store.setState({
      view: 'record',
      layoutPanelOpen: false,
      status: 'starting',
      captureError: '',
      captureErrorCode: '',
    });

    // Camera-only records the webcam and nothing else, so the screen is never acquired:
    // no host picker, no share prompt, no system audio (T18). `screen` stays null and every
    // step below treats a screenless studio as a first-class shape.
    const solo = !needsScreen(store.state.layout);

    let screen = null;
    if (!solo) {
      try {
        screen = await captureScreen(store.state);
      } catch (error) {
        // A stale failure must not repaint the app: leaving Record mid-start bumped the
        // token via endPreview(), and there is no studio on screen left to show an error.
        if (token === refs.prepareToken) this.fail(error);
        return;
      }
      notices.dismiss(SCREEN_CAPTURE_BANNER); // a route bound; the old failure is history
      if (token !== refs.prepareToken) {
        stopStream(screen.stream);
        return;
      }
    }
    const screenStream = screen ? screen.stream : null;

    const state = store.state;
    const [cameraStream, micStream] = await Promise.all([
      optional(captureCamera(state), 'camera'),
      optional(captureMic(state), 'microphone'),
    ]);
    if (token !== refs.prepareToken) {
      [screenStream, cameraStream, micStream].forEach(stopStream);
      return;
    }

    // Every other layout survives a missing camera by falling back to the full screen.
    // Camera-only has nothing to fall back to — a studio with no camera would record a
    // blank rectangle, so refuse it and say which of the two fixes applies.
    if (solo && !cameraStream) {
      [micStream].forEach(stopStream);
      this.fail(
        captureFailure(
          'The Camera only layout records your camera, and no camera could be opened. ' +
            'Choose a camera in Setup, or pick a layout that records your screen.',
          'camera-required',
        ),
      );
      return;
    }

    if (cameraStream) cameraStream.getVideoTracks().forEach((t) => (t.enabled = state.cameraEnabled));
    if (micStream) micStream.getAudioTracks().forEach((t) => (t.enabled = state.micEnabled));

    const [screenVideo, cameraVideo] = await Promise.all([
      screenStream ? createVideoElement(screenStream) : Promise.resolve(null),
      cameraStream ? createVideoElement(cameraStream) : Promise.resolve(null),
    ]);
    if (token !== refs.prepareToken) {
      [screenStream, cameraStream, micStream].forEach(stopStream);
      return;
    }

    const { audioContext, audioNodes, mixedAudio } = await mixAudio(screenStream, micStream);
    if (token !== refs.prepareToken) {
      if (audioContext) audioContext.close().catch(() => undefined);
      [screenStream, cameraStream, micStream].forEach(stopStream);
      return;
    }

    refs.capture = {
      ...emptyCapture(), // the loop handles start clean; startDrawLoop() owns them
      screenStream,
      cameraStream,
      micStream,
      audioContext,
      audioNodes,
      mixedAudio,
      screenVideo,
      cameraVideo,
    };

    // The host picker's own "Stop sharing" control ends the track behind our back.
    // Camera-only never opened a picker, so there is no such track to watch.
    if (screenStream) {
      screenStream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', async () => {
          if (refs.capture.screenStream !== screenStream) return;
          notices.toast('info', 'Screen sharing ended.');
          await this.endPreview();
          // The studio auto-starts on entry (T15), so `idle` on the Record tab would
          // either strand a spinner or silently re-grab the screen the user just
          // released. Surface the external stop as a retryable state instead.
          if (store.state.view === 'record') {
            store.setState({
              status: 'error',
              captureError: 'Screen sharing was stopped from the sharing controls. Retry to go live again.',
              captureErrorCode: '',
            });
          }
        });
      });
    }

    store.setState({ status: 'preview', timerMs: 0, systemAudioActive: screen ? screen.systemAudio : false });
    this.startDrawLoop();

    // System audio rides on the screen stream, so camera-only cannot have it and the
    // setting is not "unavailable here" — it simply does not apply to this layout.
    if (screen && state.includeSystemAudio && !screen.systemAudio) {
      notices.toast('warn', 'System audio isn’t available here — recording screen video with your microphone.');
    }
    notices.toast('good', solo ? 'Camera preview is live.' : 'Studio preview is live.');
  },

  /**
   * Composite from a bundled Worker's timer, not requestAnimationFrame.
   *
   * The studio is meant to be used while its own window is in the background — that is
   * the whole point of a screen recorder — and Chromium stops rAF and throttles page
   * timers to ~1Hz for a hidden or occluded window. Painting from the page would freeze
   * the canvas, and with it the recorded video, on the frame the user switched away on.
   * `ticker.js` keeps its interval while the page is hidden; rAF is the fallback for a
   * host where the worker cannot run (the recording still freezes there, but only where
   * the worker is unavailable). Every worker failure mode has to reach that fallback: a
   * worker that is constructed but dead paints nothing at all, which is worse than the
   * background freeze this loop exists to fix.
   */
  startDrawLoop() {
    const bundle = refs.capture;
    if (bundle.drawing) return;
    bundle.drawing = true;

    try {
      const ticker = new Worker('ticker.js');
      ticker.onmessage = () => {
        if (bundle.tickerWatchdog !== null) {
          clearTimeout(bundle.tickerWatchdog); // it ticks; the clock is trustworthy from here
          bundle.tickerWatchdog = null;
        }
        drawFrame();
      };
      // A fetch/parse/runtime failure fires here instead of throwing at construction.
      ticker.onerror = (event) => this.demoteTicker(ticker, 'frame ticker worker failed', event);
      ticker.postMessage({ type: 'start', fps: store.state.frameRate });
      bundle.ticker = ticker;
      // A worker that loads but never ticks is just as fatal, and silent. Demote it too.
      bundle.tickerWatchdog = setTimeout(
        () => this.demoteTicker(ticker, 'frame ticker worker sent no frames', null),
        TICKER_FIRST_TICK_MS,
      );
      return;
    } catch (error) {
      logError('frame ticker worker unavailable; compositing from requestAnimationFrame', error);
    }
    bundle.animationId = requestAnimationFrame(drawFrame);
  },

  /** Drop a broken worker and re-clock the live loop from rAF. Safe to call twice. */
  demoteTicker(ticker, message, detail) {
    const bundle = refs.capture;
    if (bundle.ticker !== ticker) return; // already stopped, or already demoted
    logError(`${message}; compositing from requestAnimationFrame`, detail);

    if (bundle.tickerWatchdog !== null) {
      clearTimeout(bundle.tickerWatchdog);
      bundle.tickerWatchdog = null;
    }
    ticker.onmessage = null;
    ticker.onerror = null;
    ticker.terminate();
    bundle.ticker = null;

    if (bundle.drawing && bundle.animationId === null) {
      bundle.animationId = requestAnimationFrame(drawFrame); // drawFrame re-schedules itself now
    }
  },

  /** Re-clock a live compositor when the frame rate setting changes under it. */
  retimeDrawLoop() {
    const bundle = refs.capture;
    if (!bundle.drawing || !bundle.ticker) return;
    bundle.ticker.postMessage({ type: 'start', fps: store.state.frameRate });
  },

  /** Stop the compositor, whichever clock is driving it. */
  stopDrawLoop() {
    const bundle = refs.capture;
    bundle.drawing = false;
    if (bundle.tickerWatchdog !== null) {
      clearTimeout(bundle.tickerWatchdog);
      bundle.tickerWatchdog = null;
    }
    if (bundle.ticker) {
      bundle.ticker.terminate();
      bundle.ticker = null;
    }
    if (bundle.animationId !== null) cancelAnimationFrame(bundle.animationId);
    bundle.animationId = null;
  },

  /** Cancel the loop, stop every track, close the AudioContext, drop the bundle. */
  reset() {
    recorder.dispose();
    this.stopDrawLoop();
    const bundle = refs.capture;
    stopStream(bundle.screenStream);
    stopStream(bundle.cameraStream);
    stopStream(bundle.micStream);
    if (bundle.audioNodes) {
      for (const node of [...bundle.audioNodes.sources, bundle.audioNodes.destination]) {
        try {
          node.disconnect();
        } catch (error) {
          logError('audio node disconnect failed', error);
        }
      }
    }
    if (bundle.audioContext) bundle.audioContext.close().catch(() => undefined);
    if (bundle.screenVideo) bundle.screenVideo.srcObject = null;
    if (bundle.cameraVideo) bundle.cameraVideo.srcObject = null;
    refs.capture = emptyCapture();
  },

  /** Stop first so an in-flight recording is finalized, never dropped. */
  /**
   * Tear the studio down and bring it back on the streams the current layout needs (T18).
   * `prepareStudio()` is a no-op while a session is live, so the end must come first.
   */
  async restartStudio({ layoutPanelOpen = false } = {}) {
    await this.endPreview();
    await this.prepareStudio();
    if (layoutPanelOpen && ACTIVE_STATUSES.has(store.state.status)) {
      store.setState({ layoutPanelOpen: true });
    }
  },

  async endPreview() {
    refs.endingPreview = true;
    try {
      if (recorder.isActive()) await recorder.stop();
      refs.prepareToken += 1;
      this.reset();
      store.setState({
        status: 'idle',
        timerMs: 0,
        captureError: '',
        captureErrorCode: '',
        systemAudioActive: false,
        layoutPanelOpen: false,
      });
    } finally {
      refs.endingPreview = false;
    }
  },

  /**
   * With no End Preview control (T15), a preview whose recording finalized while the
   * user was on another tab would hold the screen, camera, and microphone forever.
   * Release it; re-entering Record starts a fresh one.
   */
  releaseIfParked() {
    if (store.state.status === 'preview' && store.state.view !== 'record' && !refs.endingPreview) {
      this.endPreview();
    }
  },

  fail(error) {
    refs.prepareToken += 1;
    this.reset();
    const message = errorText(error);
    const code = (error && error.code) || '';
    store.setState({
      status: 'error',
      captureError: message,
      captureErrorCode: code,
      timerMs: 0,
      systemAudioActive: false,
    });
    if (code === 'screen-bridge-missing') {
      // Dismissible, and keyed so a later successful capture can retract it. A banner the
      // user cannot close, describing a condition that has since been fixed, is furniture.
      notices.banner('danger', message, { key: SCREEN_CAPTURE_BANNER });
    } else {
      notices.toast('warn', message);
    }
  },

  /** Live toggles: flip the track, not the stream, so recording never breaks. */
  setMicEnabled(enabled) {
    const { micStream } = refs.capture;
    if (micStream) micStream.getAudioTracks().forEach((track) => (track.enabled = enabled));
    store.setState({ micEnabled: enabled });
    settings.save();
  },

  /**
   * echoCancellation/noiseSuppression/autoGainControl are read once, at getUserMedia time.
   * Re-apply them to the live track so the toggle means something during a session;
   * a host that refuses says so rather than pretending the change landed.
   * Returns 'idle' (no live mic), 'applied', or 'failed'.
   */
  async setEnhanceAudio(enabled) {
    store.setState({ enhanceAudio: enabled });
    settings.save();

    const { micStream } = refs.capture;
    const tracks = micStream ? micStream.getAudioTracks() : [];
    if (!tracks.length) return 'idle';

    try {
      await Promise.all(
        tracks.map((track) =>
          track.applyConstraints({
            echoCancellation: enabled,
            noiseSuppression: enabled,
            autoGainControl: enabled,
          }),
        ),
      );
      return 'applied';
    } catch (error) {
      logError('applyConstraints failed for enhanceAudio', error);
      return 'failed';
    }
  },

  setCameraEnabled(enabled) {
    // The camera IS the scene in a solo layout: hiding it would record a blank rectangle.
    // The studio's toggle is already locked there; this is the invariant behind the lock.
    if (!enabled && !needsScreen(store.state.layout)) return;

    const { cameraStream } = refs.capture;
    if (cameraStream) cameraStream.getVideoTracks().forEach((track) => (track.enabled = enabled));
    store.setState({ cameraEnabled: enabled });
    settings.save();
  },
};

// --------------------------------------------------------------- compositor --
// Draws the scene snapshot onto the persistent canvas every frame (LLD §5.3).
// The canvas is what MediaRecorder captures in T05, so these colors are baked
// into the recording: they come from theme-independent stage tokens, never from
// the host's light/dark palette.

const CSS_VAR_CACHE = new Map();

function cssVar(name) {
  if (!CSS_VAR_CACHE.has(name)) {
    CSS_VAR_CACHE.set(name, getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  }
  return CSS_VAR_CACHE.get(name);
}

/** The store snapshot the draw loop reads, so it never touches state mid-frame. */
function syncScene(state) {
  refs.scene = {
    mode: layoutPreset(state.layout).mode,
    shape: layoutPreset(state.layout).shape || 'rect',
    cameraRect: cameraBox(state),
    screenRect: screenBox(state),
    cameraBorder: state.cameraBorder,
    cameraVisible: state.cameraEnabled,
    resolution: RESOLUTIONS[state.resolutionIndex] || RESOLUTIONS[0],
  };
}

/**
 * Draw `video` filling the box, cropping the overflow (object-fit: cover).
 * The clip is load-bearing: a 16:9 source covering a narrow box (split, side-by-side)
 * overflows it by design, and without clipping the camera pane bleeds over the screen pane.
 */
function fillVideoCover(context, video, x, y, width, height) {
  const videoWidth = video.videoWidth || width;
  const videoHeight = video.videoHeight || height;
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.drawImage(video, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
}

function drawRoundedVideo(context, video, x, y, width, height, radius, border) {
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.clip();
  fillVideoCover(context, video, x, y, width, height);
  context.restore();

  if (!border) return;
  context.save();
  context.lineWidth = Math.max(4, width * 0.012);
  context.strokeStyle = cssVar('--atom-camera-outline');
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.stroke();
  context.restore();
}

/** A circular camera bubble: inscribe the circle, clip, cover-fill, stroke the border. */
function drawCircleVideo(context, video, x, y, width, height, border) {
  const radius = Math.min(width, height) / 2;
  const cx = x + width / 2;
  const cy = y + height / 2;
  context.save();
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.clip();
  fillVideoCover(context, video, cx - radius, cy - radius, radius * 2, radius * 2);
  context.restore();

  if (!border) return;
  context.save();
  context.lineWidth = Math.max(4, radius * 0.024);
  context.strokeStyle = cssVar('--atom-camera-outline');
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawFrame() {
  const bundle = refs.capture;
  if (!bundle.drawing) return; // stopDrawLoop() ended the loop
  // The worker pushes a frame per tick; only the rAF fallback re-schedules itself.
  if (!bundle.ticker) bundle.animationId = requestAnimationFrame(drawFrame);

  const canvas = refs.canvas;
  if (!canvas) return;

  const scene = refs.scene;
  const solo = scene.mode === 'solo'; // camera-only: there is no screen stream to wait on
  const screen = bundle.screenVideo;
  if (!solo && (!screen || screen.readyState < 2)) return;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;

  const { width, height } = scene.resolution;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  context.fillStyle = cssVar('--atom-stage-bg');
  context.fillRect(0, 0, width, height);

  const camera = bundle.cameraVideo;
  const scaled = (px) => (px / 1920) * width; // radii authored against a 1080p stage
  const box = (rect) => [width * rect.x, height * rect.y, width * rect.w, height * rect.h];

  // Every layout degrades to a full-stage screen when there is no camera to draw — except
  // camera-only, which has no screen to fall back on and paints the empty stage instead.
  if (!camera || camera.readyState < 2 || !scene.cameraVisible) {
    if (!solo) fillVideoCover(context, screen, 0, 0, width, height);
    return;
  }

  if (solo) {
    fillVideoCover(context, camera, 0, 0, width, height);
  } else if (scene.mode === 'columns') {
    fillVideoCover(context, screen, ...box(scene.screenRect));
    fillVideoCover(context, camera, ...box(scene.cameraRect));
  } else if (scene.mode === 'inset') {
    fillVideoCover(context, camera, ...box(scene.cameraRect));
    drawRoundedVideo(context, screen, ...box(scene.screenRect), scaled(28), true);
  } else if (scene.mode === 'scrim') {
    fillVideoCover(context, screen, 0, 0, width, height);
    context.fillStyle = cssVar('--atom-stage-scrim');
    context.fillRect(0, 0, width, height);
    drawRoundedVideo(context, camera, ...box(scene.cameraRect), scaled(36), scene.cameraBorder);
  } else if (scene.shape === 'circle') {
    fillVideoCover(context, screen, 0, 0, width, height);
    drawCircleVideo(context, camera, ...box(scene.cameraRect), scene.cameraBorder);
  } else {
    fillVideoCover(context, screen, 0, 0, width, height);
    drawRoundedVideo(context, camera, ...box(scene.cameraRect), scaled(34), scene.cameraBorder);
  }
}

// ------------------------------------------------------------------ recorder --
// MediaRecorder lifecycle over the composited canvas (LLD §7). The clock ticks
// imperatively into the DOM rather than through setState, so a 4 Hz timer never
// re-mounts the canvas the recorder is capturing.

// Preference order per LLD §7. In Chromium this normally resolves to WebM; a
// host that records MP4 natively makes T08's transcode a straight copy.
const MIME_PREFERENCE = [
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return MIME_PREFERENCE.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

const RECORDER_FAIL_REASON = 'Recording stopped unexpectedly';

/** The container the recorder actually produced. Never assume WebM. */
function extensionFor(mimeType) {
  return /mp4/i.test(mimeType || '') ? 'mp4' : 'webm';
}

// ~8.7 Mbps at 1080p60, ~4.4 at 1080p30. Capped so 1440p60 stays sane.
const BITS_PER_PIXEL_FRAME = 0.07;
const MAX_VIDEO_BITRATE = 24_000_000;
const AUDIO_BITRATE = 128_000;

function videoBitrate(resolution, frameRate) {
  const raw = resolution.width * resolution.height * frameRate * BITS_PER_PIXEL_FRAME;
  return Math.min(MAX_VIDEO_BITRATE, Math.round(raw));
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

const THUMBNAIL_WIDTH = 320;

/** Downscale the stage to a few-KB JPEG; the index stores these inline (LLD §3). */
function captureThumbnail() {
  const canvas = refs.canvas;
  if (!canvas || !canvas.width || !canvas.height) return '';
  const scaled = document.createElement('canvas');
  scaled.width = THUMBNAIL_WIDTH;
  scaled.height = Math.round((canvas.height / canvas.width) * THUMBNAIL_WIDTH);
  const context = scaled.getContext('2d');
  if (!context) return '';
  context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  try {
    return scaled.toDataURL('image/jpeg', 0.72);
  } catch (error) {
    logError('thumbnail capture failed', error); // tainted canvas
    return '';
  }
}

const RECORDING_STATUSES = new Set(['recording', 'paused']);

const recorder = {
  isActive() {
    return RECORDING_STATUSES.has(store.state.status) && !!refs.mediaRecorder;
  },

  /** Elapsed time excluding every paused span. Frozen once `pausedAt` is set. */
  elapsedMs() {
    const clock = refs.clock;
    if (!clock.startedAt) return 0;
    const now = clock.pausedAt || performance.now();
    return Math.max(0, now - clock.startedAt - clock.totalPausedMs);
  },

  /** Freeze the clock and commit the elapsed value to state. Idempotent. */
  freeze() {
    if (refs.clock.startedAt && !refs.clock.pausedAt) refs.clock.pausedAt = performance.now();
    store.setState({ timerMs: this.elapsedMs() });
  },

  paintClock() {
    const el = document.querySelector('[data-clock]');
    if (el) el.textContent = formatClock(this.elapsedMs());
  },

  stopClock() {
    if (refs.clock.timerId !== null) clearInterval(refs.clock.timerId);
    refs.clock.timerId = null;
  },

  /** Stop the canvas capture stream only — the mixed audio track belongs to the AudioContext. */
  releaseStream() {
    if (refs.canvasStream) refs.canvasStream.getTracks().forEach((track) => track.stop());
    refs.canvasStream = null;
  },

  start() {
    const state = store.state;
    if (state.status !== 'preview' || refs.mediaRecorder) return;
    const canvas = refs.canvas;
    if (!canvas) return;
    if (typeof MediaRecorder === 'undefined') {
      notices.toast('danger', 'This host cannot record: MediaRecorder is unavailable.');
      return;
    }

    const resolution = RESOLUTIONS[state.resolutionIndex] || RESOLUTIONS[0];
    const { mixedAudio } = refs.capture;
    const mimeType = pickMimeType();
    const options = {
      videoBitsPerSecond: videoBitrate(resolution, state.frameRate),
      audioBitsPerSecond: AUDIO_BITRATE,
    };
    if (mimeType) options.mimeType = mimeType;

    // captureStream(), the constructor, and start() can each throw. A partial start
    // must leave no refs behind, or the `refs.mediaRecorder` guard above turns every
    // later Record click into a silent no-op.
    let canvasStream = null;
    try {
      canvasStream = canvas.captureStream(state.frameRate);
      const tracks = [...canvasStream.getVideoTracks()];
      if (mixedAudio) tracks.push(...mixedAudio.getAudioTracks());

      const mediaRecorder = new MediaRecorder(new MediaStream(tracks), options);
      refs.mediaRecorder = mediaRecorder;
      refs.canvasStream = canvasStream;
      refs.chunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size) refs.chunks.push(event.data);
      };
      mediaRecorder.onerror = (event) => this.fail(event);
      mediaRecorder.onstop = () => this.finalize();

      mediaRecorder.start(1000); // 1s timeslices, so a crash still leaves usable chunks
    } catch (error) {
      logError('recorder start failed', error);
      if (canvasStream) canvasStream.getTracks().forEach((track) => track.stop());
      refs.mediaRecorder = null;
      refs.canvasStream = null;
      refs.chunks = [];
      notices.toast('danger', 'Could not start the recorder. The preview is still live — try Record again.');
      return;
    }

    refs.clock = { startedAt: performance.now(), pausedAt: 0, totalPausedMs: 0, timerId: null };
    refs.clock.timerId = setInterval(() => this.paintClock(), 250);

    store.setState({ status: 'recording', timerMs: 0 });
    this.paintClock();
    if (!mixedAudio) notices.toast('warn', 'Recording without audio — no microphone or system audio.');
  },

  pause() {
    if (store.state.status !== 'recording' || !refs.mediaRecorder) return;
    refs.mediaRecorder.pause();
    this.freeze();
    store.setState({ status: 'paused' });
  },

  resume() {
    if (store.state.status !== 'paused' || !refs.mediaRecorder) return;
    refs.mediaRecorder.resume();
    refs.clock.totalPausedMs += performance.now() - refs.clock.pausedAt;
    refs.clock.pausedAt = 0;
    store.setState({ status: 'recording' });
    this.paintClock();
  },

  /** Resolves with the persisted recording (or null) once onstop has finalized. */
  stop() {
    if (!this.isActive()) return Promise.resolve(null);
    this.stopClock();
    this.freeze();
    store.setState({ status: 'stopping' });
    return new Promise((resolve) => {
      refs.stopResolvers.push(resolve);
      try {
        refs.mediaRecorder.stop(); // → onstop → finalize() → settle()
      } catch (error) {
        this.fail(error); // never leave the caller awaiting a stop that won't come
      }
    });
  },

  settle(item) {
    const resolvers = refs.stopResolvers;
    refs.stopResolvers = [];
    resolvers.forEach((resolve) => resolve(item));
  },

  /**
   * onstop: build the blob, grab a thumbnail, hand off to the library.
   * `reason` is set when we got here from a recorder error rather than a clean stop —
   * the take is still salvaged, the copy just says so.
   */
  async finalize({ reason = '' } = {}) {
    const mediaRecorder = refs.mediaRecorder;
    if (!mediaRecorder) return; // already torn down by fail() or dispose()

    this.stopClock();
    this.freeze();
    const durationMs = store.state.timerMs;
    const mimeType = mediaRecorder.mimeType || pickMimeType() || 'video/webm';
    const chunks = refs.chunks;
    const thumbnail = captureThumbnail(); // before reset() blanks the canvas

    this.releaseStream();
    refs.mediaRecorder = null;
    refs.chunks = [];
    refs.clock = emptyClock();

    let item = null;
    let indexed = false;
    if (chunks.length) {
      const blob = new Blob(chunks, { type: mimeType });
      try {
        const saved = await library.persist({ blob, thumbnail, durationMs, mimeType, extension: extensionFor(mimeType) });
        item = saved.item;
        indexed = saved.indexed;
      } catch (error) {
        // A failed save must never strand the studio in `stopping`. persist() throws
        // user-ready copy (a denied capability names itself); fall back if it did not.
        logError('persist failed', error);
        notices.toast('danger', (error && error.message) || 'The recording could not be saved.');
      }
    } else if (!reason) {
      notices.toast('warn', 'Nothing was captured — the recording was empty.');
    }

    // endPreview() may already have torn the capture down behind us.
    store.setState({
      status: refs.capture.screenStream ? 'preview' : 'idle',
      timerMs: 0,
      selectedRecordingId: item ? item.id : store.state.selectedRecordingId,
    });
    capture.releaseIfParked();
    // A quarantined index means the file is on disk but will never be listed again. Every
    // path that reports a save has to say so — the salvage path included.
    const unlisted = ' It will not be listed after a reload, because the recordings library could not be updated.';
    if (item && reason) {
      notices.toast(
        'warn',
        `${reason} — saved the ${formatClock(item.durationMs)} recorded so far.${indexed ? '' : unlisted}`,
      );
    } else if (item && !indexed) {
      notices.toast(
        'warn',
        `Saved ${formatClock(item.durationMs)} to disk, but the recordings library could not be updated — this recording will not be listed after a reload.`,
      );
    } else if (item) {
      notices.toast('good', `Recording finished — ${formatClock(item.durationMs)}.`);
    } else if (reason) {
      notices.toast('danger', `${reason}. Nothing could be saved.`);
    }
    this.settle(item);
  },

  /**
   * A recorder error, or a stop() that threw. `start(1000)` buffers 1s timeslices for
   * exactly this: whatever was recorded before the fault is saved rather than dropped.
   */
  fail(event) {
    logError('MediaRecorder error', event);
    const mediaRecorder = refs.mediaRecorder;

    if (mediaRecorder) {
      mediaRecorder.onerror = null; // a dead recorder must not re-enter fail()

      if (mediaRecorder.state !== 'inactive') {
        // stop() QUEUES the final dataavailable and only then fires stop — finalizing
        // inline here would take a snapshot of refs.chunks before that last timeslice
        // lands, dropping up to a second of the take. Finalize from onstop instead, and
        // leave ondataavailable attached so the flushed chunk reaches the saved blob.
        this.stopClock();
        this.freeze(); // the duration is the fault instant, not the end of the flush
        store.setState({ status: 'stopping' });
        mediaRecorder.onstop = () => this.finalize({ reason: RECORDER_FAIL_REASON });
        try {
          mediaRecorder.stop();
          return;
        } catch (error) {
          logError('recorder stop failed', error);
          mediaRecorder.onstop = null; // it will never fire; fall through and salvage now
        }
      } else {
        mediaRecorder.onstop = null;
      }

      if (refs.chunks.length) {
        this.finalize({ reason: RECORDER_FAIL_REASON });
        return; // finalize() releases the stream, clears refs, and settles the promise
      }
    }

    this.stopClock();
    this.releaseStream();
    refs.mediaRecorder = null;
    refs.chunks = [];
    refs.clock = emptyClock();
    store.setState({ status: refs.capture.screenStream ? 'preview' : 'idle', timerMs: 0 });
    notices.toast('danger', 'Recording stopped unexpectedly. Nothing could be saved.');
    capture.releaseIfParked();
    this.settle(null);
  },

  /** Tear down without persisting — page teardown and capture.reset(). */
  dispose() {
    this.stopClock();
    const mediaRecorder = refs.mediaRecorder;
    refs.mediaRecorder = null;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = null;
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onerror = null;
      try {
        mediaRecorder.stop();
      } catch (error) {
        logError('recorder stop failed', error);
      }
    }
    this.releaseStream();
    refs.chunks = [];
    refs.clock = emptyClock();
    this.settle(null);
  },
};

// ------------------------------------------------------------------ library --
// Persistence (LLD §3/§8): the recording file goes to resources/recordings/, and
// its metadata to the `recordings` storage key. Full recordings are always files;
// only the small JPEG thumbnail lives inline in the index.

const RECORDINGS_KEY = 'recordings';

function recordingTitle(createdAt) {
  const date = new Date(createdAt);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `Recording ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`
  );
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Base64 without the `data:…;base64,` prefix — the encoding `files.write` takes. */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('The recording could not be read.'));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      if (comma === -1) reject(new Error('The recording could not be encoded.'));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

// A multiple of 3, so each slice base64-encodes to a self-contained, unpadded run and
// the concatenation equals the encoding of the whole blob.
const BASE64_CHUNK_BYTES = 3 * 1024 * 1024;

/** Best effort: never leave a truncated recording where a whole one is expected. */
async function discardPartial(path) {
  const res = await bridge.files.delete(path);
  if (!res.ok) logError('partial recording cleanup failed', res);
}

/**
 * Stream the recording to disk a chunk at a time. Encoding a whole take at once would
 * hold the blob, its ~1.33x base64 string, and the FileReader's data URL in memory
 * simultaneously — hundreds of megabytes for a long screen recording.
 *
 * Any failure past the first chunk cleans the partial file up, whether it came back as
 * `{ ok: false }` from the bridge or was *thrown* by a FileReader that could not read
 * its slice.
 */
async function writeBlobAsBase64(path, blob) {
  if (blob.size <= BASE64_CHUNK_BYTES) {
    return bridge.files.write(path, await blobToBase64(blob), { encoding: 'base64', createParents: true });
  }

  let started = false;
  try {
    for (let offset = 0; offset < blob.size; offset += BASE64_CHUNK_BYTES) {
      const slice = blob.slice(offset, Math.min(offset + BASE64_CHUNK_BYTES, blob.size));
      const encoded = await blobToBase64(slice); // rejects if the slice cannot be read
      const res = started
        ? await bridge.files.append(path, encoded, { encoding: 'base64' })
        : await bridge.files.write(path, encoded, { encoding: 'base64', createParents: true });
      if (!res.ok) {
        if (started) await discardPartial(path);
        return res;
      }
      started = true;
    }
  } catch (error) {
    if (started) await discardPartial(path);
    throw error;
  }
  return { ok: true };
}

// The index is user-writable data on disk, and its paths flow straight into
// files.delete and the ffprobe arg. A `startsWith` prefix test is not enough:
// 'resources/recordings/../../secrets' passes it. Require one safe leaf segment.
const SAFE_LEAF = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const RECORDINGS_DIR = 'resources/recordings';
const EXPORTS_DIR = 'resources/exports';
const TRANSCRIPTS_DIR = 'resources/transcripts';

/** True only for `<dir>/<leaf>` — no traversal, no nesting, no absolute path. */
function isSafeWorkspacePath(path, dir) {
  if (typeof path !== 'string' || !path.startsWith(`${dir}/`)) return false;
  const leaf = path.slice(dir.length + 1);
  return !leaf.includes('..') && SAFE_LEAF.test(leaf);
}

/** An index entry we are willing to trust after a defensive parse. */
function isRecordingItem(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    !!value.id &&
    isSafeWorkspacePath(value.fileName, RECORDINGS_DIR)
  );
}

function repairedTitle(item, createdAt) {
  if (typeof item.title === 'string' && item.title.trim()) return item.title;
  return Number.isNaN(new Date(createdAt).getTime()) ? 'Untitled recording' : recordingTitle(createdAt);
}

function finiteOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/** A pixel dimension is a positive whole number or it is nothing at all. */
function positivePixels(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

/**
 * Every field the UI reads must hold its expected type before it reaches a render or a
 * bridge call. `id` and `fileName` are load-bearing, and an entry missing them is dropped
 * by isRecordingItem; the rest is cosmetic and repaired instead — a non-string `title`
 * threw inside the search box's `.toLowerCase()` and blanked the whole view, which is not
 * worth losing a real recording over. Sidecar paths get the full path test: remove()
 * deletes them, so an unvalidated one is a delete primitive.
 */
function sanitizeRecordingItem(entry) {
  const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : '';
  const item = {
    ...entry,
    createdAt,
    title: repairedTitle(entry, createdAt),
    durationMs: finiteOrZero(entry.durationMs),
    size: finiteOrZero(entry.size),
    mimeType: typeof entry.mimeType === 'string' ? entry.mimeType : '',
    thumbnail: typeof entry.thumbnail === 'string' ? entry.thumbnail : '',
  };
  const droppedMp4 = 'mp4Path' in entry && !isSafeWorkspacePath(entry.mp4Path, EXPORTS_DIR);
  const droppedCaption = 'captionPath' in entry && !isSafeWorkspacePath(entry.captionPath, TRANSCRIPTS_DIR);
  if (droppedMp4) delete item.mp4Path;
  if (droppedCaption) delete item.captionPath;

  // ffprobe's optional dimensions are rendered by the detail pane, so they get the same
  // treatment: a usable pair, or absent. Never a string the UI would print verbatim.
  const width = positivePixels(entry.width);
  const height = positivePixels(entry.height);
  if (width) item.width = width;
  else delete item.width;
  if (height) item.height = height;
  else delete item.height;

  // Compare the fields, never a serialization: JSON.stringify is key-order sensitive, so
  // an entry that differs only in key order would be "repaired" and rewritten every boot.
  const changed =
    droppedMp4 ||
    droppedCaption ||
    item.createdAt !== entry.createdAt ||
    item.title !== entry.title ||
    item.durationMs !== entry.durationMs ||
    item.size !== entry.size ||
    item.mimeType !== entry.mimeType ||
    item.thumbnail !== entry.thumbnail ||
    item.width !== entry.width ||
    item.height !== entry.height;

  return { item, changed };
}

const FFPROBE_ARGS = ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json'];

/**
 * Normalize the entry against the real media (LLD §8). MediaRecorder's WebM
 * container routinely ships a missing or wrong duration, so ffprobe's wins when it
 * answers. Best-effort: a missing runtime or a bad exit keeps the clock duration and
 * never blocks persistence. Workspace files are cwd-relative args — `inputs`/{{input0}}
 * is only for referenced user files, and this file is one the atom generated.
 */
async function probeRecording(fileName) {
  const res = await bridge.media.runFfprobe({
    args: [...FFPROBE_ARGS, fileName.replace(/^resources\//, '')],
    cwd: 'resources',
    timeoutMs: 30000,
  });
  if (!res.ok || res.exitCode !== 0) {
    logWarn('ffprobe normalization skipped', res.reason || res.exitCode, lastLine(res.stderr));
    return null;
  }
  try {
    const data = JSON.parse(res.stdout || '{}');
    const seconds = Number(data.format && data.format.duration);
    const video = (data.streams || []).find((stream) => Number(stream.width) > 0);
    const meta = {};
    if (Number.isFinite(seconds) && seconds > 0) meta.durationMs = Math.round(seconds * 1000);
    if (video) {
      meta.width = Number(video.width);
      meta.height = Number(video.height);
    }
    return Object.keys(meta).length ? meta : null;
  } catch (error) {
    logError('ffprobe json parse failed', error);
    return null;
  }
}

/**
 * A failed probe is not proof of absence, so an unreadable path keeps its entry.
 * Fails OPEN: use it to decide whether something may still be there.
 */
async function stillOnDisk(path) {
  const res = await bridge.files.exists(path);
  return res.ok ? !!res.exists : true;
}

/**
 * Proof of presence. Fails CLOSED: an unreadable probe is not a yes. Use it before
 * trusting that a file a tool claimed to write actually exists, or before reusing a
 * cached artifact — a wrong "yes" there hands a missing path to a save dialog.
 */
async function confirmedOnDisk(path) {
  const res = await bridge.files.exists(path);
  return !!(res.ok && res.exists);
}

const library = {
  async save() {
    // load() quarantined an index it could not parse. Writing now would replace the
    // damaged-but-recoverable key with whatever partial list is in memory.
    if (!refs.indexReadable) {
      logWarn('recordings save skipped: the stored index is quarantined');
      return false;
    }
    const res = await bridge.storage.set(RECORDINGS_KEY, JSON.stringify(store.state.recordings));
    if (!res.ok && res.reason !== 'no-host') {
      logError('recordings save failed', res);
      notices.toast('danger', bridge.explain(res, 'The recordings library could not be saved.', { cap: 'storage' }));
    }
    return res.ok;
  },

  /**
   * A readable index is the only thing standing between the user and an orphaned
   * pile of video files. When it cannot be read we say so, and we refuse to let a
   * later save() overwrite the bytes that might still be salvageable.
   */
  async quarantine(message, raw) {
    refs.indexReadable = false;

    // Only promise the backup once it exists. `storage.set` can fail for the same
    // reason the read did, and a banner that claims a copy nobody kept is worse than
    // one that admits it.
    let tail = '';
    if (typeof raw === 'string') {
      const res = await bridge.storage.set(`${RECORDINGS_KEY}.corrupt`, raw);
      if (res.ok) {
        tail = ' A copy of the damaged index was kept.';
      } else {
        logError('corrupt index backup failed', res);
        tail = ' The damaged index could not be backed up.';
      }
    }
    notices.banner('warn', `${message}${tail}`, { dismissible: true });
  },

  /** Boot: parse the index defensively, then drop entries whose file is gone. */
  async load() {
    const res = await bridge.storage.get(RECORDINGS_KEY);
    if (!res.ok) {
      if (res.reason === 'no-host') return; // outside Preview: nothing to read, nothing to lose
      await this.quarantine(
        bridge.explain(res, 'The recordings library could not be read.', { cap: 'storage' }),
        null,
      );
      return;
    }
    if (res.value == null) return; // a first run, not a failure

    const raw = typeof res.value === 'string' ? res.value : JSON.stringify(res.value);
    let saved;
    try {
      saved = typeof res.value === 'string' ? JSON.parse(res.value) : res.value;
    } catch (error) {
      logError('recordings parse failed', error);
      await this.quarantine(
        'The recordings library is corrupt and could not be read. Your recording files are untouched on disk.',
        raw,
      );
      return;
    }
    if (!Array.isArray(saved)) {
      await this.quarantine(
        'The recordings library is in an unexpected format and could not be read. Your recording files are untouched on disk.',
        raw,
      );
      return;
    }

    const items = [];
    let repaired = 0;
    for (const entry of saved) {
      if (!isRecordingItem(entry)) continue;
      const { item, changed } = sanitizeRecordingItem(entry);
      if (changed) repaired += 1;
      items.push(item);
    }
    const rejected = saved.length - items.length;

    const alive = [];
    let pruned = 0;
    for (const item of items) {
      const probe = await bridge.files.exists(item.fileName);
      if (probe.ok && !probe.exists) pruned += 1; // deleted outside Rekorder
      else alive.push(item); // a failed probe is not proof of absence
    }

    store.setState({ recordings: alive });

    // Write back whenever what we loaded differs from what is stored. Saving only on a
    // prune left junk entries and repaired fields on disk, so the same warning toast
    // greeted the user on every single boot.
    if (pruned || rejected || repaired) await this.save();

    if (pruned) {
      notices.toast('info', `${pruned} recording${pruned === 1 ? '' : 's'} missing from disk — removed from the library.`);
    }
    if (rejected) {
      logWarn(`${rejected} unreadable recordings index entries were skipped`);
      notices.toast('warn', `${rejected} unreadable library entr${rejected === 1 ? 'y was' : 'ies were'} skipped.`);
    }
  },

  /**
   * onstop → disk. Throws with user-ready copy; recorder.finalize() surfaces it.
   * Returns `{ item, indexed }` — a quarantined index still lets the file land on disk,
   * but the entry will not survive a reload, and the caller must not claim otherwise.
   */
  async persist({ blob, thumbnail, durationMs, mimeType, extension }) {
    const id = newId();
    const createdAt = new Date().toISOString();
    const fileName = `${RECORDINGS_DIR}/${id}.${extension}`;
    // Both inputs are closed sets today (a UUID and webm|mp4); assert it rather than
    // trusting that, since this path becomes an FFprobe arg and a files.delete target.
    if (!isSafeWorkspacePath(fileName, RECORDINGS_DIR)) {
      throw new Error('The recording could not be saved: unsafe file name.');
    }

    const written = await writeBlobAsBase64(fileName, blob);
    if (!written.ok) {
      throw new Error(bridge.explain(written, 'The recording could not be written to disk.', { cap: 'filesystem' }));
    }

    const item = {
      id,
      title: recordingTitle(createdAt),
      createdAt,
      durationMs,
      size: blob.size,
      mimeType,
      thumbnail,
      fileName,
    };
    Object.assign(item, await probeRecording(fileName));

    store.setState({ recordings: [item, ...store.state.recordings] });
    const indexed = await this.save();
    return { item, indexed };
  },

  /** Delete one path. A file that is already gone counts as deleted, not as a failure. */
  async deletePath(path) {
    const res = await bridge.files.delete(path);
    if (res.ok) return { gone: true, reason: '' };
    if (!(await stillOnDisk(path))) return { gone: true, reason: '' };
    return { gone: false, reason: res.reason || '' };
  },

  /** Drop entries from the index without touching disk — the files are already gone. */
  async forget(ids) {
    const dropped = new Set(ids);
    const state = store.state;
    const goneFiles = new Set(
      state.recordings.filter((item) => dropped.has(item.id)).map((item) => item.fileName),
    );
    const staleError = goneFiles.has(state.playbackError);
    store.setState({
      recordings: state.recordings.filter((item) => !dropped.has(item.id)),
      selectedRecordingIds: new Set([...state.selectedRecordingIds].filter((id) => !dropped.has(id))),
      selectedRecordingId: dropped.has(state.selectedRecordingId) ? '' : state.selectedRecordingId,
      playbackError: staleError ? '' : state.playbackError,
      playbackErrorText: staleError ? '' : state.playbackErrorText,
    });
    await this.save();
  },

  /**
   * Delete the files, then prune the index. The recording file governs the prune: once
   * it is gone the row must go too, or the user is left with a row that cannot play. A
   * surviving sidecar is reported as an orphan rather than resurrecting the entry, and a
   * denied delete of the recording itself keeps the row instead of orphaning its bytes.
   */
  async remove(ids) {
    const wanted = new Set(ids);
    const items = store.state.recordings.filter((item) => wanted.has(item.id));

    // Unbind the <video> before its file disappears. A still-bound source fires `error`
    // as the bytes go away, and player.handleError() would report a vanished recording —
    // and redundantly forget() it — for a file the user deliberately deleted.
    if (items.some((item) => item.fileName === refs.playerPath)) player.stop();

    const removed = new Set();
    const failures = [];
    let orphanedSidecars = 0;

    for (const item of items) {
      const main = await this.deletePath(item.fileName);
      if (!main.gone) {
        failures.push({ id: item.id, reason: main.reason });
        continue;
      }
      // mp4Path/captionPath are written by T08/T09; a recording owns its sidecars.
      for (const sidecar of [item.mp4Path, item.captionPath].filter(Boolean)) {
        const res = await this.deletePath(sidecar);
        if (!res.gone) orphanedSidecars += 1;
      }
      removed.add(item.id);
    }

    if (removed.size) await this.forget(removed);
    return { removed: removed.size, failed: failures.length, failures, orphanedSidecars };
  },
};

// ---------------------------------------------------------------- playback --
// A persistent <video> the Recordings mounter re-parents, so a re-render (a
// keystroke in the search box) cannot reload the file or lose the playhead.

const player = {
  ensureEl() {
    if (!refs.playerEl) {
      const el = document.createElement('video');
      el.className = 'player__video';
      el.controls = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.preload = 'metadata';
      // files.url() builds a URL; it does not prove the file is there or intact. A file
      // deleted or truncated after the index was read fails here, not at bind time.
      el.addEventListener('error', () => this.handleError());
      refs.playerEl = el;
    }
    return refs.playerEl;
  },

  /**
   * The only place a mid-session disappearance surfaces. If the file really is gone,
   * prune the row (load()'s self-healing, but without waiting for the next boot);
   * otherwise the bytes are there and unplayable, which is a different message.
   */
  async handleError() {
    const path = refs.playerPath;
    if (!path) return; // stop() detaching the source is not a playback failure
    refs.playerPath = '';

    if (await stillOnDisk(path)) {
      // Record the failure in state. Clearing refs alone would let the next render
      // re-bind the same unplayable file, erroring and toasting on every repaint.
      const message = 'This recording could not be played. The file may be corrupt or in a format this host cannot decode.';
      store.setState({ playbackError: path, playbackErrorText: message });
      notices.toast('danger', message);
      return;
    }

    // Only claim the removal we actually perform: the row may already be gone.
    const item = store.state.recordings.find((entry) => entry.fileName === path);
    if (!item) {
      this.stop();
      notices.toast('warn', 'That recording is no longer on disk.');
      return;
    }
    notices.toast('warn', 'That recording is no longer on disk — removing it from the library.');
    await this.forgetMissing(item.id);
  },

  async forgetMissing(id) {
    this.stop();
    await library.forget([id]);
  },

  async sync(state) {
    const item = state.recordings.find((entry) => entry.id === state.selectedRecordingId);
    if (!item) {
      this.stop();
      return;
    }
    if (state.playbackError === item.fileName) {
      this.stop(); // a known-bad file: the pane shows the failure, the <video> stays unbound
      return;
    }
    if (refs.playerPath === item.fileName) return; // already bound — do not restart it
    refs.playerPath = item.fileName;

    const res = await bridge.files.url(item.fileName);
    if (refs.playerPath !== item.fileName) return; // the selection moved on while awaiting
    if (!res.ok) {
      // Flag it exactly as an <video> `error` is flagged. Clearing refs alone would let
      // the next render call files.url() again, fail again, and toast again — forever.
      refs.playerPath = '';
      const message = bridge.explain(res, 'That recording could not be opened.', { cap: 'filesystem' });
      store.setState({ playbackError: item.fileName, playbackErrorText: message });
      notices.toast('danger', message);
      return;
    }
    this.ensureEl().src = res.url;
  },

  stop() {
    refs.playerPath = '';
    const el = refs.playerEl;
    if (!el || !el.getAttribute('src')) return;
    el.pause();
    el.removeAttribute('src');
    el.load(); // release the decoder and the file handle
  },
};

// ----------------------------------------------------------- media helpers --
// LLD §9. The recording is a file this atom generated, so FFmpeg addresses it as a
// plain cwd-relative arg. `inputs`/{{inputN}} are only for referenced user files.

const MP4_ARGS = [
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
  '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', // the moov atom up front, so the file streams/seeks immediately
];

// FFmpeg asks before clobbering an existing output. The host prepends -nostdin, so that
// question has nobody to answer it and the run fails instead. Always overwrite.
const FFMPEG_OVERWRITE = '-y';

/**
 * Host tools otherwise fall back to a default budget a long recording blows through,
 * which surfaces as an opaque `runtime-error` (LLD §9 timeout rule).
 */
function timeoutForDuration(durationMs, factor, floor) {
  return Math.max(floor, Math.round((Number(durationMs) || 0) * factor));
}

/** `cwd` is `resources/`, so every path arg is written relative to it. */
function workspaceArg(path) {
  return path.replace(/^resources\//, '');
}

function recordingExtension(recording) {
  const dot = recording.fileName.lastIndexOf('.');
  return dot === -1 ? 'webm' : recording.fileName.slice(dot + 1);
}

/** A host whose MediaRecorder already produced MP4 needs no transcode at all. */
function isNativeMp4(recording) {
  return recordingExtension(recording) === 'mp4' || String(recording.mimeType || '').startsWith('video/mp4');
}

/** A save-dialog suggestion, not a workspace path — but a name of dots is still no name. */
function safeFileStem(title) {
  const stem = String(title || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  return stem || 'recording';
}

function selectedRecording(state) {
  return state.recordings.find((item) => item.id === state.selectedRecordingId) || null;
}

// ---------------------------------------------------------------- captions --
// LLD §9.2. Whisper cannot read video, so FFmpeg extracts mono 16 kHz WAV first.
// Everything here is non-blocking: a caption failure must never fail the video export.

/** A VTT/SRT with no `-->` cue has no speech in it, however many bytes it has. */
function hasCues(text) {
  return /-->/.test(String(text || ''));
}

const captions = {
  async cleanup(path) {
    const res = await bridge.files.delete(path);
    if (!res.ok) logError('transcription scratch file left behind', path, res.reason);
  },

  /** Returns the workspace caption path, or '' when none could be produced. */
  async ensure(recording, progress) {
    // Reusing a cached transcript needs proof it is there; an unreadable probe means we
    // transcribe again rather than hand a missing path to the save dialog.
    const cached = isSafeWorkspacePath(recording.captionPath, TRANSCRIPTS_DIR) ? recording.captionPath : '';
    if (cached && (await confirmedOnDisk(cached))) return cached;

    const made = await bridge.files.mkdir('resources/tmp', { recursive: true });
    if (!made.ok) {
      bridge.fail(made, 'The temporary folder for captions could not be created.', { cap: 'filesystem' });
      return '';
    }

    const wav = `resources/tmp/${recording.id}.wav`;
    try {
      progress('Extracting audio…');
      const extract = await bridge.media.runFfmpeg({
        args: [FFMPEG_OVERWRITE, '-i', workspaceArg(recording.fileName), '-vn', '-ac', '1', '-ar', '16000', workspaceArg(wav)],
        cwd: 'resources',
        timeoutMs: timeoutForDuration(recording.durationMs, 1, 60000),
      });
      if (!extract.ok) {
        bridge.fail(extract, 'The audio for captions could not be extracted.', {
          runtime: 'ffmpeg',
          persistent: extract.reason === 'runtime-missing',
        });
        return '';
      }
      if (extract.exitCode !== 0) {
        notices.toast('danger', `Caption audio failed: ${lastLine(extract.stderr) || `FFmpeg exited ${extract.exitCode}`}`);
        return '';
      }

      progress('Transcribing…');
      const result = await bridge.speech.transcribe({
        path: wav,
        format: 'vtt',
        timeoutMs: timeoutForDuration(recording.durationMs, 6, 300000),
      });
      if (!result.ok) {
        bridge.fail(result, 'Captions could not be generated.', {
          runtime: 'whisper-cli',
          persistent: result.reason === 'runtime-missing',
        });
        return '';
      }
      // The bridge writes under resources/transcripts/ and reports where. Trust the path
      // only after it passes the same check every other index path gets.
      const captionPath = isSafeWorkspacePath(result.outputPath, TRANSCRIPTS_DIR)
        ? result.outputPath
        : `${TRANSCRIPTS_DIR}/${recording.id}.vtt`;

      if (!hasCues(result.text)) {
        // Whisper still wrote a header-only file. Nothing will reference it, so nothing
        // would ever clean it up — remove it here rather than leave an orphan behind.
        await this.cleanup(captionPath);
        notices.toast('warn', 'No speech was found in this recording, so no captions were generated.');
        return '';
      }

      // Proof, not assumption: `stillOnDisk` fails open, so an unreadable probe would
      // let a phantom transcript through this guard.
      if (!(await confirmedOnDisk(captionPath))) {
        notices.toast('danger', 'The caption file could not be found after transcription.');
        return '';
      }

      await exporter.patch(recording.id, { captionPath });
      return captionPath;
    } finally {
      await this.cleanup(wav); // the WAV is scratch, whichever way we left
    }
  },
};

// ------------------------------------------------------------------ export --

const exporter = {
  running: false,

  progress(label) {
    store.setState({ exportProgress: label ? { active: true, label } : null });
  },

  /** Merge fields into an index entry and persist the index. */
  async patch(id, fields) {
    store.setState({
      recordings: store.state.recordings.map((item) => (item.id === id ? { ...item, ...fields } : item)),
    });
    await library.save();
  },

  /** Transcode to H.264/AAC. Returns the workspace path, or '' when it could not be produced. */
  async ensureMp4(recording) {
    // This path becomes an FFmpeg arg. The index is validated on load and by persist(),
    // but assert it here too rather than trust a caller.
    if (!isSafeWorkspacePath(recording.fileName, RECORDINGS_DIR)) {
      notices.toast('danger', 'That recording has an invalid file name and cannot be exported.');
      return '';
    }
    if (isNativeMp4(recording)) return recording.fileName;

    // mp4Path is read back from the index, so it gets the same treatment as fileName
    // before it becomes an exportFile/reveal target.
    // Proof of presence: an unreadable probe re-transcodes rather than hand a possibly
    // missing file to the save dialog.
    const cached = isSafeWorkspacePath(recording.mp4Path, EXPORTS_DIR) ? recording.mp4Path : '';
    if (cached && (await confirmedOnDisk(cached))) return cached; // already transcoded

    // FFmpeg never creates its output directory. `recursive` is mkdir's option —
    // `createParents` belongs to files.write and is ignored here.
    const made = await bridge.files.mkdir('resources/exports', { recursive: true });
    if (!made.ok) {
      bridge.fail(made, 'The exports folder could not be created.', { cap: 'filesystem' });
      return '';
    }

    const mp4Path = `resources/exports/${recording.id}.mp4`;
    this.progress('Transcoding to MP4…');
    const res = await bridge.media.runFfmpeg({
      args: [FFMPEG_OVERWRITE, '-i', workspaceArg(recording.fileName), ...MP4_ARGS, workspaceArg(mp4Path)],
      cwd: 'resources',
      timeoutMs: timeoutForDuration(recording.durationMs, 4, 120000),
    });

    if (!res.ok) {
      bridge.fail(res, 'The MP4 transcode failed.', { runtime: 'ffmpeg', persistent: res.reason === 'runtime-missing' });
      return '';
    }
    if (res.exitCode !== 0) {
      notices.toast('danger', `The MP4 transcode failed: ${lastLine(res.stderr) || `FFmpeg exited ${res.exitCode}`}`);
      return '';
    }

    await this.patch(recording.id, { mp4Path });
    return mp4Path;
  },

  /** Best-effort metadata sidecar; a failure never fails the export. `exportedAs` is the
   *  container actually written (`mp4`/`webm`), never the option the user selected. */
  async writeSidecar(recording, exportedAs) {
    const meta = {
      id: recording.id,
      title: recording.title,
      createdAt: recording.createdAt,
      durationMs: recording.durationMs,
      size: recording.size,
      mimeType: recording.mimeType,
      width: recording.width || null,
      height: recording.height || null,
      captionPath: recording.captionPath || null,
      exportedAs,
      exportedAt: new Date().toISOString(),
    };
    const res = await bridge.files.write(
      `resources/exports/${recording.id}.recforge.json`,
      JSON.stringify(meta, null, 2),
      { encoding: 'utf8', createParents: true },
    );
    if (!res.ok) logError('sidecar write failed', res);
  },

  async run(recording) {
    if (this.running || !recording) return;
    this.running = true;
    try {
      // Every export path leads to files.exportFile, so the index path is checked once
      // here rather than only inside ensureMp4 — the WebM route skips that entirely.
      if (!isSafeWorkspacePath(recording.fileName, RECORDINGS_DIR)) {
        notices.toast('danger', 'That recording has an invalid file name and cannot be exported.');
        return;
      }

      const format = store.state.exportFormat === 'webm' ? 'webm' : 'mp4';

      let videoPath = recording.fileName;
      if (format === 'mp4') {
        videoPath = await this.ensureMp4(recording);
        if (!videoPath) return; // ensureMp4 already explained why
      }

      // Re-read by id, not by selection: ensureMp4() patched the entry, and the user may
      // have clicked another row while FFmpeg was running. If the row is gone entirely
      // they deleted it mid-transcode — do not open a save dialog for a file we just erased.
      const afterTranscode = store.state.recordings.find((entry) => entry.id === recording.id);
      if (!afterTranscode) {
        notices.toast('warn', 'That recording was deleted before the export finished.');
        return;
      }

      // Captions are best-effort: a whisper failure has already explained itself and must
      // not cost the user the video export they asked for.
      const captionPath = store.state.includeCaptions
        ? await captions.ensure(afterTranscode, (label) => this.progress(label))
        : '';

      this.progress('Saving…');
      const current = store.state.recordings.find((entry) => entry.id === recording.id);
      if (!current) {
        notices.toast('warn', 'That recording was deleted before the export finished.');
        return;
      }
      // The sidecar records the container that was actually written, not the option the
      // user picked: "as recorded" on a native-MP4 host produces an .mp4, not a .webm.
      const extension = videoPath.slice(videoPath.lastIndexOf('.') + 1);
      await this.writeSidecar(current, extension);

      const saved = await bridge.files.exportFile(videoPath, {
        suggestedName: `${safeFileStem(current.title)}.${extension}`,
      });
      if (!saved.ok) {
        bridge.fail(saved, 'The export could not be saved.', { cap: 'filesystem' });
        return;
      }
      if (saved.canceled || saved.cancelled) {
        notices.toast('info', 'Export cancelled.');
        return; // they cancelled the export; do not follow it with a caption dialog
      }
      notices.toast('good', `Exported as ${extension.toUpperCase()}.`);

      // The save dialog never reports where the video landed, so the sidecar cannot be
      // placed beside it automatically — it gets its own dialog.
      if (captionPath) await this.saveCaptions(current, captionPath);
    } finally {
      this.running = false;
      this.progress('');
    }
  },

  async saveCaptions(recording, captionPath) {
    const extension = captionPath.slice(captionPath.lastIndexOf('.') + 1);
    const saved = await bridge.files.exportFile(captionPath, {
      suggestedName: `${safeFileStem(recording.title)}.${extension}`,
    });
    if (!saved.ok) {
      bridge.fail(saved, 'The caption file could not be saved.', { cap: 'filesystem' });
      return;
    }
    if (saved.canceled || saved.cancelled) {
      notices.toast('info', 'Captions were generated but not saved. Use “Reveal captions” to find them.');
      return;
    }
    notices.toast('good', `Captions exported as ${extension.toUpperCase()}.`);
  },

  /** The caption sidecar lives in the workspace; reveal it on its own. */
  async revealCaptions(recording) {
    if (!recording || !isSafeWorkspacePath(recording.captionPath, TRANSCRIPTS_DIR)) return;
    const res = await bridge.files.reveal(recording.captionPath);
    if (!res.ok) bridge.fail(res, 'The caption file could not be revealed.', { cap: 'filesystem' });
  },

  /** Reveals the workspace artifact — the bridge never reports where the user saved their copy. */
  async reveal(recording) {
    if (!recording) return;
    if (!isSafeWorkspacePath(recording.fileName, RECORDINGS_DIR)) {
      notices.toast('danger', 'That recording has an invalid file name and cannot be revealed.');
      return;
    }
    const cached = isSafeWorkspacePath(recording.mp4Path, EXPORTS_DIR) ? recording.mp4Path : '';
    const target = cached && (await confirmedOnDisk(cached)) ? cached : recording.fileName;
    const res = await bridge.files.reveal(target);
    if (!res.ok) bridge.fail(res, 'That file could not be revealed.', { cap: 'filesystem' });
  },
};

// ------------------------------------------------------------------ router --

/**
 * Navigate to a view. Rule (LLD §1 / T01): choosing Layouts while a studio
 * session is live opens the live layout panel inside Record instead of
 * leaving the studio.
 */
function navigateTo(view) {
  if (view === 'layouts' && ACTIVE_STATUSES.has(store.state.status)) {
    store.setState({ view: 'record', layoutPanelOpen: true });
    return;
  }
  // Record IS the live studio (T15): entering it starts the preview, no button.
  // Navigation is always a click, so the user gesture getDisplayMedia may need is fresh.
  if (view === 'record' && store.state.status === 'idle') {
    capture.prepareStudio();
    return;
  }
  // Leaving Record releases the screen/camera/mic hold — unless a recording is in
  // flight, which deliberately keeps running while the user visits other tabs.
  if (view !== 'record' && (store.state.status === 'starting' || store.state.status === 'preview')) {
    capture.endPreview();
  }
  store.setState({ view, layoutPanelOpen: false });
}

// -------------------------------------------------------------------- views --

const NAV_ITEMS = [
  { view: 'setup', label: 'Setup', icon: 'sliders' },
  { view: 'layouts', label: 'Layouts', icon: 'grid' },
  { view: 'record', label: 'Record', icon: 'video' },
  { view: 'recordings', label: 'Recordings', icon: 'film' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
];

function renderSidebar(state) {
  const count = state.recordings.length;
  const items = NAV_ITEMS.map((item) => {
    const active = state.view === item.view;
    const badge =
      item.view === 'recordings' && count > 0
        ? `<span class="nav-item__badge">${count}</span>`
        : '';
    return (
      `<button type="button" class="nav-item${active ? ' is-active' : ''}" ` +
      `data-action="navigate" data-view="${item.view}" ` +
      `${active ? 'aria-current="page"' : ''}>` +
      `${icon(item.icon, { size: 18 })}` +
      `<span class="nav-item__label">${item.label}</span>${badge}` +
      `</button>`
    );
  }).join('');

  const meta = state.meta ? `${esc(state.meta.id)} · v${esc(state.meta.version)}` : 'Rekorder';

  return (
    `<aside class="sidebar">` +
    `<div class="sidebar__brand">` +
    `<span class="sidebar__mark">${icon('record', { size: 18 })}</span>` +
    `<span class="sidebar__name">Rekorder</span>` +
    `</div>` +
    `<nav class="sidebar__nav" aria-label="Primary">${items}</nav>` +
    `<div class="sidebar__footer">${meta}</div>` +
    `</aside>`
  );
}

const BANNER_ICON = { info: 'info', warn: 'alert', danger: 'alert', success: 'check' };

function renderBanner(state) {
  const banners = state.banners
    .map((entry) => {
      const iconName = BANNER_ICON[entry.kind] || 'info';
      const close = entry.dismissible
        ? `<button type="button" class="banner__close" data-action="clear-banner" data-id="${esc(entry.id)}" ` +
          `aria-label="Dismiss">${icon('close', { size: 15 })}</button>`
        : '';
      // A banner that states a problem the user can fix should carry the fix.
      const actions = (entry.actions || [])
        .map(
          (a) =>
            `<button type="button" class="btn btn--${a.variant || 'ghost'} btn--sm" ` +
            `data-action="${esc(a.action)}"${a.kind ? ` data-kind="${esc(a.kind)}"` : ''}>` +
            `${a.icon ? icon(a.icon, { size: 14 }) : ''}<span>${esc(a.label)}</span></button>`,
        )
        .join('');
      return (
        `<div class="banner banner--${entry.kind}" role="status">` +
        `${icon(iconName, { size: 22 })}` +
        `<span class="banner__msg">${esc(entry.message)}</span>` +
        (actions ? `<span class="banner__actions">${actions}</span>` : '') +
        close +
        `</div>`
      );
    })
    .join('');
  return `<div class="banner-region">${banners}</div>`;
}

/**
 * Generic view header (icon + title + subtitle + optional actions slot).
 * The header is a fixed bar: it also OPENS the `.view__scroll` region that holds
 * everything after it; render() closes that div. Every view starts with this call.
 */
function viewHeader(iconName, title, subtitle, actions = '') {
  return (
    `<header class="view__header"><div class="view__heading">` +
    `${icon(iconName, { size: 24 })}` +
    `<div><div class="view__title">${esc(title)}</div>` +
    `<div class="view__subtitle">${esc(subtitle)}</div></div></div>` +
    (actions ? `<div class="view__actions">${actions}</div>` : '') +
    `</header><div class="view__scroll">`
  );
}

/** Neutral empty-state body used by the scaffolded screens. */
function emptyState(iconName, title, desc) {
  return (
    `<div class="empty-state">` +
    `<div class="empty-state__icon">${icon(iconName, { size: 24 })}</div>` +
    `<h2 class="empty-state__title">${esc(title)}</h2>` +
    `<p class="empty-state__desc">${esc(desc)}</p>` +
    `</div>`
  );
}

// --------------------------------------------------------------- setup view --

/** A labelled <select>. Change events dispatch via data-change. */
function selectField(label, changeAction, options, selectedValue, { disabled = false } = {}) {
  const opts = options
    .map(
      (o) =>
        `<option value="${esc(o.value)}"${o.value === selectedValue ? ' selected' : ''}>${esc(o.label)}</option>`,
    )
    .join('');
  return (
    `<label class="field"><span class="field__label">${esc(label)}</span>` +
    `<span class="field__control">` +
    `<select class="select" data-change="${changeAction}"${disabled ? ' disabled' : ''}>${opts}</select>` +
    `<span class="field__caret">${icon('chevron', { size: 14 })}</span>` +
    `</span></label>`
  );
}

/** A card container used by the four setup source cards. */
function setupCard(iconName, title, bodyHtml, headRight = '') {
  return (
    `<section class="card">` +
    `<header class="card__head">${icon(iconName, { size: 16 })}` +
    `<h3 class="card__title">${esc(title)}</h3>${headRight}</header>` +
    `<div class="card__body">${bodyHtml}</div></section>`
  );
}

/** Compact empty state inside a card, optionally with its own recovery actions. */
function cardEmpty(iconName, title, desc, actions = '') {
  return (
    `<div class="card-empty">${icon(iconName, { size: 20 })}` +
    `<div><div class="card-empty__title">${esc(title)}</div>` +
    `<div class="card-empty__desc">${esc(desc)}</div>` +
    (actions ? `<div class="card-empty__actions">${actions}</div>` : '') +
    `</div></div>`
  );
}

function setupCameraBody(state) {
  if (state.capabilities.camera === 'denied')
    return cardEmpty('camera', 'Camera blocked', 'Grant camera access in Studio Permissions, then Refresh.');
  if (!state.cameras.length) return deviceEmpty('camera', 'camera', state);
  const options = state.cameras.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  return (
    `<div class="cam-preview"><div class="cam-preview__slot" data-cam-slot></div></div>` +
    selectField('Device', 'select-camera', options, state.selectedCameraId)
  );
}

function setupScreenBody(state) {
  // Camera-only never acquires a screen, so the picker below would be a promise the studio
  // does not keep. Say so, and offer the way back rather than a dead select.
  if (!needsScreen(state.layout)) {
    return cardEmpty(
      'monitor',
      'Not captured in Camera only',
      'The Camera only layout records your camera and nothing else — no screen is captured and no sharing prompt appears. Choose another layout to record your screen.',
      `<button type="button" class="btn btn--ghost btn--sm" data-action="navigate" data-view="layouts">` +
        `${icon('grid', { size: 14 })}<span>Layouts</span></button>`,
    );
  }
  if (state.capabilities.screenCapture === 'denied')
    return cardEmpty('monitor', 'Screen capture blocked', 'Grant screen-capture access in Studio Permissions, then Refresh.');
  if (!state.desktopSources.length)
    return cardEmpty('monitor', 'No screen sources', 'Press Refresh to look for screens and windows.');
  const selected = state.desktopSources.find((s) => s.id === state.selectedSourceId) || state.desktopSources[0];
  const options = state.desktopSources.map((s) => ({ value: s.id, label: s.name }));
  const thumb = selected.thumbnail
    ? `<img class="thumb__img" src="${esc(selected.thumbnail)}" alt="Preview of ${esc(selected.name)}">`
    : `<div class="thumb__blank">${icon('monitor', { size: 24 })}</div>`;
  return `<div class="thumb">${thumb}</div>` + selectField('Source', 'select-source', options, selected.id);
}

/** Copy for an empty device list, keyed by the reason diagnoseDevice() found. */
const DEVICE_ISSUE_COPY = {
  microphone: {
    blocked: ['Microphone blocked', 'Grant microphone access in Studio Permissions, then press Refresh.'],
    busy: ['Microphone unavailable', 'Another app is using the microphone. Close it, then press Refresh.'],
    unsupported: ['Microphone unavailable', 'This host does not expose audio input devices.'],
    error: ['Microphone unavailable', 'The microphone could not be opened. Press Refresh to try again.'],
    // macOS hands an unauthorized process an empty device list, which reaches the browser
    // as NotFoundError. "No microphone" and "no permission to see the microphone" are
    // indistinguishable from here, so name both instead of blaming the hardware.
    absent: [
      'No microphone visible',
      'If one is connected, macOS has probably not authorized this app — it hands an unauthorized app an empty device list rather than an error. Open Privacy & Security → Microphone and enable TinyAtom, which a development build lists as “Electron”. Then recheck.',
    ],
    hidden: ['Microphone not listed', 'The microphone works but this host is not listing audio devices. Recording audio may still succeed — press Refresh, or report this as a host issue.'],
  },
  camera: {
    blocked: ['Camera blocked', 'Grant camera access in Studio Permissions, then press Refresh.'],
    busy: ['Camera unavailable', 'Another app is using the camera. Close it, then press Refresh.'],
    unsupported: ['Camera unavailable', 'This host does not expose video input devices.'],
    error: ['Camera unavailable', 'The camera could not be opened. Press Refresh to try again.'],
    absent: [
      'No camera visible',
      'If one is connected, macOS has probably not authorized this app — it hands an unauthorized app an empty device list rather than an error. Open Privacy & Security → Camera and enable TinyAtom, which a development build lists as “Electron”. Then recheck.',
    ],
    hidden: ['Camera not listed', 'The camera works but this host is not listing video devices. Press Refresh, or report this as a host issue.'],
  },
};

// The macOS Privacy panes. `shell.openExternal` documents http/https/mailto only, so this
// scheme may be refused; the `open-privacy-pane` handler attempts it anyway and falls back
// to the clipboard. See the platform note in tickets/T03-setup-devices.md.
const PRIVACY_LINKS = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
};

const PRIVACY_PANE = { microphone: 'Microphone', camera: 'Camera' };

function isMacHost() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/i.test(navigator.userAgent || navigator.platform || '');
}

/**
 * A device the OS is hiding is only recoverable from the OS. Offer the pane and a retry
 * right where the problem is stated, instead of leaving the user to find both.
 */
function deviceEmpty(kind, iconName, state) {
  const copy = DEVICE_ISSUE_COPY[kind];
  const issue = state.deviceIssues[kind];
  const [title, desc] = copy[issue] || copy.absent;

  const offerPane = issue === 'absent' && isMacHost() && !!PRIVACY_LINKS[kind];
  const actions =
    (offerPane
      ? `<button type="button" class="btn btn--primary btn--sm" data-action="open-privacy-pane" data-kind="${kind}">` +
        `${icon('settings', { size: 14 })}<span>Open Settings</span></button>`
      : '') +
    `<button type="button" class="btn btn--ghost btn--sm" data-action="refresh-devices">` +
    `${icon('refresh', { size: 14 })}<span>Recheck</span></button>`;

  return cardEmpty(iconName, title, desc, actions);
}

/**
 * The meter surface `micMeter` paints into. The bars carry real data now, so they are not
 * aria-hidden decoration; the status line is the accessible reading of the same signal.
 * Render this wherever `micMeter.key()` will open a microphone — an open microphone with
 * no visible meter is an OS recording indicator the user cannot account for.
 */
function meterMarkup() {
  const bars = Array.from(
    { length: METER_BARS },
    () => `<span class="meter__bar" data-meter-bar style="height:${METER_FLOOR}%"></span>`,
  ).join('');
  return (
    `<div class="meter" role="img" aria-label="Microphone level">${bars}</div>` +
    `<p class="meter__status" data-meter-status role="status">Starting the microphone meter…</p>`
  );
}

function setupMicBody(state) {
  if (state.capabilities.microphone === 'denied')
    return cardEmpty('mic', 'Microphone blocked', 'Grant microphone access in Studio Permissions, then Refresh.');
  if (!state.microphones.length) {
    // A `hidden` microphone works but this host will not enumerate it (T03), so `key()`
    // meters the system default. There is no device to name — but there is a signal to
    // show, and it is the only evidence the user has that the unlisted microphone works.
    const metered = state.deviceIssues.microphone === 'hidden';
    return deviceEmpty('microphone', 'mic', state) + (metered ? meterMarkup() : '');
  }
  const options = state.microphones.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  return meterMarkup() + selectField('Device', 'select-mic', options, state.selectedMicId);
}

function setupSystemAudioBody(state) {
  const options = [
    { value: 'on', label: 'On (best-effort)' },
    { value: 'off', label: 'Off' },
  ];
  const bound = ACTIVE_STATUSES.has(state.status);
  // System audio rides on the screen stream. Camera-only never opens one, so the setting is
  // inert there — the recording carries the microphone alone.
  const solo = !needsScreen(state.layout);
  const note = solo
    ? 'Camera only records your microphone alone — system audio arrives with the screen stream, which this layout doesn’t capture.'
    : bound
      ? 'Locked while the studio is live — system audio is requested when the screen stream is acquired. End the preview to change it.'
      : 'Capture computer audio alongside your mic. Falls back to mic-only if the system can’t share audio.';
  return (
    `<p class="card__note">${note}</p>` +
    selectField('System audio', 'toggle-system-audio', options, state.includeSystemAudio ? 'on' : 'off', {
      disabled: bound || solo,
    })
  );
}

function renderSetup(state) {
  const refreshBtn =
    `<button type="button" class="btn btn--ghost" data-action="refresh-devices"${state.setupLoading ? ' disabled' : ''}>` +
    `${icon('refresh', { size: 15 })}<span>${state.setupLoading ? 'Refreshing…' : 'Refresh'}</span></button>`;

  const pill = state.cameras.length
    ? `<span class="pill">${esc(RESOLUTIONS[state.resolutionIndex]?.label || '1080p')} · ${state.frameRate}fps</span>`
    : '';

  const cards =
    setupCard('camera', 'Camera', setupCameraBody(state), pill) +
    setupCard('monitor', 'Screen / Window', setupScreenBody(state)) +
    setupCard('mic', 'Microphone', setupMicBody(state)) +
    setupCard('volume', 'System Audio', setupSystemAudioBody(state));

  const footer =
    `<div class="setup__footer">` +
    `<p class="setup__reassure">${icon('check', { size: 14 })} Everything stays on this device. Rekorder never uploads your recordings.</p>` +
    `<button type="button" class="btn btn--primary" data-action="continue-to-studio">` +
    `<span>Continue to Studio</span>${icon('chevron', { size: 16 })}</button></div>`;

  return (
    viewHeader('sliders', 'Setup', 'Choose your sources', refreshBtn) +
    `<div class="setup"><div class="setup__grid">${cards}</div>${footer}</div>`
  );
}

// -------------------------------------------------------------- record view --

const STATUS_LABELS = {
  idle: 'Idle',
  starting: 'Preparing',
  preview: 'Ready',
  recording: 'Recording',
  paused: 'Paused',
  stopping: 'Saving',
  error: 'Needs attention',
};

/** One badge in the source strip: what the composite is actually being built from. */
function sourceBadge(iconName, label, value, { off = false } = {}) {
  return (
    `<div class="source-badge${off ? ' is-off' : ''}">${icon(iconName, { size: 14 })}` +
    `<span class="source-badge__label">${esc(label)}</span>` +
    `<span class="source-badge__value">${esc(value)}</span></div>`
  );
}

function deviceLabel(list, id, fallback) {
  const found = list.find((d) => d.deviceId === id);
  return found ? found.label || fallback : 'None';
}

function renderSourceStrip(state) {
  const source = state.desktopSources.find((s) => s.id === state.selectedSourceId);
  // Camera-only holds no screen stream, so the strip must not name a source it never opened.
  const solo = !needsScreen(state.layout);
  return (
    `<div class="studio__sources">` +
    sourceBadge('monitor', 'Screen', solo ? 'Not captured' : source ? source.name : 'Host picker', { off: solo }) +
    sourceBadge('camera', 'Camera', state.cameraEnabled ? deviceLabel(state.cameras, state.selectedCameraId, 'Camera') : 'Hidden', {
      off: !state.cameraEnabled,
    }) +
    sourceBadge('mic', 'Mic', state.micEnabled ? deviceLabel(state.microphones, state.selectedMicId, 'Microphone') : 'Muted', {
      off: !state.micEnabled,
    }) +
    sourceBadge('volume', 'System audio', state.systemAudioActive ? 'On' : 'Off', { off: !state.systemAudioActive }) +
    `<button type="button" class="btn btn--ghost btn--sm studio__sources-action" data-action="navigate" data-view="settings">` +
    `${icon('settings', { size: 14 })}<span>Settings</span></button>` +
    `</div>`
  );
}

const STAGE_OVERLAYS = {
  starting: 'Preparing the studio…',
  stopping: 'Saving recording…',
};

/** The live stage: a persistent <canvas> the compositor owns, plus its overlays. */
function renderStage(state) {
  const busyLabel = STAGE_OVERLAYS[state.status];
  const overlay = busyLabel
    ? `<div class="stage__overlay"><span class="spinner" aria-hidden="true"></span>` +
      `<span>${esc(busyLabel)}</span></div>`
    : '';
  return (
    `<div class="studio__stage">` +
    `<div class="stage__slot" data-canvas-slot></div>${overlay}` +
    `<span class="status-pill status-pill--${state.status}">` +
    `<span class="status-pill__dot" aria-hidden="true"></span>${esc(STATUS_LABELS[state.status] || state.status)}</span>` +
    `</div>`
  );
}

function transportButton(action, iconName, label, { variant = '', disabled = false } = {}) {
  return (
    `<button type="button" class="btn${variant ? ` ${variant}` : ''}" data-action="${action}"` +
    `${disabled ? ' disabled' : ''}>${icon(iconName, { size: 15 })}<span>${esc(label)}</span></button>`
  );
}

/** Record / pause / resume / stop, plus the live clock. */
function renderTransport(state) {
  if (state.status === 'recording') {
    return (
      transportButton('pause-recording', 'pause', 'Pause') +
      transportButton('stop-recording', 'stop', 'Stop', { variant: 'btn--danger' })
    );
  }
  if (state.status === 'paused') {
    return (
      transportButton('resume-recording', 'record', 'Resume') +
      transportButton('stop-recording', 'stop', 'Stop', { variant: 'btn--danger' })
    );
  }
  if (state.status === 'stopping') {
    return (
      `<button type="button" class="btn" disabled>` +
      `<span class="spinner" aria-hidden="true"></span><span>Saving…</span></button>`
    );
  }
  return transportButton('start-recording', 'record', 'Record', {
    variant: 'btn--record',
    disabled: state.status !== 'preview',
  });
}

const CLOCK_STATUSES = new Set(['recording', 'paused', 'stopping']);

function renderStudioBar(state) {
  const busy = state.status === 'stopping';
  // Icon-only: the glyph swaps to its slashed variant when the source is off (T15).
  // The accessible name is the ACTION and flips with state ("Mute mic" ↔ "Unmute mic"),
  // so no aria-pressed: a flipping name plus a pressed state read contradictorily.
  const toggle = (action, on, onLabel, offLabel, iconName, { locked = false, why = '' } = {}) =>
    `<button type="button" class="btn btn--icon${on ? '' : ' is-off'}" data-action="${action}" ` +
    `aria-label="${esc(on ? onLabel : offLabel)}" ` +
    `title="${esc(locked && why ? why : on ? onLabel : offLabel)}"${busy || locked ? ' disabled' : ''}>` +
    `${icon(on ? iconName : `${iconName}-off`, { size: 16 })}</button>`;

  // Hiding the camera in Camera only leaves nothing to composite — the take would be a blank
  // rectangle. Every other layout still has the screen behind it, so the toggle stays live there.
  const soloCamera = !needsScreen(state.layout);

  const clock = CLOCK_STATUSES.has(state.status)
    ? `<span class="clock" data-clock role="timer" aria-label="Recording time">${formatClock(recorder.elapsedMs())}</span>`
    : '';

  const layouts =
    `<button type="button" class="btn${state.layoutPanelOpen ? ' is-active' : ''}" ` +
    `data-action="${state.layoutPanelOpen ? 'close-layout-panel' : 'open-layout-panel'}" ` +
    `aria-expanded="${state.layoutPanelOpen}"${busy ? ' disabled' : ''}>` +
    `${icon('grid', { size: 15 })}<span>Layouts</span></button>`;

  return (
    `<div class="studio__bar">` +
    `<div class="studio__transport">${renderTransport(state)}${clock}</div>` +
    `<span class="studio__bar-gap"></span>` +
    toggle('toggle-mic', state.micEnabled, 'Mute mic', 'Unmute mic', 'mic') +
    toggle('toggle-camera', state.cameraEnabled, 'Hide camera', 'Show camera', 'camera', {
      locked: soloCamera,
      why: 'Camera only records the camera — there is nothing to show if you hide it.',
    }) +
    layouts +
    `</div>`
  );
}

function renderRecord(state) {
  if (state.status === 'error') {
    // A blocked capability cannot be retried away — the fix lives in Studio Permissions,
    // so offer a re-probe instead of a Retry that is guaranteed to fail again.
    const blocked = state.captureErrorCode === 'capability-denied';
    const primary = blocked
      ? `<button type="button" class="btn btn--primary" data-action="recheck-permissions">` +
        `${icon('refresh', { size: 15 })}<span>Recheck permissions</span></button>`
      : `<button type="button" class="btn btn--primary" data-action="prepare-studio">` +
        `${icon('refresh', { size: 15 })}<span>Retry</span></button>`;
    return (
      viewHeader('video', 'Record', 'Studio') +
      `<div class="studio-error">` +
      `<div class="studio-error__icon">${icon('alert', { size: 24 })}</div>` +
      `<h2 class="studio-error__title">${blocked ? 'Screen capture is blocked' : 'Capture could not start'}</h2>` +
      `<p class="studio-error__desc">${esc(state.captureError || 'The studio preview could not be started.')}</p>` +
      `<div class="studio-error__actions">` +
      primary +
      `<button type="button" class="btn" data-action="navigate" data-view="setup">${icon('sliders', { size: 15 })}<span>Back to Setup</span></button>` +
      `</div></div>`
    );
  }

  if (!ACTIVE_STATUSES.has(state.status)) {
    // Transient: navigateTo('record') already kicked prepareStudio off (T15); this
    // renders for at most one frame before `starting` mounts the stage.
    return (
      viewHeader('video', 'Record', 'Studio') +
      `<div class="studio-starting"><span class="spinner" aria-hidden="true"></span>` +
      `<span>Starting the studio preview…</span></div>`
    );
  }

  return (
    viewHeader('video', 'Record', 'Studio') +
    `<div class="studio">` +
    `<div class="studio__stage-wrap">${renderStage(state)}${renderLayoutPanel(state)}</div>` +
    `${renderStudioBar(state)}${renderSourceStrip(state)}</div>`
  );
}

// ------------------------------------------------------------ layouts view --
// Presets, the drag/resize stage, and the in-studio live panel (LLD §5.3).
//
// Continuous gestures (drag, size slider) must NOT run through setState: render()
// swaps the whole innerHTML, which would destroy the node under the pointer
// mid-gesture. Same contract as the recording clock — paint imperatively while the
// gesture runs, commit to state once on release.

const layoutGesture = {
  draft: null,

  update(patch) {
    if (!this.draft) {
      this.draft = { cameraRect: { ...store.state.cameraRect }, cameraScale: store.state.cameraScale };
    }
    Object.assign(this.draft, patch);
    const merged = { ...store.state, ...this.draft };
    syncScene(merged); // the live composite follows the gesture, mid-recording included
    paintLayoutDraft(merged);
  },

  /** Persist the resolved box, never the raw pointer math: `cameraBox()` clamps it onto the stage. */
  commit({ refocus } = {}) {
    if (!this.draft) return;
    const merged = { ...store.state, ...this.draft };
    this.draft = null;
    store.setState({ cameraScale: merged.cameraScale, cameraRect: cameraBox(merged) });
    settings.save();
    if (refocus) {
      const el = document.querySelector(refocus); // the re-render replaced the focused node
      if (el) el.focus();
    }
  },

  cancel() {
    this.draft = null;
    syncScene(store.state);
    paintLayoutDraft(store.state); // undo the imperative paint; state never changed
  },
};

function boxStyle(rect) {
  const pct = (n) => `${(n * 100).toFixed(3)}%`;
  return `left:${pct(rect.x)};top:${pct(rect.y)};width:${pct(rect.w)};height:${pct(rect.h)}`;
}

/** The only two nodes a gesture changes, repainted without a re-render. */
function paintLayoutDraft(state) {
  const box = document.querySelector('[data-camera-box]');
  if (box) box.setAttribute('style', boxStyle(cameraBox(state)));
  for (const el of document.querySelectorAll('[data-scale-value]')) el.textContent = `${state.cameraScale}%`;
}

const LAYOUT_PRESETS = [
  { id: 'cameraOnly', label: 'Camera only', hint: 'Just your camera, full frame. The screen isn’t captured.' },
  { id: 'pip', label: 'Picture in picture', hint: 'Camera floats over the screen.' },
  { id: 'pipTall', label: 'Vertical strip', hint: 'A full-height camera strip over the screen.' },
  { id: 'pipSquare', label: 'Square', hint: 'A square camera floats over the screen.' },
  { id: 'pipCircle', label: 'Circle', hint: 'A round camera bubble over the screen.' },
  { id: 'splitLeft', label: 'Split · camera left', hint: 'Camera and screen share the frame.' },
  { id: 'split', label: 'Split · camera right', hint: 'Screen and camera share the frame.' },
  { id: 'sideBySideLeft', label: 'Side by side · left', hint: 'Tall camera on the left, wide screen.' },
  { id: 'sideBySide', label: 'Side by side · right', hint: 'Wide screen, tall camera on the right.' },
  { id: 'camera', label: 'Fullscreen camera', hint: 'Camera fills the frame; the screen insets.' },
  { id: 'focus', label: 'Focus', hint: 'A large camera over a dimmed screen.' },
];

/** A preset thumbnail, laid out by the same geometry the compositor draws with. */
function layoutMini(id) {
  const preset = LAYOUT_DEFAULTS[id];
  const snapshot = { layout: id, cameraScale: presetScale(preset), cameraRect: preset.rect };
  const camera =
    `<span class="mini__camera${preset.shape === 'circle' ? ' mini__camera--circle' : ''}" ` +
    `style="${boxStyle(cameraBox(snapshot))}"></span>`;
  if (preset.mode === 'solo') return `<span class="mini" aria-hidden="true">${camera}</span>`; // no screen in this one

  const screen = `<span class="mini__screen" style="${boxStyle(screenBox(snapshot) || FULL_RECT)}"></span>`;
  return `<span class="mini" aria-hidden="true">${preset.mode === 'inset' ? camera + screen : screen + camera}</span>`;
}

function presetGrid(state, { compact = false } = {}) {
  // Mid-take, the layouts that would change which streams the studio holds are unreachable
  // (applyLayoutPreset refuses them). Disable them rather than let the click fail.
  const frozen = RECORD_LOCKED_STATUSES.has(state.status);
  const items = LAYOUT_PRESETS.map((preset) => {
    const active = state.layout === preset.id;
    const locked = frozen && needsScreen(preset.id) !== needsScreen(state.layout);
    const why = needsScreen(preset.id)
      ? 'A screen layout can’t be started mid-recording.'
      : 'Camera only can’t drop the screen mid-recording.';
    return (
      `<button type="button" class="preset${active ? ' is-active' : ''}" role="radio" ` +
      `aria-checked="${active}" data-action="apply-layout" data-layout="${preset.id}"` +
      (locked ? ` disabled title="${esc(why)}"` : '') +
      `>` +
      layoutMini(preset.id) +
      `<span class="preset__label">${esc(preset.label)}</span>` +
      (compact ? '' : `<span class="preset__hint">${esc(preset.hint)}</span>`) +
      `</button>`
    );
  }).join('');
  return (
    `<div class="preset-grid${compact ? ' preset-grid--compact' : ''}" role="radiogroup" ` +
    `aria-label="Camera layout">${items}</div>`
  );
}

/**
 * Size + border, shared by the Layouts screen and the live panel. Both controls
 * are disabled on presets that ignore them — `cameraBox()` ignores the scale on a
 * fixed preset, and only `BORDER_MODES` draw an outline.
 *
 * `live` marks the in-studio panel, which has no draggable camera box: its stage is
 * the compositor's canvas. The note must not send the user after an affordance that
 * only exists on the Layouts screen.
 */
function layoutControls(state, { live = false } = {}) {
  const preset = layoutPreset(state.layout);
  const { min, max } = scaleRange(preset);
  const scale = clamp(state.cameraScale, min, max);
  const note = !preset.movable
    ? 'This preset fixes the camera position and size.'
    : live
      ? 'Reposition the camera from the Layouts screen.'
      : 'Drag the camera on the stage, or nudge it with the arrow keys.';
  return (
    `<div class="layout-controls">` +
    `<label class="layout-control">` +
    `<span class="layout-control__head"><span>Camera size</span>` +
    `<span class="layout-control__value" data-scale-value>${scale}%</span></span>` +
    `<input type="range" class="range" min="${min}" max="${max}" step="1" value="${scale}" ` +
    `data-input="camera-scale" data-change="camera-scale"${preset.movable ? '' : ' disabled'}>` +
    `</label>` +
    `<div class="layout-control__row">` +
    `<button type="button" class="btn btn--sm${state.cameraBorder ? ' is-active' : ''}" ` +
    `data-action="toggle-camera-border" aria-pressed="${state.cameraBorder}"` +
    `${BORDER_MODES.has(preset.mode) ? '' : ' disabled'}>` +
    `${icon('camera', { size: 14 })}<span>Camera border</span></button>` +
    `<span class="layout-control__note">${esc(note)}</span>` +
    `</div></div>`
  );
}

/** The editable stage: the same two boxes `drawFrame` composites, in the same z-order. */
function renderLayoutStage(state) {
  const preset = layoutPreset(state.layout);
  const source = state.desktopSources.find((s) => s.id === state.selectedSourceId);
  const fill = source && source.thumbnail
    ? `<img class="layout-stage__thumb" src="${esc(source.thumbnail)}" alt="">`
    : `<span class="layout-stage__blank">${icon('monitor', { size: 20 })}</span>`;

  const screen = `<div class="layout-stage__screen" style="${boxStyle(screenBox(state) || FULL_RECT)}">${fill}</div>`;
  const scrim = preset.mode === 'scrim' ? `<div class="layout-stage__scrim"></div>` : '';
  const border = state.cameraBorder && BORDER_MODES.has(preset.mode) ? ' has-border' : '';
  const shape = preset.shape === 'circle' ? ' layout-stage__camera--circle' : '';
  const camera =
    `<div class="layout-stage__camera${preset.movable ? ' is-movable' : ''}${border}${shape}" ` +
    `style="${boxStyle(cameraBox(state))}" data-camera-box` +
    (preset.movable
      ? ` data-movable tabindex="0" aria-label="Camera box — drag or use the arrow keys to reposition it">`
      : ` aria-label="Camera box — this preset fixes its position">`) +
    `<span class="layout-stage__tag">${icon('camera', { size: 13 })}<span>Camera</span></span></div>`;

  // Camera-only: the stage IS the camera. Drawing a screen behind it would advertise a
  // capture this layout never makes.
  const body =
    preset.mode === 'solo' ? camera : preset.mode === 'inset' ? camera + screen : screen + scrim + camera;
  return `<div class="layout-stage" data-layout-stage>${body}</div>`;
}

function renderLayouts(state) {
  const actions =
    `<button type="button" class="btn btn--primary" data-action="continue-to-studio">` +
    `${icon('play', { size: 15 })}<span>Open Studio</span></button>`;
  return (
    viewHeader('grid', 'Layouts', 'Camera arrangement', actions) +
    `<div class="layouts">` +
    `<div class="layouts__presets">${presetGrid(state)}</div>` +
    `<div class="layouts__editor">${renderLayoutStage(state)}${layoutControls(state)}</div>` +
    `</div>`
  );
}

/** The live panel: presets + controls over the studio stage. No drag — the canvas is the stage here. */
function renderLayoutPanel(state) {
  if (!state.layoutPanelOpen) return '';
  return (
    `<div class="layout-panel" role="dialog" aria-label="Layout">` +
    `<div class="layout-panel__head"><span class="layout-panel__title">Layout</span>` +
    `<button type="button" class="btn btn--ghost btn--sm" data-action="close-layout-panel">` +
    `${icon('close', { size: 14 })}<span>Close</span></button></div>` +
    presetGrid(state, { compact: true }) +
    layoutControls(state, { live: true }) +
    `</div>`
  );
}

// ---------------------------------------------------------- recordings view --

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'largest', label: 'Largest' },
  { value: 'longest', label: 'Longest' },
];

const epoch = (iso) => Date.parse(iso) || 0; // a repaired entry may carry no createdAt

const SORTERS = {
  recent: (a, b) => epoch(b.createdAt) - epoch(a.createdAt),
  largest: (a, b) => (b.size || 0) - (a.size || 0),
  longest: (a, b) => (b.durationMs || 0) - (a.durationMs || 0),
};

/** Pure: search by title, then sort. Never mutates state.recordings. */
function visibleRecordings(state) {
  const query = state.query.trim().toLowerCase();
  const rows = query
    ? state.recordings.filter((item) => item.title.toLowerCase().includes(query))
    : state.recordings.slice();
  return rows.sort(SORTERS[state.sortMode] || SORTERS.recent);
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function recordingsActions(state) {
  if (!state.recordings.length) return '';
  const selected = state.selectedRecordingIds.size;

  if (state.confirmDelete) {
    return (
      `<span class="library__confirm">Delete ${selected} recording${selected === 1 ? '' : 's'} permanently?</span>` +
      `<button type="button" class="btn btn--ghost btn--sm" data-action="cancel-delete">Cancel</button>` +
      `<button type="button" class="btn btn--danger btn--sm" data-action="confirm-delete">` +
      `${icon('trash', { size: 14 })}<span>Delete</span></button>`
    );
  }

  if (!state.selectionMode) {
    return (
      `<button type="button" class="btn btn--ghost btn--sm" data-action="toggle-selection-mode">` +
      `${icon('check', { size: 14 })}<span>Select</span></button>`
    );
  }

  return (
    `<button type="button" class="btn btn--ghost btn--sm" data-action="toggle-selection-mode">Cancel</button>` +
    `<button type="button" class="btn btn--danger btn--sm" data-action="delete-selected"${selected ? '' : ' disabled'}>` +
    `${icon('trash', { size: 14 })}<span>Delete${selected ? ` (${selected})` : ''}</span></button>`
  );
}

function recordingsToolbar(state) {
  return (
    `<div class="library__toolbar">` +
    `<label class="search"><span class="search__icon">${icon('search', { size: 14 })}</span>` +
    `<input class="search__input" type="search" placeholder="Search recordings" ` +
    `aria-label="Search recordings" data-input="recordings-query" value="${esc(state.query)}"></label>` +
    selectField('Sort', 'recordings-sort', SORT_OPTIONS, state.sortMode) +
    `</div>`
  );
}

function recordingThumb(item) {
  return item.thumbnail
    ? `<span class="thumb rec-row__thumb"><img class="thumb__img" src="${esc(item.thumbnail)}" alt=""></span>`
    : `<span class="thumb rec-row__thumb thumb__blank">${icon('film', { size: 16 })}</span>`;
}

function recordingRow(item, state) {
  const active = item.id === state.selectedRecordingId;
  const checked = state.selectedRecordingIds.has(item.id);
  const check = state.selectionMode
    ? `<input class="rec-item__check" type="checkbox" data-change="toggle-recording-selected" ` +
      `data-id="${esc(item.id)}"${checked ? ' checked' : ''} aria-label="Select ${esc(item.title)}">`
    : '';
  return (
    `<li class="rec-item${active ? ' is-active' : ''}">${check}` +
    `<button type="button" class="rec-row" data-action="select-recording" data-id="${esc(item.id)}"` +
    `${active ? ' aria-current="true"' : ''}>` +
    recordingThumb(item) +
    `<span class="rec-row__meta"><span class="rec-row__title">${esc(item.title)}</span>` +
    `<span class="rec-row__sub">${esc(formatDateTime(item.createdAt))} · ` +
    `${esc(formatClock(item.durationMs))} · ${esc(formatBytes(item.size))}</span></span>` +
    `</button></li>`
  );
}

/**
 * The "as recorded" option is named after what this take actually is. A host whose
 * MediaRecorder produced MP4 must not be offered a "WebM (as recorded)" that would hand
 * the user an .mp4 file.
 */
function formatOptions(item) {
  return [
    { value: 'mp4', label: 'MP4 (H.264 / AAC)' },
    { value: 'webm', label: `${recordingExtension(item).toUpperCase()} (as recorded)` },
  ];
}

const FRAME_RATE_OPTIONS = [
  { value: '60', label: '60 fps' },
  { value: '30', label: '30 fps' },
];

const ON_OFF = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

/**
 * Resolution, frame rate, and enhance-audio shape the *capture* (LLD §5), not the
 * transcode, so they are labelled as defaults for the next take. Rendering them among the
 * export options would be three controls that silently do nothing to the file being exported.
 */
function captureDefaults(state) {
  // These are the same two controls the Settings screen renders, and their handlers reject
  // a change mid-take. Disable them here too, or the copy in this panel would silently
  // discard what the user just picked.
  const locked = RECORD_LOCKED_STATUSES.has(state.status);
  const resolutions = RESOLUTIONS.map((entry, index) => ({ value: String(index), label: entry.label }));
  return (
    `<div class="export__group">` +
    `<h4 class="export__title">Recording defaults</h4>` +
    `<div class="export__row">` +
    selectField('Resolution', 'select-resolution', resolutions, String(state.resolutionIndex), { disabled: locked }) +
    selectField('Frame rate', 'select-frame-rate', FRAME_RATE_OPTIONS, String(state.frameRate), { disabled: locked }) +
    selectField('Enhance audio', 'toggle-enhance-audio', ON_OFF, state.enhanceAudio ? 'on' : 'off') +
    `</div>` +
    `<p class="export__note">${
      locked
        ? 'Resolution and frame rate are locked while a recording is in progress.'
        : 'Applies to your next recording, not to an export of an existing one.'
    }</p>` +
    `</div>`
  );
}

function exportPanel(state, item) {
  const busy = !!(state.exportProgress && state.exportProgress.active);
  const format = state.exportFormat === 'webm' ? 'webm' : 'mp4';
  const hint =
    format === 'mp4' && !isNativeMp4(item)
      ? 'MP4 is transcoded with FFmpeg the first time, then reused.'
      : 'Saved exactly as it was recorded — no transcode.';

  return (
    `<section class="export">` +
    `<div class="export__group">` +
    `<h4 class="export__title">Export</h4>` +
    `<div class="export__row">` +
    selectField('Format', 'export-format', formatOptions(item), format, { disabled: busy }) +
    selectField('Include captions', 'toggle-captions', ON_OFF, state.includeCaptions ? 'on' : 'off', { disabled: busy }) +
    `<button type="button" class="btn btn--primary" data-action="export-recording"${busy ? ' disabled' : ''}>` +
    `${icon('download', { size: 16 })}<span>Export video</span></button>` +
    `<button type="button" class="btn btn--ghost" data-action="show-export"${busy ? ' disabled' : ''}>` +
    `${icon('share', { size: 16 })}<span>Show export</span></button>` +
    `</div>` +
    (busy
      ? `<p class="export__progress" role="status"><span class="spinner" aria-hidden="true"></span>` +
        `<span>${esc(state.exportProgress.label)}</span></p>`
      : `<p class="export__note">${esc(hint)}</p>`) +
    (state.includeCaptions && !busy
      ? `<p class="export__note">Captions are transcribed locally with Whisper and saved through a second dialog.</p>`
      : '') +
    captionsRow(item, busy) +
    `<p class="export__note">Show export reveals Rekorder's own copy — the save dialog never reports where you put yours.</p>` +
    `</div>` +
    captureDefaults(state) +
    `</section>`
  );
}

/** Once a recording has captions, they are an artifact the user can find on their own. */
function captionsRow(item, busy) {
  if (!item.captionPath) return '';
  const name = item.captionPath.slice(item.captionPath.lastIndexOf('/') + 1);
  return (
    `<p class="export__captions">${icon('check', { size: 14 })}` +
    `<span>Captions ready — <code>${esc(name)}</code></span>` +
    `<button type="button" class="btn btn--ghost btn--sm" data-action="reveal-captions"${busy ? ' disabled' : ''}>` +
    `${icon('share', { size: 14 })}<span>Reveal captions</span></button></p>`
  );
}

function recordingDetail(state) {
  const item = selectedRecording(state);
  if (!item) {
    return (
      `<div class="library__detail">` +
      cardEmpty('play', 'Nothing selected', 'Pick a recording from the list to play it back.') +
      `</div>`
    );
  }
  const dimensions = item.width && item.height ? `${item.width}×${item.height}` : 'Unknown size';
  const facts = [
    ['Recorded', formatDateTime(item.createdAt)],
    ['Duration', formatClock(item.durationMs)],
    ['Resolution', dimensions],
    ['File size', formatBytes(item.size)],
    ['Format', item.mimeType || 'Unknown'],
  ];
  // A file that already failed keeps the <video> unmounted: binding it again would
  // error and toast on every repaint.
  const stage =
    state.playbackError === item.fileName
      ? `<div class="player player--failed">` +
        `<div class="player__failure">${icon('alert', { size: 20 })}` +
        `<p class="player__failure-text">${esc(state.playbackErrorText || 'This recording could not be played.')}</p>` +
        `<button type="button" class="btn btn--ghost btn--sm" data-action="retry-playback">` +
        `${icon('refresh', { size: 14 })}<span>Try again</span></button></div></div>`
      : `<div class="player" data-player-slot></div>`;

  return (
    `<div class="library__detail">` +
    stage +
    `<h3 class="player__title">${esc(item.title)}</h3>` +
    `<dl class="player__facts">` +
    facts
      .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`)
      .join('') +
    `</dl>` +
    exportPanel(state, item) +
    `</div>`
  );
}

function libraryFooter(state) {
  const count = state.recordings.length;
  const total = state.recordings.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  return (
    `<footer class="library__footer">` +
    `<span>${count} recording${count === 1 ? '' : 's'}</span>` +
    `<span aria-hidden="true">·</span><span>${esc(formatBytes(total))} on disk</span>` +
    `</footer>`
  );
}

function renderRecordings(state) {
  const header = viewHeader('film', 'Recordings', 'Your local library', recordingsActions(state));
  if (!state.recordings.length) {
    return (
      header +
      emptyState(
        'film',
        'No recordings yet',
        'Finished recordings are saved to disk here, survive reloads, and can be searched, played back, and deleted.',
      )
    );
  }

  const rows = visibleRecordings(state);
  const list = rows.length
    ? `<ul class="rec-list">${rows.map((item) => recordingRow(item, state)).join('')}</ul>`
    : cardEmpty('search', 'No matches', `No recording title contains “${state.query.trim()}”.`);

  return (
    header +
    `<div class="library">` +
    `<div class="library__list-pane">${recordingsToolbar(state)}${list}${libraryFooter(state)}</div>` +
    recordingDetail(state) +
    `</div>`
  );
}

// ------------------------------------------------------------ settings view --

// The settings screen has no recording in hand, so it names the container generically —
// unlike the export panel, which labels "as recorded" after the actual take.
const EXPORT_FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4 (H.264 / AAC)' },
  { value: 'webm', label: 'As recorded (no transcode)' },
];

function settingsRow(body) {
  return `<div class="settings__row">${body}</div>`;
}

function recordingSettingsBody(state) {
  const locked = RECORD_LOCKED_STATUSES.has(state.status);
  const resolutions = RESOLUTIONS.map((entry, index) => ({ value: String(index), label: entry.label }));
  return (
    settingsRow(
      selectField('Resolution', 'select-resolution', resolutions, String(state.resolutionIndex), { disabled: locked }) +
        selectField('Frame rate', 'select-frame-rate', FRAME_RATE_OPTIONS, String(state.frameRate), { disabled: locked }),
    ) +
    `<p class="card__note">${
      locked
        ? 'Locked while a recording is in progress — the canvas and its capture stream are already bound.'
        : 'Applies to the next studio preview. Higher values cost more CPU and disk.'
    }</p>`
  );
}

function audioSettingsBody(state) {
  // System audio is requested from getDisplayMedia when the screen stream is acquired.
  // Unlike enhance-audio there is no applyConstraints for it: adding a system-audio track
  // means re-acquiring the display stream, which needs a fresh user gesture and would
  // interrupt the take. So it locks for the life of the session rather than lying.
  const bound = ACTIVE_STATUSES.has(state.status);
  return (
    settingsRow(
      selectField('System audio', 'toggle-system-audio', ON_OFF, state.includeSystemAudio ? 'on' : 'off', { disabled: bound }) +
        selectField('Enhance audio', 'toggle-enhance-audio', ON_OFF, state.enhanceAudio ? 'on' : 'off'),
    ) +
    `<p class="card__note">${
      bound
        ? 'System audio is locked while the studio is live; it is requested when the screen stream is acquired. Enhance audio still applies to the live microphone.'
        : 'System audio is best-effort: some hosts refuse to share it, and the studio says so when that happens. Enhance audio applies echo cancellation, noise suppression, and auto gain to the microphone.'
    }</p>`
  );
}

function exportSettingsBody(state) {
  // An export in flight already read these two. Disable them here exactly as the export
  // panel does, or this copy of the controls would silently discard the change.
  const busy = !!(state.exportProgress && state.exportProgress.active);
  return (
    settingsRow(
      selectField('Default format', 'export-format', EXPORT_FORMAT_OPTIONS, state.exportFormat === 'webm' ? 'webm' : 'mp4', { disabled: busy }) +
        selectField('Include captions', 'toggle-captions', ON_OFF, state.includeCaptions ? 'on' : 'off', { disabled: busy }),
    ) +
    `<p class="card__note">${
      busy
        ? 'Locked while an export is running.'
        : 'MP4 transcodes with FFmpeg on first export. Captions transcribe locally with Whisper; both runtimes install from the Studio Runtime tab.'
    }</p>`
  );
}

function storageSettingsBody(state) {
  const count = state.recordings.length;
  const total = state.recordings.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  return (
    `<p class="settings__stat"><strong>${count}</strong> recording${count === 1 ? '' : 's'} · ` +
    `<strong>${esc(formatBytes(total))}</strong> on disk</p>` +
    `<div class="card-empty__actions">` +
    `<button type="button" class="btn btn--ghost btn--sm" data-action="reveal-recordings"${count ? '' : ' disabled'}>` +
    `${icon('share', { size: 14 })}<span>Reveal recordings folder</span></button></div>` +
    `<p class="card__note">Recordings live in this atom's workspace and survive reloads, updates, and reinstalls. ` +
    `Delete them from the Recordings screen.</p>`
  );
}

function renderSettings(state) {
  // A bulk write would bypass the per-control locks; the handler refuses too.
  const live = ACTIVE_STATUSES.has(state.status);
  const reset =
    `<button type="button" class="btn btn--ghost btn--sm" data-action="reset-settings"${live ? ' disabled' : ''}` +
    `${live ? ' title="Stop the recording to reset preferences."' : ''}>` +
    `${icon('refresh', { size: 14 })}<span>Reset preferences</span></button>`;

  return (
    viewHeader('settings', 'Settings', 'Preferences', reset) +
    `<div class="setup"><div class="setup__grid">` +
    setupCard('video', 'Recording', recordingSettingsBody(state)) +
    setupCard('volume', 'Audio', audioSettingsBody(state)) +
    setupCard('download', 'Export defaults', exportSettingsBody(state)) +
    setupCard('film', 'Storage', storageSettingsBody(state)) +
    `</div>` +
    `<p class="setup__reassure">Every preference is stored on this machine only. ` +
    `Resetting restores the defaults and leaves your camera and microphone choices alone.</p></div>`
  );
}

// Screens: every view is live as of T10.
const VIEWS = {
  setup: renderSetup,
  record: renderRecord,
  layouts: renderLayouts,
  recordings: renderRecordings,
  settings: renderSettings,
};

function renderView(state) {
  const view = VIEWS[state.view] || VIEWS.setup;
  return view(state);
}

// ------------------------------------------------------------------ render --
// After the innerHTML swap, per-view mounters do imperative wiring for hot
// paths that must not be re-created as strings (the camera <video>, and later
// the studio canvas/clock). Unmounters tear the previous view's handles down.

/** The studio <canvas> lives in refs so the draw loop survives view changes. */
const stage = {
  ensureCanvas() {
    if (!refs.canvas) {
      const canvas = document.createElement('canvas');
      canvas.className = 'stage__canvas';
      canvas.width = RESOLUTIONS[0].width;
      canvas.height = RESOLUTIONS[0].height;
      refs.canvas = canvas;
    }
    return refs.canvas;
  },
};

const MOUNTERS = {
  setup: (state) => {
    const slot = document.querySelector('[data-cam-slot]');
    if (slot) {
      const el = cameraPreview.ensureEl();
      if (el.parentElement !== slot) slot.appendChild(el);
    }
    cameraPreview.sync(state);
    micMeter.sync(state);
  },

  record: () => {
    const slot = document.querySelector('[data-canvas-slot]');
    if (!slot) return; // idle / error states have no stage
    const canvas = stage.ensureCanvas();
    if (canvas.parentElement !== slot) slot.appendChild(canvas);
    recorder.paintClock(); // the re-render replaced the node the ticker writes to
  },

  // Requirements §3: the camera box shows the live feed, so the user frames what they
  // are dragging instead of positioning an empty rectangle. It borrows Setup's
  // persistent <video> — only one of the two views is ever mounted.
  layouts: (state) => {
    const box = document.querySelector('[data-camera-box]');
    if (box) {
      const el = cameraPreview.ensureEl();
      if (el.parentElement !== box) box.prepend(el); // behind the "Camera" tag
    }
    cameraPreview.sync(state);
  },

  // Re-parenting the persistent <video> synchronously keeps it "in the document"
  // across the innerHTML swap, so a keystroke in the search box cannot pause playback.
  recordings: (state) => {
    const slot = document.querySelector('[data-player-slot]');
    if (slot) {
      const el = player.ensureEl();
      if (el.parentElement !== slot) slot.appendChild(el);
    }
    player.sync(state);
  },
};

// Leaving Record keeps a RECORDING running while the user visits other tabs; a
// mere preview is released by navigateTo() on the way out (T15), not here — an
// unmounter runs mid-render, where the teardown's setState must not re-enter.
const UNMOUNTERS = {
  setup: () => {
    cameraPreview.stop();
    micMeter.stop();
  },
  layouts: () => cameraPreview.stop(),
  recordings: () => player.stop(),
};

function render(state) {
  const app = document.getElementById('app');
  if (!app) return;

  if (refs.mountedView && refs.mountedView !== state.view) {
    const unmount = UNMOUNTERS[refs.mountedView];
    if (unmount) unmount();
  }

  app.setAttribute('aria-busy', 'false');
  app.innerHTML =
    renderSidebar(state) +
    `<main class="main">` +
    renderBanner(state) +
    `<section class="view" data-view="${state.view}">${renderView(state)}</div></section>` +
    `</main>`;

  refs.mountedView = state.view;
  const mount = MOUNTERS[state.view];
  if (mount) mount(state);
}

// ------------------------------------------------------- delegated events --
// One click listener on the document dispatches by data-action so re-renders
// never leak listeners. Later tickets add cases to ACTIONS.

const ACTIONS = {
  navigate: (el) => navigateTo(el.dataset.view),
  'clear-banner': (el) => notices.clearBanner(el.dataset.id),
  'refresh-devices': () => devices.refresh(),
  // getDisplayMedia needs the user gesture, so the studio starts from the click.
  'continue-to-studio': () => capture.prepareStudio(),
  'prepare-studio': () => capture.prepareStudio(),
  // Re-probe after the user grants the capability in Studio Permissions, then go
  // straight back to a live preview: this click IS the fresh user gesture
  // getDisplayMedia may need, and the studio has no start button to hand back to (T15).
  'recheck-permissions': async () => {
    await probeCapabilities();
    await devices.refresh();
    if (store.state.capabilities.screenCapture === 'denied') {
      notices.toast('warn', 'Screen capture is still blocked. Grant it in Studio Permissions.');
      return;
    }
    notices.toast('good', 'Screen capture is allowed — restarting the studio preview.');
    capture.prepareStudio();
  },
  'start-recording': () => recorder.start(),
  'pause-recording': () => recorder.pause(),
  'resume-recording': () => recorder.resume(),
  'stop-recording': () => recorder.stop(),
  'toggle-mic': () => {
    const next = !store.state.micEnabled;
    capture.setMicEnabled(next);
    notices.toast('info', next ? 'Microphone enabled.' : 'Microphone muted.');
  },
  'toggle-camera': () => {
    const next = !store.state.cameraEnabled;
    capture.setCameraEnabled(next);
    notices.toast('info', next ? 'Camera enabled.' : 'Camera hidden.');
  },
  'apply-layout': (el) => applyLayoutPreset(el.dataset.layout),
  'toggle-camera-border': () => {
    store.setState({ cameraBorder: !store.state.cameraBorder });
    settings.save();
  },
  'open-layout-panel': () => store.setState({ layoutPanelOpen: true }),
  'close-layout-panel': () => store.setState({ layoutPanelOpen: false }),

  'select-recording': (el) =>
    store.setState({ selectedRecordingId: el.dataset.id, playbackError: '', playbackErrorText: '' }),
  'retry-playback': () => store.setState({ playbackError: '', playbackErrorText: '' }),
  'export-recording': () => exporter.run(selectedRecording(store.state)),
  'show-export': () => exporter.reveal(selectedRecording(store.state)),
  'reveal-captions': () => exporter.revealCaptions(selectedRecording(store.state)),
  'reset-settings': async () => {
    const outcome = await settings.reset();
    if (outcome === 'locked') {
      notices.toast('warn', 'Stop the recording before resetting preferences — resolution, frame rate, and system audio are bound to the live capture.');
    } else if (outcome === 'saved') {
      notices.toast('good', 'Preferences reset. Your camera and microphone choices were kept.');
    } else if (outcome === 'unavailable') {
      // Not a failure: there is no host to persist to, and the startup banner says so.
      notices.toast('info', 'Preferences reset. They will persist once Rekorder runs in Studio Preview.');
    } else {
      // save() already raised a banner explaining why; do not follow it with a success message.
      notices.toast('warn', 'Preferences reset for this session, but they could not be saved.');
    }
  },
  'reveal-recordings': async () => {
    const res = await bridge.files.reveal(RECORDINGS_DIR);
    if (!res.ok) bridge.fail(res, 'The recordings folder could not be revealed.', { cap: 'filesystem' });
  },
  /**
   * Open the macOS Privacy pane. `shell.openExternal` documents http/https/mailto only, so
   * the `x-apple.systempreferences:` scheme may be refused — try it anyway (a host that
   * later allows it needs no change here), and fall back to putting the link on the
   * clipboard, which opens the pane when pasted into Safari's address bar.
   */
  'open-privacy-pane': async (el) => {
    const kind = el.dataset.kind;
    const url = PRIVACY_LINKS[kind];
    if (!url) return;

    const opened = await bridge.shell.openExternal(url);
    if (opened.ok) {
      notices.toast('good', `Opening System Settings — enable TinyAtom under ${PRIVACY_PANE[kind]}, then press Recheck.`, { timeout: 8000 });
      return;
    }
    logWarn('openExternal refused the privacy-pane scheme', opened);

    const copied = await bridge.clipboard.writeText(url);
    if (!copied.ok) {
      bridge.fail(copied, 'The System Settings link could not be opened or copied.', { cap: 'clipboard' });
      return;
    }
    notices.toast(
      'warn',
      `This host will not open System Settings directly, so the link is on your clipboard. Paste it into Safari's address bar to reach the ${PRIVACY_PANE[kind]} pane, enable TinyAtom (a development build is listed as “Electron”), then press Recheck.`,
      { timeout: 12000 },
    );
  },
  'toggle-selection-mode': () =>
    store.setState({
      selectionMode: !store.state.selectionMode,
      selectedRecordingIds: new Set(),
      confirmDelete: false,
    }),
  'delete-selected': () => {
    if (store.state.selectedRecordingIds.size) store.setState({ confirmDelete: true });
  },
  'cancel-delete': () => store.setState({ confirmDelete: false }),
  'confirm-delete': async () => {
    const ids = [...store.state.selectedRecordingIds];
    store.setState({ confirmDelete: false });
    const { removed, failed, failures, orphanedSidecars } = await library.remove(ids);

    if (removed) {
      notices.toast('good', `Deleted ${removed} recording${removed === 1 ? '' : 's'}.`);
      if (!store.state.recordings.length) store.setState({ selectionMode: false });
    }
    if (failed) {
      // The typed reason names the actual problem — a blocked capability reads as one.
      const reason = failures[0] && failures[0].reason;
      const fallback = `${failed} recording${failed === 1 ? '' : 's'} could not be deleted.`;
      notices.toast('danger', bridge.explain({ reason }, fallback, { cap: 'filesystem' }));
    }
    if (orphanedSidecars) {
      notices.toast('warn', `${orphanedSidecars} exported file${orphanedSidecars === 1 ? '' : 's'} could not be deleted and remain${orphanedSidecars === 1 ? 's' : ''} in the workspace.`);
    }
  },
};

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const handler = ACTIONS[el.dataset.action];
  if (handler) handler(el, event);
});

// <select> changes dispatch via data-change (kept separate from click actions
// so opening a dropdown doesn't fire a click handler).
const CHANGE_ACTIONS = {
  'select-camera': (el) => {
    store.setState({ selectedCameraId: el.value });
    settings.save();
  },
  'select-mic': (el) => {
    store.setState({ selectedMicId: el.value });
    settings.save();
  },
  'select-source': (el) => store.setState({ selectedSourceId: el.value }),
  // Requested once, from getDisplayMedia, when the screen stream is acquired. A change
  // during a live session cannot reach that stream, so it is refused rather than lost.
  'toggle-system-audio': (el) => {
    if (ACTIVE_STATUSES.has(store.state.status)) return;
    store.setState({ includeSystemAudio: el.value === 'on' });
    settings.save();
  },
  // `change` lands on pointer release (and on each arrow key): commit the gesture.
  'camera-scale': (el) => {
    layoutGesture.update({ cameraScale: Number(el.value) });
    layoutGesture.commit({ refocus: '[data-input="camera-scale"]' });
  },
  'recordings-sort': (el) => store.setState({ sortMode: el.value }),
  // An export in flight already read both of these; a late change would be discarded.
  'export-format': (el) => {
    if (exporter.running) return;
    const exportFormat = SETTINGS_SCHEMA.exportFormat(el.value);
    if (exportFormat === undefined) return;
    store.setState({ exportFormat });
    settings.save();
  },
  'toggle-captions': (el) => {
    if (exporter.running) return;
    store.setState({ includeCaptions: el.value === 'on' });
    settings.save();
  },
  // The <select> is disabled mid-take, but the handler must not rely on that: resizing the
  // canvas or changing the frame rate under a live captureStream corrupts the recording.
  'select-resolution': (el) => {
    if (RECORD_LOCKED_STATUSES.has(store.state.status)) return;
    const resolutionIndex = SETTINGS_SCHEMA.resolutionIndex(Number(el.value));
    if (resolutionIndex === undefined) return;
    store.setState({ resolutionIndex });
    settings.save();
  },
  'select-frame-rate': (el) => {
    if (RECORD_LOCKED_STATUSES.has(store.state.status)) return;
    const frameRate = SETTINGS_SCHEMA.frameRate(Number(el.value));
    if (frameRate === undefined) return;
    store.setState({ frameRate });
    settings.save();
    capture.retimeDrawLoop(); // a preview already on screen keeps its own clock otherwise
  },
  'toggle-enhance-audio': async (el) => {
    const enabled = el.value === 'on';
    const outcome = await capture.setEnhanceAudio(enabled);
    if (outcome === 'applied') {
      notices.toast('info', enabled ? 'Audio enhancement on.' : 'Audio enhancement off.');
    } else if (outcome === 'failed') {
      notices.toast('warn', 'This host will not change audio enhancement mid-stream. It applies to your next studio preview.');
    }
  },
  'toggle-recording-selected': (el) => {
    const ids = new Set(store.state.selectedRecordingIds);
    if (el.checked) ids.add(el.dataset.id);
    else ids.delete(el.dataset.id);
    store.setState({ selectedRecordingIds: ids, confirmDelete: false });
  },
};

document.addEventListener('change', (event) => {
  const el = event.target.closest('[data-change]');
  if (!el) return;
  const handler = CHANGE_ACTIONS[el.dataset.change];
  if (handler) handler(el, event);
});

// `input` fires continuously while the slider thumb moves. It only paints — a
// setState here would swap the innerHTML and rip the slider out from under the pointer.
const INPUT_ACTIONS = {
  'camera-scale': (el) => layoutGesture.update({ cameraScale: Number(el.value) }),

  // The search box does need state (the list is derived from `query`), so it takes the
  // re-render and puts the caret back where the typist left it.
  'recordings-query': (el) => {
    const { selectionStart, selectionEnd } = el;
    store.setState({ query: el.value, confirmDelete: false });
    const next = document.querySelector('[data-input="recordings-query"]');
    if (!next) return;
    next.focus();
    try {
      next.setSelectionRange(selectionStart, selectionEnd);
    } catch (error) {
      // Some input types refuse selection ranges; focus alone is enough.
    }
  },
};

document.addEventListener('input', (event) => {
  const el = event.target.closest('[data-input]');
  if (!el) return;
  const handler = INPUT_ACTIONS[el.dataset.input];
  if (handler) handler(el, event);
});

// Drag the camera box on a movable preset. The gesture paints imperatively and
// commits once on release, so the dragged node survives the whole drag.
document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.target.closest) return;
  const boxEl = event.target.closest('[data-camera-box][data-movable]');
  const stageEl = boxEl && boxEl.closest('[data-layout-stage]');
  if (!stageEl) return;

  event.preventDefault(); // suppress the drag-image / text selection
  boxEl.focus();
  const bounds = stageEl.getBoundingClientRect();
  const start = cameraBox(store.state);
  const grabX = (event.clientX - bounds.left) / bounds.width - start.x;
  const grabY = (event.clientY - bounds.top) / bounds.height - start.y;
  try {
    boxEl.setPointerCapture(event.pointerId);
  } catch (error) {
    // Capture is best-effort; the window listeners below carry the drag regardless.
  }

  const move = (moveEvent) => {
    layoutGesture.update({
      cameraRect: {
        ...store.state.cameraRect,
        x: (moveEvent.clientX - bounds.left) / bounds.width - grabX,
        y: (moveEvent.clientY - bounds.top) / bounds.height - grabY,
      },
    });
  };
  const finish = (keep) => () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', abort);
    if (keep) layoutGesture.commit();
    else layoutGesture.cancel();
  };
  const up = finish(true);
  const abort = finish(false);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', abort);
});

// Dragging is pointer-only, so the camera box also answers the arrow keys.
const NUDGE_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

document.addEventListener('keydown', (event) => {
  const boxEl = event.target.closest && event.target.closest('[data-camera-box][data-movable]');
  const delta = boxEl && NUDGE_KEYS[event.key];
  if (!delta) return;
  event.preventDefault();
  const step = event.shiftKey ? 0.05 : 0.01;
  const rect = store.state.cameraRect;
  layoutGesture.update({
    cameraRect: { ...rect, x: rect.x + delta[0] * step, y: rect.y + delta[1] * step },
  });
  layoutGesture.commit({ refocus: '[data-camera-box]' });
});

// -------------------------------------------------------------------- init --

/**
 * Async startup: metadata → restore saved selections → load the recordings index
 * → probe capabilities (unlocks device labels) → enumerate devices for Setup.
 */
async function boot() {
  const meta = await bridge.metadata();
  if (meta && meta.id) {
    store.setState({ meta: { id: meta.id, name: meta.name, version: meta.version } });
  }
  await settings.load();
  await library.load();
  await probeCapabilities();
  await devices.refresh();
}

function init() {
  syncScene(store.state);
  store.subscribe(syncScene); // keep the draw loop's snapshot ahead of render()
  store.subscribe(render);
  render(store.state);

  // An in-flight recording cannot be flushed synchronously at teardown, so warn
  // before the view goes away rather than dropping the chunks silently.
  window.addEventListener('beforeunload', (event) => {
    if (!recorder.isActive()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // Never leave the camera/mic indicators lit after the atom view goes away.
  window.addEventListener('pagehide', () => {
    micMeter.stop();
    capture.reset();
  });

  if (!bridge.available()) {
    notices.banner(
      'info',
      'Running outside the TinyAtom host — capture, files, and storage are inactive until Preview.',
    );
  }

  boot();

  // Dev handle for verifying the app from the console during Preview.
  window.__rekorder = {
    store, notices, bridge, devices, settings, navigateTo,
    capture, recorder, library, player, exporter, captions, refs, applyLayoutPreset,
    LAYOUT_DEFAULTS, LAYOUT_PRESETS, cameraBox, screenBox, syncScene, scaleRange, needsScreen, mixAudio,
    visibleRecordings, formatBytes, isSafeWorkspacePath, isRecordingItem,
    timeoutForDuration, isNativeMp4, safeFileStem, hasCues,
    deviceConstraint, diagnoseDevice, captureMic, captureCamera, captureScreen,
    SETTINGS_KEYS, SETTINGS_SCHEMA, createInitialState, explainFailure,
    micMeter, timeDomainRms, spectrumBars, describe, setupMicBody,
    __actions: ACTIONS, __changes: CHANGE_ACTIONS,
  };
}

init();
