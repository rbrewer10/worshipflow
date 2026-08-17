# Releasing a new version

WorshipFlow Pro checks GitHub for a newer release once at startup (see
`src/main/autoUpdate.ts`) and offers a one-click restart-to-update once it's
downloaded one. For that to have anything to find, a real GitHub Release
has to exist with the right files attached.

This was a fully manual process for a while — deliberately, since it hadn't
been run enough times yet to be worth scripting — but that turned out to be
exactly why it lapsed: the auto-update channel went silently stale for two
weeks (v0.12.5 stayed "latest" while six more versions were built locally
and never published) because nobody remembered to run the manual steps.
`scripts/release.mjs` (via `npm run release`) now automates everything
except the one genuinely human judgment call.

## Steps

1. **Decide the version number** — a patch bump for a bug fix, a minor
   bump for a new feature, whatever fits (e.g. `0.12.9` → `0.13.0`). This is
   the only step that stays manual.

2. **Run the release script:**
   ```bash
   npm run release -- 0.13.0
   ```
   This bumps `package.json`/`package-lock.json` together (via
   `npm version`, so they can't drift out of sync the way a hand-edited
   `package.json` alone did in the past), commits and pushes that bump,
   runs `npm run dist`, tags the commit `v0.13.0`, pushes the tag, and
   publishes a GitHub Release with the installer, its `.blockmap`, and
   `latest.yml` attached — with auto-generated release notes from the
   commit log since the last tag.

   Add `--dry-run` to do everything up through the version-bump commit
   (useful for checking the script itself still works) without pushing,
   building, tagging, or publishing anything:
   ```bash
   npm run release -- 0.13.0 --dry-run
   ```

3. **Verify:** an already-installed older version, next time it's opened,
   should silently download this release in the background and show
   "Restart to update" in the top bar within a few minutes.

## Notes

`npm run dist` produces, in `dist-installer/`:
- `WorshipFlow-Pro-Setup-X.Y.Z.exe` — the installer itself.
- `WorshipFlow-Pro-Setup-X.Y.Z.exe.blockmap` — used by electron-updater for
  efficient differential downloads.
- `latest.yml` — the manifest electron-updater reads to know the latest
  version number and the installer's checksum.

The filename is deliberately hyphenated, not "WorshipFlow Pro Setup X.Y.Z.exe"
— a space-containing name broke auto-update the first time this was tried
(GitHub's upload UI turns spaces into dots, while electron-builder's own
`latest.yml` turns them into hyphens, so the file electron-updater looks for
never matched what was actually hosted). `release.mjs` uploads the files
electron-builder actually produced, so this can't drift — but if you ever
attach files by hand instead, don't rename them first.

- The repo is public specifically so this works with no access token
  embedded in the shipped app — see the 2026-08-02 auto-update design spec.
- If a release is ever published with the wrong files, or needs to be
  pulled, delete it entirely from GitHub rather than editing it in place —
  electron-updater caches metadata by tag, so an edited-in-place release can
  behave unpredictably.
