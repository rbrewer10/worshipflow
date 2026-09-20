import type { SongSection } from './types'
import { parseReflowText } from './reflowText'

export interface ImportedSong {
  title: string
  author?: string
  ccli?: string
  copyright?: string
  sections: SongSection[]
  source: 'chordpro' | 'ccli' | 'plain' | 'usr'
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

function looksUsr(text: string): boolean {
  return /^\s*\[File\]/im.test(text)
    || /^\s*\[S\s+[A-Z]?\d+\]/m.test(text)
    || (/^Title=/m.test(text) && /^\[[A-Z]{1,3}\d*\]/m.test(text))
}

function usrKind(tag: string): { kind: SongSection['kind']; label: string } {
  const t = tag.toUpperCase()
  if (t.startsWith('V')) return { kind: 'verse', label: `Verse ${t.slice(1) || '1'}` }
  if (t.startsWith('C')) return { kind: 'chorus', label: t.length > 1 ? `Chorus ${t.slice(1)}` : 'Chorus' }
  if (t.startsWith('B')) return { kind: 'bridge', label: t.length > 1 ? `Bridge ${t.slice(1)}` : 'Bridge' }
  if (t.startsWith('T')) return { kind: 'tag', label: 'Tag' }
  if (t.startsWith('P')) return { kind: 'section', label: 'Pre-Chorus' }
  if (t.startsWith('I')) return { kind: 'intro', label: 'Intro' }
  if (t.startsWith('E')) return { kind: 'ending', label: 'Ending' }
  return { kind: 'section', label: tag }
}

function parseUsr(raw: string): ImportedSong {
  const meta: { title?: string; author?: string; ccli?: string; copyright?: string } = {}
  const sections: SongSection[] = []
  let current: { kind: SongSection['kind']; label: string; lines: string[] } | null = null

  const flush = (): void => {
    if (!current) return
    const lyrics = current.lines.join('\n').trim()
    if (lyrics) {
      sections.push({
        kind: current.kind,
        label: current.label,
        ordinal: sections.length,
        lyrics,
      })
    }
    current = null
  }

  for (const rawLine of raw.split(/\r?\n/)) {
    const header = rawLine.trim().match(/^\[([^\]]+)\]$/)
    if (header) {
      const tag = header[1].trim()
      if (/^(File|S\s)/i.test(tag)) { flush(); continue }
      flush()
      current = { ...usrKind(tag), lines: [] }
      continue
    }
    const kv = rawLine.match(/^(Title|Author|Copyright|CCLI|Artist)\s*=\s*(.*)$/i)
    if (kv && !current) {
      const key = kv[1].toLowerCase()
      const val = kv[2].trim()
      if (!val) continue
      if (key === 'title') meta.title = val
      else if (key === 'author' || key === 'artist') meta.author = meta.author ? `${meta.author} | ${val}` : val.replace(/\|/g, ' | ')
      else if (key === 'ccli') meta.ccli = val.replace(/\D/g, '') || val
      else if (key === 'copyright') meta.copyright = val
      continue
    }
    if (current) current.lines.push(rawLine.replace(/\s*\|\s*$/, ''))
  }
  flush()

  if (sections.length === 0) {
    return {
      title: meta.title || 'Untitled',
      author: meta.author,
      ccli: meta.ccli,
      copyright: meta.copyright,
      sections: parseReflowText(raw),
      source: 'usr',
    }
  }

  return {
    title: meta.title || firstLyricTitle(sections[0].lyrics) || 'Untitled',
    author: meta.author,
    ccli: meta.ccli,
    copyright: meta.copyright,
    sections,
    source: 'usr',
  }
}

export function importLyrics(raw: string): ImportedSong | null {
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) return null
  if (looksUsr(text)) return parseUsr(text)
  if (looksChordPro(text)) return parseChordPro(text)
  if (looksCcli(text)) return parseCcli(text)
  const sections = parseReflowText(text)
  return {
    title: firstLyricTitle(text) || 'Untitled',
    sections,
    source: 'plain',
  }
}

export function decodeSongFileBytes(buf: Uint8Array): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf)
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf)
  }
  return new TextDecoder('utf-8').decode(buf)
}
