import { detectUrlPasteIngest } from './url-ingest'

describe('detectUrlPasteIngest', () => {
  it('detects OpenAPI path lines', () => {
    const preview = detectUrlPasteIngest('POST /v1/pets')
    expect(preview?.kind).toBe('openapi-path')
    expect(preview?.method).toBe('POST')
    expect(preview?.url).toBe('/v1/pets')
  })

  it('detects cURL with confirm preview', () => {
    const preview = detectUrlPasteIngest("curl -X GET 'https://api.test/health'")
    expect(preview?.kind).toBe('curl')
    expect(preview?.url).toBe('https://api.test/health')
  })
})
