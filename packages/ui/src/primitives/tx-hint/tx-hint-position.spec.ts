import { describe, expect, it } from 'vitest';

import { estimateHintSize, placeHint } from './tx-hint-position';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    },
  };
}

describe('placeHint', () => {
  it('centers a short top hint on the trigger instead of shifting by max width', () => {
    const trigger = rect(600, 80, 48, 28);
    const size = estimateHintSize('Copy UUID', 0);
    const point = placeHint('top', trigger, size.width, size.height, 1400, 900);
    const triggerCenter = trigger.left + trigger.width / 2;
    const bubbleCenter = point.x + size.width / 2;
    expect(Math.abs(bubbleCenter - triggerCenter)).toBeLessThan(1);
    expect(point.y).toBe(trigger.top - 10 - size.height);
    expect(size.width).toBeLessThan(140);
  });

  it('centers a bottom hint on the trigger', () => {
    const trigger = rect(900, 200, 60, 32);
    const point = placeHint('bottom', trigger, 84, 36, 1400, 900);
    expect(point.x).toBe(trigger.left + trigger.width / 2 - 42);
    expect(point.y).toBe(trigger.bottom + 10);
  });

  it('keeps a long titlebar hint inside the viewport', () => {
    const trigger = rect(1860, 8, 34, 30);
    const text = 'Settings — Testrix 99.0.0 is ready to install';
    const size = estimateHintSize(text, 2, 1920);
    const point = placeHint('bottom', trigger, size.width, size.height, 1920, 1080);
    expect(size.width).toBeGreaterThan(220);
    expect(point.x).toBeGreaterThanOrEqual(8);
    expect(point.x + size.width).toBeLessThanOrEqual(1912);
  });
});
