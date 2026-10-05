import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  type TemplateRef,
  ViewContainerRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Overlay, type GlobalPositionStrategy, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import type { FlowScenario } from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

@Component({
  selector: 'tx-flow-scenario-bar',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './flow-scenario-bar.component.html',
  styleUrl: './flow-scenario-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowScenarioBarComponent {
  readonly scenarios = input.required<readonly FlowScenario[]>();
  readonly activeId = input<string | null>(null);

  readonly selected = output<string>();
  readonly added = output<void>();
  readonly duplicated = output<string>();
  readonly removed = output<string>();
  readonly renamed = output<{ readonly id: string; readonly name: string }>();
  readonly toggled = output<{ readonly id: string; readonly enabled: boolean }>();
  readonly runOne = output<string>();

  readonly renamingId = signal<string | null>(null);
  readonly menu = signal<{ readonly id: string } | null>(null);

  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('scenarioMenu');
  private overlayRef: OverlayRef | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.closeMenu());
  }

  rowCount(scenario: FlowScenario): number {
    return scenario.data.enabled ? scenario.data.rows.length : 0;
  }

  handleMenu(id: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();
    this.menu.set({ id });
    const x = event.clientX;
    const y = event.clientY;
    const position = this.overlay.position().global();
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'tx-overlay-menu',
    });
    overlayRef.attach(new TemplatePortal(this.menuTemplate(), this.vcr));
    this.overlayRef = overlayRef;
    this.placeMenu(overlayRef, position, x, y);
    requestAnimationFrame(() => {
      if (this.overlayRef === overlayRef)
        this.placeMenu(overlayRef, position, x, y);
    });
    window.setTimeout(() => {
      if (this.overlayRef !== overlayRef)
        return;
      overlayRef.outsidePointerEvents().subscribe(() => this.closeMenu());
    });
  }

  startRename(id: string): void {
    this.closeMenu();
    this.renamingId.set(id);
  }

  commitRename(id: string, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.value.trim())
      this.renamed.emit({ id, name: target.value.trim() });
    this.renamingId.set(null);
  }

  menuAction(action: 'duplicate' | 'delete' | 'toggle' | 'run'): void {
    const menu = this.menu();
    this.closeMenu();
    if (!menu)
      return;
    const scenario = this.scenarios().find((item) => item.id === menu.id);
    if (action === 'duplicate')
      this.duplicated.emit(menu.id);
    else if (action === 'delete')
      this.removed.emit(menu.id);
    else if (action === 'run')
      this.runOne.emit(menu.id);
    else if (scenario)
      this.toggled.emit({ id: menu.id, enabled: !scenario.enabled });
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.closeMenu();
  }

  private placeMenu(overlayRef: OverlayRef, position: GlobalPositionStrategy, x: number, y: number): void {
    const menu = overlayRef.overlayElement.querySelector('.tx-flow-scenarios__menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 150;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 180;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }

  private closeMenu(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.menu.set(null);
  }
}
