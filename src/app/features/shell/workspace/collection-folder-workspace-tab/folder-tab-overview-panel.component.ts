import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionFolderSettings, CollectionFolderTabSectionId } from '@shared/config';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import { TxTagsInputComponent } from '@app/shared/components/tx-tags-input/tx-tags-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

import {
  buildFolderOverviewConfigCards,
  type FolderOverviewContentsCounts,
  type FolderOverviewInheritedVariable,
  type FolderOverviewOwnVariable,
} from './folder-tab-overview-summary';
import { iconForCollectionKind } from '@app/features/shell/collections/collection-tree.icons';

const INHERITED_VARIABLES_PREVIEW_LIMIT = 8;
const OWN_VARIABLES_PREVIEW_LIMIT = 8;

interface FolderOverviewContentsStat {
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

@Component({
  selector: 'app-folder-tab-overview-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxIconComponent, TxTagsInputComponent, TxTextareaComponent],
  templateUrl: './folder-tab-overview-panel.component.html',
  styleUrl: './folder-tab-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderTabOverviewPanelComponent {
  readonly description = input('');
  readonly tags = input<readonly string[]>([]);
  readonly folderName = input('Folder');
  readonly parentPath = input('');
  readonly environmentName = input('No environment');
  readonly settings = input.required<CollectionFolderSettings>();
  readonly contentsCounts = input<FolderOverviewContentsCounts>({ requests: 0, folders: 0 });
  readonly inheritedVariables = input<readonly FolderOverviewInheritedVariable[]>([]);
  readonly ownVariables = input<readonly FolderOverviewOwnVariable[]>([]);

  readonly descriptionChange = output<string>();
  readonly tagsChange = output<readonly string[]>();
  readonly sectionSelect = output<CollectionFolderTabSectionId>();

  protected readonly configCards = computed(() => buildFolderOverviewConfigCards(this.settings()));

  protected readonly inheritedVariablesPreview = computed(() =>
    this.inheritedVariables().slice(0, INHERITED_VARIABLES_PREVIEW_LIMIT),
  );

  protected readonly inheritedVariablesOverflow = computed(() =>
    Math.max(0, this.inheritedVariables().length - INHERITED_VARIABLES_PREVIEW_LIMIT),
  );

  protected readonly ownVariablesPreview = computed(() =>
    this.ownVariables().slice(0, OWN_VARIABLES_PREVIEW_LIMIT),
  );

  protected readonly ownVariablesOverflow = computed(() =>
    Math.max(0, this.ownVariables().length - OWN_VARIABLES_PREVIEW_LIMIT),
  );

  protected contentsStats(): readonly FolderOverviewContentsStat[] {
    const counts = this.contentsCounts();
    const settings = this.settings();
    const variableCount = settings.variables.filter((row) => row.key.trim()).length;
    const headerCount = settings.headers.filter((row) => row.key.trim()).length;

    return [
      { label: 'Requests', value: `${counts.requests}`, icon: iconForCollectionKind('request') },
      { label: 'Subfolders', value: `${counts.folders}`, icon: iconForCollectionKind('folder') },
      { label: 'Variables', value: `${variableCount}`, icon: 'hash' },
      { label: 'Headers', value: `${headerCount}`, icon: 'layers' },
    ];
  }

  protected handleVariablesSelect(): void {
    this.sectionSelect.emit('variables');
  }
}
