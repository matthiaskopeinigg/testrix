import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FlowNodeKind } from '@testrix/contracts';

@Component({
  selector: 'tx-flow-node-icon',
  standalone: true,
  templateUrl: './flow-node-icon.component.html',
  styleUrl: './flow-node-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowNodeIconComponent {
  readonly kind = input.required<FlowNodeKind>();
  readonly size = input(16);
}
