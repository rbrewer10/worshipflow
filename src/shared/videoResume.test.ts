import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { resumeTime, isVideoSnapshot, READ_OUTPUT_VIDEO_JS } from './videoResume'

// QA B12-N5: Reload projector restarted a playing video from 0.
describe('video resume across Reload projector', () => {
  it('a playing video continues where it would be now; a paused one stays put', () => {
    const r = { src: '/m/loop.mp4', time: 4.96, paused: false, capturedAt: 1000 }
    expect(resumeTime(r, 1800, 60)).toBeCloseTo(5.76, 5)
    expect(resumeTime({ ...r, paused: true }, 9000, 60)).toBe(4.96)
    // the background loops: past the end wraps round
    expect(resumeTime({ ...r, time: 9.5 }, 2000, 10)).toBeCloseTo(0.5, 5)
    expect(resumeTime(r, 1000, NaN)).toBe(4.96)
  })
  it('only well-formed snapshots are used', () => {
    expect(isVideoSnapshot({ src: '/m/a.mp4', time: 3, paused: false })).toBe(true)
    expect(isVideoSnapshot({ src: '', time: 3, paused: false })).toBe(false)
    expect(isVideoSnapshot({ src: '/m/a.mp4', time: NaN, paused: false })).toBe(false)
    expect(isVideoSnapshot(null)).toBe(false)
    expect(READ_OUTPUT_VIDEO_JS).toMatch(/video\[data-wf-bg\]/)
  })
  it('wiring: main reads the video before reloading and sends it after load; Output marks, seeks and pauses', () => {
    const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
    const fn = main.slice(main.indexOf('async function reloadProjectorWindows('), main.indexOf("ipcMain.handle('wf:output:reload'"))
    expect(fn.indexOf('readOutputVideo(w)')).toBeGreaterThan(-1)
    expect(fn.indexOf('readOutputVideo(w)')).toBeLessThan(fn.indexOf('reloadIgnoringCache()'))
    expect(fn).toMatch(/once\('did-finish-load'[\s\S]*send\('wf:output:resumeVideo'/)
    const out = readFileSync(join(__dirname, '..', 'renderer', 'src', 'Output.tsx'), 'utf8')
    expect(out).toMatch(/data-wf-bg/)
    expect(out).toMatch(/data-wf-src=\{bgSrc\}/)
    expect(out).toMatch(/onLoadedMetadata=\{\(e\) => applyVideoResume\(e\.currentTarget, bgSrc\)\}/)
    expect(out).toMatch(/onOutputResumeVideo/)
  })
})
