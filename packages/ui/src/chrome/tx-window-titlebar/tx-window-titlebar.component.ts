import { ChangeDetectionStrategy, Component, input, output, type OutputEmitterRef } from '@angular/core';

import { ensureWindowChrome } from '../../overlays/overlay-window-drag';
import { TxHintComponent } from '../../primitives/tx-hint/tx-hint.component';

@Component({
  selector: 'tx-window-titlebar',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './tx-window-titlebar.component.html',
  styleUrl: './tx-window-titlebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxWindowTitlebarComponent {
  readonly logoSrc = input('assets/logo.svg');
  readonly productName = input('Testrix');
  readonly platform = input('win32');
  readonly isMaximized = input(false);
  /** Sync state for the Collab status dot; null keeps the icon quiet. */
  readonly collabState = input<string | null>(null);
  readonly collabDetail = input<string | null>(null);
  readonly collabOpen = input(false);
  /** Shows a dot on Settings and becomes its hint detail, for example an update ready to install. */
  readonly settingsNotice = input<string | null>(null);
  readonly minimize = output();
  readonly maximize = output();
  readonly close = output();
  readonly openSettings = output();
  readonly toggleCollab = output();

  /**
   * Settings / Collab can fire on pointerdown. Caption buttons cannot:
   * Windows undoes minimize/maximize while the mouse is still down.
   */
  onChromePointer(event: PointerEvent, channel: OutputEmitterRef<void>): void {
    if (event.button !== 0)
      return;
    event.stopPropagation();
    this.fireChrome(channel);
  }

  onCaptionPointerDown(event: PointerEvent): void {
    if (event.button !== 0)
      return;
    event.stopPropagation();
  }

  onCaptionPointerUp(event: PointerEvent, channel: OutputEmitterRef<void>): void {
    if (event.button !== 0)
      return;
    event.stopPropagation();
    this.fireChrome(channel);
  }

  private fireChrome(channel: OutputEmitterRef<void>): void {
    ensureWindowChrome();
    channel.emit();
  }
}
