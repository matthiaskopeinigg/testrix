import { Injectable, signal } from '@angular/core';

export interface TxToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface TxToastShowOptions {
  readonly message: string;
  /** Auto-dismiss delay. `0` keeps the toast until Later or the action. */
  readonly durationMs?: number;
  readonly action?: TxToastAction;
  /** When false, the action runs and the toast stays (for example download progress). */
  readonly dismissOnAction?: boolean;
  /** Adds a second, quiet button that only closes the toast (for example Later). */
  readonly dismissLabel?: string;
  /** `0–100` shows a meter; `null` is an indeterminate bar. */
  readonly progress?: number | null;
  /** Called when the toast expires without the action being used. */
  readonly onExpire?: () => void;
}

export interface TxToastPatch {
  readonly message?: string;
  readonly action?: TxToastAction | null;
  readonly dismissLabel?: string | null;
  readonly progress?: number | null;
}

export interface TxToastItem {
  readonly id: string;
  readonly message: string;
  readonly action?: TxToastAction;
  readonly dismissLabel?: string;
  /** `0–100` shows a meter; `null` is an indeterminate bar. */
  readonly progress?: number | null;
}

const DEFAULT_DURATION_MS = 5000;

/**
 * Bottom toast stack. One timer per toast unless `durationMs` is 0. Action
 * dismisses by default; `dismissOnAction: false` keeps the toast for in-place updates.
 */
@Injectable({ providedIn: 'root' })
export class TxToastService {
  readonly items = signal<readonly TxToastItem[]>([]);

  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly expireCallbacks = new Map<string, () => void>();
  private readonly persistAction = new Set<string>();
  private readonly settled = new Set<string>();
  private nextId = 0;

  show(options: TxToastShowOptions): string {
    const id = `tx-toast-${this.nextId += 1}`;
    const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
    if (options.dismissOnAction === false)
      this.persistAction.add(id);

    this.items.update((list) => [
      ...list,
      {
        id,
        message: options.message,
        action: options.action ? this.bindAction(id, options.action) : undefined,
        dismissLabel: options.dismissLabel,
        progress: options.progress,
      },
    ]);
    if (options.onExpire)
      this.expireCallbacks.set(id, options.onExpire);

    if (durationMs > 0) {
      const timer = setTimeout(() => {
        this.settle(id, true);
        this.dismiss(id);
      }, durationMs);
      this.timers.set(id, timer);
    }
    return id;
  }

  /**
   * Rewrites a live toast. Returns false when that id is already gone.
   */
  update(id: string, patch: TxToastPatch): boolean {
    let found = false;
    this.items.update((list) =>
      list.map((item) => {
        if (item.id !== id)
          return item;
        found = true;
        return {
          ...item,
          message: patch.message ?? item.message,
          action:
            patch.action === undefined
              ? item.action
              : patch.action === null
                ? undefined
                : this.bindAction(id, patch.action),
          dismissLabel:
            patch.dismissLabel === undefined
              ? item.dismissLabel
              : patch.dismissLabel === null
                ? undefined
                : patch.dismissLabel,
          progress: 'progress' in patch ? patch.progress : item.progress,
        };
      }),
    );
    return found;
  }

  dismiss(id: string): void {
    this.clearTimer(id);
    this.expireCallbacks.delete(id);
    this.persistAction.delete(id);
    this.settled.delete(id);
    this.items.update((list) => list.filter((item) => item.id !== id));
  }

  private bindAction(id: string, action: TxToastAction): TxToastAction {
    return {
      label: action.label,
      onClick: () => {
        if (this.settled.has(id))
          return;
        if (this.persistAction.has(id)) {
          action.onClick();
          return;
        }
        this.settle(id, false);
        action.onClick();
        this.dismiss(id);
      },
    };
  }

  private settle(id: string, shouldExpire: boolean): void {
    if (this.settled.has(id))
      return;
    this.settled.add(id);
    this.clearTimer(id);
    if (shouldExpire) {
      const onExpire = this.expireCallbacks.get(id);
      this.expireCallbacks.delete(id);
      onExpire?.();
    }
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (!timer)
      return;
    clearTimeout(timer);
    this.timers.delete(id);
  }
}
