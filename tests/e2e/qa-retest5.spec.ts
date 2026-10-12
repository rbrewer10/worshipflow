import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl, goLive, pressKey, openServedPage } from './qaHelpers'

// Regression specs for the QA retest5 lane B findings (retest5-b.md), all
// confirmed failing on candidate 757e53a:
//  B5-N1 — in an announcement block the projector, Volunteer mode and the stage
//          kept the FIRST announcement's title over every later body.
//  B5-N4 — Paste setlist: 'Mark 4:35—41' imported as 'Mark 4:35' (one verse
//          live, silently); 'Psalm 23-24' / 'Psalms 23–24' became song placeholders.
//  B5-N3 — 'John 3:99' passed Review & publish, then toasted at Go Live.
//  B5-N5 — deck scripture slides carried no verse numbers after slide 1 and
//          nothing marked a chapter change.

const wfCall = <T = any>(op: Page, fn: string, ...args: unknown[]): Promise<T> =>
  op.evaluate(([f, a]) => (window as any).wf[f as string](...(a as unknown[])), [fn, args] as const)

async function reloadOperator(op: Page): Promise<void> {
  await op.reload()
  await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
}

/** Space through the live item, collecting each slide's text once its deck text has landed. */
async function stepThrough(app: ElectronApplication, op: Page, id: number, max = 40): Promise<string[]> {
  const lines: string[] = [(await liveState(op)).line]
  for (let i = 0; i < max; i++) {
    await pressKey(app, op, 'Space')
    const s = await liveState(op)
    if (s.liveServiceItemId !== id) break
    lines.push(s.line)
  }
  return lines
}

test('B5-N1: every announcement in a block shows its OWN title — output, stage monitor, Volunteer, and the NEXT previews', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const ids = await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Block titles', '2026-10-11')
      await wf.setActiveService(sid)
      const s1 = await wf.songCreate({ title: 'Opening Song', sections: [{ kind: 'verse', ordinal: 1, label: 'V1', lyrics: 'Opening line' }] })
      const ann = { display: 'slide', frequency: 'once', startDate: null, endDate: null, active: true }
      const a1 = await wf.announcementCreate({ ...ann, title: 'Potluck Sunday', body: 'Bring a dish' })
      const a2 = await wf.announcementCreate({ ...ann, title: 'Choir Practice', body: 'Wednesday 7 PM' })
      const a3 = await wf.announcementCreate({ ...ann, title: 'Youth Lock-in', body: 'Friday night' })
      await wf.serviceAddItem(sid, { type: 'song', ref_id: s1 })
      const block = await wf.serviceAddItem(sid, { type: 'announcement', ref_id: null, title: 'Announcements', payload: { refIds: [a1, a2, a3] } })
      const svc = await wf.serviceGet(sid)
      return { block, title: svc.items.find((i: any) => i.id === block).title as string }
    })
    await reloadOperator(op)
    const out = await outputWindow(app)
    await goToLiveControl(op)
    await goLive(op, ids.title)
    const stage = await openServedPage(app, op, '/zone/4')
    const zone = (id: string): Promise<string> => stage.evaluate((i) => document.getElementById(i)?.textContent ?? '', id)

    const steps: Array<[string, string, RegExp]> = [
      ['Potluck Sunday', 'Bring a dish', /Choir Practice — Wednesday 7 PM/],
      ['Choir Practice', 'Wednesday 7 PM', /Youth Lock-in — Friday night/],
      ['Youth Lock-in', 'Friday night', /^(?!.*(Potluck|Choir))/],
    ]
    for (let k = 0; k < steps.length; k++) {
      const [title, body, next] = steps[k]
      if (k > 0) await pressKey(app, op, 'Space')
      await expect.poll(async () => (await liveState(op)).index).toBe(k)
      const s = await liveState(op)
      expect(s.liveServiceItemId).toBe(ids.block)
      expect(s.songTitle, `slide ${k + 1}: the broadcast title`).toBe(title)
      // Projector: the slide's own title over its own body, never another's.
      await expect.poll(() => visibleText(out), { message: `slide ${k + 1} output` }).toMatch(new RegExp(`${title}[\\s\\S]*${body}`))
      for (const [other] of steps.filter((_, j) => j !== k)) expect(await visibleText(out), `slide ${k + 1} output shows "${other}"`).not.toContain(other)
      // Stage monitor (zone 4): title bar and NEXT.
      await expect.poll(() => zone('songtitle'), { message: `slide ${k + 1} stage title` }).toBe(title)
      await expect.poll(() => zone('current')).toContain(body)
      if (k < 2) await expect.poll(() => zone('nextline'), { message: `slide ${k + 1} stage NEXT` }).toMatch(next)
    }

    // Volunteer mode on slide 2: its own title, and the next announcement named.
    await pressKey(app, op, 'ArrowLeft')
    await expect.poll(async () => (await liveState(op)).index).toBe(1)
    await op.getByRole('button', { name: 'Volunteer mode' }).first().click()
    const vol = async (): Promise<string> => (await op.locator('body').innerText()).replace(/\s+/g, ' ')
    await expect.poll(vol).toMatch(/Slide 2 of 3 · Choir Practice/)
    expect(await vol()).toMatch(/Next: Youth Lock-in — Friday night/)
    expect(await vol()).not.toMatch(/Slide 2 of 3 · Potluck Sunday/)
  } finally { await closeApp(app, userDataDir) }
})

