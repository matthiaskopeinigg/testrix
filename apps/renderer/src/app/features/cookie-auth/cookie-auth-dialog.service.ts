import { Injectable, signal } from '@angular/core';

/**
 * Opens the Cookie & auth jar popup. Hosted once on the shell overlay stack.
 */
@Injectable({ providedIn: 'root' })
export class CookieAuthDialogService {
  readonly open = signal(false);

  show(): void {
    this.open.set(true);
  }

  hide(): void {
    this.open.set(false);
  }
}
