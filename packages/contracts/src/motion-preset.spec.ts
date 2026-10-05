import { describe, expect, it } from 'vitest'
import { motionPresetFromSpeeds, speedsForMotionPreset } from './settings'

describe('motion presets', () => {
  it('maps Reduced to none for open and close', () => {
    expect(speedsForMotionPreset('reduced')).toEqual({
      animationSpeed: 'none',
      closeAnimationSpeed: 'none',
    })
  })

  it('infers Reduced only from none/none', () => {
    expect(motionPresetFromSpeeds('none', 'none')).toBe('reduced')
    expect(motionPresetFromSpeeds('slow', 'slow')).toBe('custom')
    expect(motionPresetFromSpeeds('fast', 'fast')).toBe('snappy')
  })
})
