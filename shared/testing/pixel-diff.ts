const PIXEL_STRIDE = 4;

/**
 * Percent of pixels that differ between two packed bitmaps (BGRA or RGBA).
 * Length mismatch is treated as 100% changed.
 */
export function changedPixelPercent(actual: Uint8Array, expected: Uint8Array): number {
  if (actual.length === 0 || actual.length !== expected.length) {
    return 100;
  }
  const pixels = actual.length / PIXEL_STRIDE;
  if (pixels <= 0) {
    return 100;
  }
  let changed = 0;
  for (let i = 0; i < actual.length; i += PIXEL_STRIDE) {
    if (
      actual[i] !== expected[i] ||
      actual[i + 1] !== expected[i + 1] ||
      actual[i + 2] !== expected[i + 2]
    ) {
      changed += 1;
    }
  }
  return (changed / pixels) * 100;
}

/**
 * Copies `actual` and paints differing pixels magenta (BGRA: B=255 G=0 R=255).
 */
export function paintDiffMagenta(actual: Uint8Array, expected: Uint8Array): Uint8Array {
  const out = Uint8Array.from(actual);
  const len = Math.min(actual.length, expected.length);
  for (let i = 0; i < len; i += PIXEL_STRIDE) {
    if (
      actual[i] !== expected[i] ||
      actual[i + 1] !== expected[i + 1] ||
      actual[i + 2] !== expected[i + 2]
    ) {
      out[i] = 255;
      out[i + 1] = 0;
      out[i + 2] = 255;
      out[i + 3] = 255;
    }
  }
  return out;
}
