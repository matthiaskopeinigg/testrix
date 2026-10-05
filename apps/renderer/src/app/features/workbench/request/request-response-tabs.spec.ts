import { overflowResponseTabs, primaryResponseTabs } from './request-response-tabs'

describe('request-response-tabs', () => {
  it('promotes redirects and diff into primary when relevant', () => {
    const primary = primaryResponseTabs({
      hasTiming: true,
      runCount: 2,
      redirectCount: 1,
      canDiff: true,
    })
    expect(primary).toEqual(['pretty', 'headers', 'timeline', 'runs', 'redirects', 'diff'])
    expect(overflowResponseTabs({
      hasTiming: true,
      runCount: 2,
      redirectCount: 1,
      canDiff: true,
    })).toEqual(['raw', 'preview', 'cookies'])
  })
})