test('B5-N5: deck scripture numbers every verse on output and stage, and marks the chapter change', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const ids = await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Verse numbers', '2026-10-11')
      await wf.setActiveService(sid)
      await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Start', body: 'Start slide' } })
      const cross = await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference: 'John 3:35-4:3' } })
      await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'End', body: 'End slide' } })
      const svc = await wf.serviceGet(sid)
      return { cross, title: svc.items.find((i: any) => i.id === cross).title as string }
    })
    await reloadOperator(op)
    const out = await outputWindow(app)
    await goToLiveControl(op)
    await goLive(op, ids.title)
    const stage = await openServedPage(app, op, '/zone/4')
    // The deck lands a moment after Go Live; wait for its first slide.
    await expect.poll(async () => (await liveState(op)).line, { timeout: 10_000 }).toMatch(/^3:35 The Father loveth the Son/)
    await expect.poll(() => visibleText(out)).toMatch(/3:35 The Father loveth/)
    await expect.poll(() => stage.evaluate(() => document.getElementById('current')?.textContent ?? '')).toMatch(/3:35 The Father loveth/)
    const lines = await stepThrough(app, op, ids.cross)
    const all = lines.join('\n')
    // Every verse is numbered, on every slide — not just the first.
    for (const n of ['3:35 ', '36 ', '4:1 ', '2 ', '3 ']) expect(all, `verse "${n.trim()}" unnumbered`).toContain(n)
    for (const line of lines) expect(line, 'a slide starts without its chapter:verse').toMatch(/^\d+:\d+ \S/)
    // The chapter change is marked where it happens.
    expect(all).toMatch(/4:1 When therefore the Lord knew/)
  } finally { await closeApp(app, userDataDir) }
})

test('B5-N4: Paste setlist imports em-dash and chapter-range readings whole, and they go live whole', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const sid = await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Pasted readings', '2026-10-11')
      await wf.setActiveService(sid)
      return sid
    })
    await reloadOperator(op)
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).click()
    await op.getByRole('button', { name: 'Show import options' }).click()
    await op.getByRole('button', { name: /Paste setlist/ }).click()
    const READINGS = ['Mark 4:35\u201441', 'Psalm 23-24', 'Psalm 23\u201324', 'Psalms 23-24', 'John 3:35\u20144:3']
    await op.locator('textarea[placeholder^="1. Amazing Grace"]').fill(READINGS.join('\n'))
    await expect(op.getByTestId('setlist-preview')).toBeVisible()
    // Each reading previews as Scripture with its whole range (757e53a: "Mark 4:35", and "Song" rows).
    for (const r of READINGS) await expect(op.getByTestId('setlist-preview')).toContainText(`Scripture${r}`)
    await op.getByRole('button', { name: 'Add to this service' }).click()
    await expect.poll(async () => (await wfCall<any>(op, 'serviceGet', sid)).items.length, { timeout: 10_000 }).toBe(READINGS.length)
    const items = (await wfCall<any>(op, 'serviceGet', sid)).items
    expect(items.map((i: any) => [i.type, i.payload.reference ?? i.payload.label])).toEqual(READINGS.map((r) => ['scripture', r]))

    // Mark 4:35—41 goes live as all seven verses, through 41.
    await goToLiveControl(op)
    const mark = items[0]
    await goLive(op, mark.title)
    await expect.poll(async () => (await liveState(op)).total, { timeout: 10_000 }).toBeGreaterThan(1)
    const lines: string[] = [(await liveState(op)).line]
    for (let i = 0; i < 20; i++) {
      await pressKey(app, op, 'Space')
      const s = await liveState(op)
      if (s.liveServiceItemId !== mark.id) break
      lines.push(s.line)
    }
    const text = lines.join('\n')
    expect(text).toMatch(/And the same day, when the even was come/)
    expect(text, 'verse 41 missing: the import cut the range to one verse').toMatch(/What manner of man is this, that even the wind and the sea obey him\?/)
  } finally { await closeApp(app, userDataDir) }
})

test('B5-N3: a verse past the end of its chapter is blocking in Review & publish', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Verse bounds', '2026-10-11')
      await wf.setActiveService(sid)
      const song = await wf.songCreate({ title: 'Opening Song', sections: [{ kind: 'verse', ordinal: 1, label: 'V1', lyrics: 'Opening line' }] })
      await wf.serviceAddItem(sid, { type: 'song', ref_id: song })
      await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference: 'John 3:99' } })
    })
    await reloadOperator(op)
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).first().click()
    const review = op.getByRole('button', { name: /^Review (plan|& publish)/ }).first()
    await review.waitFor()
    await review.click()
    await expect.poll(async () => (await op.locator('body').innerText()).replace(/\s+/g, ' '), { timeout: 5000 }).toMatch(/[1-9]\d* blocking/)
    const body = (await op.locator('body').innerText()).replace(/\s+/g, ' ')
    expect(body).toMatch(/Fix the reference “John 3:99”/)
    expect(body).toMatch(/John 3 has no verse 99\./)
  } finally { await closeApp(app, userDataDir) }
})
