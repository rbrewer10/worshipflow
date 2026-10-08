import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { shouldClearHiddenText, modeAfterAsyncLoad, textHideApplies, textHideBlocker, textHideNotice } from './layerReset'

describe('shouldClearHiddenText (QA B2 / A-N4)', () => {
  it('C pressed before Go Live is cleared by the new item (B2)', () => {
    // C at generation 4; Go Live starts load 5.
    expect(shouldClearHiddenText(4, 5)).toBe(true)
  })
  it('C pressed while a slow scripture lookup is in flight stays hidden when the verse lands (A-N4)', () => {
    // Load 5 started (generation already 5), then C → recorded at 5.
    expect(shouldClearHiddenText(5, 5)).toBe(false)
  })
  it('a C from long ago never blocks clearing', () => expect(shouldClearHiddenText(-1, 1)).toBe(true))
})

describe('wiring (source guard)', () => {
  const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8')
  it('setLayers records when C was pressed', () => {
    expect(main).toMatch(/textHiddenAtGeneration = tracks\[track\]\.loadGeneration/)
  })
  it('the async loaders pass the generation their load started at', () => {
    const scripture = main.slice(main.indexOf('async function doLoadScripture'), main.indexOf('async function doLoadScripture') + 4000)
    expect(scripture).toMatch(/resetPerItemLayers\(track, generation\)/)
  })
})

describe('modeAfterAsyncLoad (QA A2-N2)', () => {
  it('Black pressed while the verse is loading stays black when it lands', () => {
    // load 5 started, then B → recorded at 5
    expect(modeAfterAsyncLoad('black', 5, 5)).toBe('black')
  })
  it('Logo pressed while the verse is loading stays on the logo', () => {
    expect(modeAfterAsyncLoad('logo', 5, 5)).toBe('logo')
  })
  it('Black pressed BEFORE Go Live is cleared by the new item (unchanged behaviour)', () => {
    expect(modeAfterAsyncLoad('black', 4, 5)).toBe('lyrics')
  })
  it('B then L(yrics) during the load shows the verse', () => {
    expect(modeAfterAsyncLoad('lyrics', 5, 5)).toBe('lyrics')
  })
  it('a countdown or other mode is replaced by lyrics', () => {
    expect(modeAfterAsyncLoad('countdown', 9, 5)).toBe('lyrics')
  })
})

// Ryan's decision #4 (Oct 2026): keep today's behaviour — Black (or Logo)
// pressed during the 1.5 s tap-to-cancel Go Live wait does NOT cancel the
// armed Go Live. The screen blacks at once; when the wait ends the armed item
// goes live and takes the screen out of Black. (Church Tech open decision #6;
// retest3-b spec 36, retest7 66-B, retest8 68e.)
describe("Black during the 1.5 s Go Live wait (Ryan's decision #4: keep)", () => {
  it('the armed item fires after Black and its load clears Black/Logo (load generation is newer than the press)', () => {
    // B at generation 7 during the wait; the arm fires → load 8.
    expect(modeAfterAsyncLoad('black', 7, 8)).toBe('lyrics')
    expect(modeAfterAsyncLoad('logo', 7, 8)).toBe('lyrics')
  })
  it('the tap-to-cancel arm is only cancelled by a second tap, a newer arm or leaving the view — never by Black/Logo', () => {
    const rd = (f: string): string => readFileSync(join(__dirname, '..', 'renderer', 'src', f), 'utf8').replace(/\r\n/g, '\n')
    const hook = rd('liveActions.ts')
    const fn = hook.slice(hook.indexOf('export function usePendingConfirm('), hook.indexOf('\n}\n', hook.indexOf('export function usePendingConfirm(')))
    expect(fn).not.toMatch(/black|logo|onState/i)
    for (const f of ['ServiceRail.tsx', 'SlideGrid.tsx']) {
      const src = rd(f)
      expect(src).toContain('usePendingConfirm()')
      // cancel() is called from the unmount cleanup only.
      const calls = src.match(/\bcancel\(\)/g) ?? []
      expect(calls, f).toHaveLength(1)
      expect(src, f).toMatch(/return \(\) => \{ off\(\); cancel\(\) \}/)
    }
  })
})

describe('A2-N2 wiring (source guard)', () => {
  const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8')
  it('Black and Logo record the generation they were pressed at', () => {
    expect(main).toMatch(/type === 'black'\) \{[^}]*blankedAtGeneration = t\.loadGeneration/)
    expect(main).toMatch(/type === 'logo'\) \{[^}]*blankedAtGeneration = t\.loadGeneration/)
  })
  it('the async loaders no longer force lyrics mode', () => {
    for (const fn of ['async function doLoadScripture', 'async function doLoadSong']) {
      const body = main.slice(main.indexOf(fn), main.indexOf(fn) + 4500)
      expect(body).toMatch(/t\.mode = modeAfterAsyncLoad\(t\.mode, t\.blankedAtGeneration, generation\)/)
      expect(body.slice(0, body.indexOf('modeAfterAsyncLoad'))).not.toMatch(/t\.mode = 'lyrics'/)
    }
  })
})

describe('textHideApplies (QA B2-N11)', () => {
  it('C is ignored on a countdown or picture, applies to lyrics / text / scripture', () => {
    expect(textHideApplies('countdown')).toBe(false)
    expect(textHideApplies('image')).toBe(false)
    expect(textHideApplies('lyrics')).toBe(true)
    expect(textHideApplies('black')).toBe(true) // pre-arming C while blanked still works
  })
  it('QA B3-N5: decided by the live item too — pictures (mode lyrics), the sermon card (mode logo) and announcements', () => {
    expect(textHideApplies('lyrics', 'image')).toBe(false)
    expect(textHideApplies('logo', 'sermon')).toBe(false)
    expect(textHideApplies('announcement', 'announcement')).toBe(false)
    expect(textHideApplies('lyrics', 'announcement')).toBe(false) // ticker-style announcement
    expect(textHideApplies('livecall', 'livecall')).toBe(false)
    expect(textHideApplies('lyrics', 'song')).toBe(true)
    expect(textHideApplies('lyrics', 'scripture')).toBe(true)
    expect(textHideApplies('lyrics', 'text')).toBe(true)
    expect(textHideApplies('black', 'song')).toBe(true)
    expect(textHideApplies('lyrics', null)).toBe(true) // ad-hoc Quick Text
  })
  it('each refusal says why', () => {
    expect(textHideNotice(textHideBlocker('logo', 'sermon')!)).toMatch(/sermon card/)
    expect(textHideNotice(textHideBlocker('lyrics', 'image')!)).toMatch(/picture/)
    expect(textHideNotice(textHideBlocker('announcement', 'announcement')!)).toMatch(/announcement/)
  })
  it('setLayers checks it (with the live item type) before hiding text', () => {
    const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8')
    expect(main).toMatch(/flags\?\.textHidden === true \? textHideBlocker\(tracks\[track\]\.mode, liveType\) : null/)
  })
})
