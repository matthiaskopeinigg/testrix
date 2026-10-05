import { app } from 'electron';

const DEBOUNCE_MS = 2_000;
const IDLE_INTERVAL_MS = 30_000;
const LIVE_INTERVAL_MS = 10_000;
/** Flipping between windows should not turn into a fetch every time. */
const FOCUS_MIN_GAP_MS = 60_000;

/**
 * Quiet background sync: after a save settles, when a window is focused, and on an
 * interval that tightens while the Collab dock is open or a shared run is in flight.
 */
export class CollabSyncLoop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private intervalMs = IDLE_INTERVAL_MS;
  private onFocus: (() => void) | null = null;
  private lastRunAt = 0;

  constructor(private readonly runSync: () => void) {}

  start(): void {
    if (this.onFocus)
      return;
    this.arm(IDLE_INTERVAL_MS);
    this.onFocus = () => {
      if (Date.now() - this.lastRunAt >= FOCUS_MIN_GAP_MS)
        this.run();
    };
    app.on('browser-window-focus', this.onFocus);
  }

  /** Tightens the interval while someone is watching Collab or a run is live. */
  setLive(live: boolean): void {
    const next = live ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    if (next === this.intervalMs || !this.onFocus)
      return;
    this.arm(next);
  }

  /**
   * Schedules a sync after edits go quiet. Immediate runs still go through {@link poke}.
   */
  schedule(): void {
    if (this.timer)
      clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.run();
    }, DEBOUNCE_MS);
  }

  poke(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.run();
  }

  stop(): void {
    if (this.timer)
      clearTimeout(this.timer);
    this.timer = null;
    if (this.interval)
      clearInterval(this.interval);
    this.interval = null;
    if (this.onFocus)
      app.off('browser-window-focus', this.onFocus);
    this.onFocus = null;
  }

  private run(): void {
    this.lastRunAt = Date.now();
    this.runSync();
  }

  private arm(intervalMs: number): void {
    if (this.interval)
      clearInterval(this.interval);
    this.intervalMs = intervalMs;
    this.interval = setInterval(() => this.run(), intervalMs);
  }
}
