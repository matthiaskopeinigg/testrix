export interface LoadProfilePreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly virtualUsers: number;
  readonly durationSec: number;
  readonly rampUpSec: number;
  readonly maxErrorRate?: number;
  readonly maxP95Ms?: number;
}

export const LOAD_PROFILE_PRESETS: readonly LoadProfilePreset[] = [
  { id: 'smoke', label: 'Smoke', description: 'Minimal traffic to verify the target responds.', virtualUsers: 2, durationSec: 30, rampUpSec: 0, maxErrorRate: 5, maxP95Ms: 2000 },
  { id: 'load', label: 'Load', description: 'Sustained traffic at expected production levels.', virtualUsers: 25, durationSec: 300, rampUpSec: 30, maxErrorRate: 5, maxP95Ms: 1500 },
  { id: 'stress', label: 'Stress', description: 'High concurrency to find breaking points.', virtualUsers: 100, durationSec: 600, rampUpSec: 60, maxErrorRate: 10, maxP95Ms: 3000 },
  { id: 'spike', label: 'Spike', description: 'Sudden burst of users after a short ramp.', virtualUsers: 100, durationSec: 180, rampUpSec: 5, maxErrorRate: 15, maxP95Ms: 4000 },
  { id: 'soak', label: 'Soak', description: 'Long-running test to expose memory leaks and drift.', virtualUsers: 20, durationSec: 1800, rampUpSec: 120, maxErrorRate: 5, maxP95Ms: 1500 },
];

export function applyLoadProfilePreset(preset: LoadProfilePreset): {
  readonly virtualUsers: number;
  readonly durationSec: number;
  readonly rampUpSec: number;
  readonly maxErrorRate?: number;
  readonly maxP95Ms?: number;
} {
  return {
    virtualUsers: preset.virtualUsers,
    durationSec: preset.durationSec,
    rampUpSec: preset.rampUpSec,
    ...(preset.maxErrorRate !== undefined ? { maxErrorRate: preset.maxErrorRate } : {}),
    ...(preset.maxP95Ms !== undefined ? { maxP95Ms: preset.maxP95Ms } : {}),
  };
}
