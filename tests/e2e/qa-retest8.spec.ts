import { test, expect, type Page } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun } from './electronApp'
import { liveState, goToLiveControl, openServedPage } from './qaHelpers'

// Regression specs for the QA retest8 findings (retest8.md), confirmed failing
// on d98401e:
//  B8-N2 — leaving a countdown (or Black/Logo pressed late in the Go live
//          pending window) for a reading put the un-numbered pre-deck verse
//          text ('16 For God…', '35 And the same day…') on the projector for
//          220–370 ms (Stage: a frame) before the numbered deck crossfaded in.
//          Repros b-extra/retest8/specs8/68f-space-arrival, 68e-bl-pending.
//  B8-N1 — Paste setlist silently dropped 'Title – Artist' lines whose title
//          ends in a serving word ('Lord of Hosts – Shane & Shane', 'Promise
//          Keeper – Danny Gokey'…), even when they are library songs.
//          Repro specs8/72-song-artist-paste.

// Text a viewer could actually read: displayed, and every ancestor at least
// half opaque (a crossfading layer counts once it's mostly in).
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

// Verse text that doesn't start with its chapter:verse ('35 And the same day…',
// '16 For God so loved…', 'And we know that…'), as QA's 68e/68f flag it.
const UNNUMBERED = /^(?!\d+:\d+ )(\d+ [A-Z]|[A-Z][a-z]+ [a-z]+ [a-z]+)/
const NOT_SCRIPTURE = /Start slide|Service begins|^Start\b/i
// The Stage window: drop the header up to its slide counter, keep the current slide.
const stageCurrent = (t: string): string => t.replace(/^.*?\d+ (of|\/) \d+\s*/, '').split(/ Next\b/i)[0]

test('B8-N2: no un-numbered pre-deck verse text when a reading follows a countdown or Black/Logo', async () => {
  test.setTimeout(300_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const items: Array<{ id: number; title: string }> = await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Pre-deck numbering', '2026-10-11')
      await wf.setActiveService(sid)
      const ids = [
        await wf.serviceAddItem(sid, { type: 'countdown', payload: { seconds: 120 } }),
        await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference: 'John 3:16-18' } }),
        await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Start', body: 'Start slide' } }),
        await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference: 'Mark 4:35-41' } }),
        await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference: 'Psalm 46:1-3' } }),
        await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference: 'Romans 8:28; 12:1-2' } }),
      ]
      const svc = await wf.serviceGet(sid)
      return ids.map((id) => ({ id, title: svc.items.find((i: any) => i.id === id).title as string }))
    })
    const titles = items.map((i) => i.title)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    const out = await outputWindow(app)
    await op.evaluate(() => (window as any).wf.stageOpen())
    const stageWin = await (async () => {
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        const p = app.windows().find((w) => w.url().includes('#/stage'))
        if (p) { await p.waitForLoadState('domcontentloaded'); return p }
        await op.waitForTimeout(200)
      }
      throw new Error('Stage window never opened')
    })()
    const z3 = await openServedPage(app, op, '/zone/3', { width: 960, height: 540 })
    await goToLiveControl(op)
    const goLiveButton = (k: number) => op.getByRole('button', { name: `Go live: ${titles[k]}`, exact: true }).first()
    const focusOperator = async (): Promise<void> => {
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => !/#\/(output|stage)|\/zone\/|\/obs/.test(x.webContents.getURL()))
        w?.focus(); w?.webContents.focus()
      })
      await op.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    }
    const settle = async (k: number): Promise<void> => {
      await goLiveButton(k).click()
      await expect.poll(async () => (await liveState(op)).liveServiceItemId, { timeout: 10_000 }).toBe(items[k].id)
      await op.waitForTimeout(2600)  // past the pending window, fully faded in
    }

    const frames: string[] = []
    // Act, then sample OUT, the Stage window and Zone 3 every ~25 ms for 3 s.
    const sample = async (label: string, act: () => Promise<void>, key?: { press: string; at: number }): Promise<string> => {
      const t0 = Date.now()
      await act()
      let pressed = !key
      let lastOut = ''
      while (Date.now() - t0 < 3500) {
        const t = Date.now() - t0
        if (!pressed && key && t >= key.at) { await op.keyboard.press(key.press); pressed = true }
        const [o, s, z] = await Promise.all([shownText(out), shownText(stageWin), shownText(z3)])
        for (const [name, text] of [['OUT', o], ['STAGE', stageCurrent(s)], ['Z3', z]] as const) {
          if (UNNUMBERED.test(text) && !NOT_SCRIPTURE.test(text)) frames.push(`${label} +${t}ms ${name} "${text.slice(0, 60)}"`)
        }
        lastOut = o
        await op.waitForTimeout(15)
      }
      return lastOut
    }

    for (let round = 0; round < 2; round++) {
      // Countdown → John 3:16-18 by Space (the countdown is one slide).
      await settle(0)
      await focusOperator()
      let settled = await sample(`R${round} countdown→Space`, () => op.keyboard.press('Space'))
      expect(settled, 'projector after Space from the countdown').toMatch(/^3:16 For God so loved/)
      // Countdown → Mark 4:35-41 by a clicked Go live.
      await settle(0)
      settled = await sample(`R${round} countdown→click Mark`, () => goLiveButton(3).click())
      expect(settled, 'projector after Go live from the countdown').toMatch(/^4:35 And the same day/)
      // Black / Logo pressed late in the pending window, then the reading goes live.
      for (const [k, press, first] of [[4, 'b', /^46:1 To the chief Musician/], [5, 'l', /^8:28 And we know/]] as const) {
        await settle(2)
        await focusOperator()
        settled = await sample(`R${round} ${press}@1300 ${titles[k]}`, () => goLiveButton(k).click(), { press, at: 1300 })
        expect(settled, `${titles[k]}: projector once live`).toMatch(first)
      }
    }
    if (frames.length) console.log(frames.join('\n'))
    expect(frames, 'un-numbered pre-deck frames').toEqual([])
  } finally {
    await closeApp(app, userDataDir)
  }
})

