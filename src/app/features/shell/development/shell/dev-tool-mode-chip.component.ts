import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type DevToolModeChipVariant = 'mode' | 'section';

@Component({
  selector: 'app-dev-tool-mode-chip',
  standalone: true,
  template: `
    <button
      type="button"
      [class]="chipClass()"
      [class.is-active]="active()"
      [attr.aria-pressed]="active()"
      (click)="selected.emit()"
    >
      <ng-content />
    </button>
  `,
  styleUrl: './_dev-tool-shell-widgets.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevToolModeChipComponent {
  readonly active = input(false);
  /** `section` uses workspace-style section tabs (e.g. OpenAPI Editor / Outline). */
  readonly variant = input<DevToolModeChipVariant>('mode');
  readonly selected = output<void>();

  protected readonly chipClass = computed(() =>
    this.variant() === 'section' ? 'dev-tool-tab__section-tab' : 'dev-tool-tab__mode-chip',
  );
}
