import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { serviceById } from '@testrix/contracts';

import type { WorkbenchTab } from '../workbench/workbench.store';
import { ServiceIconComponent } from './service-icon.component';

@Component({
  selector: 'tx-service-editor',
  standalone: true,
  imports: [ServiceIconComponent],
  templateUrl: './service-editor.component.html',
  styleUrl: './service-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceEditorComponent {
  readonly tab = input.required<WorkbenchTab>();

  readonly service = computed(() => serviceById(this.tab().nodeId));
}
