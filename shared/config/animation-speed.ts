/** Global UI motion speed (`settings.ui.animationSpeed` → `html[data-animation-speed]`). */
export const ANIMATION_SPEED_IDS = [
  'super-slow',
  'slow',
  'normal',
  'fast',
  'none',
] as const;

export type AnimationSpeed = (typeof ANIMATION_SPEED_IDS)[number];

export const ANIMATION_SPEED_OPTIONS: readonly {
  readonly id: AnimationSpeed;
  readonly label: string;
}[] = [
  { id: 'super-slow', label: 'Super slow' },
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
  { id: 'none', label: 'None' },
];
