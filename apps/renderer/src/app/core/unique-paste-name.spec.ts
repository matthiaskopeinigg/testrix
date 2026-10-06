import { describe, expect, it } from 'vitest'

import { uniquePasteName } from './unique-paste-name'

describe('uniquePasteName', () => {
  it('keeps a name the destination does not have', () => {
    expect(uniquePasteName('Login', ['Health'])).toBe('Login')
  })

  it('adds copy when the name is taken', () => {
    expect(uniquePasteName('Login', ['Login'])).toBe('Login copy')
    expect(uniquePasteName('Login', ['Login', 'Login copy'])).toBe('Login copy 2')
  })
})
