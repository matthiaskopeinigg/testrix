import { nativeImage } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { changedPixelPercent, paintDiffMagenta } from '../../../shared/testing/pixel-diff';

export interface E2eCheckpointPaths {
  readonly baseline: string;
  readonly actual: string;
  readonly diff: string;
}

/** Stable per-profile checkpoint files (`e2e-checkpoints/{flowId}/{stepId}.png`). */
export function e2eCheckpointPaths(checkpointDir: string, flowId: string, stepId: string): E2eCheckpointPaths {
  const folder = path.join(checkpointDir, flowId);
  return {
    baseline: path.join(folder, `${stepId}.png`),
    actual: path.join(folder, `${stepId}.actual.png`),
    diff: path.join(folder, `${stepId}.diff.png`),
  };
}

export interface E2eCheckpointCompareResult {
  readonly ok: boolean;
  readonly wroteBaseline: boolean;
  readonly changedPercent: number;
  readonly baselinePath: string;
  readonly actualPath?: string;
  readonly diffPath?: string;
  readonly message?: string;
}

/**
 * First run writes the baseline and passes. Later runs fail when changed pixels
 * exceed `thresholdPercent`.
 */
export async function compareE2eCheckpoint(input: {
  readonly checkpointDir: string;
  readonly flowId: string;
  readonly stepId: string;
  readonly capturePng: Buffer;
  readonly thresholdPercent: number;
}): Promise<E2eCheckpointCompareResult> {
  const paths = e2eCheckpointPaths(input.checkpointDir, input.flowId, input.stepId);
  await fs.mkdir(path.dirname(paths.baseline), { recursive: true });

  let baselinePng: Buffer | null = null;
  try {
    baselinePng = await fs.readFile(paths.baseline);
  } catch {
    baselinePng = null;
  }

  if (!baselinePng) {
    await fs.writeFile(paths.baseline, input.capturePng);
    return {
      ok: true,
      wroteBaseline: true,
      changedPercent: 0,
      baselinePath: paths.baseline,
    };
  }

  await fs.writeFile(paths.actual, input.capturePng);
  const actualImage = nativeImage.createFromBuffer(input.capturePng);
  const baselineImage = nativeImage.createFromBuffer(baselinePng);
  const actualSize = actualImage.getSize();
  const baselineSize = baselineImage.getSize();
  if (actualSize.width !== baselineSize.width || actualSize.height !== baselineSize.height) {
    return {
      ok: false,
      wroteBaseline: false,
      changedPercent: 100,
      baselinePath: paths.baseline,
      actualPath: paths.actual,
      message: `Checkpoint size changed (${baselineSize.width}×${baselineSize.height} → ${actualSize.width}×${actualSize.height}).`,
    };
  }

  const actualBitmap = actualImage.getBitmap() as unknown as Uint8Array;
  const baselineBitmap = baselineImage.getBitmap() as unknown as Uint8Array;
  const changedPercent = changedPixelPercent(actualBitmap, baselineBitmap);
  if (changedPercent <= input.thresholdPercent) {
    return {
      ok: true,
      wroteBaseline: false,
      changedPercent,
      baselinePath: paths.baseline,
    };
  }

  const diffBitmap = paintDiffMagenta(actualBitmap, baselineBitmap);
  const diffPng = nativeImage
    .createFromBitmap(Buffer.from(diffBitmap), {
      width: actualSize.width,
      height: actualSize.height,
    })
    .toPNG();
  await fs.writeFile(paths.diff, diffPng);
  return {
    ok: false,
    wroteBaseline: false,
    changedPercent,
    baselinePath: paths.baseline,
    actualPath: paths.actual,
    diffPath: paths.diff,
    message: `Checkpoint changed ${changedPercent.toFixed(2)}% of pixels (threshold ${input.thresholdPercent}%).`,
  };
}

/** Copies the last actual capture over the baseline PNG. */
export async function updateE2eCheckpointBaseline(
  checkpointDir: string,
  flowId: string,
  stepId: string,
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  const paths = e2eCheckpointPaths(checkpointDir, flowId, stepId);
  try {
    const actual = await fs.readFile(paths.actual);
    await fs.mkdir(path.dirname(paths.baseline), { recursive: true });
    await fs.writeFile(paths.baseline, actual);
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No actual checkpoint capture to promote.',
    };
  }
}
