import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun } from './electronApp'
import { liveState, goToLiveControl, goLive, openServedPage } from './qaHelpers'

// Regression specs for the QA retest9 findings (retest9.md), confirmed failing
// on 8be25a7:
//  B9-N5 — Play slide N on a reading whose slides combine verses landed one
//          slide early (repro b-extra/retest9/specs9/74-goliveat).
//  B9-N6 — on a slow network a stale Go live landed during a newer armed click.
//  B9-N7 — Space during a pending lookup moved the item still on screen.
//  B9-N8 — text dissolved over an incoming image for ~0.4 s (specs9/75).
//  B9-N9 — zone 1 showed the numbered verse before the reference card.
//  B9-N1..N4 — Paste setlist: qualifier+role labels, hymnal-number tails,
//          colon credits, no library rescue of date / 'Role: name' lines.

function shownText(p: Page): Promise<string> {
  return p.evaluate(() => {
    const seen = (el: Element | null): boolean => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return false
      }
      return true
    }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const out: string[] = []
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.textContent ?? '').trim()
      if (t && seen(n.parentElement)) out.push(t)
    }
    return out.join(' ').replace(/\d{1,2}:\d{2}(:\d{2})?\s?[AP]M/g, '').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
  }).catch(() => '?')
}

// An online translation answered by a fake bible-api.com (main-process
// fetch) that holds every answer until the test releases it — a slow network,
// deterministic and offline. Lookups already in flight (the Live Control
// previews start some) are shared by the Go live, so they are held too.
async function holdBible(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const g = globalThis as any
    g.__qaHeld = []
    g.__qaRelease = (): void => { const held = g.__qaHeld; g.__qaHeld = null; for (const r of held ?? []) r() }
    if (g.__qaBibleOrig) return
    g.__qaBibleOrig = g.fetch
    g.fetch = (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input)
      if (!/bible-api\.com/.test(url)) return g.__qaBibleOrig(input, init)
      const q = decodeURIComponent(new URL(url).pathname.slice(1))
      const m = /^(.+?) (\d+):(\d+)(?:-(\d+))?$/.exec(q)
      const verses: any[] = []
      if (m) for (let v = +m[3]; v <= +(m[4] ?? m[3]); v++) verses.push({ book_name: m[1], chapter: +m[2], verse: v, text: `Online wording of ${m[2]}:${v}, long enough that the deck gives this verse a slide of its own when it goes live.\n` })
      const answer = (): Response => new Response(JSON.stringify({ reference: q, verses, translation_id: 'web' }), { status: 200, headers: { 'content-type': 'application/json' } })
      if (!g.__qaHeld) return Promise.resolve(answer())
      return new Promise((res) => g.__qaHeld.push(() => res(answer())))
    }
  })
}
const releaseBible = (app: ElectronApplication): Promise<void> => app.evaluate(() => { (globalThis as any).__qaRelease() })

async function focusOperator(app: ElectronApplication, op: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !/#\/(output|stage)|\/zone\/|\/obs/.test(x.webContents.getURL()))
    w?.focus(); w?.webContents.focus()
  })
  await op.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

async function setup(op: Page, name: string, add: Array<Record<string, unknown>>, songs: string[] = []): Promise<number[]> {
  return op.evaluate(async ({ name, add, songs }) => {
    const wf = (window as any).wf
    const songIds: number[] = []
    for (const t of songs) {
      songIds.push(await wf.songCreate({ title: t, sections: [1, 2, 3].map((n) => ({ kind: 'verse', ordinal: n, label: `Verse ${n}`, lyrics: `${t} verse ${n}` })) }))
    }
    const sid = await wf.serviceCreate(name, '2026-10-11')
    await wf.setActiveService(sid)
    const ids: number[] = []
    for (const it of add) ids.push(await wf.serviceAddItem(sid, it.type === 'song' ? { type: 'song', ref_id: songIds[it.song as number] } : it))
    return ids
  }, { name, add, songs })
}

