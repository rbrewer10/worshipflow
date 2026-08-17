// Automates the release process documented in docs/RELEASING.md — the
// project deferred this deliberately ("hasn't been run enough times yet to
// be worth scripting"), but by the time it mattered nobody remembered to run
// the manual steps and the auto-update channel went silently stale for two
// weeks. This scripts everything except the one genuinely human judgment
// call (what the next version number should be).
//
// Usage:
//   node scripts/release.mjs 0.13.0            # bump, build, tag, publish
//   node scripts/release.mjs 0.13.0 --dry-run  # do everything except
//                                               # push/tag/publish, so the
//                                               # script itself can be
//                                               # tested safely
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const [, , versionArg, ...rest] = process.argv
const dryRun = rest.includes('--dry-run')

// On Windows, npm is a .cmd batch wrapper, not a directly executable binary —
// execFileSync can't spawn a .cmd file at all without shell:true (git/gh ship
// as real .exe files and don't need this). With shell:true, Node handles
// argument escaping for the array form itself, so this is still safe against
// spaces/quotes in args (e.g. a version string) without manual quoting here.
function needsShell(cmd) {
  return process.platform === 'win32' && cmd === 'npm'
}

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  return execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: needsShell(cmd), ...opts })
}

function runCapture(cmd, args) {
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', shell: needsShell(cmd) }).trim()
}

function fail(msg) {
  console.error(`\nrelease aborted: ${msg}`)
  process.exit(1)
}

if (!versionArg || !/^\d+\.\d+\.\d+$/.test(versionArg)) {
  fail(`expected a semver version like 0.13.0, got: ${versionArg ?? '(none)'}`)
}
const version = versionArg
const tag = `v${version}`

// A dirty tree here means either uncommitted work that shouldn't be swept
// into the version-bump commit, or a previous failed release run — either
// way this needs a human to look, not a script to guess.
const dirty = runCapture('git', ['status', '--porcelain'])
if (dirty) fail(`working tree isn't clean:\n${dirty}\nCommit, stash, or discard first.`)

const existingTags = runCapture('git', ['tag'])
if (existingTags.split('\n').includes(tag)) fail(`tag ${tag} already exists`)

const branch = runCapture('git', ['branch', '--show-current'])
console.log(`Releasing ${version} from branch ${branch}${dryRun ? ' (dry run)' : ''}`)

// 1. Bump package.json + package-lock.json together — hand-editing just
// package.json is exactly how this project's version history ended up with
// package.json and package-lock.json out of sync in the past.
run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'])

// 2. Commit the bump. This is the step the audit found had been skipped for
// versions 0.12.7/0.12.8 — no commit, no trace of what was actually built.
run('git', ['add', 'package.json', 'package-lock.json'])
run('git', ['commit', '-m', `chore: bump version to ${version}`])

if (dryRun) {
  console.log('\n--dry-run: stopping before build/tag/push/publish. Undo the version-bump commit with:')
  console.log(`  git reset --hard HEAD~1`)
  process.exit(0)
}

run('git', ['push'])

// 3. Build the installer. electron-builder writes into dist-installer/.
run('npm', ['run', 'dist'])

const distDir = join(root, 'dist-installer')
const expected = [
  `WorshipFlow-Pro-Setup-${version}.exe`,
  `WorshipFlow-Pro-Setup-${version}.exe.blockmap`,
  'latest.yml'
]
const missing = expected.filter((f) => !existsSync(join(distDir, f)))
if (missing.length > 0) {
  fail(`npm run dist didn't produce the expected files: ${missing.join(', ')}\n` +
    `(check the filename convention hasn't changed — see docs/RELEASING.md's note ` +
    `about spaces vs. hyphens breaking electron-updater's lookup)`)
}

const latestYml = readFileSync(join(distDir, 'latest.yml'), 'utf8')
console.log(`\nBuilt installer for ${version}. latest.yml:\n${latestYml}`)

// 4. Tag the commit that was actually built, and push the tag — a release
// with no corresponding tag can't be traced back to a commit later.
run('git', ['tag', tag])
run('git', ['push', 'origin', tag])

// 5. Publish. --generate-notes pulls the commit log since the previous tag,
// which is a real improvement over the hand-written notes this always used
// to skip — release notes are also something that reliably gets forgotten
// under manual process.
run('gh', [
  'release', 'create', tag,
  join(distDir, expected[0]),
  join(distDir, expected[1]),
  join(distDir, expected[2]),
  '--title', version,
  '--generate-notes'
])

console.log(`\nPublished ${tag}. Verify: an already-installed older version should silently ` +
  `download this in the background and show "Restart to update" within a few minutes.`)
