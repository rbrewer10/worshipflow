# Developing WorshipFlow

## Toolchain

- **Node 24.15.x with npm 11.** This is what CI and the release workflow use
  (`.nvmrc`, `package.json` `engines`). `nvm use` / `fnm use` / Volta pick it up
  from `.nvmrc`.
- **Not Node 20 / npm 9.** npm 9 resolves an optional peer of vitest's bundled
  vite (`esbuild ^0.27 || ^0.28`) differently from npm 11, so `npm ci` on npm 9
  fails with a misleading "package.json and package-lock.json are not in sync —
  Missing: esbuild@0.28.2". The lockfile is correct for npm 11; `.npmrc` sets
  `engine-strict=true` so the wrong toolchain now fails with a clear
  "Unsupported engine" message instead.
- **Not Node 24.16+ (or 26.1+) yet:** a stream `destroy()` change there truncates
  Electron's postinstall extraction (nodejs/node#63487).

## Everyday commands

```sh
npm ci              # install exactly what package-lock.json says
npm run dev         # electron-vite dev (data in ./.worshipflow-dev)
npm run typecheck   # main + renderer
npm run lint        # renderer (jsx-a11y etc.)
npm test            # vitest unit tests
npm run test:e2e    # build, then drive the real app with Playwright
```

CI (`.github/workflows/ci.yml`) should run typecheck, lint, unit tests and
e2e on Windows for every push to master and every pull request (the lint/e2e
steps are proposed in the release-hygiene PR description; workflow files have
to be pushed by someone with the `workflow` scope).

## Dev profile and e2e isolation

An unpackaged run stores its database, backups and `recovery.json` in
`<cwd>/.worshipflow-dev`, unless `--user-data-dir=<dir>` (or the
`WF_USER_DATA_DIR` env var) is given, in which case that directory is used.
Packaged builds always use `%APPDATA%\worshipflow`.

The e2e harness (`tests/e2e/electronApp.ts`) launches every test with its own
temp `--user-data-dir` **and** temp cwd, so tests never share a database with
each other or with your dev profile. A fresh profile opens to the first-run
wizard; use `completeFirstRun(operator, { sample })` to get past it. On Linux,
run e2e under `xvfb-run -a npm run test:e2e`.