test('B9-N5: Play slide N on a reading lands on deck slide N, with no first-verse frame', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const [start, thess, john] = await setup(op, 'Play slide N', [
      { type: 'text', payload: { title: 'Start', body: 'Start slide' } },
      { type: 'scripture', payload: { reference: '1 Thessalonians 5:16-18' } },
      { type: 'scripture', payload: { reference: 'John 11:33-37' } },
    ])
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    const out = await outputWindow(app)
    const slides: Record<number, string[]> = await op.evaluate(async () => {
      const wf = (window as any).wf
      const rows = await wf.serviceSlides(await wf.getActiveServiceId())
      return Object.fromEntries(rows.map((r: any) => [r.id, r.slides]))
    })
    // QA's grids: 1 Thess = [5:16-17, 5:18]; John = [11:33, 11:34-35, 11:36, 11:37].
    expect(slides[thess].length).toBe(2)
    expect(slides[john].length).toBe(4)
    for (const [id, idx, want, first] of [[thess, 1, /^5:18 /, /^5:16 /], [john, 3, /^11:37 /, /^11:33 /], [john, 2, /^11:36 /, /^11:33 /], [john, 1, /^11:34 /, /^11:33 /]] as const) {
      await op.evaluate((s) => (window as any).wf.liveGoLiveAt('main', s, 0), start)
      await op.waitForTimeout(1200)
      const frames: string[] = []
      const t0 = Date.now()
      const go = op.evaluate(({ id, idx }) => (window as any).wf.liveGoLiveAt('main', id, idx), { id, idx })
      while (Date.now() - t0 < 1500) { frames.push(await shownText(out)); await op.waitForTimeout(15) }
      await go
      const s = await liveState(op)
      expect(s.liveServiceItemId).toBe(id)
      expect(s.index, `Play slide ${idx + 1}`).toBe(idx)
      expect(String(s.line)).toMatch(want)
      expect(frames.filter((f) => first.test(f)), 'first-verse frames before the clicked slide').toEqual([])
    }
  } finally {
    await closeApp(app, userDataDir)
  }
})

test('B9-N6: a reading still being looked up does not land during a newer armed Go live', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const [, mark, john] = await setup(op, 'Armed Go live', [
      { type: 'text', payload: { title: 'Start', body: 'Start slide' } },
      { type: 'scripture', payload: { reference: 'Mark 4:35-41' } },
      { type: 'scripture', payload: { reference: 'John 3:16-18' } },
    ])
    await op.evaluate(() => (window as any).wf.featuresSetBibleTranslation('web'))
    await holdBible(app)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await goToLiveControl(op)
    await goLive(op, 'Start')
    const titles: Record<number, string> = await op.evaluate(async () => {
      const wf = (window as any).wf
      const svc = await wf.serviceGet(await wf.getActiveServiceId())
      return Object.fromEntries(svc.items.map((i: any) => [i.id, i.title]))
    })
    // Mark fires after its 1.5 s arm and waits on the network. John is armed at
    // +2.5 s; the network answers at +3 s — inside John's arm window.
    const t0 = Date.now()
    await op.getByRole('button', { name: `Go live: ${titles[mark]}`, exact: true }).first().click()
    const seen: string[] = []
    let clickedJohn = false
    let released = false
    while (Date.now() - t0 < 9000) {
      if (!clickedJohn && Date.now() - t0 >= 2500) {
        await op.getByRole('button', { name: `Go live: ${titles[john]}`, exact: true }).first().click()
        clickedJohn = true
      }
      if (!released && Date.now() - t0 >= 3000) { await releaseBible(app); released = true }
      const s = await liveState(op)
      seen.push(`+${Date.now() - t0} ${s.liveServiceItemId} ${s.songTitle}`)
      if (s.liveServiceItemId === john) break
      await op.waitForTimeout(50)
    }
    const s = await liveState(op)
    expect(s.liveServiceItemId, seen.join('\n')).toBe(john)
    expect(seen.filter((l) => / Mark /.test(l) || l.includes(` ${mark} `)), 'Mark went live after John was armed').toEqual([])
  } finally {
    await closeApp(app, userDataDir)
  }
})

