import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { CaptureTabSectionId } from '@shared/config';
import type { CaptureItem } from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

@Component({
  selector: 'app-cap-tab-overview-panel',
  standalone: true,
  imports: [TxButtonComponent, TxIconComponent, TxTagComponent],
  templateUrl: './cap-tab-overview-panel.component.html',
  styleUrl: './cap-tab-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CapTabOverviewPanelComponent {
  readonly session = input.required<CaptureItem>();
  readonly entryCount = input(0);
  readonly recording = input(false);
  readonly captureSupported = input(true);

  readonly sectionSelect = output<CaptureTabSectionId>();
}
