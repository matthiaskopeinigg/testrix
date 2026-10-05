import type { TxHintLayerService, TxHintPlacement } from '@testrix/ui';

/**
 * Copy `value` to the clipboard and flash a confirmation on the event target.
 */
export async function copyToolText(
  hints: TxHintLayerService,
  value: string,
  event: Event,
  placement: TxHintPlacement = 'top',
): Promise<boolean> {
  if (!value)
    return false;
  const copied = await writeClipboard(value);
  if (!copied)
    return false;
  const target = event.currentTarget;
  if (target instanceof HTMLElement)
    hints.flashAt('Copied', target, placement);
  return true;
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.append(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    return ok;
  }
}