test('B9-N7: Space during a pending lookup is kept for the reading, not the item on screen', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const [, mark] = await setup(op, 'Space while looking up', [
      { type: 'song', song: 0 },
      { type: 'scripture', payload: { reference: 'Mark 4:35-41' } },
    ], ['Alpha Hymn'])
    await op.evaluate(() => (window as any).wf.featuresSetBibleTranslation('web'))
    await holdBible(app)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await goToLiveControl(op)
    await goLive(op, 'Alpha Hymn')
    expect((await liveState(op)).index).toBe(0)
    const markTitle: string = await op.evaluate(async (id) => {
      const wf = (window as any).wf
      return (await wf.serviceGet(await wf.getActiveServiceId())).items.find((i: any) => i.id === id).title
    }, mark)
    await op.getByRole('button', { name: `Go live: ${markTitle}`, exact: true }).first().click()
    await op.waitForTimeout(2200)  // fired at 1.5 s; the lookup is held
    await focusOperator(app, op)
    await op.keyboard.press('Space')
    await op.waitForTimeout(150)
    await op.keyboard.press('Space')
    await op.waitForTimeout(300)
    const during = await liveState(op)
    expect(during.songTitle, 'still the hymn while Mark is looked up').toBe('Alpha Hymn')
    expect(during.index, 'the hymn did not move').toBe(0)
    await releaseBible(app)
    await expect.poll(async () => (await liveState(op)).liveServiceItemId, { timeout: 15_000 }).toBe(mark)
    await op.waitForTimeout(800)
    const after = await liveState(op)
    // Two verses in (one verse per slide here), as #30 carries a press made on the verse list.
    expect(after.index, 'two presses carried onto the reading').toBe(2)
    expect(String(after.line)).toMatch(/^4:37 /)
  } finally {
    await closeApp(app, userDataDir)
  }
})

test('B9-N8: text leaves at once when an image goes live', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const png = join(userDataDir, 'red.png')
    writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
    const [text, image] = await setup(op, 'Text to media', [
      { type: 'text', payload: { title: 'Welcome to Snow Hill', body: 'Welcome to Snow Hill' } },
      { type: 'image', payload: { path: png } },
    ])
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    const out = await outputWindow(app)
    for (let round = 0; round < 2; round++) {
      await op.evaluate((id) => (window as any).wf.liveGoLiveAt('main', id, 0), text)
      await expect.poll(() => shownText(out), { timeout: 10_000 }).toContain('Welcome to Snow Hill')
      await op.waitForTimeout(1200)
      // rAF-sample every text node on OUT (effective opacity) while the image goes live.
      const sampler = out.evaluate(() => new Promise<Array<{ t: number; vis: string }>>((res) => {
        const t0 = performance.now(); const tr: Array<{ t: number; vis: string }> = []
        const eff = (el: Element): number => { let o = 1; for (let e: Element | null = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity) } return o }
        const step = (): void => {
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const vis: string[] = []
          for (let n = w.nextNode(); n; n = w.nextNode()) { const t = (n.textContent ?? '').trim(); if (t && eff(n.parentElement!) > 0.05) vis.push(t) }
          tr.push({ t: Math.round(performance.now() - t0), vis: vis.join(' | ') })
          if (performance.now() - t0 < 1200) requestAnimationFrame(step); else res(tr)
        }
        requestAnimationFrame(step)
      }))
      await op.evaluate((id) => (window as any).wf.liveGoLiveAt('main', id, 0), image)
      const trace = await sampler
      const s = await liveState(op)
      expect(s.liveServiceItemId).toBe(image)
      const firstGone = trace.findIndex((f) => !f.vis.includes('Welcome to Snow Hill'))
      expect(firstGone, 'the words left OUT').toBeGreaterThan(-1)
      const lingering = trace.filter((f) => f.vis.includes('Welcome to Snow Hill') && f.t > trace[firstGone].t)
      expect(lingering, 'words came back while the image was going live').toEqual([])
      // d98401e cleared in the first frame; 8be25a7 dissolved for ~400 ms.
      expect(trace[firstGone].t, 'ms until the words were gone').toBeLessThan(150)
    }
  } finally {
    await closeApp(app, userDataDir)
  }
})

