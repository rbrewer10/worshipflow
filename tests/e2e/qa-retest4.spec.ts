import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl, goLive, pressKey } from './qaHelpers'

// Regression specs for the QA retest4 ship blockers (retest4-b.md):
//  B4-N2 — Space inside an announcement BLOCK skipped the rest of the block.
//  B4-N1 — en-dash ranges, chapter ranges, cross-chapter ranges and comma lists
//          failed lookup; Go Live did nothing, no toast, Review plan said Ready.

const wfCall = <T = any>(op: Page, fn: string, ...args: unknown[]): Promise<T> =>
  op.evaluate(([f, a]) => (window as any).wf[f as string](...(a as unknown[])), [fn, args] as const)

/** Items added through IPC don't reach an already-mounted rail — reload the operator UI, like reopening it. */
async function reloadOperator(op: Page): Promise<void> {
  await op.reload()
  await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
}

const toasts = (op: Page): Promise<string[]> =>
  op.locator('div.fixed.inset-x-0.top-3 > div, [role=status], [role=alert]').allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean))

/** Space through the live item, collecting each slide's text, until the next item goes live. */
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

test('B4-N2: Space walks through every announcement in an announcement block, then moves on', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const ids = await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Block Sunday', '2026-10-11')
      await wf.setActiveService(sid)
      const s1 = await wf.songCreate({ title: 'Opening Song', sections: [{ kind: 'verse', ordinal: 1, label: 'V1', lyrics: 'Opening line' }] })
      const s2 = await wf.songCreate({ title: 'Closing Song', sections: [{ kind: 'verse', ordinal: 1, label: 'V1', lyrics: 'Closing line' }] })
      const ann = { display: 'slide', frequency: 'once', startDate: null, endDate: null, active: true }
      const a1 = await wf.announcementCreate({ ...ann, title: 'Potluck Sunday', body: 'Bring a dish' })
      const a2 = await wf.announcementCreate({ ...ann, title: 'Choir Practice', body: 'Wednesday 7 PM' })
      const a3 = await wf.announcementCreate({ ...ann, title: 'Youth Lock-in', body: 'Friday night' })
      await wf.serviceAddItem(sid, { type: 'song', ref_id: s1 })
      const block = await wf.serviceAddItem(sid, { type: 'announcement', ref_id: null, title: 'Announcements', payload: { refIds: [a1, a2, a3] } })
      const closing = await wf.serviceAddItem(sid, { type: 'song', ref_id: s2 })
      const svc = await wf.serviceGet(sid)
      return { block, closing, title: svc.items.find((i: any) => i.id === block).title as string }
    })
    await reloadOperator(op)
    const out = await outputWindow(app)
    await goToLiveControl(op)
    await goLive(op, ids.title)
    let s = await liveState(op)
    expect(s.liveServiceItemId).toBe(ids.block)
    expect(s.mode).toBe('announcement')
    expect(s.total).toBe(3)
    expect(s.index).toBe(0)
    await expect.poll(() => visibleText(out)).toMatch(/Bring a dish/)

    await pressKey(app, op, 'Space')
    s = await liveState(op)
    expect(s.liveServiceItemId, 'QA B4-N2: Space jumped straight past the block').toBe(ids.block)
    expect(s.index).toBe(1)
    await expect.poll(() => visibleText(out)).toMatch(/Wednesday 7 PM/)

    await pressKey(app, op, 'Space')
    s = await liveState(op)
    expect(s.liveServiceItemId).toBe(ids.block)
    expect(s.index).toBe(2)
    await expect.poll(() => visibleText(out)).toMatch(/Friday night/)

    // Back steps inside the block too.
    await pressKey(app, op, 'ArrowLeft')
    s = await liveState(op)
    expect(s.liveServiceItemId).toBe(ids.block)
    expect(s.index).toBe(1)
    await pressKey(app, op, 'Space')

    // The last announcement: Space moves on to the next item.
    await pressKey(app, op, 'Space')
    await expect.poll(async () => (await liveState(op)).liveServiceItemId, { timeout: 10_000 }).toBe(ids.closing)
    await expect.poll(() => visibleText(out)).toMatch(/Closing line/)
  } finally { await closeApp(app, userDataDir) }
})

