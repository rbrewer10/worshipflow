// Auto-detect song section labels based on lyrics patterns
import type { SectionKind } from '../../shared/types'

interface SectionAnalysis {
  ordinal: number
  detectedKind: SectionKind
  confidence: number
  reason: string
}

export function analyzeAndLabelSections(text: string): SectionAnalysis[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)

  // Track which lyrics patterns we've seen
  const patterns = new Map<string, number>() // normalized lyrics -> count
  const analyses: SectionAnalysis[] = []

  // First pass: count unique lyric patterns to identify repeating sections
  blocks.forEach((block) => {
    const normalized = normalizeLyrics(block)
    patterns.set(normalized, (patterns.get(normalized) || 0) + 1)
  })

  // Second pass: analyze each block and assign labels
  blocks.forEach((block, ordinal) => {
    const firstLine = block.split('\n')[0].toLowerCase().trim()
    const normalized = normalizeLyrics(block)
    const repeatCount = patterns.get(normalized) || 1
    const isFirstBlock = ordinal === 0
    const isLastBlock = ordinal === blocks.length - 1
    const blockLength = block.split('\n').length

    let detectedKind: SectionKind = 'verse'
    let confidence = 0.5
    let reason = 'default'

    // Check for explicit markers in first line
    const markerMatch = checkExplicitMarker(firstLine)
    if (markerMatch) {
      detectedKind = markerMatch.kind
      confidence = 0.95
      reason = `explicit: "${firstLine}"`
    }
    // Detect by position heuristics
    else if (isFirstBlock && blockLength <= 4) {
      detectedKind = 'intro'
      confidence = 0.8
      reason = 'short opening section'
    } else if (isLastBlock && blockLength <= 4) {
      detectedKind = 'ending'
      confidence = 0.8
      reason = 'short closing section'
    }
    // Detect by repetition (chorus usually repeats, verses don't)
    else if (repeatCount >= 2) {
      detectedKind = 'chorus'
      confidence = 0.85
      reason = `appears ${repeatCount}x (repeated pattern)`
    }
    // Detect by position after chorus
    else if (ordinal > 0 && analyses[ordinal - 1]?.detectedKind === 'chorus') {
      detectedKind = 'verse'
      confidence = 0.6
      reason = 'follows chorus'
    }
    // Detect bridge by position (usually 2/3 through song)
    else if (ordinal > blocks.length * 0.5 && ordinal < blocks.length * 0.85 && blockLength >= 4) {
      // Only if we haven't detected chorus or other special sections nearby
      const nearbyKinds = [
        analyses[ordinal - 1]?.detectedKind,
        analyses[ordinal - 2]?.detectedKind
      ]
      if (!nearbyKinds.includes('chorus')) {
        detectedKind = 'bridge'
        confidence = 0.6
        reason = 'mid-to-late song position'
      }
    }
    // Default to verse
    else {
      detectedKind = 'verse'
      confidence = 0.4
      reason = 'no distinguishing features'
    }

    analyses.push({ ordinal, detectedKind, confidence, reason })
  })

  return analyses
}

function checkExplicitMarker(
  firstLine: string
): { kind: SectionKind; label: string } | null {
  const KNOWN: SectionKind[] = ['verse', 'chorus', 'bridge', 'tag', 'intro', 'ending']
  const word = firstLine.replace(/\s*\d+\s*$/, '')

  for (const kind of KNOWN) {
    if (word === kind) {
      return { kind, label: firstLine }
    }
  }

  // Check for common abbreviations or variations
  const abbrevs: Record<string, SectionKind> = {
    v: 'verse',
    c: 'chorus',
    ch: 'chorus',
    b: 'bridge',
    pre: 'verse', // pre-chorus → treat as verse for now
    i: 'intro',
    e: 'ending',
    out: 'ending',
    outro: 'ending',
    t: 'tag'
  }

  const abbreviated = word.replace(/\W/g, '')
  return abbrevs[abbreviated] ? { kind: abbrevs[abbreviated], label: firstLine } : null
}

function normalizeLyrics(block: string): string {
  // Normalize for pattern matching (ignore case, extra whitespace, punctuation)
  return block
    .toLowerCase()
    .split('\n')
    .map((line) => line.replace(/\W/g, '').slice(0, 20))
    .join('|')
}

// Apply detected labels to text, showing user the changes.
//
// Under the Reflow model, a blank line no longer means "new section" — it's
// only a slide break within whichever section the nearest preceding label
// line opened. So a blank-line-separated block with no label of its own,
// immediately following an already-labeled block, is a continuation slide of
// that same section, not a fresh stanza that itself needs labeling.
// Prepending a label to it here would fragment an already-correctly-labeled
// section into two once parsed back on save (see the 2026-08-05 design
// spec's parsing rule). Once inside a labeled section, every following
// unlabeled block is left untouched until the next real label — this can't
// distinguish "still the same section" from "a genuinely new but
// accidentally unlabeled verse" (both look identical in raw text), so a
// truly new verse in that position won't get an auto-suggested label; the
// operator can label it directly, which is the normal Reflow workflow
// anyway. This only affects text that already contains at least one real
// label — a fully fresh, entirely unlabeled paste behaves exactly as before.
export function previewAutoLabels(text: string, analyses: SectionAnalysis[]): string {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)

  let inLabeledSection = false
  return blocks
    .map((block, idx) => {
      const analysis = analyses[idx]
      if (!analysis) return block

      const firstLine = block.split('\n')[0]
      const alreadyHasLabel = isExplicitLabel(firstLine)

      if (alreadyHasLabel) {
        inLabeledSection = true
        return block
      }

      if (inLabeledSection) {
        return block
      }

      const labelText = formatSectionLabel(analysis.detectedKind)
      return `${labelText}\n${block}`
    })
    .join('\n\n')
}

function isExplicitLabel(line: string): boolean {
  const KNOWN: SectionKind[] = ['verse', 'chorus', 'bridge', 'tag', 'intro', 'ending']
  const word = line.toLowerCase().replace(/\s*\d+\s*$/, '')
  return KNOWN.includes(word as SectionKind) && line.length <= 14
}

function formatSectionLabel(kind: SectionKind): string {
  const formatted = kind.charAt(0).toUpperCase() + kind.slice(1)
  return formatted
}
