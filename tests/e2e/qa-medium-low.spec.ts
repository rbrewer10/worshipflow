import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl, goLive, pressKey } from './qaHelpers'

// Regression specs for the medium/low QA findings (b-extra/specs 03-10 and
// report-a M/L items) that need the real app to show.

test('B13: no fps/OUT debug badges on the projector once it has been up a few seconds; B14: theme fonts really load', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    const out = await outputWindow(app)
    await completeFirstRun(op)
    expect(await visibleText(out)).not.toMatch(/\bfps\b/)
    await out.waitForTimeout(6500)
    const txt = await visibleText(out)
    expect(txt).not.toMatch(/\bfps\b/)
    expect(txt).not.toMatch(/OUT 1/)
    // B14: the two fonts that were saved GitHub HTML pages now decode.
    const status = await op.evaluate(async () => {
      const res: Record<string, string> = {}
      for (const fam of ['PT Serif', 'Cormorant Garamond']) {
        const face = [...(document as any).fonts].find((f: FontFace) => f.family.replace(/["']/g, '') === fam)
        try { await face.load(); res[fam] = face.status } catch { res[fam] = 'error' }
      }
      return res
    })
    expect(status).toEqual({ 'PT Serif': 'loaded', 'Cormorant Garamond': 'loaded' })
  } finally { await closeApp(app, userDataDir) }
})

test('B10: deleting the live item (and its neighbour) never leaves Next stuck at the last slide', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    await goLive(op, 'Amazing Grace')
    const svcId = (await op.evaluate(() => (window as any).wf.servicesList())).find((s: any) => s.name === 'Sample Sunday').id
    const svc = await op.evaluate((id) => (window as any).wf.serviceGet(id), svcId)
    const ids: number[] = svc.items.map((i: any) => i.id)
    const liveId = (await liveState(op)).liveServiceItemId
    const idx = ids.indexOf(liveId)
    const neighbour = ids[idx + 1] // "Come Thou Fount"
    // Scripture items need the online Bible lookup, which the e2e sandbox has
    // no network for (a failed lookup deliberately leaves the item un-live),
    // so take them out of the way too.
    const scriptureIds: number[] = svc.items.slice(idx + 2).filter((i: any) => i.type === 'scripture').map((i: any) => i.id)
    const after = svc.items.slice(idx + 2).find((i: any) => !['header', 'placeholder', 'scripture'].includes(i.type))
    await op.evaluate(async (ids) => { for (const id of ids) await (window as any).wf.serviceRemoveItem(id) }, scriptureIds)
    // What a batch delete including the live row used to do.
    await op.evaluate(async (a) => { await (window as any).wf.serviceRemoveItem(a.liveId); await (window as any).wf.serviceRemoveItem(a.neighbour) }, { liveId, neighbour })
    // Step through Amazing Grace's last slides and past its end. Before the
    // fix Next went dead at the last slide.
    for (let i = 0; i < 8 && (await liveState(op)).liveServiceItemId === liveId; i++) await pressKey(app, op, 'ArrowRight')
    await expect.poll(async () => (await liveState(op)).liveServiceItemId).toBe(after.id)
  } finally { await closeApp(app, userDataDir) }
})

