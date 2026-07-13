# rekorder tests

Headless harnesses for the logic that does not need a browser. Each one loads the real
`app.js` into a `node:vm` context with a fake DOM and a fake `window.tinyAtom` bridge,
then drives the modules directly and asserts on what reached the bridge.

They are **development files only**. `index.html` never loads them, they ship no runtime
code into the atom, and they need nothing installed — just Node.

```sh
node tests/t03-devices.test.mjs    # enumeration, permission diagnosis, capture fallback
node tests/t07-library.test.mjs    # persistence, index, playback, delete
node tests/t08-export.test.mjs     # WebM/MP4 export, FFmpeg args, reveal
node tests/t09-captions.test.mjs   # audio extract, Whisper, caption sidecar
node tests/t10-settings.test.mjs   # settings schema, round-trip, reset, AC audits
node tests/t11-mic-meter.test.mjs  # live microphone meter, silence detection, teardown
node tests/t17-draw-clock.test.mjs # compositor clock: worker ticks, retime, rAF fallbacks
```

Each prints one line per assertion and exits non-zero if any failed. Run them all:

```sh
for t in tests/*.test.mjs; do node "$t" | tail -1; done
```

## What they cannot cover

Anything that needs the real host: a live `MediaRecorder`, `getDisplayMedia`, real device
enumeration, the actual FFmpeg and Whisper binaries, the native save dialog,
`files.url` streaming into a `<video>`, and a real `Worker` under the atom:// CSP driving a
real hidden window (t17 fakes the Worker; it proves the clock's contract, not the host's).
Those belong to the Studio Preview pass, and each ticket's Verification section names what
is still owed there.
