import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { AppearanceThemeId, ThemePalette, ThemeUiGroup } from '@shared/theme';

import { TxLazyVisibleDirective } from '../../../directives/tx-lazy-visible.directive';
import { TxThemeLayoutPreviewComponent } from '../../tx-theme-layout-preview/tx-theme-layout-preview.component';

const THEME_CHUNK_SIZE = 12;

@Component({
  selector: 'tx-settings-theme-group',
  standalone: true,
  imports: [TxLazyVisibleDirective, TxThemeLayoutPreviewComponent],
  templateUrl: './tx-settings-theme-group.component.html',
  styleUrl: './tx-settings-theme-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-settings-theme-group',
  },
})
export class TxSettingsThemeGroupComponent {
  readonly group = input.required<ThemeUiGroup>();
  readonly scrollRoot = input<HTMLElement | null>(null);
  readonly eager = input(false);
  readonly activeTheme = input.required<AppearanceThemeId>();
  readonly paletteFor = input.required<(themeId: string) => ThemePalette | undefined>();

  readonly themeSelect = output<AppearanceThemeId>();

  private readonly destroyRef = inject(DestroyRef);
  private chunkIdleHandle: ReturnType<typeof requestIdleCallback> | null = null;

  protected readonly groupVisible = signal(false);
  protected readonly renderedCount = signal(0);

  private readonly groupLazy = viewChild(TxLazyVisibleDirective);

  constructor() {
    effect(() => {
      const visible = this.groupLazy()?.visible() ?? false;
      this.groupVisible.set(visible);
    });

    effect(() => {
      if (!this.groupVisible()) {
        this.cancelChunkedRender();
        this.renderedCount.set(0);
        return;
      }
      this.startChunkedRender(this.group().themes.length);
    });

    this.destroyRef.onDestroy(() => this.cancelChunkedRender());
  }

  protected visibleThemes(): readonly string[] {
    return this.group().themes.slice(0, this.renderedCount());
  }

  protected skeletonSlots(): readonly number[] {
    const group = this.group();
    const columns = 3;
    const rows = 2;
    return Array.from({ length: Math.min(group.themes.length, columns * rows) }, (_, index) => index);
  }

  protected isActive(themeId: AppearanceThemeId): boolean {
    return this.activeTheme() === themeId;
  }

  protected handleSelect(themeId: AppearanceThemeId): void {
    this.themeSelect.emit(themeId);
  }

  private startChunkedRender(total: number): void {
    this.cancelChunkedRender();
    const initial = Math.min(this.eager() ? total : THEME_CHUNK_SIZE, total);
    this.renderedCount.set(initial);
    if (initial >= total) {
      return;
    }

    let count = initial;
    const step = (): void => {
      this.chunkIdleHandle = null;
      if (!this.groupVisible()) {
        return;
      }
      count = Math.min(count + THEME_CHUNK_SIZE, total);
      this.renderedCount.set(count);
      if (count < total) {
        this.chunkIdleHandle = requestIdleCallback(step, { timeout: 48 });
      }
    };
    this.chunkIdleHandle = requestIdleCallback(step, { timeout: 48 });
  }

  private cancelChunkedRender(): void {
    if (this.chunkIdleHandle != null) {
      cancelIdleCallback(this.chunkIdleHandle);
      this.chunkIdleHandle = null;
    }
  }
}
