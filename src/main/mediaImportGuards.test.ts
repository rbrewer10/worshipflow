import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// QA B2-N1 source guards: every picker that sets a projector picture/video
// (image items, song backgrounds) must go through wf.mediaPick, which copies
// the file into imported-media — never store the raw dialog path again.
const read = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf-8')

describe('media pickers copy into the app folder (B2-N1)', () => {
  for (const file of ['renderer/src/ServiceEditor.tsx', 'renderer/src/editors/ImageEditor.tsx', 'renderer/src/CardEditPanel.tsx', 'renderer/src/SongLibrary.tsx']) {
    it(`${file} uses mediaPick, not dialogOpenFile`, () => {
      const src = read(file)
      expect(src).toMatch(/wf\.mediaPick\(\)/)
      expect(src).not.toMatch(/dialogOpenFile\(\)/)
    })
  }
  it('main copies importImages slides and checks media on Go Live', () => {
    const src = read('main/index.ts')
    expect(src).toMatch(/ipcMain\.handle\('wf:media:pick'[\s\S]{0,1200}importMediaFile\(/)
    expect(src).toMatch(/wf:service:importImages[\s\S]{0,1500}importMediaFile\(f, mediaRoots\(\)\)/)
    expect(src).toMatch(/item\.type === 'image'\) \{[\s\S]{0,400}mediaProblemFor\(p/)
    expect(src).toMatch(/void migrateOutsideMedia\('startup'\)/)
  })
})
