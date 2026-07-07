# TinyAtom atom workspace: Autocuts Clips

This is the editable workspace for atom `autocuts-clips`. Stay inside this folder.
Read the shared Studio docs in the parent folder before changing files:
`../CREATOR_GUIDE.md`, `../TINYATOM_README.md`, `../TINYATOM_API.md`, `../TINYATOM_CREATION_FLOW.md`, and `../TINYATOM_CAPABILITIES.md`.

If you are confused about TinyAtom APIs, capabilities, runtime dependencies, or creation rules, read those shared docs instead of inspecting the TinyAtom host source.

## Rules

- Do not edit the TinyAtom host app or any path outside this workspace.
- Build the atom with plain `index.html`, `app.js`, and `styles.css`.
- The atom runs under strict `atom://` CSP with no Node.js, Electron, remote scripts, remote assets, or default network access. Local bundled WebAssembly is allowed; keep `.wasm`, model, worker, and media assets inside the atom workspace/package.
- Use only `window.tinyAtom` for host features.
- TinyAtom can become a complete desktop app through the capability bridge: storage, files, projects, terminal, network, downloads, secrets, OAuth, media/device access, print/PDF, windows, tray menu, shortcuts, protocols, and related host APIs.
- Native capabilities start at zero access. Request the exact capabilities the implementation uses in `.tinyatom/creation/capability-requests.json`; Studio saves them to `manifest.json` and activates Preview grants.
- Do not hand-edit `manifest.json` or `.tinyatom/creation/dev-permissions.json` to grant permissions.
- If the atom needs shared runtime software such as FFmpeg, FFprobe, Whisper, or another TinyAtom-provided tool/model, document the runtime, reason, inputs, outputs, and host support needed in `.tinyatom/creation/requirements.md`, then declare it in `.tinyatom/runtime-dependencies.json`. Install missing fetched runtimes from the Studio Runtime tab before Preview testing.
- FFmpeg is available through `window.tinyAtom.media.runFfmpeg({ args, cwd, timeoutMs })` when the atom has the `media` capability and the `ffmpeg` runtime is declared. Keep cwd under `resources/` or `projects/`; it defaults to `resources/`.
- FFprobe is available through `window.tinyAtom.media.runFfprobe({ args, cwd, timeoutMs })` when the atom has the `media` capability and the `ffprobe` runtime is declared.
- User-picked binary files and generated artifacts are available through `window.tinyAtom.files.importFile`, `list`, `url`, `open`, and `reveal` when the atom has the `filesystem` capability. Paths are scoped to `resources/` and `projects/`.
- Whisper transcription is available through `window.tinyAtom.speech.transcribe({ path, format })` when the atom has the `speech` capability and the `whisper-cli` and `whisper-model` runtimes are declared. Formats are `text`, `srt`, `vtt`, and `json`; use `json` for timestamped segments.
- Open external web/mail links through `window.tinyAtom.shell.openExternal(...)` when the atom has the `external-links` capability.
- If the atom needs app-specific local WASM, model, worker, or media assets, bundle those files inside the atom package. If a tool/model is likely to be reused by multiple atoms, declare it as a TinyAtom runtime dependency instead of duplicating it.
- Do not tell the user a requirement is blocked completely. If one route is unavailable, propose the viable TinyAtom route: local bundled web/WASM assets, an existing `window.tinyAtom` bridge capability, a host tool, or a new platform bridge requirement.
- Do not assume arbitrary shell, Node, or package access from atom code; implement through `window.tinyAtom` and local bundled assets, and call out any missing host bridge as a platform requirement.
- `window.tinyAtom` calls that return `{ ok: false }` may include a typed `reason` such as `capability-denied`, `invalid-request`, `runtime-missing`, `runtime-error`, or `unsupported`. Handle the failure even when `reason` is absent.
- If `.tinyatom/creation/review-feedback.md` exists, read it before each new plan step and address its findings before asking for approval or release review.
- Do not edit `.tinyatom/creation/status.json`; Studio owns approvals.

## Creation Flow

1. Start with `.tinyatom/creation/requirements.md`. Interview the user about goal, users, scope, functionality, out of scope, data, privacy, capabilities, and any required software/tools. When complete, ask the user to approve Requirements in the Progress UI.
2. After Requirements is approved, write `.tinyatom/creation/prd.md` from the requirements. Keep it plain, specific, and concise. Include required capabilities and host tools/packages. Ask the user to approve PRD in the Progress UI or request changes.
3. After PRD is approved, write `.tinyatom/creation/plan.md`. The plan does not need approval. Implement it step by step and mark each item complete in `plan.md`.
4. For large apps, split `plan.md` into phases. After each phase, ask the user to review the Preview UI and request changes before continuing.
5. When finished, mark the top of `plan.md` complete and tell the user to review the final Preview.

This file mirrors `AGENTS.md` so Gemini and other agents get the same workspace briefing.
