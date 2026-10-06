import { describe, it, expect } from 'vitest'
import { zoneHtmlFor } from './zoneHtml'

// The stage page is a self-contained HTML string served to the stage TV. The
// layout is verified in a real browser by the QA stage harness / e2e suite;
// these pin the specific root-cause fixes so they can't silently regress.
const html = zoneHtmlFor(4, 'tok', 'room')!

describe('Stage Monitor fit (QA A-H1)', () => {
  it("#current uses flex-basis 0 so its box doesn't depend on the verse's own size", () => {
    expect(html).toMatch(/#current\{flex:1 1 0;min-height:0/)
    expect(html).not.toContain('#current{flex:1 1 auto')
  })
  it('lays out and fits the Next preview BEFORE measuring #current', () => {
    const nextFit = html.indexOf('fitText(nextLine,')
    const curFit = html.indexOf('fitText(current.firstChild,fs,minFs,')
    expect(nextFit).toBeGreaterThan(-1)
    expect(curFit).toBeGreaterThan(nextFit)
  })
  it('Next preview box excludes its padding', () => {
    expect(html).toContain('nextSection.clientHeight-parseFloat(ncs.paddingTop)-parseFloat(ncs.paddingBottom)')
  })
  it('re-renders on resize', () => {
    expect(html).toContain("window.addEventListener('resize'")
  })
  it("reserves the ticker's real height, not a fixed 5.5vh", () => {
    expect(html).not.toContain("'5.5vh'")
    expect(html).toContain("ov.offsetHeight+'px'")
  })
  it('caps the stage message', () => {
    expect(html).toMatch(/#stagemsg\{[^}]*max-height:20vh/)
  })
  it('shows the next item title on the last slide, and hides an empty Next box', () => {
    expect(html).toContain('state.nextItemTitle')
    expect(html).toContain("nextLabel.textContent='Up next'")
    expect(html).toContain('showNext(!!nextText)')
  })
  it('QA A-N5: the lower-third band is capped at 10vh and its text shrinks to fit', () => {
    expect(html).toContain("el.style.maxHeight='10vh'")
    expect(html).toMatch(/oSize>0\.9/)
  })
  it('QA A-N5: Next is dropped when the verse would get less than 40% of the screen', () => {
    const next = html.indexOf('fitText(nextLine,')
    const drop = html.indexOf('if(current.clientHeight<window.innerHeight*0.4) showNext(false)')
    expect(drop).toBeGreaterThan(next)
    expect(html.indexOf('fitText(current.firstChild,fs,minFs,')).toBeGreaterThan(drop)
  })
  it('the page script still parses', () => {
    const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('<\/script>'))
    expect(() => new Function(script)).not.toThrow()
  })
  it('QA A2-N4: the sermon card fits its content box and flags a clipped speaker line', () => {
    expect(html).toContain('var sAvailH=current.clientHeight-parseFloat(scs.paddingTop)-parseFloat(scs.paddingBottom)')
    expect(html).toContain('fitText(sWrap.firstChild,7,3,Math.min(sAvailW,current.clientWidth-window.innerWidth*0.10),sAvailH-subH)')
    expect(html).toContain('if(sWrap.scrollHeight>sAvailH+1) window.__wfOverflow=true')
  })
})
