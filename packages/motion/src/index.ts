import type { AnimationSpeed } from '@testrix/contracts';
import { motionScaleForSpeed } from '@testrix/contracts';
import { animate, spring, stagger, type AnimationOptions, type AnimationPlaybackControls } from 'motion';

export interface MotionRuntimeOptions {
  readonly speed: AnimationSpeed;
  readonly reducedMotion: boolean;
}

export interface TxMotionController {
  animate: typeof animate;
  spring: typeof spring;
  stagger: typeof stagger;
  scaleDuration: (ms: number) => number;
  shouldAnimate: () => boolean;
  stopAll: () => void;
}

/**
 * Creates a motion runtime that no-ops when the user disables animation.
 */
export function createTxMotion(getOptions: () => MotionRuntimeOptions): TxMotionController {
  const running = new Set<AnimationPlaybackControls>();

  const shouldAnimate = (): boolean => getOptions().speed !== 'none';

  const scaleDuration = (ms: number): number => {
    const options = getOptions();
    return ms * motionScaleForSpeed(options.speed);
  };

  const wrappedAnimate: typeof animate = ((...args: Parameters<typeof animate>) => {
    if (!shouldAnimate()) {
      const target = args[0];
      const keyframes = args[1];
      if (target && keyframes && typeof keyframes === 'object') {
        void animate(target, keyframes, { duration: 0 });
      }
      return {
        stop() {},
        finished: Promise.resolve(),
      } as AnimationPlaybackControls;
    }

    const controls = animate(...args);
    running.add(controls);
    void controls.finished.finally(() => running.delete(controls));
    return controls;
  }) as typeof animate;

  return {
    animate: wrappedAnimate,
    spring,
    stagger,
    scaleDuration,
    shouldAnimate,
    stopAll: () => {
      for (const item of running) {
        item.stop();
      }
      running.clear();
    },
  };
}

export type { AnimationOptions, AnimationPlaybackControls };
export { animate, spring, stagger };
