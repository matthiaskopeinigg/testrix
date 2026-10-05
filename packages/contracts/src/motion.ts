import { type z } from 'zod';

import { animationSpeedSchema } from './settings';

/**
 * Maps a user motion preference to a CSS/JS duration scale.
 */
export function motionScaleForSpeed(speed: z.infer<typeof animationSpeedSchema>): number {
  switch (speed) {
    case 'none':
      return 0;
    case 'slow':
      return 3;
    case 'fast':
      return 0.72;
    default:
      return 1.25;
  }
}

export { animationSpeedSchema };
