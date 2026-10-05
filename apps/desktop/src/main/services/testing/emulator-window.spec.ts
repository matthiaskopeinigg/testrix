import { describe, expect, it } from 'vitest';

import { mapDeviceDisplayRect } from './emulator-window';

describe('mapDeviceDisplayRect', () => {
  it('left-aligns when a right tool strip is present', () => {
    const rect = mapDeviceDisplayRect({ x: 100, y: 50, width: 448, height: 800 }, 1080, 2400);
    expect(rect.height).toBe(800);
    expect(rect.width).toBe(Math.round(800 * (1080 / 2400)));
    expect(rect.x).toBe(100);
    expect(rect.y).toBe(50);
  });

  it('centers when the client is wider than a tool strip', () => {
    const rect = mapDeviceDisplayRect({ x: 10, y: 20, width: 500, height: 800 }, 1080, 2400);
    expect(rect.width).toBe(Math.round(800 * (1080 / 2400)));
    expect(rect.height).toBe(800);
    expect(rect.x).toBe(10 + Math.round((500 - rect.width) / 2));
    expect(rect.y).toBe(20);
  });
});
