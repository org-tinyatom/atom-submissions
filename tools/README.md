# Vendored publish tooling

These scripts are copied from the TinyAtom app repo (`scripts/`) so this repository's `publish.yml` and
`checks.yml` workflows are **self-contained** — CI checks out no external repo.

- `publish-atom.mjs` + `lib/atom-publish.mjs` — package + sign a merged atom and upsert the signed catalog.
  `publish.yml` runs this on push to `main`.
- `check-atom-submission.mjs` + `lib/atom-checks.mjs` — advisory structural + security checks on a
  submission. `checks.yml` runs this on pull requests.
- `atom-capabilities.mjs` — the capability list a submission's manifest is validated against.

## Keep in sync with the app

These are copies. When the app repo changes, update the matching file here:

- **`atom-capabilities.mjs`** — mirror `src/types/atom-ipc.ts` `ATOM_CAPABILITIES` whenever a capability is
  added or removed.
- **`lib/atom-publish.mjs`** / **`lib/atom-checks.mjs`** — re-copy if the app's packaging/signing or check
  logic changes. The signing logic in particular must keep producing signatures the app still verifies.

The **only** intentional difference from the app's copy: this `lib/atom-publish.mjs`'s
`readAtomCapabilities` imports `ATOM_CAPABILITIES` from `atom-capabilities.mjs` instead of parsing
`src/types/atom-ipc.ts`. Everything else — the packaging, the Ed25519 manifest + catalog signing — is
byte-for-byte the app's logic.
