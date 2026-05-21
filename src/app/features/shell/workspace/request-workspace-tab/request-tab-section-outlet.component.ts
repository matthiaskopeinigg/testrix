import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Type,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import {
  loadRequestTabSection,
  peekRequestTabSection,
  type RequestTabSectionPanelId,
} from './request-tab-section-loader';
import { RequestTabDynamicOutletComponent } from './request-tab-dynamic-outlet.component';

/** Lazy-loads a request tab section panel and mounts it with inputs/outputs. */
@Component({
  selector: 'app-request-tab-section-outlet',
  standalone: true,
  imports: [RequestTabDynamicOutletComponent],
  template: `
    <app-request-tab-dynamic-outlet
      [componentType]="componentType()"
      [panelInputs]="panelInputs()"
      [panelOutputs]="panelOutputs()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTabSectionOutletComponent {
  readonly section = input.required<RequestTabSectionPanelId>();
  readonly panelInputs = input.required<Record<string, unknown>>();
  readonly panelOutputs = input.required<Record<string, (value: unknown) => void>>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly componentType = signal<Type<unknown> | null>(null);

  private loadGeneration = 0;

  constructor() {
    effect(() => {
      const section = this.section();
      const cached = peekRequestTabSection(section);
      if (cached) {
        this.componentType.set(cached);
        return;
      }
      const generation = ++this.loadGeneration;
      void loadRequestTabSection(section).then((component) => {
        if (generation !== this.loadGeneration) {
          return;
        }
        this.componentType.set(component);
        this.cdr.markForCheck();
      });
    });

    this.destroyRef.onDestroy(() => {
      this.loadGeneration += 1;
    });
  }
}
