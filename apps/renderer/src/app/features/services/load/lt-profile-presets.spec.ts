import { describe, expect, it } from 'vitest';

import { applyLoadProfilePreset, LOAD_PROFILE_PRESETS } from './lt-profile-presets';

describe('applyLoadProfilePreset', () => {
  it('copies VU duration ramp and optional thresholds', () => {
    const stress = LOAD_PROFILE_PRESETS.find((preset) => preset.id === 'stress');
    expect(stress).toBeTruthy();
    if (!stress)
      return;
    expect(applyLoadProfilePreset(stress)).toEqual({
      virtualUsers: 100,
      durationSec: 600,
      rampUpSec: 60,
      maxErrorRate: 10,
      maxP95Ms: 3000,
    });
  });

  it('includes every planned preset id', () => {
    expect(LOAD_PROFILE_PRESETS.map((preset) => preset.id)).toEqual([
      'smoke',
      'load',
      'stress',
      'spike',
      'soak',
    ]);
  });
});