test('B11 + B12: USB .wfservice with a BOM imports; changed lyrics ask first; track/zone routing kept; bad files give a message', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const exportPath = join(userDataDir, 'export.wfservice')
    await app.evaluate(({ dialog }, p) => { (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: p }) }, exportPath)
    const svcId = (await op.evaluate(() => (window as any).wf.servicesList())).find((s: any) => s.name === 'Sample Sunday').id
    const exp = await op.evaluate((id) => (window as any).wf.serviceExport(id), svcId)
    expect(exp.filePath).toBe(exportPath) // B24: export reports where it saved

    const bundle = JSON.parse(readFileSync(exportPath, 'utf8'))
    const ag = bundle.items.find((i: any) => i.song?.title === 'Amazing Grace')
    ag.song.sections = [{ kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'UPDATED LYRICS FROM THE USB STICK' }]
    ag.track = 'second'
    ag.zoneRouting = { 1: 'lyrics', 2: 'logo', 3: 'lyrics', 4: 'stage' }
    bundle.items.push({ type: 'bogus', title: 'Mystery' })
    const usb = join(userDataDir, 'changed.wfservice')
    writeFileSync(usb, '\uFEFF' + JSON.stringify(bundle))

    await app.evaluate(({ dialog }, p) => {
      const g = globalThis as any
      g.__asked = []
      ;(dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
      ;(dialog as any).showMessageBox = async (...a: any[]) => { const o = a.length > 1 ? a[1] : a[0]; g.__asked.push(o.buttons); return { response: 1 } } // "Use the file's version"
    }, usb)
    const res = await op.evaluate(() => (window as any).wf.serviceImportFile())
    expect(res.error).toBeUndefined()
    expect(res.summary).toMatch(/Imported “Sample Sunday \(2\)”/)
    expect(res.summary).toMatch(/Updated from the file: Amazing Grace/)
    expect(res.summary).toMatch(/Skipped 1/)
    const asked = await app.evaluate(() => (globalThis as any).__asked)
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('Use the file’s version')

    const songs = await op.evaluate(() => (window as any).wf.songsList(''))
    const agSong = await op.evaluate((id) => (window as any).wf.songGet(id), songs.find((s: any) => s.title === 'Amazing Grace').id)
    expect(agSong.sections[0].lyrics).toBe('UPDATED LYRICS FROM THE USB STICK')
    const imported = await op.evaluate((id) => (window as any).wf.serviceGet(id), res.serviceId)
    const agItem = imported.items.find((i: any) => i.type === 'song' && i.ref_id === agSong.id)
    expect(agItem.track).toBe('second')
    expect(agItem.zoneRouting).toEqual({ 1: 'lyrics', 2: 'logo', 3: 'lyrics', 4: 'stage' })

    // Truncated file → a friendly message, nothing created.
    const before = (await op.evaluate(() => (window as any).wf.servicesList())).length
    writeFileSync(usb, JSON.stringify(bundle).slice(0, 300))
    const bad = await op.evaluate(() => (window as any).wf.serviceImportFile())
    expect(bad.serviceId).toBeNull()
    expect(bad.error).toMatch(/isn’t a WorshipFlow service/)
    expect((await op.evaluate(() => (window as any).wf.servicesList())).length).toBe(before)
  } finally { await closeApp(app, userDataDir) }
})

test('B17: the operator window fits a 1280x720 laptop with the help button on screen; B23: Sample Sunday has a date', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const size = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => !/#\/(output|stage)/.test(x.webContents.getURL()))!
      w.setSize(1280, 649)
      return w.getSize()
    })
    expect(size).toEqual([1280, 649])
    await op.waitForTimeout(300)
    const help = await op.getByTitle('Quick start help').boundingBox()
    const vw = await op.evaluate(() => innerWidth)
    expect(help!.x + help!.width).toBeLessThanOrEqual(vw)
    const sample = (await op.evaluate(() => (window as any).wf.servicesList())).find((s: any) => s.name === 'Sample Sunday')
    expect(sample.service_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  } finally { await closeApp(app, userDataDir) }
})

test('B20: C toggles the lyrics back; the CURRENT preview says they are hidden. B21: Enter in an empty lower-third box keeps the live one', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    await goLive(op, 'Amazing Grace')
    await pressKey(app, op, 'c')
    expect((await liveState(op)).textHidden).toBe(true)
    await expect(op.getByRole('status').filter({ hasText: 'Lyrics hidden on the screens' })).toBeVisible()
    await pressKey(app, op, 'c')
    expect((await liveState(op)).textHidden).toBe(false)

    await op.evaluate(() => (window as any).wf.liveSetOverlayTicker('main', 'Potluck after service'))
    const box = op.getByPlaceholder('Potluck after service')
    await box.click()
    await box.press('Enter')
    await op.waitForTimeout(300)
    expect((await liveState(op)).overlayTicker).toBe('Potluck after service')
  } finally { await closeApp(app, userDataDir) }
})
