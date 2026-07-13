# TinyAtom atom workspace: rekorder

This is the editable workspace for atom `rekorder`. Stay inside this folder.
Read the shared Studio docs in the parent folder before changing files:
`../CREATOR_GUIDE.md`, `../TINYATOM_README.md`, `../TINYATOM_API.md`, `../TINYATOM_CREATION_FLOW.md`, `../TINYATOM_CAPABILITIES.md`, `../TINYATOM_THEME.md`, and `../TINYATOM_WORKSPACES.md`.

If you are confused about TinyAtom APIs, capabilities, runtime dependencies, theme rules, workspace/data paths, or creation rules, read those shared docs instead of inspecting the TinyAtom host source.

## Rules

- Do not edit the TinyAtom host app or unrelated paths. Source changes stay inside this workspace; runtime data edits are allowed only inside this atom's artifact workspace when explicitly requested.
- Build the atom with plain `index.html`, `app.js`, and `styles.css`.
- Read `../TINYATOM_THEME.md` before designing or changing UI colors. New atoms should use the TinyAtom workbench palette unless the user explicitly asks for a different brand or visual direction.
- Keep the generated `styles.css` token block as the source of truth for color, font, border, and radius values. Use `var(--atom-bg)`, `var(--atom-panel)`, `var(--atom-ink)`, `var(--atom-muted)`, `var(--atom-accent)`, and `var(--atom-line)` in component rules; when the user requests theme changes, update or add semantic `--atom-*` tokens before using new colors.
- The atom runs under strict `atom://` CSP with no Node.js, Electron, remote scripts, remote assets, or default network access. Local bundled WebAssembly is allowed; keep `.wasm`, model, worker, and media assets inside the atom workspace/package.
- Use only `window.tinyAtom` for host features.
- TinyAtom can become a complete desktop app through the capability bridge: storage, database, files, linked external file references, terminal, network, downloads, secrets, OAuth, media/device access, print/PDF, windows, tray menu, shortcuts, protocols, and related host APIs.
- Native capabilities start at zero access. Request the exact capabilities the implementation uses in `.tinyatom/creation/capability-requests.json`; Studio saves them to `manifest.json` and activates Preview grants.
- Do not hand-edit `manifest.json` or `.tinyatom/creation/dev-permissions.json` to grant permissions.
- If the atom needs shared runtime software such as FFmpeg, FFprobe, Whisper, or another TinyAtom-provided tool/model, document the runtime, reason, inputs, outputs, and host support needed in `.tinyatom/creation/requirements.md`, then declare it in `.tinyatom/runtime-dependencies.json`. Install missing fetched runtimes from the Studio Runtime tab before Preview testing.
- FILE RULE: A file that already exists on the user machine is REFERENCED in place with `files.reference` and never copied into the atom workspace; only files the atom GENERATES (clips, transcripts, exports) are written there. `files.importFile` COPIES, so it is reserved for a small asset the atom should own long-term (an icon, a kept template) — never a processing source (video, audio, document, dataset).
- FFmpeg is available through `window.tinyAtom.media.runFfmpeg({ args, inputs, cwd, timeoutMs })` when the atom has the `media` capability and the `ffmpeg` runtime is declared. To process an existing user file, pass `inputs: [{ refId }]` and address it in args as `{{input0}}`; outputs go under `resources/` or `projects/` (cwd defaults to `resources/`).
- FFprobe is available through `window.tinyAtom.media.runFfprobe({ args, inputs, cwd, timeoutMs })` when the atom has the `media` capability and the `ffprobe` runtime is declared; it takes the same `inputs` + `{{input0}}` form for referenced files.
- Artifact files are available through the complete `window.tinyAtom.files` bridge when the atom has the `filesystem` capability: list, stat, exists, read, write, append, mkdir, copy, move, rename, delete, search, url, open, reveal, export, plus `files.reference.*` for existing user files. Paths are relative to the atom artifact workspace, not this source workspace; use `resources/` for generated files by convention.
- Structured app data belongs in `window.tinyAtom.db` when the atom has the `database` capability. If the atom needs tables, fill the "Database Tables (If Needed)" section in Requirements and PRD with table names, purpose, important columns, indexes/constraints, and migration files under `db/migrations/NNNN_<slug>.sql`.
- Existing user files and folders are referenced through `window.tinyAtom.files.reference` (part of the `filesystem` capability): `pickFile`/`pickDirectory` link them in place, the atom receives opaque `refId` values, never absolute paths, and `files.reference.url(refId, subpath?)` streams large media.
- Whisper transcription is available through `window.tinyAtom.speech.transcribe({ path | refId, format })` when the atom has the `speech` capability and the `whisper-cli` and `whisper-model` runtimes are declared. Pass `refId` for an existing user audio file, or `path` for a workspace file. Formats are `text`, `srt`, `vtt`, and `json`; use `json` for timestamped segments.
- Open external web/mail links through `window.tinyAtom.shell.openExternal(...)` when the atom has the `external-links` capability.
- If the atom needs app-specific local WASM, model, worker, or media assets, bundle those files inside the atom package. If a tool/model is likely to be reused by multiple atoms, declare it as a TinyAtom runtime dependency instead of duplicating it.
- Do not tell the user a requirement is blocked completely. If one route is unavailable, propose the viable TinyAtom route: local bundled web/WASM assets, an existing `window.tinyAtom` bridge capability, a host tool, or a new platform bridge requirement.
- Do not assume arbitrary shell, Node, or package access from atom code; implement through `window.tinyAtom` and local bundled assets, and call out any missing host bridge as a platform requirement.
- `window.tinyAtom` calls that return `{ ok: false }` may include a typed `reason` such as `capability-denied`, `invalid-request`, `runtime-missing`, `runtime-error`, or `unsupported`. Handle the failure even when `reason` is absent.
- If `.tinyatom/creation/reviews/` has review files, read them before continuing and address their findings before asking for approval or release review.
- Do not edit `.tinyatom/creation/status.json`; Studio owns approvals.

