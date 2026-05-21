import { DecimalPipe, JsonPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  findComponentEntry,
  parseComponentSectionId,
} from '@app/core/design-system/design-system.registry';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { TxAutofocusDirective } from '@app/shared/directives/tx-autofocus.directive';
import { TruncatePipe } from '@app/shared/pipes/truncate.pipe';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxBrandLogoComponent } from '@app/shared/components/tx-brand-logo/tx-brand-logo.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxModalComponent } from '@app/shared/components/tx-modal/tx-modal.component';
import { TxDividerComponent } from '@app/shared/components/tx-divider/tx-divider.component';
import { TxTooltipDirective } from '@app/shared/components/tx-tooltip/tx-tooltip.directive';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxVariableInputComponent } from '@app/shared/components/tx-variable-input/tx-variable-input.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxSliderComponent } from '@app/shared/components/tx-slider/tx-slider.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';
import { TxSpinnerComponent } from '@app/shared/components/tx-spinner/tx-spinner.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import {
  TX_CODE_EDITOR_LANGUAGES,
  txCodeEditorLanguageLabel,
  type TxCodeEditorLanguage,
} from '@app/shared/components/tx-code-editor/tx-code-editor-language';
import { TX_CODE_EDITOR_SAMPLES } from '@app/shared/components/tx-code-editor/tx-code-editor-samples';
import { TxWindowTitlebarComponent } from '@app/shared/components/tx-window-titlebar/tx-window-titlebar.component';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTabBarComponent } from '@app/shared/components/tx-tab-bar/tx-tab-bar.component';
import { TxTabComponent } from '@app/shared/components/tx-tab/tx-tab.component';
import type { TxTabBarItem } from '@app/shared/components/tx-tab/tx-tab.types';
import { TxSplitPaneComponent } from '@app/shared/components/tx-split-pane/tx-split-pane.component';
import type { SplitLayoutNode } from '@shared/config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import { TX_TREE_DEMO_NODES } from '@app/shared/components/tx-tree/tx-tree.sample';
import {
  TX_TREE_INITIAL_DND_DEBUG_INFO,
  TX_TREE_ROW_HIT_SLOP_PX,
  type TxTreeDnDDebugInfo,
  type TxTreeDragScope,
  type TxTreeNode,
  type TxTreeNodeDropEvent,
  type TxTreeSiblingSort,
} from '@app/shared/components/tx-tree/tx-tree.types';

interface ButtonDemoSpec {
  readonly key: string;
  readonly variant: 'cta' | 'primary' | 'secondary' | 'add';
  readonly label: string;
  readonly disabled?: boolean;
  readonly usesLoading?: boolean;
}

type DropdownDemoMode = 'field' | 'standalone' | 'disabled' | 'empty';

interface DropdownDemoSpec {
  readonly key: string;
  readonly meta: string;
  readonly mode: DropdownDemoMode;
  readonly foot: string;
}

const DROPDOWN_DEMO_SPECS: readonly DropdownDemoSpec[] = [
  {
    key: 'field',
    meta: 'tx-form-field + tx-dropdown',
    mode: 'field',
    foot: 'span.tx-field__label (caption) · button.tx-dropdown__trigger · hover + click',
  },
  {
    key: 'standalone',
    meta: 'tx-dropdown-host (no label)',
    mode: 'standalone',
    foot: ':host { width: 100% } · min-height var(--tx-control-height-md)',
  },
  {
    key: 'disabled',
    meta: '[disabled]="true"',
    mode: 'disabled',
    foot: 'button.tx-dropdown__trigger:disabled',
  },
  {
    key: 'empty',
    meta: 'options.length === 0',
    mode: 'empty',
    foot: 'li.tx-dropdown__empty · role=listbox',
  },
];

const BUTTON_DEMO_SPECS: readonly ButtonDemoSpec[] = [
  { key: 'cta', variant: 'cta', label: 'CTA' },
  { key: 'primary', variant: 'primary', label: 'Primary' },
  { key: 'secondary', variant: 'secondary', label: 'Secondary' },
  { key: 'add', variant: 'add', label: 'Add' },
  { key: 'disabled', variant: 'primary', label: 'Disabled', disabled: true },
  { key: 'saving', variant: 'primary', label: 'Saving…', usesLoading: true },
  { key: 'submit', variant: 'cta', label: 'Submit', usesLoading: true },
];

