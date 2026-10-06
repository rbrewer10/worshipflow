import { describe, expect, it } from 'vitest'
import { DEFAULT_TABLET_PORT, tabletPortFromEnv } from './tabletHtml'

describe('WF_HTTP_PORT (test/QA port override)', () => {
  it('defaults to 3691', () => {
    expect(DEFAULT_TABLET_PORT).toBe(3691)
    expect(tabletPortFromEnv({})).toBe(3691)
  })
  it('uses a valid override', () => {
    expect(tabletPortFromEnv({ WF_HTTP_PORT: '47391' })).toBe(47391)
    expect(tabletPortFromEnv({ WF_HTTP_PORT: ' 5000 ' })).toBe(5000)
  })
  it('ignores junk, privileged and out-of-range values', () => {
    for (const v of ['', 'abc', '80', '0', '70000', '3691.5', '-1', '4000x']) expect(tabletPortFromEnv({ WF_HTTP_PORT: v }), v).toBe(3691)
  })
})
