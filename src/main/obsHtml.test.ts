import { describe, it, expect } from 'vitest'
import { OBS_HTML } from './obsHtml'

// Runs the overlay page's real <script> against minimal fake elements, so the
// regression covers the shipped code rather than a copy of it.
class El {
  className = ''
  textContent = ''
  attrs: Record<string, string> = {}
  children: El[] = []
  style: Record<string, string> = {}
  scrollWidth = 100
  clientWidth = 1000
  getAttribute(k: string): string | null { return this.attrs[k] ?? null }
  setAttribute(k: string, v: string): void { this.attrs[k] = v }
  removeAttribute(k: string): void { delete this.attrs[k] }
  appendChild(c: El): void { this.children.push(c) }
}

function loadOverlay(): { apply: (msg: unknown) => void; els: Record<string, El> } {
  const script = OBS_HTML.slice(OBS_HTML.indexOf('<script>') + 8, OBS_HTML.indexOf('</script>'))
  const els: Record<string, El> = { box: new El(), text: new El(), title: new El(), ticker: new El() }
  const document = { getElementById: (id: string) => els[id], createElement: () => new El() }
  class FakeWS { onclose: unknown; onmessage: unknown }
  const run = new Function('document', 'WebSocket', 'location', 'setTimeout', `${script}; return apply`)
  const apply = run(document, FakeWS, { host: 'x' }, () => 0) as (msg: unknown) => void
  return { apply, els }
}

const live = { mode: 'lyrics', line: 'Amazing grace, how sweet the sound', songTitle: 'Amazing Grace', textHidden: false, rehearsal: false, overlayTicker: null }

describe('OBS overlay', () => {
  it('shows live lyrics normally', () => {
    const { apply, els } = loadOverlay()
    apply({ type: 'state', state: live })
    expect(els.box.className).toBe('on')
    expect(els.text.textContent).toContain('Amazing grace')
  })

  it('QA B5: shows nothing while Rehearsal mode is on (lyrics or lower third)', () => {
    const { apply, els } = loadOverlay()
    apply({ type: 'state', state: live })
    apply({ type: 'state', state: { ...live, rehearsal: true, overlayTicker: 'Welcome!' } })
    expect(els.box.className).toBe('')
    expect(els.ticker.className).toBe('')
  })

  it('an untitled text slide shows as lyrics with no title (QA A-C1 companion)', () => {
    const { apply, els } = loadOverlay()
    apply({ type: 'state', state: { ...live, songTitle: '', line: 'Welcome to Snow Hill Church' } })
    expect(els.box.className).toBe('on')
    expect(els.title.className).toBe('')
  })

  it('a ticker announcement goes to the ticker strip, not the lyric box', () => {
    const { apply, els } = loadOverlay()
    apply({ type: 'state', state: { ...live, isTicker: true, songTitle: 'Potluck', line: 'Potluck after service' } })
    expect(els.box.className).toBe('')
    expect(els.ticker.className).toBe('on')
    expect(els.ticker.textContent).toBe('Potluck after service')
  })

  it('QA B-15: a lower third too long for the strip scrolls instead of being cut off', () => {
    const { apply, els } = loadOverlay()
    els.ticker.scrollWidth = 1881
    els.ticker.clientWidth = 1280
    apply({ type: 'state', state: { ...live, overlayTicker: 'x'.repeat(160) } })
    expect(els.ticker.children[0]?.className).toBe('track')
  })
})