test('B8-N1: pasted "Title – Artist" lines stay service items and link to library songs; skipped lines are listed', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const library = ['Lord of Hosts', 'Promise Keeper', 'Way Maker', 'Covenant Keeper', 'Burden Bearer', 'Goodness of God', 'Holy, Holy, Holy']
    await op.evaluate(async (want) => {
      const wf = (window as any).wf
      const have = new Set(((await wf.songsList('')) as any[]).map((s) => String(s.title).toLowerCase()))
      for (const t of want) {
        if (!have.has(t.toLowerCase())) await wf.songCreate({ title: t, sections: [{ kind: 'verse', ordinal: 1, label: 'Verse 1', lyrics: `${t} line one\n${t} line two` }] })
      }
      const id = await wf.serviceCreate('Song–artist paste', '2026-10-11')
      await wf.setActiveService(id)
    }, library)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).first().click()
    await op.getByLabel('Show import options').click()
    await op.getByRole('button', { name: /Paste setlist/ }).click()
    const setlist = [
      'Prelude',
      'Lord of Hosts – Shane & Shane',
      'Welcome & Announcements',
      'Promise Keeper – Danny Gokey',
      'Way Maker – Leeland',
      'Covenant Keeper — Joe Pace',
      'Scripture Reading: Psalm 46:1-3',
      'Burden Bearer - Jason Crabb',
      'Goodness of God – Bethel Music',
      'Holy, Holy, Holy (Leader: Jim Price)',
      'Ushers: Ann Lee & Tom Ray',
      'Sermon: Be Still',
      'Heavenly Host – Chancel Choir',
      'Benediction',
    ].join('\n')
    await op.getByPlaceholder(/Amazing Grace/).fill(setlist)
    const preview = op.getByTestId('setlist-preview')
    for (const t of ['Lord of Hosts', 'Promise Keeper', 'Covenant Keeper', 'Burden Bearer', 'Heavenly Host']) {
      await expect(preview, `preview keeps ${t}`).toContainText(t)
    }
    // The one line that really is a serving credit is skipped — and the operator is told.
    const skipped = op.getByTestId('setlist-skipped')
    await expect(skipped).toContainText('1 line skipped')
    await skipped.locator('summary').click()
    await expect(op.getByRole('list', { name: 'Skipped lines' })).toContainText('Ushers: Ann Lee & Tom Ray')
    await expect(preview).not.toContainText('Ushers')

    await op.getByRole('button', { name: /Add to this service|Create service/ }).click()
    await expect.poll(async () => op.evaluate(async () => {
      const wf = (window as any).wf
      return ((await wf.serviceGet(await wf.getActiveServiceId())).items as any[]).length
    }), { timeout: 10_000 }).toBeGreaterThan(0)
    const linked: Record<string, string | null> = await op.evaluate(async (want) => {
      const wf = (window as any).wf
      const svc = await wf.serviceGet(await wf.getActiveServiceId())
      const songs = (await wf.songsList('')) as any[]
      const titleOf = (id: number | null) => songs.find((s) => s.id === id)?.title ?? null
      return Object.fromEntries(want.map((t) => {
        const item = (svc.items as any[]).find((i) => i.type === 'song' && i.ref_id != null && titleOf(i.ref_id) === t)
        return [t, item ? titleOf(item.ref_id) : null]
      }))
    }, library)
    // Every library song in the paste is a linked song item (57bc behaviour), the
    // '(Leader: …)' note no longer stopping 'Holy, Holy, Holy' from matching.
    expect(linked).toEqual(Object.fromEntries(library.map((t) => [t, t])))
  } finally {
    await closeApp(app, userDataDir)
  }
})
