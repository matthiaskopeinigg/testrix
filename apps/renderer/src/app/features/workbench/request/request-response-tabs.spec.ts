import { overflowResponseTabs, primaryResponseTabs } from './request-response-tabs'

describe('request-response-tabs', () => {
  it('promotes redirects and diff into primary when relevant', () => {
    const primary = primaryResponseTabs({
      hasTiming: true,
      runCount: 2,
      redirectCount: 1,
      canDiff: true,
      canPreview: false,
    })
    expect(primary).toEqual(['pretty', 'headers', 'timeline', 'runs', 'redirects', 'diff'])
    expect(overflowResponseTabs({
      hasTiming: true,
      runCount: 2,
      redirectCount: 1,
      canDiff: true,
      canPreview: false,
    })).toEqual(['raw', 'preview', 'cookies'])
  })

  it('promotes preview when the body is html, xml, or svg', () => {
    const input = {
      hasTiming: true,
      runCount: 0,
      redirectCount: 0,
      canDiff: false,
      canPreview: true,
    }
    expect(primaryResponseTabs(input)).toEqual(['pretty', 'preview', 'headers', 'timeline'])
    expect(overflowResponseTabs(input)).toEqual(['raw', 'cookies', 'redirects', 'diff'])
  })
})
