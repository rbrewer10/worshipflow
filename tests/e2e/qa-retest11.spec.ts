import { test, expect } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, completeFirstRun } from './electronApp'

// Regression spec for the QA retest11 finding (retest11.md), confirmed failing
// on a3e1402:
//  B11-N1 — Paste setlist: a double space, a tab or a non-breaking space
//           inside a line made 'Amazing  Grace' an unlinked placeholder and
//           imported 'Head  Usher: Carl Mims' as a song placeholder.

test('B11-N1: paste setlist — extra spaces, tabs and non-breaking spaces inside a line still link songs and skip role lines', async () => {
  test.setTimeout(180_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    // One library title saved with a double space: it must match too.
    const library = ['Amazing Grace', 'Great Is Thy Faithfulness', 'Holy, Holy, Holy', 'Be Thou  My Vision']
    await op.evaluate(async (want) => {
      const wf = (window as any).wf
      const norm = (t: string): string => t.replace(/\s+/g, ' ').trim().toLowerCase()
      const have = new Set(((await wf.songsList('')) as any[]).map((s) => norm(String(s.title))))
      for (const t of want) {
        if (!have.has(norm(t))) await wf.songCreate({ title: t, sections: [{ kind: 'verse', ordinal: 1, label: 'Verse 1', lyrics: `${t} line one` }] })
      }
      const id = await wf.serviceCreate('Bulletin paste 11', '2026-10-11')
      await wf.setActiveService(id)
    }, library)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).first().click()
    await op.getByLabel('Show import options').click()
    await op.getByRole('button', { name: /Paste setlist/ }).click()
    const serving = ['Head  Usher: Carl Mims', 'Senior  Pastor: Ryan Brewer', 'Choir\tDirector: Gloria Lee']
    await op.getByPlaceholder(/Amazing Grace/).fill([
      'Prelude', 'Amazing  Grace', serving[0], 'Great Is\tThy Faithfulness', serving[1], 'Hymn:\u00A0\u00A0Holy, Holy, Holy', serving[2], 'Be Thou My Vision', 'Benediction',
    ].join('\n'))
    // The preview shows exactly the titles that get imported.
    const preview = op.getByTestId('setlist-preview')
    await expect(preview.locator('li')).toHaveCount(6)
    const shown = (await preview.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
    expect(shown).toEqual(['Header Prelude', 'Song Amazing Grace', 'Song Great Is Thy Faithfulness', 'Song Holy, Holy, Holy', 'Song Be Thou My Vision', 'Header Benediction'])
    const skipped = op.getByTestId('setlist-skipped')
    await expect(skipped).toContainText(`${serving.length} lines skipped`)
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
    // All four linked (no "Song: …" placeholders), nothing from the role lines.
    expect(items.filter((i) => i.type === 'song').map((i) => i.title?.replace(/\s+/g, ' '))).toEqual(['Amazing Grace', 'Great Is Thy Faithfulness', 'Holy, Holy, Holy', 'Be Thou My Vision'])
    expect(items.filter((i) => i.type === 'placeholder')).toEqual([])
  } finally {
    await closeApp(app, userDataDir)
  }
})
