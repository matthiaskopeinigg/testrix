import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tx-tool-icon',
  standalone: true,
  templateUrl: './tool-icon.component.html',
  styleUrl: './tool-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolIconComponent {
  readonly toolId = input.required<string>();
  readonly size = input(14);
}
