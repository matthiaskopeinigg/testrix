import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { AppearanceThemeId } from '@shared/theme';

import { TxThemeLayoutPreviewComponent } from '../../tx-theme-layout-preview/tx-theme-layout-preview.component';

import type { SettingsThemePickerGroup } from './tx-settings-theme-picker.data';

@Component({
  selector: 'tx-settings-theme-group',
  standalone: true,
  imports: [TxThemeLayoutPreviewComponent],
  templateUrl: './tx-settings-theme-group.component.html',
  styleUrl: './tx-settings-theme-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-settings-theme-group',
  },
})
export class TxSettingsThemeGroupComponent {
  readonly group = input.required<SettingsThemePickerGroup>();
  readonly activeTheme = input.required<AppearanceThemeId>();

  readonly themeSelect = output<AppearanceThemeId>();

  protected isActive(themeId: AppearanceThemeId): boolean {
    return this.activeTheme() === themeId;
  }

  protected handleSelect(themeId: AppearanceThemeId): void {
    this.themeSelect.emit(themeId);
  }
}
