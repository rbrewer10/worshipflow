import { test, expect } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, completeFirstRun } from './electronApp'

// Regression spec for the QA retest10 finding (retest10.md), confirmed failing
// on 2f17ee5:
//  B10-N1 — Paste setlist skipped a library song whose title is a describing
//           word plus a role noun ("Peace Speaker", "Story Teller") when its
//           credit followed a colon or was a titled name after a dash.

test('B10-N1: paste setlist — a library title beats the generic role label; real role lines still skip', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const library = ['Peace Speaker', 'Story Teller']
    await op.evaluate(async (want) => {
      const wf = (window as any).wf
      const have = new Set(((await wf.songsList('')) as any[]).map((s) => String(s.title).toLowerCase()))
      for (const t of want) {
        if (!have.has(t.toLowerCase())) await wf.songCreate({ title: t, sections: [{ kind: 'verse', ordinal: 1, label: 'Verse 1', lyrics: `${t} line one` }] })
      }
      const id = await wf.serviceCreate('Bulletin paste 10', '2026-10-11')
      await wf.setActiveService(id)
    }, library)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).first().click()
    await op.getByLabel('Show import options').click()
    await op.getByRole('button', { name: /Paste setlist/ }).click()
    const serving = ['Greeter: Mary Hill', 'Head Usher \u2013 Carl Mims', 'Sound & Video: Jo Park', 'Freedom Speaker \u2013 Jim Price']
    await op.getByPlaceholder(/Amazing Grace/).fill([
      'Prelude', 'Peace Speaker: Geron Davis', serving[0], 'Story Teller: Morgan Cryar', serving[1], serving[2],
      'Peace Speaker \u2013 Dr. Geron Davis', serving[3], 'Benediction',
    ].join('\n'))
    const skipped = op.getByTestId('setlist-skipped')
    await expect(skipped).toContainText(`${serving.length} lines skipped`)
    await skipped.locator('summary').click()
    const list = op.getByRole('list', { name: 'Skipped lines' })
    for (const line of serving) await expect(list).toContainText(line)
    await expect(list).not.toContainText('Peace Speaker')
    await expect(list).not.toContainText('Story Teller')
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
    // All three linked to the library (no "Song: …" placeholders), nothing from the role lines.
    expect(items.filter((i) => i.type === 'song').map((i) => i.title)).toEqual(['Peace Speaker', 'Story Teller', 'Peace Speaker'])
    expect(items.filter((i) => i.type === 'placeholder')).toEqual([])
  } finally {
    await closeApp(app, userDataDir)
  }
})
