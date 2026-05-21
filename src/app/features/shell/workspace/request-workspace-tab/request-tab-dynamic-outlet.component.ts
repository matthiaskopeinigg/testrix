import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ComponentRef,
  DestroyRef,
  Type,
  effect,
  inject,
  input,
  viewChild,
  ViewContainerRef,
} from '@angular/core';

type OutputEmitterLike = {
  subscribe?: (callback: (value: unknown) => void) => { unsubscribe: () => void };
};

/**
 * Mounts a standalone component with signal inputs and `output()` bindings.
 * NgComponentOutlet in Angular 21.2 supports inputs only — not outputs.
 */
@Component({
  selector: 'app-request-tab-dynamic-outlet',
  standalone: true,
  template: `<ng-template #host />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTabDynamicOutletComponent {
  readonly componentType = input<Type<unknown> | null>(null);
  readonly panelInputs = input<Record<string, unknown>>({});
  readonly panelOutputs = input<Record<string, (value: unknown) => void>>({});

  private readonly host = viewChild.required('host', { read: ViewContainerRef });
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  private componentRef: ComponentRef<unknown> | null = null;
  private mountedType: Type<unknown> | null = null;
  private outputUnsubs: Array<() => void> = [];

  constructor() {
    effect(() => {
      const type = this.componentType();
      void this.ensureMounted(type);
    });

    effect(() => {
      this.applyInputs(this.panelInputs());
    });

    this.destroyRef.onDestroy(() => this.teardown());
  }

  private async ensureMounted(type: Type<unknown> | null): Promise<void> {
    if (!type) {
      this.teardown();
      return;
    }
    if (this.mountedType === type && this.componentRef) {
      return;
    }
    this.teardown();
    this.mountedType = type;
    this.componentRef = this.host().createComponent(type);
    this.applyInputs(this.panelInputs());
    this.wireOutputs(this.panelOutputs());
    this.cdr.markForCheck();
  }

  private applyInputs(inputs: Record<string, unknown>): void {
    const ref = this.componentRef;
    if (!ref) {
      return;
    }
    for (const [key, value] of Object.entries(inputs)) {
      ref.setInput(key, value);
    }
  }

  private wireOutputs(outputs: Record<string, (value: unknown) => void>): void {
    const ref = this.componentRef;
    if (!ref) {
      return;
    }
    for (const unsub of this.outputUnsubs) {
      unsub();
    }
    this.outputUnsubs = [];

    const instance = ref.instance as Record<string, OutputEmitterLike>;
    for (const [key, handler] of Object.entries(outputs)) {
      const outputRef = instance[key];
      const subscription = outputRef?.subscribe?.(handler);
      if (subscription) {
        this.outputUnsubs.push(() => subscription.unsubscribe());
      }
    }
  }

  private teardown(): void {
    for (const unsub of this.outputUnsubs) {
      unsub();
    }
    this.outputUnsubs = [];
    this.componentRef?.destroy();
    this.componentRef = null;
    this.mountedType = null;
    this.host()?.clear();
  }
}
