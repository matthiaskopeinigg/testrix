import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  signal,
} from '@angular/core';

import {
  DESIGN_SYSTEM_ANIMATION_CATEGORIES,
  DESIGN_SYSTEM_ANIMATION_DEMOS,
  type DesignSystemAnimationCategory,
  type DesignSystemAnimationDemo,
} from '@app/core/design-system/design-system-animations.registry';
import { DESIGN_SYSTEM_TOKENS } from '@app/core/design-system/design-system.registry';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';

@Component({
  selector: 'app-ds-animations-panel',
  standalone: true,
  imports: [TxButtonComponent],
  templateUrl: './ds-animations-panel.component.html',
  styleUrl: './ds-animations-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsAnimationsPanelComponent implements AfterViewInit {
  readonly categories = DESIGN_SYSTEM_ANIMATION_CATEGORIES;
  readonly demos = DESIGN_SYSTEM_ANIMATION_DEMOS;
  readonly motionTokens = DESIGN_SYSTEM_TOKENS.filter((t) => t.category === 'motion');

  readonly replayGeneration = signal<Record<string, number>>({});
  readonly previewVisible = signal<Record<string, boolean>>({});
  readonly dndDenyActive = signal<Record<string, boolean>>({});

  @ViewChildren('focusPreviewBtn') private focusPreviewBtns?: QueryList<ElementRef<HTMLButtonElement>>;

  ngAfterViewInit(): void {
    for (const demo of this.demos) {
      if (demo.kind === 'dnd-deny') {
        this.scheduleDndDenyPulse(demo.id);
      }
    }
  }

  demosInCategory(category: DesignSystemAnimationCategory): readonly DesignSystemAnimationDemo[] {
    return this.demos.filter((demo) => demo.category === category);
  }

  trackDemo(demo: DesignSystemAnimationDemo): string {
    const generation = this.replayGeneration()[demo.id] ?? 0;
    return `${demo.id}-${generation}`;
  }

  isPreviewVisible(demoId: string): boolean {
    return this.previewVisible()[demoId] !== false;
  }

  isDndDenyActive(demoId: string): boolean {
    return this.dndDenyActive()[demoId] === true;
  }

  handleReplay(demo: DesignSystemAnimationDemo): void {
    if (!demo.replayable) {
      return;
    }

    this.previewVisible.update((current) => ({ ...current, [demo.id]: false }));

    requestAnimationFrame(() => {
      this.replayGeneration.update((current) => ({
        ...current,
        [demo.id]: (current[demo.id] ?? 0) + 1,
      }));
      this.previewVisible.update((current) => ({ ...current, [demo.id]: true }));

      if (demo.kind === 'dnd-deny') {
        this.scheduleDndDenyPulse(demo.id);
      }
      if (demo.kind === 'focus-glow') {
        requestAnimationFrame(() => this.focusGlowPreview(demo.id));
      }
    });
  }

  private scheduleDndDenyPulse(demoId: string): void {
    this.dndDenyActive.update((current) => ({ ...current, [demoId]: false }));
    requestAnimationFrame(() => {
      this.dndDenyActive.update((current) => ({ ...current, [demoId]: true }));
    });
  }

  private focusGlowPreview(demoId: string): void {
    const btn = this.focusPreviewBtns?.find((ref) => ref.nativeElement.dataset['demoId'] === demoId);
    const el = btn?.nativeElement;
    if (!el) {
      return;
    }
    el.classList.remove('is-replay-focus');
    el.blur();
    requestAnimationFrame(() => {
      el.classList.add('is-replay-focus');
      el.focus();
      window.setTimeout(() => el.classList.remove('is-replay-focus'), 700);
    });
  }
}
