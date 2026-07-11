import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

// Persistent rolling diagnostics log — a developer/operator can retrieve a record
// of errors after a live Sunday service (console output is invisible during a
// live service). One file per calendar day, no rotation beyond that. Additive
// only: every logger call also still calls the matching console method, so dev
// console behavior is unchanged.

function todayFileName(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `worshipflow-${y}-${m}-${d}.log`
}

// call app.getPath('userData') lazily (inside functions, not at module load time)
// in case logger.ts is imported before app is ready — matches recovery.ts/index.ts convention.
export function getLogsDir(): string {
  const dir = join(app.getPath('userData'), 'logs')
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  } catch {
    // Never let a logging failure crash the app.
  }
  return dir
}

function writeLine(level: string, msg: string): void {
  try {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
    appendFileSync(join(getLogsDir(), todayFileName()), line, 'utf-8')
  } catch {
    // A logging failure must never crash the app or throw uncaught.
  }
}

export function logInfo(msg: string): void {
  console.log(msg)
  writeLine('INFO', msg)
}

export function logWarn(msg: string): void {
  console.warn(msg)
  writeLine('WARN', msg)
}

export function logError(msg: string, err?: unknown): void {
  console.error(msg, err)
  const suffix = err !== undefined ? ` — ${err instanceof Error ? (err.stack ?? err.message) : String(err)}` : ''
  writeLine('ERROR', `${msg}${suffix}`)
}

// Reads today's log file and returns the last n lines (empty array if none yet).
export function getRecentLogLines(n: number): string[] {
  try {
    const filePath = join(getLogsDir(), todayFileName())
    if (!existsSync(filePath)) return []
    const contents = readFileSync(filePath, 'utf-8')
    const lines = contents.split('\n').filter((l) => l.length > 0)
    return lines.slice(-n)
  } catch {
    return []
  }
}
