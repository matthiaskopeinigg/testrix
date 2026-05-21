import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ConfigService } from '@app/core/config/config.service';
import { DESIGN_SYSTEM_TOKENS } from '@app/core/design-system/design-system.registry';
import { ThemeService } from '@app/core/theme/theme.service';
import { ElectronService } from '@app/core/electron/electron.service';
import type { AppearanceThemeId, ThemePalette, ThemeUiGroup } from '@shared/theme';
import { THEME_PALETTES, THEME_UI_GROUPS, findThemePalette, getThemeLabel } from '@shared/theme';
import { TX_ICON_NAMES } from '@app/shared/icons/tx-icon.registry';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxThemeLayoutPreviewComponent } from '@app/shared/components/tx-theme-layout-preview/tx-theme-layout-preview.component';

import { DsAnimationsPanelComponent } from './ds-animations-panel.component';

@Component({
  selector: 'app-ds-style-guide-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxIconComponent,
    TxThemeLayoutPreviewComponent,
    DsAnimationsPanelComponent,
  ],
  templateUrl: './ds-style-guide-panel.component.html',
  styleUrl: './ds-style-guide-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsStyleGuidePanelComponent {
  readonly sectionId = input.required<string>();

  private readonly config = inject(ConfigService);
  private readonly electron = inject(ElectronService);
  private readonly themeService = inject(ThemeService);

  readonly tokens = DESIGN_SYSTEM_TOKENS;
  readonly iconNames = TX_ICON_NAMES;
  readonly iconFilter = signal('');
  readonly themeFilter = signal('');

  readonly filteredIcons = computed(() => {
    const query = this.iconFilter().trim().toLowerCase();
    if (!query) return this.iconNames;
    return this.iconNames.filter((name) => name.toLowerCase().includes(query));
  });

  readonly themeUiGroups = computed((): readonly ThemeUiGroup[] => {
    const query = this.themeFilter().trim().toLowerCase();
    if (!query) {
      return THEME_UI_GROUPS;
    }
    const match = (id: string) => {
      const palette = findThemePalette(id);
      return (
        id.includes(query) ||
        (palette?.label.toLowerCase().includes(query) ?? false)
      );
    };
    return THEME_UI_GROUPS.map((group) => ({
      ...group,
      themes: group.themes.filter(match),
    })).filter((group) => group.themes.length > 0);
  });

  readonly configDir = signal<string>('…');
  readonly bridgeLine = computed(() => {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return 'No preload bridge (browser-only harness).';
    }
    const { platform, versions, devToolkit } = bridge;
    return `${platform} · app ${versions.app} · electron ${versions.electron} · devToolkit=${String(devToolkit)}`;
  });

  readonly activeTheme = computed(() => this.themeService.theme());
  readonly themeCount = THEME_PALETTES.length;

  constructor() {
    void this.loadConfigDir();
  }

  paletteFor(themeId: string): ThemePalette | undefined {
    return findThemePalette(themeId);
  }

  themeLabel(themeId: AppearanceThemeId): string {
    return getThemeLabel(themeId);
  }

  async applyTheme(theme: AppearanceThemeId): Promise<void> {
    await this.themeService.setTheme(theme, true);
  }

  handleIconFilterInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.iconFilter.set(target.value);
  }

  handleThemeFilterInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.themeFilter.set(target.value);
  }

  async handleHydrateConfig(): Promise<void> {
    await this.config.hydrate();
    await this.loadConfigDir();
  }

  private async loadConfigDir(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      this.configDir.set('(unavailable)');
      return;
    }
    try {
      this.configDir.set(await bridge.config.getConfigDir());
    } catch {
      this.configDir.set('(error)');
    }
  }
}
