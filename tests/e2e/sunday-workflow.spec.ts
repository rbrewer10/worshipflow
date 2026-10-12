import { test, expect } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'

// Exercises the actual "run a Sunday" loop end-to-end against the real built
// app: create a song, build a service, send it live, and verify the change
// reaches the REAL audience-facing output window (via WF_SIM), not just the
// operator's own state. Logic tests alone can't catch a wire-up bug between
// the operator UI and what the congregation's screen actually renders.
//
// Updated for the 0.20 UI: a fresh profile opens to the first-run wizard, the
// nav menus are "Media/Library" and "Settings", and the song editor is one
// continuous lyrics textarea (ReflowEditor).
test('build a service, go live, advance, and black all reach the real output window', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const operator = await operatorWindow(app)
    const output = await outputWindow(app)
    await completeFirstRun(operator)

    // Sanity: a pristine app must never show the Phase-0 demo song's lyrics
    // on the real output (Phase 1's "demo-state leak" fix).
    await expect(operator.getByText(/Good (morning|afternoon|evening)/)).toBeVisible()
    expect(await visibleText(output)).not.toMatch(/Amazing grace/i)

    // --- Create a song ---
    const mainNav = operator.getByRole('navigation', { name: 'Main' })
    await mainNav.getByRole('button', { name: 'Media/Library' }).click()
    await operator.getByRole('menuitem', { name: 'Songs' }).click()
    await operator.getByRole('button', { name: 'New Song' }).click()
    await operator.getByPlaceholder('Song title…').fill('E2E Test Song')
    await operator.getByRole('button', { name: 'Create', exact: true }).click()

    const lyrics = operator.getByLabel('Song lyrics')
    await lyrics.fill('Testing one two three\n\nSecond slide words')
    await lyrics.blur()
    // Autosave is debounced; wait for the song to actually hold the lyrics.
    await expect.poll(async () => operator.evaluate(async () => {
      const songs = await window.wf.songsList('')
      const s = songs.find((x) => x.title === 'E2E Test Song')
      if (!s) return ''
      const full = await window.wf.songGet(s.id)
      return full?.sections.map((sec) => sec.lyrics).join('\n') ?? ''
    }), { timeout: 10_000 }).toContain('Second slide words')

    // --- Build a service and add the song ---
    await mainNav.getByRole('button', { name: 'Build service' }).click()
    await operator.getByLabel('Enter a new service name').fill('E2E Test Service')
    await operator.getByRole('button', { name: 'Create new service' }).click()
    await mainNav.getByRole('button', { name: 'Media/Library' }).click()
    await operator.getByRole('menuitem', { name: 'Songs' }).click()
    await operator.getByRole('button', { name: 'Add E2E Test Song to current service' }).click()

    // --- Go live ---
    await mainNav.getByRole('button', { name: 'Live Control' }).click()
    await operator.getByRole('button', { name: 'Go live: E2E Test Song' }).click()
    // The rail's tap-to-confirm gesture auto-fires ~1.5s after arming
    // (see usePendingConfirm) — deliberate Sunday-safety friction.
    await expect.poll(() => visibleText(output), { timeout: 5000 }).toContain('Testing one two three')

    // --- Advance reaches the real screen ---
    await operator.keyboard.press('ArrowRight')
    await expect.poll(() => visibleText(output)).toContain('Second slide words')

    // --- Black reaches the real screen ---
    // The "B" shortcut also regression-tests the Phase-1 fix scoping global
    // shortcuts to the Live tab.
    await operator.keyboard.press('b')
    await expect.poll(() => visibleText(output)).not.toContain('Second slide words')
  } finally {
    await closeApp(app, userDataDir)
  }
})

// Guards the nav regrouping: the menus must be openable and navigable by
// keyboard alone, since that is the part a mouse-only manual check never
// exercises.
test('library and settings menus are keyboard operable', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const operator = await operatorWindow(app)
    await completeFirstRun(operator)
    const mainNav = operator.getByRole('navigation', { name: 'Main' })

    const settings = mainNav.getByRole('button', { name: 'Settings' })
    await settings.focus()
    await operator.keyboard.press('ArrowDown')
    await expect(operator.getByRole('menu', { name: 'Settings' })).toBeVisible()
    await expect(operator.getByRole('menuitem', { name: 'Screens & zones' })).toBeFocused()

    await operator.keyboard.press('ArrowUp')
    await expect(operator.getByRole('menuitem', { name: 'Diagnostics & backups' })).toBeFocused()

    await operator.keyboard.press('Escape')
    await expect(operator.getByRole('menu', { name: 'Settings' })).not.toBeVisible()
    await expect(settings).toBeFocused()

    await mainNav.getByRole('button', { name: 'Media/Library' }).click()
    await operator.getByRole('menuitem', { name: 'Backgrounds' }).click()
    await expect(operator.getByRole('heading', { name: 'Backgrounds' })).toBeVisible()
  } finally {
    await closeApp(app, userDataDir)
  }
})

// e2e isolation guard: the dev build used to ignore --user-data-dir and write
// into <cwd>/.worshipflow-dev, so every run shared one database.
test('each launch gets its own throwaway profile', async () => {
  const { app, userDataDir, profileDir } = await launchApp()
  try {
    await operatorWindow(app)
    const userData = await app.evaluate(({ app: a }) => a.getPath('userData'))
    expect(userData).toBe(profileDir)
  } finally {
    await closeApp(app, userDataDir)
  }
})
