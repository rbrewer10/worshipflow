import type { SongSection } from './types'
import { parseReflowText } from './reflowText'

export interface ImportedSong {
  title: string
  author?: string
  ccli?: string
  copyright?: string
  sections: SongSection[]
  source: 'chordpro' | 'ccli' | 'plain'
}

const DIRECTIVE = /^\s*\{([^:}]+)(?::\s*([^}]*))?\}\s*$/i

function metaKey(name: string): 'title' | 'author' | 'ccli' | 'copyright' | null {
  const n = name.trim().toLowerCase()
  if (n === 'title' || n === 't') return 'title'
  if (n === 'artist' || n === 'author' || n === 'subtitle' || n === 'st' || n === 'composer') return 'author'
  if (n === 'ccli' || n === 'ccli_song' || n === 'song_number') return 'ccli'
  if (n === 'copyright' || n === 'c') return 'copyright'
  return null
}

function sectionLabelFromDirective(name: string, arg: string | undefined): string | null {
  const n = name.trim().toLowerCase()
  if (n === 'start_of_chorus' || n === 'soc' || n === 'chorus') return arg?.trim() || 'Chorus'
  if (n === 'start_of_verse' || n === 'sov' || n === 'verse') return arg?.trim() || 'Verse'
  if (n === 'start_of_bridge' || n === 'sob' || n === 'bridge') return arg?.trim() || 'Bridge'
  if (n === 'start_of_tag' || n === 'tag') return arg?.trim() || 'Tag'
  if (n === 'start_of_intro' || n === 'intro') return arg?.trim() || 'Intro'
  if (n === 'end_of_chorus' || n === 'eoc' || n === 'end_of_verse' || n === 'eov' || n === 'end_of_bridge' || n === 'eob') {
    return null
  }
  return null
}

function looksChordPro(raw: string): boolean {
  return /^\s*\{(?:title|t|artist|soc|sov|start_of_)/im.test(raw) || /\[[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*\]/.test(raw)
}

function looksCcli(raw: string): boolean {
  return /CCLI\s+Song\s*#/i.test(raw) || /©/.test(raw)
}

function parseChordPro(raw: string): ImportedSong {
  const meta: { title?: string; author?: string; ccli?: string; copyright?: string } = {}
  const body: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(DIRECTIVE)
    if (m) {
      const key = metaKey(m[1])
      if (key && m[2]?.trim()) {
        const val = m[2].trim()
        if (key === 'author' && meta.author) meta.author = `${meta.author} | ${val}`
        else meta[key] = val
        continue
      }
      const label = sectionLabelFromDirective(m[1], m[2])
      if (label) {
        if (body.length && body[body.length - 1].trim() !== '') body.push('')
        body.push(label)
      }
      continue
    }
    body.push(line)
  }
  const text = body.join('\n').trim()
  const sections = parseReflowText(text || (meta.title ?? 'Untitled'))
  return {
    title: meta.title || firstLyricTitle(text) || 'Untitled',
    author: meta.author,
    ccli: meta.ccli,
    copyright: meta.copyright,
    sections,
    source: 'chordpro',
  }
}

function parseCcli(raw: string): ImportedSong {
  const lines = raw.split(/\r?\n/)
  let title = ''
  let author: string | undefined
  let ccli: string | undefined
  let copyright: string | undefined
  const body: string[] = []
  let startedLyrics = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      if (startedLyrics) body.push('')
      continue
    }
    const ccliMatch = line.match(/CCLI\s+Song\s*#\s*([\d]+)/i)
    if (ccliMatch) { ccli = ccliMatch[1]; continue }
    if (/^CCLI\s+(Song|License)/i.test(line)) continue
    if (/^©/.test(line) || /^Copyright/i.test(line)) { copyright = line.replace(/^©\s*/, ''); continue }
    if (/^For use solely/i.test(line) || /^www\.ccli/i.test(line)) continue
    if (!startedLyrics) {
      if (!title) { title = line; continue }
      if (!author && !/^(verse|chorus|bridge|tag|intro|ending|pre-?chorus)\b/i.test(line)) {
        author = line.replace(/\s*\|\s*/g, ' | ')
        continue
      }
      startedLyrics = true
    }
    body.push(rawLine)
    startedLyrics = true
  }

  const text = body.join('\n').trim()
  return {
    title: title || firstLyricTitle(text) || 'Untitled',
    author,
    ccli,
    copyright,
    sections: parseReflowText(text || title || 'Untitled'),
    source: 'ccli',
  }
}

function firstLyricTitle(text: string): string | null {
  for (const line of text.split('\n')) {
    const t = line.replace(/\[[^\]]+\]/g, '').trim()
    if (t && !/^(verse|chorus|bridge|tag|intro|ending)\b/i.test(t)) return t.slice(0, 80)
  }
  return null
}

export function importLyrics(raw: string): ImportedSong | null {
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) return null
  if (looksChordPro(text)) return parseChordPro(text)
  if (looksCcli(text)) return parseCcli(text)
  const sections = parseReflowText(text)
  return {
    title: firstLyricTitle(text) || 'Untitled',
    sections,
    source: 'plain',
  }
}
