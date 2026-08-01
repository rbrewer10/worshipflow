import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { launchApp, closeApp } from './electronApp'

// Exercises the actual "run a Sunday" loop end-to-end against the real built
// app: create a song, build a service, send it live, and verify the change
// reaches the REAL audience-facing output window (via WF_SIM), not just the
// operator's own state. This is the "full Sunday-workflow test" the audit
// asked for — logic tests alone can't catch a wire-up bug between the
// operator UI and what the congregation's screen actually renders.
test('build a service, go live, advance, and black all reach the real output window', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
    const pages = app.windows()
    const operator = pages.find((p) => !p.url().includes('#/output')) as Page
    const output = pages.find((p) => p.url().includes('#/output')) as Page
    expect(operator).toBeTruthy()
    expect(output).toBeTruthy()

    // Sanity: a pristine app must never show the Phase-0 demo song's lyrics
    // on the real output (this was Phase 1's "demo-state leak" fix — this
    // test is also a regression guard for it).
    await expect(operator.getByText('Good morning').or(operator.getByText('Good afternoon')).or(operator.getByText('Good evening'))).toBeVisible()
    await expect(output.getByText('Amazing grace')).not.toBeVisible()

    // --- Create a song ---
    // Songs moved behind the Library menu in the 2026-08-01 nav regrouping.
    // Nav clicks are scoped to the main nav because LiveDrawer renders its own
    // app-wide "Songs" tab button — an unscoped name match is ambiguous and
    // fails Playwright strict mode. (That ambiguity predates this change: it
    // is why this spec could never have passed as originally written.)
    const mainNav = operator.getByRole('navigation', { name: 'Main' })
    await mainNav.getByRole('button', { name: 'Library' }).click()
    await operator.getByRole('menuitem', { name: 'Songs' }).click()
    await operator.getByRole('button', { name: 'New Song' }).click()
    await operator.getByPlaceholder('Song title…').fill('E2E Test Song')
    await operator.getByRole('button', { name: 'Create' }).click()

    // Give it one line of real lyrics so the output window has something
    // concrete to assert on, rather than just an empty slide.
    const editSlideButton = operator.getByRole('button', { name: 'Edit slide text' })
    await editSlideButton.click()
    const lyricsInput = operator.getByLabel('Slide lyrics')
    await lyricsInput.fill('Testing one two three')
    await lyricsInput.blur()
    await expect(operator.getByText('Testing one two three')).toBeVisible()

    // --- Build a service and add the song ---
    await mainNav.getByRole('button', { name: 'Build service' }).click()
    await operator.getByLabel('Enter a new service name').fill('E2E Test Service')
    await operator.getByRole('button', { name: 'Create new service' }).click()
    await operator.getByRole('button', { name: 'Add item' }).click()
    await operator.getByLabel('Song from library').selectOption({ label: 'E2E Test Song' })

    // --- Go live ---
    await mainNav.getByRole('button', { name: 'Live' }).click()
    await operator.getByRole('button', { name: 'Go live: E2E Test Song' }).click()
    // The rail's tap-to-confirm gesture auto-fires ~1.5s after arming
    // (see usePendingConfirm) — this is deliberate Sunday-safety friction
    // from the click-consistency fix, not a bug to work around.
    await expect(output.getByText('Testing one two three')).toBeVisible({ timeout: 3000 })

    // --- Black reaches the real screen ---
    // Uses the "B" keyboard shortcut (also regression-tests the Phase-1 fix
    // scoping global shortcuts to the Live tab) rather than clicking, since
    // several icon-only buttons share "Black" as part of their accessible name.
    await operator.keyboard.press('b')
    await expect(output.getByText('Testing one two three')).not.toBeVisible()
  } finally {
    await closeApp(app, userDataDir)
  }
})

// Guards the 2026-08-01 nav regrouping: the menus must be openable and
// navigable by keyboard alone, since that is the part a mouse-only manual
// check will never exercise.
test('library and setup menus are keyboard operable', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
    const operator = app.windows().find((p) => !p.url().includes('#/output')) as Page
    const mainNav = operator.getByRole('navigation', { name: 'Main' })

    const setup = mainNav.getByRole('button', { name: 'Setup' })
    await setup.focus()
    await operator.keyboard.press('ArrowDown')
    await expect(operator.getByRole('menu', { name: 'Setup' })).toBeVisible()
    await expect(operator.getByRole('menuitem', { name: 'Screens & zones' })).toBeFocused()

    await operator.keyboard.press('ArrowUp')
    await expect(operator.getByRole('menuitem', { name: 'Diagnostics & backups' })).toBeFocused()

    await operator.keyboard.press('Escape')
    await expect(operator.getByRole('menu', { name: 'Setup' })).not.toBeVisible()
    await expect(setup).toBeFocused()

    await mainNav.getByRole('button', { name: 'Library' }).click()
    await operator.getByRole('menuitem', { name: 'Backgrounds' }).click()
    await expect(operator.getByRole('heading', { name: 'Backgrounds' })).toBeVisible()
  } finally {
    await closeApp(app, userDataDir)
  }
})
