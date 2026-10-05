import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tx-service-icon',
  standalone: true,
  templateUrl: './service-icon.component.html',
  styleUrl: './service-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceIconComponent {
  readonly serviceId = input.required<string>();
  readonly size = input(14);
}