## Source Workspace And Runtime Data

- This folder is the editable source workspace at `studio/rekorder/`. It contains app source, creation docs, and assets intentionally packaged with the atom.
- Studio Preview and installed atoms share a durable artifact workspace at `artifacts/rekorder/`. In the default TinyAtom library this is `~/TinyAtom/artifacts/rekorder`; from the default source workspace it is reachable as `../../artifacts/rekorder`.
- `window.tinyAtom.files`, `storage`, `media`, and `speech` operate on the artifact workspace. `window.tinyAtom.files.reference` stores external file refs in `artifacts/rekorder/.tinyatom/refs.json`, but referenced files stay in the user-picked location. A runtime path such as `resources/datasets/request.json` means `artifacts/rekorder/resources/datasets/request.json`, not a file beside `app.js`.
- During Studio Preview, atom-requested terminals open in this source workspace by default. If the atom asks an agent to process `resources/...` or `projects/...`, include the artifact workspace path in the prompt and write outputs back into that artifact subfolder.
- If the app polls for a completion file such as `result.json`, write intermediate files first and write the polled result file last.
- Do not copy large Preview-generated files, imported media, transcripts, datasets, or clips into the source/package unless the user explicitly asks to bundle them as app assets.

## Theme And Styling

- Use `../TINYATOM_THEME.md` for the complete palette, token list, usage rules, and instructions for user-requested theme changes.
- Keep hardcoded hex/rgb/hsl/named colors out of component CSS. If a new color role is required, define a semantic `--atom-*` token in `styles.css` and reference it with `var(...)`.
- Keep the default feel calm and professional: editor-like dark surfaces, restrained contrast, one blue command accent, visible focus/selection states, and crisp 1px separators.
- Preserve `color-scheme: light dark` and the `@media (prefers-color-scheme: light)` override so the atom follows the host theme.

## Creation Flow

1. Interview the user, then write `.tinyatom/creation/requirements.md`. Ask the user to approve Requirements in the Studio Progress UI.
2. After Requirements is approved, write `.tinyatom/creation/prd.md` from the approved requirements. Ask the user to approve PRD in the Studio Progress UI.
3. After PRD is approved, write `.tinyatom/creation/lld.md` (the low-level design). LLD does not need a separate approval.
4. Break the PRD and LLD into tickets, then implement one ticket at a time and keep each ticket current.

When interviewing for requirements, cover goal, users, scope, functionality, theme or brand changes, out of scope, the data model (list required database tables — name, purpose, key columns, relationships — or state that no tables are needed), privacy, capabilities, and any required software/tools.

Do not implement before Requirements and PRD are approved in the Studio Progress UI.

This file mirrors `AGENTS.md` so Gemini and other agents get the same workspace briefing.
