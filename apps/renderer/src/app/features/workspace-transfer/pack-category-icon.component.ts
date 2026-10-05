import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { PackCategory } from '@testrix/contracts';

@Component({
  selector: 'tx-pack-category-icon',
  standalone: true,
  templateUrl: './pack-category-icon.component.html',
  styleUrl: './pack-category-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackCategoryIconComponent {
  readonly id = input.required<PackCategory>();
}
