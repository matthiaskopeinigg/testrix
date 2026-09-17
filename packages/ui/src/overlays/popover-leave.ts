import { readLeaveMotionScale, readMotionScale } from '../dnd/tx-drop-settle';

/** CSS leave duration for menus, before the motion-scale multiplier. */
export const TX_POPOVER_LEAVE_MS = 220;

/**
 * True when open or close animation is off, so popovers should detach immediately.
 */
export function shouldSkipLeaveMotion(): boolean {
  return readMotionScale() <= 0 || readLeaveMotionScale() <= 0;
}

/**
 * Adds `is-leaving` and waits for the popover-out animation, then `done`.
 *
 * @returns A cancel function that skips `done` (use when disposing immediately).
 */
export function playLeaveThen(element: HTMLElement | null, done: () => void): () => void {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const finish = (): void => {
    if (settled)
      return;
    settled = true;
    if (timer !== null)
      clearTimeout(timer);
    if (element)
      element.removeEventListener('animationend', onEnd);
    done();
  };

  const cancel = (): void => {
    if (settled)
      return;
    settled = true;
    if (timer !== null)
      clearTimeout(timer);
    if (element)
      element.removeEventListener('animationend', onEnd);
  };

  const onEnd = (event: AnimationEvent): void => {
    if (event.target === element)
      finish();
  };

  if (!element || shouldSkipLeaveMotion()) {
    finish();
    return cancel;
  }

  element.addEventListener('animationend', onEnd);
  element.classList.add('is-leaving');
  timer = setTimeout(finish, Math.ceil(TX_POPOVER_LEAVE_MS * readLeaveMotionScale()) + 80);
  return cancel;
}
