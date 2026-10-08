import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// QA B9-N8 (pinned against SOURCE — Output.tsx is a React component and this
// Vitest config has no DOM; end to end: tests/e2e/qa-retest9.spec.ts).
// After the B8-N2 crossfade rework the outgoing words dissolved over an
// incoming picture for ~0.4 s; d98401e took them off in the first frame.
const out = readFileSync(join(__dirname, 'Output.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('QA B9-N8: text to media clears the words at once', () => {
  it('no words and a new background empties both lyric layers (no crossfade)', () => {
    expect(out).toMatch(/const toMedia = s\.mode === 'lyrics' && !s\.line && \(s\.background \?\? null\) !== lastBackground\n\s+lastBackground = s\.background \?\? null/)
    expect(out).toMatch(/toMedia\n\s+\? \(prev\.a \|\| prev\.b \? \{ front: prev\.front, a: '', b: '' \} : prev\)/)
  })
  it('keeps B8-N2: the same words do not restart the crossfade', () => {
    expect(out).toMatch(/: \(prev\.front === 0 \? prev\.a : prev\.b\) === s\.line\n\s+\? prev/)
  })
})
