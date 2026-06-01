import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';

import { ConfigService } from '@app/core/config/config.service';

import {
  KEYBOARD_SHORTCUT_CATALOG,
  type KeyboardShortcutDefinition,
} from './keyboard-shortcut-catalog';
import { keyboardEventMatchesChord } from './chord-matcher';

type HandlerFn = () => boolean | void;

/**
 * Global shortcuts: document keydown (capture). Handlers register by catalog id; first
 * handler that returns `true` stops propagation. Settings merge overrides onto default chords.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private readonly handlers = new Map<string, HandlerFn[]>();
  private readonly config = inject(ConfigService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.zone.runOutsideAngular(() => {
      fromEvent<KeyboardEvent>(document, 'keydown', { capture: true })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((ev) => this.onDocumentKeydownCapture(ev));
    });
  }

  /** Effective chord for an action (user override or catalog default). */
  effectiveChord(actionId: string): string {
    const entry = KEYBOARD_SHORTCUT_CATALOG.find((d) => d.id === actionId);
    if (!entry) return '';
    const settings = this.config.settings();
    const override = settings?.keyboard?.bindings?.[actionId];
    return (override && override.trim()) || entry.defaultChord;
  }

  /**
   * Register a handler for a catalog action. Returns unregister function.
   * Multiple handlers per id are invoked newest-first until one returns non-`false`.
   */
  register(actionId: string, fn: HandlerFn): () => void {
    let list = this.handlers.get(actionId);
    if (!list) {
      list = [];
      this.handlers.set(actionId, list);
    }
    list.push(fn);
    return () => {
      const current = this.handlers.get(actionId);
      if (!current) return;
      const index = current.lastIndexOf(fn);
      if (index !== -1) current.splice(index, 1);
    };
  }

  /** Labels + categories for settings UI (global + editor). */
  getCatalog(): readonly KeyboardShortcutDefinition[] {
    return KEYBOARD_SHORTCUT_CATALOG;
  }

  private onDocumentKeydownCapture(ev: KeyboardEvent): void {
    if (ev.defaultPrevented) return;
    const target = ev.target as HTMLElement | null;

    for (const def of KEYBOARD_SHORTCUT_CATALOG) {
      if (def.scope !== 'global') continue;
      const chord = this.effectiveChord(def.id);
      if (!chord || !keyboardEventMatchesChord(ev, chord)) continue;
      if (def.skipWhenInEditableField && this.isInEditableField(target)) continue;

      const list = this.handlers.get(def.id);
      if (!list?.length) continue;

      let handled = false;
      this.zone.run(() => {
        for (let i = list.length - 1; i >= 0; i--) {
          const consumed = list[i]();
          if (consumed !== false) {
            handled = true;
            return;
          }
        }
      });
      if (handled) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    }
  }

  private isInEditableField(el: HTMLElement | null): boolean {
    return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
  }
}
