# How to submit an atom

Open a pull request that adds a single directory here:

```text
submissions/<atom-id>/
  manifest.json      required — id, name, version (MAJOR.MINOR.PATCH), entry, capabilities
  index.html         your entry file and any other assets it needs
  ...
```

Rules the advisory check (`checks.yml`) enforces on your PR:

- `<atom-id>` and `manifest.id` are lowercase-kebab (`a-z`, `0-9`, hyphens); `manifest.version` is semver.
- `manifest.entry` is a relative path that exists inside your submission.
- **Do not** include `manifest.sig`, `.pem`/`.key` files, private-key material, `.git`, or `node_modules` —
  the pipeline signs your atom after review; a signature you ship is rejected.
- Keep it under the size and file-count caps.

A red check is advice, not a rejection — a TinyAtom owner reviews every submission. On merge, a trusted
workflow signs and publishes your atom to the official catalog automatically.
