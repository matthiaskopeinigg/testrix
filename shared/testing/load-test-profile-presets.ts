import {
  loadTestProfileSchema,
  loadTestThresholdsSchema,
  type LoadTestProfile,
  type LoadTestThresholds,
} from './load-tests.schema';

export const LOAD_TEST_PROFILE_PRESET_IDS = ['smoke', 'load', 'stress', 'spike', 'soak'] as const;

export type LoadTestProfilePresetId = (typeof LOAD_TEST_PROFILE_PRESET_IDS)[number];

export interface LoadTestProfilePreset {
  readonly id: LoadTestProfilePresetId;
  readonly label: string;
  readonly description: string;
  readonly profile: LoadTestProfile;
  readonly suggestedThresholds?: LoadTestThresholds;
}

export interface ApplyLoadTestProfilePresetResult {
  readonly profile: LoadTestProfile;
  readonly suggestedThresholds?: LoadTestThresholds;
}

export const LOAD_TEST_PROFILE_PRESETS: readonly LoadTestProfilePreset[] = [
  {
    id: 'smoke',
    label: 'Smoke',
    description: 'Minimal traffic to verify the target responds.',
    profile: loadTestProfileSchema.parse({ virtualUsers: 2, durationSec: 30, rampUpSec: 0 }),
    suggestedThresholds: loadTestThresholdsSchema.parse({
      minSuccessRatePercent: 99,
      maxErrorRatePercent: 1,
    }),
  },
  {
    id: 'load',
    label: 'Load',
    description: 'Sustained traffic at expected production levels.',
    profile: loadTestProfileSchema.parse({ virtualUsers: 25, durationSec: 300, rampUpSec: 30 }),
    suggestedThresholds: loadTestThresholdsSchema.parse({
      minRequestsPerSec: 50,
      maxP95LatencyMs: 500,
    }),
  },
  {
    id: 'stress',
    label: 'Stress',
    description: 'High concurrency to find breaking points.',
    profile: loadTestProfileSchema.parse({ virtualUsers: 100, durationSec: 600, rampUpSec: 60 }),
    suggestedThresholds: loadTestThresholdsSchema.parse({
      maxErrorRatePercent: 5,
    }),
  },
  {
    id: 'spike',
    label: 'Spike',
    description: 'Sudden burst of users after a short ramp.',
    profile: loadTestProfileSchema.parse({ virtualUsers: 100, durationSec: 180, rampUpSec: 5 }),
    suggestedThresholds: loadTestThresholdsSchema.parse({
      maxP95LatencyMs: 500,
    }),
  },
  {
    id: 'soak',
    label: 'Soak',
    description: 'Long-running test to expose memory leaks and drift.',
    profile: loadTestProfileSchema.parse({ virtualUsers: 20, durationSec: 1800, rampUpSec: 120 }),
    suggestedThresholds: loadTestThresholdsSchema.parse({
      maxErrorRatePercent: 1,
      minSuccessRatePercent: 99,
    }),
  },
];

/** Returns a preset definition by id. */
export function getLoadTestProfilePreset(id: LoadTestProfilePresetId): LoadTestProfilePreset | undefined {
  return LOAD_TEST_PROFILE_PRESETS.find((preset) => preset.id === id);
}

/** Applies a preset profile and optional suggested thresholds. */
export function applyLoadTestProfilePreset(id: LoadTestProfilePresetId): ApplyLoadTestProfilePresetResult {
  const preset = getLoadTestProfilePreset(id);
  if (!preset) {
    throw new Error(`Unknown load test profile preset: ${id}`);
  }
  return {
    profile: loadTestProfileSchema.parse(preset.profile),
    suggestedThresholds: preset.suggestedThresholds
      ? loadTestThresholdsSchema.parse(preset.suggestedThresholds)
      : undefined,
  };
}

/** Detects which preset matches the given profile, if any. */
export function detectLoadTestProfilePreset(profile: LoadTestProfile): LoadTestProfilePresetId | null {
  for (const preset of LOAD_TEST_PROFILE_PRESETS) {
    const p = preset.profile;
    if (
      p.virtualUsers === profile.virtualUsers &&
      p.durationSec === profile.durationSec &&
      p.rampUpSec === profile.rampUpSec
    ) {
      return preset.id;
    }
  }
  return null;
}
