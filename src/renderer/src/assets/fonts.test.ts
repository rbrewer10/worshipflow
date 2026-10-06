import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// QA B14: two "fonts" were saved GitHub web pages (<!DOCTYPE html>), so the
// classic and elegant themes silently fell back to Georgia. Every bundled
// font file must start with a real sfnt / WOFF signature.
const DIR = join(__dirname, 'fonts')
const SIGNATURES: Record<string, string> = {
  '00010000': 'TrueType',
  '4f54544f': 'OpenType (OTTO)',
  '74727565': 'TrueType (true)',
  '774f4646': 'WOFF',
  '774f4632': 'WOFF2'
}

describe('bundled fonts (QA B14)', () => {
  const files = readdirSync(DIR).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f))
  it('there are bundled fonts to check', () => expect(files.length).toBeGreaterThan(0))
  for (const f of files) {
    it(`${f} is a real font file`, () => {
      const head = readFileSync(join(DIR, f)).subarray(0, 4).toString('hex')
      expect(SIGNATURES[head], `${f} starts with 0x${head}`).toBeDefined()
    })
  }
  it('every @font-face in main.css points at a bundled file', () => {
    const css = readFileSync(join(__dirname, 'main.css'), 'utf8')
    const urls = [...css.matchAll(/url\('\.\/fonts\/([^']+)'\)/g)].map((m) => m[1])
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) expect(files).toContain(u)
  })
})
