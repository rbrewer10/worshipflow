import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl, goLive, pressKey } from './qaHelpers'

// Regression specs for the QA retest3 findings (retest3-a.md / retest3-b.md)
// that need the real app: A3-N1, A3-N2, B3-N1, B3-N2, B3-N3, B3-N4, B3-N5, B3-N8.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVQI12P8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64')

const wfCall = <T = any>(op: Page, fn: string, ...args: unknown[]): Promise<T> =>
  op.evaluate(([f, a]) => (window as any).wf[f as string](...(a as unknown[])), [fn, args] as const)

async function sampleService(op: Page): Promise<any> {
  const id = (await wfCall<any[]>(op, 'servicesList')).find((s) => s.name === 'Sample Sunday').id
  return wfCall(op, 'serviceGet', id)
}

/** Items added through IPC don't reach an already-mounted rail — reload the operator UI, like reopening it. */
async function reloadOperator(op: Page): Promise<void> {
  await op.reload()
  await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
}

async function lanPort(op: Page): Promise<string> {
  return new URL(await wfCall<string>(op, 'getObsUrl')).port
}

async function fileRoute(port: string, path: string): Promise<{ status: number; type: string | null; body: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/file?path=${encodeURIComponent(path)}`)
  return { status: res.status, type: res.headers.get('content-type'), body: await res.text() }
}

async function setOperatorSize(app: ElectronApplication, w: number, h: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }: any, sz: { w: number; h: number }) => {
    const win = BrowserWindow.getAllWindows().find((x: any) => !/#\/(output|stage)/.test(x.webContents.getURL()))!
    win.unmaximize(); win.setSize(sz.w, sz.h)
  }, { w, h })
}

/** Is the centre of this element really the element (not something painted over it)? */
async function hitTestOk(page: Page, selector: string, index = 0): Promise<{ ok: boolean; hit: string }> {
  return page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel as string)[i as number] as HTMLElement
    el.scrollIntoView({ block: 'nearest' })
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { ok: !!hit && (el === hit || el.contains(hit)), hit: hit ? `${hit.tagName}.${(hit as HTMLElement).className}`.slice(0, 120) : 'null' }
  }, [selector, index] as const)
}

test('A3-N1: a crafted .wfservice cannot launder an SSH key, the database, recovery.json or a relative path into imported-media, and /file serves pictures and videos only', async () => {
  const { app, userDataDir: root, profileDir } = await launchApp()
  try {
    mkdirSync(join(root, 'home', '.ssh'), { recursive: true })
    const key = join(root, 'home', '.ssh', 'id_rsa')
    writeFileSync(key, '-----BEGIN FAKE PRIVATE KEY----- QA canary 7731')
    writeFileSync(join(root, 'notes-rel.txt'), 'relative canary') // the app's cwd is `root`
    const media = join(profileDir, 'imported-media')
    const crafted = [key, 'notes-rel.txt', join(media, '..', 'worshipflow.db'), join(profileDir, 'recovery.json')]

    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const svc = await sampleService(op)
    for (const path of crafted) await wfCall(op, 'serviceAddItem', svc.id, { type: 'image', payload: { path }, track: 'main' })
    // Export it to "USB" and import it back: the path that stored crafted payloads verbatim.
    const usb = join(root, 'craft.wfservice')
    await app.evaluate(({ dialog }, p) => {
      ;(dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: p })
      ;(dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
      ;(dialog as any).showMessageBox = async () => ({ response: 0 })
    }, usb)
    expect((await wfCall<any>(op, 'serviceExport', svc.id)).filePath).toBe(usb)
    const res = await wfCall<any>(op, 'serviceImportFile')
    expect(res.error).toBeUndefined()
    await wfCall(op, 'setActiveService', res.serviceId) // runs the migration
    await op.waitForTimeout(2500)

    const copies = existsSync(media) ? readdirSync(media).filter((n) => !n.startsWith('.')) : []
    expect(copies).toEqual([])
    const imported = await wfCall<any>(op, 'serviceGet', res.serviceId)
    for (const it of imported.items.filter((i: any) => i.type === 'image')) {
      expect(String(it.payload.path)).not.toContain('imported-media')
    }

    // /file: no PIN, LAN-wide — must never hand out these, even if a copy existed.
    const port = await lanPort(op)
    mkdirSync(media, { recursive: true })
    writeFileSync(join(media, 'id_rsa-1a41fdac80'), 'KEY canary')
    writeFileSync(join(media, 'worshipflow-b87a8e943c.db'), 'SQLite format 3')
    writeFileSync(join(media, 'cross-0123456789.png'), PNG)
    for (const p of [join(media, 'id_rsa-1a41fdac80'), join(media, 'worshipflow-b87a8e943c.db'), join(media, '..', 'worshipflow.db'), key]) {
      const r = await fileRoute(port, p)
      expect(r.status, p).toBe(403)
      expect(r.body).not.toMatch(/canary|SQLite/)
    }
    const ok = await fileRoute(port, join(media, 'cross-0123456789.png'))
    expect(ok.status).toBe(200)
    expect(ok.type).toBe('image/png')
  } finally { await closeApp(app, root) }
})

test('A3-N2: a crash while on Black relaunches on Black (not the lyrics); a crash with lyrics cleared (C) relaunches with them still cleared', async () => {
  const first = await launchApp()
  const root = first.userDataDir
  try {
    const op = await operatorWindow(first.app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    await goLive(op, 'Amazing Grace')
    const liveId = (await liveState(op)).liveServiceItemId
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'black'))
    expect((await liveState(op)).mode).toBe('black')
    await op.waitForTimeout(1500) // let the recovery snapshot land
    first.app.process().kill('SIGKILL')
    await new Promise((r) => setTimeout(r, 1000))

    const second = await launchApp({ root })
    const op2 = await operatorWindow(second.app)
    const out2 = await outputWindow(second.app)
    await expect.poll(async () => (await liveState(op2)).liveServiceItemId ?? null, { timeout: 20_000 }).toBe(liveId)
    expect((await liveState(op2)).mode).toBe('black')
    await op2.waitForTimeout(800)
    expect(await visibleText(out2)).not.toMatch(/Amazing grace|sweet the sound/i)

    // Un-blank, press C, crash again (also exercises a second crash right after a restore — A3-N4).
    await op2.evaluate(() => (window as any).wf.sendIntent('main', 'lyrics'))
    await expect.poll(() => visibleText(out2), { timeout: 10_000 }).toMatch(/Amazing grace|sweet the sound/i)
    await op2.evaluate(() => (window as any).wf.liveSetLayers('main', { textHidden: true }))
    await expect.poll(async () => (await liveState(op2)).textHidden).toBe(true)
    await op2.waitForTimeout(1500)
    second.app.process().kill('SIGKILL')
    await new Promise((r) => setTimeout(r, 1000))

    const third = await launchApp({ root })
    try {
      const op3 = await operatorWindow(third.app)
      const out3 = await outputWindow(third.app)
      await expect.poll(async () => (await liveState(op3)).liveServiceItemId ?? null, { timeout: 20_000 }).toBe(liveId)
      const s = await liveState(op3)
      expect(s.textHidden).toBe(true)
      expect(s.mode).toBe('lyrics')
      await op3.waitForTimeout(800)
      expect(await visibleText(out3)).not.toMatch(/sweet the sound/i)
    } finally { await third.app.close() }
  } finally { await closeApp(first.app, root) }
})

test('B3-N2: at 1600x760 with an item selected and Add content open, the whole flow list is reachable, never under the zone strip', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const svc = await sampleService(op)
    await wfCall(op, 'announcementCreate', { title: 'Potluck Sunday', body: 'Bring a dish', display: 'slide', frequency: 'recurring', active: true })
    await wfCall(op, 'setActiveService', svc.id)
    const before = svc.items.length
    await setOperatorSize(app, 1600, 760)
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).click()

    // B3-N2 first: item selected + Add content open, every row of the list can be hit.
    await op.locator('.wf-service-item-list').getByText('Amazing Grace').first().click()
    await op.getByRole('button', { name: 'Add item' }).click()
    await expect(op.getByTestId('add-content-panel')).toBeVisible()
    await op.waitForTimeout(300)
    const rows = await op.locator('.wf-service-item-list [role="button"], .wf-service-item-list > * > *').count()
    expect(rows).toBeGreaterThan(3)
    const last = await op.evaluate(() => {
      const list = document.querySelector('.wf-service-item-list') as HTMLElement
      list.scrollTop = list.scrollHeight
      const kids = Array.from(list.querySelectorAll<HTMLElement>('*')).filter((e) => e.getBoundingClientRect().height > 20 && e.children.length > 0)
      const el = kids[kids.length - 1]
      el.scrollIntoView({ block: 'nearest' })
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + Math.min(40, r.width / 2), r.top + r.height / 2)
      const strip = document.querySelector('.wf-service-bottom-strip')
      return { inList: !!hit && list.contains(hit), inStrip: !!hit && !!strip && strip.contains(hit) }
    })
    expect(last.inStrip).toBe(false)
    expect(last.inList).toBe(true)
    expect(before).toBeGreaterThan(0)
  } finally { await closeApp(app, userDataDir) }
})

test('B3-N1: at the default 1600x760 window, Paste setlist\'s "Add to this service" is clickable and adds the items', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const svc = await sampleService(op)
    await wfCall(op, 'announcementCreate', { title: 'Potluck Sunday', body: 'Bring a dish', display: 'slide', frequency: 'recurring', active: true })
    await wfCall(op, 'setActiveService', svc.id)
    const before = svc.items.length
    await setOperatorSize(app, 1600, 760)
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).click()

    // A 13-line bulletin, then a REAL click on the commit button.
    await op.getByRole('button', { name: 'Show import options' }).click()
    await op.getByRole('button', { name: /Paste setlist/ }).click()
    const bulletin = ['Prelude', 'Call to Worship', 'Opening Hymn: Holy, Holy, Holy', 'Welcome & Announcements', 'Amazing Grace', 'Pastoral Prayer',
      'Tithes & Offerings', 'Doxology', 'Scripture Reading: Romans 8:28-39', 'Sermon: More Than Conquerors', 'Just As I Am', 'Benediction', 'Postlude'].join('\n')
    await op.locator('textarea[placeholder^="1. Amazing Grace"]').fill(bulletin)
    await expect(op.getByTestId('setlist-preview')).toBeVisible()
    const add = op.getByRole('button', { name: 'Add to this service' })
    await add.scrollIntoViewIfNeeded()
    const hit = await hitTestOk(op, '[data-testid="setlist-actions"] button:last-child')
    expect(hit.ok, `covered by ${hit.hit}`).toBe(true)
    await add.click({ timeout: 5000 }) // no force: fails if the Live drawer is on top
    await expect.poll(async () => (await wfCall<any>(op, 'serviceGet', svc.id)).items.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(before + 13)
  } finally { await closeApp(app, userDataDir) }
})

test('B3-N3: a whole-chapter reading ("Psalm 100") shows different verses on every slide', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    // The e2e build can't reach resources/kjv.json (app path is out/main), so
    // serve Psalm 100 from a stubbed bible-api.com, honouring verse ranges the
    // way the real API does.
    await wfCall(op, 'featuresSetBibleTranslation', 'web')
    await app.evaluate(() => {
      const PSALM_100 = [
        'Make a joyful noise unto the LORD, all ye lands.',
        'Serve the LORD with gladness: come before his presence with singing.',
        'Know ye that the LORD he is God: it is he that hath made us, and not we ourselves.',
        'Enter into his gates with thanksgiving, and into his courts with praise.',
        'For the LORD is good; his mercy is everlasting; and his truth endureth to all generations.',
      ]
      const g = globalThis as any
      const real = g.fetch
      g.fetch = async (url: unknown, init: unknown) => {
        const u = String(url)
        if (!u.includes('bible-api.com')) return real(url, init)
        const ref = decodeURIComponent(new URL(u).pathname.slice(1))
        const m = /(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/.exec(ref)
        if (!m || m[1] !== '100') return new Response('{}', { status: 404 })
        const from = m[2] ? Number(m[2]) : 1
        const to = m[3] ? Number(m[3]) : m[2] ? from : 5
        const verses = PSALM_100.map((text, i) => ({ verse: i + 1, text })).filter((v) => v.verse >= from && v.verse <= to)
        const reference = m[2] ? `Psalms 100:${from}${to !== from ? `-${to}` : ''}` : 'Psalms 100'
        return new Response(JSON.stringify({ reference, verses }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
    })
    const svc = await sampleService(op)
    const id = await wfCall<number>(op, 'serviceAddItem', svc.id, { type: 'scripture', payload: { reference: 'Psalm 100' }, track: 'main' })
    await wfCall(op, 'setActiveService', svc.id)
    await reloadOperator(op)
    const item = (await wfCall<any>(op, 'serviceGet', svc.id)).items.find((i: any) => i.id === id)
    const out = await outputWindow(app)
    await goToLiveControl(op)
    await goLive(op, item.title)
    const texts: string[] = [await visibleText(out)]
    for (let i = 0; i < 4; i++) {
      await pressKey(app, op, 'Space')
      await op.waitForTimeout(600)
      if ((await liveState(op)).liveServiceItemId !== id) break
      texts.push(await visibleText(out))
    }
    expect(texts.length).toBeGreaterThanOrEqual(3)
    expect(new Set(texts).size).toBe(texts.length) // QA: slides 2-5 were all the same whole chapter
    expect(texts.join(' ')).toMatch(/joyful noise/i)
  } finally { await closeApp(app, userDataDir) }
})

test('B3-N4: a missing picture taken live from the rail warns instead of silently blanking; B3-N5: C on it is refused', async () => {
  const { app, userDataDir, profileDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const svc = await sampleService(op)
    const gone = join(profileDir, 'imported-media', 'gone-0000000000.png')
    const id = await wfCall<number>(op, 'serviceAddItem', svc.id, { type: 'image', payload: { path: gone }, track: 'main' })
    await wfCall(op, 'setActiveService', svc.id)
    await reloadOperator(op)
    const item = (await wfCall<any>(op, 'serviceGet', svc.id)).items.find((i: any) => i.id === id)
    await goToLiveControl(op)
    await goLive(op, item.title)
    await expect.poll(() => visibleText(op), { timeout: 5000 }).toMatch(/isn.t on this computer any more/)

    await pressKey(app, op, 'c')
    expect((await liveState(op)).textHidden).toBe(false)
    await expect.poll(() => visibleText(op), { timeout: 5000 }).toMatch(/C hides lyrics/)
  } finally { await closeApp(app, userDataDir) }
})

test('B3-N8: Space on a live announcement moves on (or stays on the card at the end) — never redraws it as a lyric slide', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const svc = await sampleService(op)
    const a1 = await wfCall<number>(op, 'announcementCreate', { title: 'Potluck Sunday', body: 'After service', display: 'slide', frequency: 'once', active: true })
    const a2 = await wfCall<number>(op, 'announcementCreate', { title: 'Youth Lock-in', body: 'Friday night', display: 'slide', frequency: 'once', active: true })
    const i1 = await wfCall<number>(op, 'serviceAddItem', svc.id, { type: 'announcement', ref_id: a1, track: 'main' })
    const t = await wfCall<number>(op, 'serviceAddItem', svc.id, { type: 'text', payload: { title: 'Go in peace', body: 'Amen' }, track: 'main' })
    const i2 = await wfCall<number>(op, 'serviceAddItem', svc.id, { type: 'announcement', ref_id: a2, track: 'main' })
    await wfCall(op, 'setActiveService', svc.id)
    await reloadOperator(op)
    const items = (await wfCall<any>(op, 'serviceGet', svc.id)).items
    const out = await outputWindow(app)
    await goToLiveControl(op)

    await goLive(op, items.find((i: any) => i.id === i1).title)
    expect((await liveState(op)).mode).toBe('announcement')
    await pressKey(app, op, 'Space')
    await expect.poll(async () => (await liveState(op)).liveServiceItemId, { timeout: 10_000 }).toBe(t)

    await goLive(op, items.find((i: any) => i.id === i2).title)
    for (let n = 0; n < 2; n++) {
      await pressKey(app, op, 'Space')
      const s = await liveState(op)
      expect(s.liveServiceItemId).toBe(i2)
      expect(s.mode).toBe('announcement')
    }
    await expect.poll(() => visibleText(out)).toMatch(/Youth Lock-in/)

    // B3-N5: C on an announcement is refused, not a silent "Lyrics off".
    await pressKey(app, op, 'c')
    expect((await liveState(op)).textHidden).toBe(false)
  } finally { await closeApp(app, userDataDir) }
})