// [reference as typed, words that must appear across the slides]. Real bundled KJV.
const READINGS: Array<[string, RegExp[]]> = [
  ['Mark 4:35\u201341', [/when the even was come/, /Why are ye so fearful\?/, /What manner of man is this/]],
  ['Psalm 23-24', [/The LORD is my shepherd/, /The earth is the LORD'S/, /King of glory/]],
  ['John 3:35-4:3', [/The Father loveth the Son/, /He left Judaea/]],
  ['Psalm 23, 24', [/The LORD is my shepherd/, /The earth is the LORD'S/]],
]

test('B4-N1: en-dash, chapter-range, cross-chapter and comma-list readings go live with their verses', async () => {
  test.setTimeout(240_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const ids = await op.evaluate(async (refs) => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Readings', '2026-10-11')
      await wf.setActiveService(sid)
      await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Start', body: 'Start slide' } })
      const out: number[] = []
      for (const reference of refs) out.push(await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference } }))
      await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'End', body: 'End slide' } })
      return out
    }, READINGS.map(([r]) => r))
    // The lookup the Build editor uses agrees.
    for (const [ref] of READINGS) {
      const r = await wfCall<any>(op, 'scriptureLookup', ref)
      expect(r.ok, `${ref}: ${r.error}`).toBe(true)
    }
    expect((await wfCall<any>(op, 'scriptureLookup', 'Mark 4:35\u201341')).verses).toHaveLength(7)
    await reloadOperator(op)
    await goToLiveControl(op)
    for (let i = 0; i < READINGS.length; i++) {
      const [ref, words] = READINGS[i]
      // Space off the end of the previous reading already took this one live.
      if ((await liveState(op)).liveServiceItemId !== ids[i]) await goLive(op, ref)
      const s = await liveState(op)
      expect(s.liveServiceItemId, `${ref} didn't go live`).toBe(ids[i])
      const text = (await stepThrough(app, op, ids[i])).join('\n')
      for (const w of words) expect(text, ref).toMatch(w)
      expect(text, `${ref}: margin notes or braces on screen`).not.toMatch(/[{}]|Heb\./)
    }
  } finally { await closeApp(app, userDataDir) }
})

test('B4-N1: a reference that will not resolve is blocking in Review plan, and Go Live says why instead of doing nothing', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Bad ref', '2026-10-11')
      await wf.setActiveService(sid)
      const song = await wf.songCreate({ title: 'Opening Song', sections: [{ kind: 'verse', ordinal: 1, label: 'V1', lyrics: 'Opening line' }] })
      await wf.serviceAddItem(sid, { type: 'song', ref_id: song })
      await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference: 'Hezekiah 4:1-3' } })
    })
    await reloadOperator(op)

    // Review plan: blocking, with the reference named.
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).first().click()
    const review = op.getByRole('button', { name: /^Review (plan|& publish)/ }).first()
    await review.waitFor()
    await review.click()
    await expect.poll(async () => (await op.locator('body').innerText()).replace(/\s+/g, ' '), { timeout: 5000 }).toMatch(/[1-9]\d* blocking/)
    expect(await op.locator('body').innerText()).toMatch(/Fix the reference “Hezekiah 4:1-3”/)
    await op.keyboard.press('Escape')

    // Go Live: a warning toast, and the output stays where it was.
    await goToLiveControl(op)
    await goLive(op, 'Opening Song')
    const before = (await liveState(op)).liveServiceItemId
    await op.getByRole('button', { name: 'Go live: Hezekiah 4:1-3', exact: true }).first().click()
    const seen = new Set<string>()
    await expect.poll(async () => {
      for (const t of await toasts(op)) seen.add(t)
      return [...seen].join(' | ')
    }, { timeout: 6000 }).toMatch(/Couldn.t find “Hezekiah 4:1-3” — nothing went live/)
    expect((await liveState(op)).liveServiceItemId).toBe(before)
  } finally { await closeApp(app, userDataDir) }
})

// QA retest5 A5-N1 (High): "Isa 9:6" put Jeremiah 9:6 on the projector and
// "Jer 29:11" fell through to Lamentations. A5-N2: "John 3:16; 5:24" dropped 5:24.
test('A5-N1: abbreviated books go live as the right passage; A5-N2: a bookless passage after ";" continues the book', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const READS: Array<[string, RegExp[], RegExp]> = [
      ['Isa 9:6', [/For unto us a child is born/], /habitation is in the midst of deceit/],
      ['Jer 29:11', [/For I know the thoughts that I think toward you/], /^$/],
      ['John 3:16; 5:24', [/For God so loved the world/, /He that heareth my word/], /^$/],
    ]
    const ids = await op.evaluate(async (refs) => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Abbrev', '2026-10-11')
      await wf.setActiveService(sid)
      await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Start', body: 'Start slide' } })
      const out: number[] = []
      for (const reference of refs) out.push(await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference } }))
      await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'End', body: 'End slide' } })
      return out
    }, READS.map(([r]) => r))
    await reloadOperator(op)
    await goToLiveControl(op)
    for (let i = 0; i < READS.length; i++) {
      const [ref, want, never] = READS[i]
      if ((await liveState(op)).liveServiceItemId !== ids[i]) await goLive(op, ref)
      expect((await liveState(op)).liveServiceItemId, `${ref} didn't go live`).toBe(ids[i])
      const text = (await stepThrough(app, op, ids[i])).join('\n')
      for (const w of want) expect(text, ref).toMatch(w)
      if (never.source !== '^$') expect(text, `${ref} showed the wrong book`).not.toMatch(never)
    }
  } finally { await closeApp(app, userDataDir) }
})
