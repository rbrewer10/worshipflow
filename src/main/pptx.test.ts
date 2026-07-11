import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parsePptx, parsePptxService } from './pptx'

// pptx.ts's XML-parsing helpers (slideText, decodeEntities, titleFromFile) are not exported,
// and the module's only entry points are async functions that operate on a real zip buffer
// (via JSZip). Rather than skip, we build a minimal synthetic .pptx-shaped zip in memory —
// JSZip is already a real project dependency, so this is a genuine round-trip through the
// same zip library the source uses, not a mock. This exercises slideText()/decodeEntities()
// indirectly through the public parsePptx()/parsePptxService() API.

// Build a slideN.xml payload matching the shape the regexes in pptx.ts expect:
// paragraphs <a:p>, text runs <a:t>, and optional explicit breaks <a:br/>.
function slideXml(paragraphs: string[]): string {
  const body = paragraphs
    .map(
      (p) =>
        `<a:p><a:r><a:rPr lang="en-US"/><a:t>${p}</a:t></a:r></a:p>`
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
}

async function buildPptx(slides: string[][]): Promise<Buffer> {
  const zip = new JSZip()
  slides.forEach((paragraphs, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(paragraphs))
  })
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  return buf
}

describe('parsePptx', () => {
  it('extracts one section of lyrics per slide, one line per paragraph', async () => {
    const buffer = await buildPptx([
      ['Amazing grace', 'how sweet the sound'],
      ['That saved a wretch', 'like me']
    ])
    const result = await parsePptx('C:\\songs\\Amazing Grace.pptx', buffer)
    expect(result.slides).toEqual([
      'Amazing grace\nhow sweet the sound',
      'That saved a wretch\nlike me'
    ])
  })

  it('derives the title from the filename, replacing underscores and stripping the extension', async () => {
    const buffer = await buildPptx([['Line one']])
    const result = await parsePptx('C:\\songs\\Amazing_Grace_Hymn.pptx', buffer)
    expect(result.title).toBe('Amazing Grace Hymn')
    expect(result.fileName).toBe('Amazing_Grace_Hymn.pptx')
  })

  it('decodes XML entities in slide text', async () => {
    const buffer = await buildPptx([['Rock &amp; Redeemer &lt;3']])
    const result = await parsePptx('song.pptx', buffer)
    expect(result.slides[0]).toBe('Rock & Redeemer <3')
  })

  it('sorts slides numerically, not lexicographically (slide2 before slide10)', async () => {
    const zip = new JSZip()
    // Insert out of order and with a two-digit slide number to catch lexicographic sort bugs.
    zip.file('ppt/slides/slide10.xml', slideXml(['Tenth']))
    zip.file('ppt/slides/slide2.xml', slideXml(['Second']))
    zip.file('ppt/slides/slide1.xml', slideXml(['First']))
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const result = await parsePptx('song.pptx', buffer)
    expect(result.slides).toEqual(['First', 'Second', 'Tenth'])
  })

  it('skips slides with no extractable text', async () => {
    const buffer = await buildPptx([['Real lyrics here'], []])
    const result = await parsePptx('song.pptx', buffer)
    expect(result.slides).toEqual(['Real lyrics here'])
  })

  it('honors explicit <a:br/> line breaks within a paragraph', async () => {
    const zip = new JSZip()
    const xml = `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Line A</a:t></a:r><a:br/><a:r><a:t>Line B</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
    zip.file('ppt/slides/slide1.xml', xml)
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const result = await parsePptx('song.pptx', buffer)
    expect(result.slides).toEqual(['Line A\nLine B'])
  })
})

describe('parsePptxService', () => {
  it('returns one entry per slide with text and a null background when no image is embedded', async () => {
    const buffer = await buildPptx([['Welcome to service'], ['Announcement text']])
    const result = await parsePptxService(buffer, 'C:\\unused-media-dir', Date.now())
    expect(result).toEqual([
      { text: 'Welcome to service', background: null },
      { text: 'Announcement text', background: null }
    ])
  })

  it('omits slides with neither text nor a background image', async () => {
    const buffer = await buildPptx([['Has text'], []])
    const result = await parsePptxService(buffer, 'C:\\unused-media-dir', Date.now())
    expect(result).toEqual([{ text: 'Has text', background: null }])
  })
})
