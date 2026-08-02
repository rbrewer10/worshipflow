# Releasing a new version

WorshipFlow Pro checks GitHub for a newer release once at startup (see
`src/main/autoUpdate.ts`) and offers a one-click restart-to-update once it's
downloaded one. For that to have anything to find, a real GitHub Release
has to exist with the right files attached. This is a manual process today
— not automated, since it hasn't been run enough times yet to be worth
scripting.

## Steps

1. **Bump the version** in `package.json`'s `"version"` field (e.g.
   `0.12.4` → `0.13.0`). A patch bump for a bug fix, a minor bump for a new
   feature — whatever fits.

2. **Build the installer:**
   ```bash
   npm run dist
   ```
   This produces, in `dist-installer/`:
   - `WorshipFlow Pro Setup X.Y.Z.exe` — the installer itself.
   - `WorshipFlow Pro Setup X.Y.Z.exe.blockmap` — used by electron-updater
     for efficient differential downloads.
   - `latest.yml` — the manifest electron-updater reads to know the latest
     version number and the installer's checksum.

3. **Commit and push the version bump** (don't skip this — the next
   session needs `package.json` to reflect what was actually shipped):
   ```bash
   git add package.json package-lock.json
   git commit -m "chore: bump version to X.Y.Z"
   git push
   ```

4. **Create the GitHub Release:**
   - Go to https://github.com/rbrewer10/worshipflow/releases/new
   - Tag: `vX.Y.Z` (must start with `v`, matching electron-updater's
     expected format)
   - Title: whatever's clear — e.g. `X.Y.Z`
   - Attach all three files from `dist-installer/`: the `.exe`, the
     `.exe.blockmap`, and `latest.yml`.
   - Publish the release (not as a draft — draft releases aren't visible to
     the update check).

5. **Verify:** an already-installed older version, next time it's opened,
   should silently download this release in the background and show
   "Restart to update" in the top bar within a few minutes.

## Notes

- The repo is public specifically so this works with no access token
  embedded in the shipped app — see the 2026-08-02 auto-update design spec.
- If a release is ever published with the wrong files, or needs to be
  pulled, delete it entirely from GitHub rather than editing it in place —
  electron-updater caches metadata by tag, so an edited-in-place release can
  behave unpredictably.
