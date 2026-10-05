import { describe, expect, it } from 'vitest';

import { motionPresetFromSpeeds, speedsForMotionPreset } from '@testrix/contracts';

import { articlesForSection, filterHelpHits } from '../help/help-registry';

/**
 * Documentation / product coverage for Settings surfaces.
 */
describe('Settings coverage', () => {
  it('covers the settings wizard and first-run essentials', () => {
    expect(articlesForSection('settings').some((item) => item.id === 'settings-wizard')).toBe(true);
    expect(filterHelpHits('Get started path').some((item) => item.id === 'settings-wizard')).toBe(true);
    expect(filterHelpHits('Show all settings').some((item) => item.id === 'settings-wizard')).toBe(true);
  });

  it('covers Reduced motion preset in help and contracts', () => {
    expect(filterHelpHits('animation speed').some((item) => item.id === 'settings-appearance')).toBe(true);
    expect(speedsForMotionPreset('reduced')).toEqual({
      animationSpeed: 'none',
      closeAnimationSpeed: 'none',
    });
    expect(motionPresetFromSpeeds('none', 'none')).toBe('reduced');
  });
});
