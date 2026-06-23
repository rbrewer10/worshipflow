// Extract song lyrics from PowerPoint (.pptx) files. A .pptx is a zip of XML;
// each slide's text lives in <a:t> runs grouped by <a:p> paragraphs. We treat
// each slide as one section (verse) and each paragraph as a line.
import JSZip from 'jszip'
import { basename, join } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import type { ParsedPptxSong } from '../shared/types'

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&') // last, so we don't double-decode
}

// Pull the text out of one slide's XML, preserving paragraph + in-line breaks.
function slideText(xml: string): string {
  const lines: string[] = []
  const paragraphs = xml.match(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g) ?? []
  for (const p of paragraphs) {
    let s = p
      // <a:br/> is an explicit line break that can sit between text runs.
      .replace(/<a:br\s*\/?>/g, '\n')
      // Inline each <a:t> run's text…
      .replace(/<a:t>([\s\S]*?)<\/a:t>/g, (_, t) => t)
      // …then strip every other tag (the inlined text is still entity-encoded,
      // so it contains no raw '<' to confuse this).
      .replace(/<[^>]+>/g, '')
    s = decodeEntities(s)
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .trim()
    lines.push(s)
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Title from filename: drop extension, tidy separators.
function titleFromFile(filePath: string): string {
  return basename(filePath)
    .replace(/\.ppt[xm]?$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function parsePptx(filePath: string, buffer: Buffer): Promise<ParsedPptxSong> {
  const zip = await JSZip.loadAsync(buffer)
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return na - nb
    })

  const slides: string[] = []
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string')
    const text = slideText(xml)
    if (text) slides.push(text)
  }

  return { fileName: basename(filePath), title: titleFromFile(filePath), slides }
}

// --- Service import: each slide → text + (best-effort) background image ---

export interface ParsedServiceSlide {
  text: string
  background: string | null // saved image path, if the slide carried one
}

function sortedSlideNames(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return na - nb
    })
}

// Find a slide's background/full-slide image (if any) and extract it to mediaDir.
async function extractSlideBackground(
  zip: JSZip,
  slideName: string,
  slideXml: string,
  mediaDir: string,
  index: number,
  stamp: number
): Promise<string | null> {
  const relName = slideName.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')
  const relFile = zip.files[relName]
  if (!relFile) return null
  const relXml = await relFile.async('string')
  const rels = new Map<string, string>()
  for (const m of relXml.matchAll(/Id="(rId\d+)"[^>]*?Target="([^"]+)"/g)) rels.set(m[1], m[2])

  // First embedded image referenced by the slide (background fill or a picture).
  for (const m of slideXml.matchAll(/r:embed="(rId\d+)"/g)) {
    const target = rels.get(m[1])
    if (!target || !/\.(png|jpe?g|gif|bmp|webp)$/i.test(target)) continue
    const mediaPath = ('ppt/' + target.replace(/^\.\.\//, '')).replace(/\/\.\.\//g, '/')
    const mediaFile = zip.files[mediaPath]
    if (!mediaFile) continue
    const ext = mediaPath.split('.').pop() ?? 'png'
    if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true })
    const outPath = join(mediaDir, `pptx-${stamp}-${index}.${ext}`)
    writeFileSync(outPath, await mediaFile.async('nodebuffer'))
    return outPath
  }
  return null
}

export async function parsePptxService(
  buffer: Buffer,
  mediaDir: string,
  stamp: number
): Promise<ParsedServiceSlide[]> {
  const zip = await JSZip.loadAsync(buffer)
  const names = sortedSlideNames(zip)
  const out: ParsedServiceSlide[] = []
  let i = 0
  for (const name of names) {
    const xml = await zip.files[name].async('string')
    const text = slideText(xml)
    const background = await extractSlideBackground(zip, name, xml, mediaDir, i, stamp)
    if (text || background) out.push({ text, background })
    i++
  }
  return out
}
