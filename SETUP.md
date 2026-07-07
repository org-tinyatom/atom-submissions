# Pipeline setup (owner only)

The two workflows in `.github/workflows/` are installed. Before they can publish, an **owner** must add
what an agent cannot: secrets, the signing key, and the tooling source. Nothing here should ever be given
to a fork pull request.

## 1. Owner signing keypair

Generate the TinyAtom owner Ed25519 keypair (in the app repo: `node scripts/generate-owner-keypair.mjs
--out-dir keys`). Then:

- **Public key** → bake into the app build (`TINYATOM_OWNER_PUBLIC_KEY_PEM` / `_PATH`). This is what the
  app verifies catalog + manifest signatures against.
- **Private key** → this repo's Actions secret `TINYATOM_OWNER_PRIVATE_KEY_PEM` (PEM text). Never commit
  it, never expose it to a `pull_request` workflow.

## 2. Repository secrets (Settings → Secrets and variables → Actions)

- `TINYATOM_OWNER_PRIVATE_KEY_PEM` — the private key from step 1. Signs each atom's `manifest.sig` and the
  catalog's `catalog.json.sig`.
- `CATALOG_PUSH_TOKEN` — a fine-grained token with `contents: write` on `org-tinyatom/atoms-catalog`
  (create Releases + push the signed catalog). If the app/tooling repo is private, the token also needs
  read access to it.

## 3. The tooling source (publish.yml checks it out)

`publish.yml` runs `node tinyatom/scripts/publish-atom.mjs`, which reads the atom capability list from
`src/types/atom-ipc.ts` — so the workflow checks out the **TinyAtom app repo** at `org-tinyatom/tinyatom`.
That repo does not exist yet. Do ONE of:

- push the TinyAtom app repo to `org-tinyatom/tinyatom` (private is fine — `CATALOG_PUSH_TOKEN` reads it), or
- adjust the `repository:` slug in both workflows to wherever the app repo lives, or
- ask to have a minimal `tinyatom-publish-tools` repo carved out (just `scripts/` + `src/types/atom-ipc.ts`)
  if you'd rather not expose the whole app.

`checks.yml` also checks out the same repo for `scripts/check-atom-submission.mjs`.

## 4. Branch protection

`main` is protected: pull requests required with 1 approval, no force-push, no deletion (admins may still
push directly for maintenance). Every submission therefore goes through owner review before the merge that
triggers `publish.yml`.

## Security posture

`checks.yml` runs on pull requests with **no secrets** and never approves — advisory only. `publish.yml`
holds the owner key and runs **only on push to `main`** (i.e. after a human merged a reviewed submission);
it signs, uploads the package as a Release asset on `atoms-catalog`, and pushes the signed `catalog.json` +
`catalog.json.sig` the app verifies (fail-closed in packaged builds, with rollback protection).
