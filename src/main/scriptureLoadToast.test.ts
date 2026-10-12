import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// index.ts imports Electron, so (like loadGenerationGuards.test.ts) this
// asserts against its source. QA B4-N1: a reference that didn't resolve went
// live as nothing with no message — Go Live just did nothing.
describe('doLoadScripture tells the operator when a reference does not resolve (QA B4-N1)', () => {
  const source = readFileSync(join(__dirname, 'index.ts'), 'utf8')
  const start = source.indexOf('async function doLoadScripture(')
  const end = source.indexOf('\nasync function ', start + 10)
  const fn = source.slice(start, end > start ? end : start + 6000)

  it('nothing resolved: a warning toast naming the reference, before returning false', () => {
    expect(start).toBeGreaterThan(-1)
    const nothing = fn.slice(fn.indexOf('if (!lines.length)'))
    expect(nothing.slice(0, 600)).toMatch(/notifyOperator\(`Couldn't find “\$\{reference\}”[^`]*`, 'warn'\)/)
    expect(nothing.indexOf('notifyOperator')).toBeLessThan(nothing.indexOf('return false'))
  })
  it('only for the current load, not a superseded one', () => {
    const nothing = fn.slice(fn.indexOf('if (!lines.length)'))
    expect(nothing.slice(0, 600)).toMatch(/loadGeneration === generation\)\s*\{\s*(\/\/[^\n]*\n\s*)*notifyOperator/)
  })
  it('some passages resolved: the skipped ones are named', () => {
    expect(fn).toMatch(/missed\.push\(ref\)/)
    expect(fn).toMatch(/if \(missed\.length\) \{\s*notifyOperator\(`Skipped/)
  })
  it('multi-chapter readings number their lines by chapter', () => {
    expect(fn).toMatch(/lines\.push\(\.\.\.verseLines\(result\.verses\)\)/)
  })
})