test('B9-N9: zone 1 goes straight to the reference card, never the verse', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const [start, mark] = await setup(op, 'Zone 1 card', [
      { type: 'text', payload: { title: 'Start', body: 'Start slide' } },
      { type: 'scripture', payload: { reference: 'Mark 4:35-41' } },
    ])
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    const z1 = await openServedPage(app, op, '/zone/1', { width: 960, height: 540 })
    for (let round = 0; round < 2; round++) {
      await op.evaluate((id) => (window as any).wf.liveGoLiveAt('main', id, 0), start)
      await op.waitForTimeout(1500)
      // What the operator's Go live does (sendItemLive): the verses, then the item
      // (its deck) — here with a slow renderer between the two.
      const go = op.evaluate(async (id) => {
        const wf = (window as any).wf
        if (!(await wf.liveLoadScripture('main', 'Mark 4:35-41', null, false, id))) return
        await new Promise((r) => setTimeout(r, 300))
        await wf.liveSetItemId('main', id)
      }, mark)
      const frames: string[] = []
      const t0 = Date.now()
      while (Date.now() - t0 < 2500) { frames.push(await shownText(z1)); await op.waitForTimeout(15) }
      await go
      expect(frames.filter((f) => /4:35 And the same day|35 And the same day/.test(f)), 'zone 1 verse frames').toEqual([])
      expect(frames[frames.length - 1]).toMatch(/Mark 4:35/)
      expect((await liveState(op)).liveServiceItemId).toBe(mark)
    }
  } finally {
    await closeApp(app, userDataDir)
  }
})

test('B9-N1..N4: paste setlist — role labels skip, hymnal numbers and colon credits link, dates are not rescued', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const library = ['Amazing Grace', 'Promise Keeper', 'Security', 'Easter Sunday']
    await op.evaluate(async (want) => {
      const wf = (window as any).wf
      const have = new Set(((await wf.songsList('')) as any[]).map((s) => String(s.title).toLowerCase()))
      for (const t of want) {
        if (!have.has(t.toLowerCase())) await wf.songCreate({ title: t, sections: [{ kind: 'verse', ordinal: 1, label: 'Verse 1', lyrics: `${t} line one` }] })
      }
      const id = await wf.serviceCreate('Bulletin paste 9', '2026-10-11')
      await wf.setActiveService(id)
    }, library)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).first().click()
    await op.getByLabel('Show import options').click()
    await op.getByRole('button', { name: /Paste setlist/ }).click()
    const serving = ['Choir Leader: Ida Ross', 'Sunday School Director: Al Fry', 'Door Keeper: Earl Dunn', 'Hostess: Mary Hill',
      'Volunteers: Ann & Bob', 'Pastor: Jo Park', 'Security: Officer Ed Hale', 'Easter Sunday \u2014 April 5, 2026']
    await op.getByPlaceholder(/Amazing Grace/).fill([
      'Prelude', ...serving.slice(0, 4), 'Amazing Grace No. 378', ...serving.slice(4), 'Promise Keeper: Danny Gokey', 'Benediction',
    ].join('\n'))
    const skipped = op.getByTestId('setlist-skipped')
    await expect(skipped).toContainText(`${serving.length} lines skipped`)
    await skipped.locator('summary').click()
    for (const line of serving) await expect(op.getByRole('list', { name: 'Skipped lines' })).toContainText(line)
    await op.getByRole('button', { name: /Add to this service|Create service/ }).click()
    await expect.poll(async () => op.evaluate(async () => {
      const wf = (window as any).wf
      return ((await wf.serviceGet(await wf.getActiveServiceId())).items as any[]).length
    }), { timeout: 10_000 }).toBeGreaterThan(0)
    // The import adds items one at a time and closes the dialog when the last is in;
    // reading the service before that raced the tail of the list (flaky on a repeat run).
    await expect(op.getByPlaceholder(/Amazing Grace/)).toBeHidden({ timeout: 20_000 })
    const items: Array<{ type: string; title: string | null }> = await op.evaluate(async () => {
      const wf = (window as any).wf
      const svc = await wf.serviceGet(await wf.getActiveServiceId())
      const songs = (await wf.songsList('')) as any[]
      return (svc.items as any[]).map((i) => ({ type: i.type, title: i.type === 'song' ? songs.find((s) => s.id === i.ref_id)?.title ?? null : i.title }))
    })
    // Both songs linked (no "Song: …" placeholders); nothing from the serving / date lines.
    expect(items.filter((i) => i.type === 'song').map((i) => i.title)).toEqual(['Amazing Grace', 'Promise Keeper'])
    expect(items.filter((i) => i.type === 'placeholder')).toEqual([])
  } finally {
    await closeApp(app, userDataDir)
  }
})
