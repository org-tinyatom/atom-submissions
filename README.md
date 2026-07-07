# TinyAtom Atom Submissions

TinyAtom is a desktop app for building and using small, focused apps called atoms. This repository is
where you submit an atom to be published to the public TinyAtom marketplace.

## How to submit an atom

1. Fork this repository.
2. Create one folder for your atom, named by its id and then its version:

   ```text
   submissions/your-atom-id/1.0.0/
   ```

3. Add your atom's files to that folder, including a `manifest.json` that describes it:

   - `id`: lowercase letters, numbers, and hyphens. It must match the id folder name.
   - `name`: a short display name shown in the marketplace.
   - `version`: in the form MAJOR.MINOR.PATCH. It must match the version folder name.
   - `entry`: the file your atom opens, for example `index.html`.
   - `capabilities`: the things your atom needs access to, if any.

4. Do not include private keys, passwords, or any other secrets.
5. Open a pull request.

A maintainer reviews every submission. Once yours is accepted and merged, your atom becomes available in
the TinyAtom marketplace.

## Updating an atom you already published

Submit a new folder with a higher version number, for example:

```text
submissions/your-atom-id/1.1.0/
```

## Guidelines

- One atom per pull request.
- Keep each atom small and self-contained.
- Give it a clear name and description so people understand what it does.

## Questions

Open an issue in this repository.