@Component({
  selector: 'app-ds-components-panel',
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
    JsonPipe,
    TruncatePipe,
    TxAutofocusDirective,
    TxButtonComponent,
    TxBannerComponent,
    TxBrandLogoComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxModalComponent,
    TxDividerComponent,
    TxTooltipDirective,
    TxInputComponent,
    TxVariableInputComponent,
    TxDropdownComponent,
    TxSliderComponent,
    TxSpinnerComponent,
    TxTagComponent,
    TxTextareaComponent,
    TxToggleComponent,
    TxCodeEditorComponent,
    TxWindowTitlebarComponent,
    TxTabComponent,
    TxTabBarComponent,
    TxSplitPaneComponent,
    TxTreeComponent,
  ],
  templateUrl: './ds-components-panel.component.html',
  styleUrl: './ds-components-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsComponentsPanelComponent {
  readonly sectionId = input.required<string>();
  readonly debugEnabled = input(false);

  private readonly notifier = inject(ErrorNotificationService);
  private readonly notifications = inject(TxNotificationService);

  readonly modalOpen = signal(false);
  readonly inputDemo = signal('https://api.example.com');
  readonly variableInputDemo = signal('Bearer $uuid');
  readonly dropdownDemo = signal('json');
  readonly dropdownStandaloneDemo = signal<string | null>(null);
  readonly dropdownDisabledDemo = signal('graphql');
  readonly dropdownEmptyDemo = signal<string | null>(null);
  readonly dropdownOptions: readonly TxDropdownOption[] = [
    { value: 'json', label: 'JSON', icon: 'code' },
    { value: 'graphql', label: 'GraphQL', icon: 'api' },
    { value: 'text', label: 'Plain text', icon: 'fileText' },
  ];
  readonly dropdownEmptyOptions: readonly TxDropdownOption[] = [];
  readonly textareaDemo = signal('{\n  "name": "Testrix"\n}');
  readonly codeEditorLanguages = TX_CODE_EDITOR_LANGUAGES;
  readonly codeEditorLanguageLabel = txCodeEditorLanguageLabel;
  readonly codeEditorLanguage = signal<TxCodeEditorLanguage>('json');
  readonly codeEditorDemo = signal(TX_CODE_EDITOR_SAMPLES.json);
  readonly toggleDemo = signal(true);
  readonly sliderDemo = signal(60);
  readonly showRemovableTag = signal(true);
  readonly showDismissibleBanner = signal(true);
  readonly demoButtonLoading = signal(true);
  readonly tabBarDemo = signal<readonly TxTabBarItem[]>([
    { id: 'a', label: 'GET /users', method: 'GET', active: true, pinned: true },
    { id: 'b', label: 'POST /login', method: 'POST' },
    { id: 'c', label: 'Health', method: 'GET' },
  ]);
  protected handleTabBarDemoActivate(tabId: string): void {
    this.tabBarDemo.set(this.tabBarDemo().map((t) => ({ ...t, active: t.id === tabId })));
  }

  readonly splitDemoLayout = signal<SplitLayoutNode>({
    type: 'split',
    direction: 'horizontal',
    ratio: 0.5,
    first: { type: 'leaf', groupId: 'left' },
    second: { type: 'leaf', groupId: 'right' },
  });
  protected readonly buttonDemoSpecs = BUTTON_DEMO_SPECS;
  protected readonly dropdownDemoSpecs = DROPDOWN_DEMO_SPECS;
  protected readonly treeDragScopes: readonly TxTreeDragScope[] = ['anywhere', 'sameParent', 'subtree'];
  protected readonly treeSortModes: readonly TxTreeSiblingSort[] = [
    'order',
    'priority',
    'orderThenPriority',
    'manual',
  ];
  readonly truncateSample =
    'https://api.example.com/v1/collections/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/requests';

  readonly treeDemoNodes = signal<typeof TX_TREE_DEMO_NODES>([...TX_TREE_DEMO_NODES]);
  readonly treeDemoExpandedIds = signal<string[]>([]);
  readonly treeDragEnabled = signal(true);
  readonly treeReparentAllowed = signal(true);
  readonly treeHandleOnly = signal(false);
  readonly treeMaxDepth = signal<number | null>(null);
  readonly treeDragScope = signal<TxTreeDragScope>('anywhere');
  readonly treeSiblingSort = signal<TxTreeSiblingSort>('orderThenPriority');
  readonly treeExpandFolderOnDrag = signal(false);
  readonly treeAnimateMove = signal(true);
  readonly treeLastDrop = signal<TxTreeNodeDropEvent | null>(null);
  readonly treeDndDebug = signal<TxTreeDnDDebugInfo>({ ...TX_TREE_INITIAL_DND_DEBUG_INFO });
  protected readonly treeHitSlopPx = TX_TREE_ROW_HIT_SLOP_PX;

  readonly treeDemoConfig = computed(() =>
    mergeTxTreeConfig({
      expansion: {
        expandFolderOnDrag: this.treeExpandFolderOnDrag(),
        expandFolderOnDrop: false,
      },
      visual: {
        animateMove: this.treeAnimateMove(),
        indentPx: this.debugEnabled() ? 48 : 28,
        showDragHandle: this.debugEnabled(),
      },
      drag: {
        enabled: this.treeDragEnabled(),
        handleOnly: this.treeHandleOnly(),
        scope: this.treeDragScope(),
      },
      drop: {
        enabled: this.treeDragEnabled(),
        reparentAllowed: this.treeReparentAllowed(),
        maxDepth: this.treeMaxDepth(),
        positions: ['before', 'after', 'inside'],
      },
      sort: {
        siblingSort: this.treeSiblingSort(),
      },
    }),
  );

  readonly entry = computed(() => {
    const id = parseComponentSectionId(this.sectionId());
    return id ? findComponentEntry(id) : undefined;
  });

  showDemoBanner(): void {
    this.notifier.reportFromMessage('Design System demo', 'Sample error surfaced via ErrorNotificationService.');
  }

  showDemoNotification(): void {
    this.notifications.showSuccess('Settings saved');
  }

  openModal(): void {
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  setCodeEditorLanguage(language: TxCodeEditorLanguage): void {
    this.codeEditorLanguage.set(language);
    this.codeEditorDemo.set(TX_CODE_EDITOR_SAMPLES[language]);
  }

  handleTreeNodesChange(nodes: readonly TxTreeNode[]): void {
    this.treeDemoNodes.set([...nodes]);
  }

  handleTreeExpandedChange(ids: readonly string[]): void {
    this.treeDemoExpandedIds.set([...ids]);
  }

  handleTreeDrop(event: TxTreeNodeDropEvent): void {
    this.treeLastDrop.set(event);
  }

  handleTreeDndDebugChange(info: TxTreeDnDDebugInfo): void {
    this.treeDndDebug.set(info);
  }

  setTreeDragScope(scope: TxTreeDragScope): void {
    this.treeDragScope.set(scope);
  }

  setTreeSiblingSort(mode: TxTreeSiblingSort): void {
    this.treeSiblingSort.set(mode);
  }
}
