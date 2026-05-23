import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { createHttpKeyValueRow } from '@shared/config';
import {
  MOCK_BODY_MATCH_MODE_IDS,
  MOCK_BODY_TYPE_IDS,
  MOCK_HEADER_MATCH_MODE_IDS,
  type MockBodyMatch,
  type MockBodyMatchMode,
  type MockBodyTypeId,
  type MockHeaderMatchMode,
  type MockHeaderMatchRow,
  type MockRuleMatcher,
} from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

import { moveMockMatcher } from './mock-server-matcher.utils';

const HEADER_MATCH_OPTIONS: readonly TxDropdownOption[] = MOCK_HEADER_MATCH_MODE_IDS.map((value) => ({
  value,
  label: value,
}));

const BODY_TYPE_OPTIONS: readonly TxDropdownOption[] = MOCK_BODY_TYPE_IDS.map((value) => ({
  value,
  label: value,
}));

const BODY_MATCH_OPTIONS: readonly TxDropdownOption[] = MOCK_BODY_MATCH_MODE_IDS.map((value) => ({
  value,
  label: value,
}));

function defaultBodyMatch(): MockBodyMatch {
  return { bodyType: 'json', match: 'contains', value: '' };
}

@Component({
  selector: 'app-ms-tab-matchers-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxCodeEditorComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxToggleComponent,
  ],
  templateUrl: './ms-tab-matchers-panel.component.html',
  styleUrl: './ms-tab-matchers-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MsTabMatchersPanelComponent {
  readonly matchers = input.required<readonly MockRuleMatcher[]>();

  readonly matchersChange = output<readonly MockRuleMatcher[]>();
  readonly addMatcher = output<void>();

  protected readonly headerMatchOptions = HEADER_MATCH_OPTIONS;
  protected readonly bodyTypeOptions = BODY_TYPE_OPTIONS;
  protected readonly bodyMatchOptions = BODY_MATCH_OPTIONS;

  protected bodyEnabled(matcher: MockRuleMatcher): boolean {
    return matcher.body !== undefined;
  }

  protected canReorder(index: number): boolean {
    return index > 0;
  }

  protected handlePatch(index: number, patch: Partial<MockRuleMatcher>): void {
    this.emitMatchers(
      this.matchers().map((matcher, i) => (i === index ? { ...matcher, ...patch } : matcher)),
    );
  }

  protected handleBodyToggle(index: number, enabled: boolean): void {
    const matcher = this.matchers()[index];
    if (!matcher) {
      return;
    }
    this.handlePatch(index, {
      body: enabled ? (matcher.body ?? defaultBodyMatch()) : undefined,
    });
  }

  protected handleBodyPatch(index: number, patch: Partial<MockBodyMatch>): void {
    const matcher = this.matchers()[index];
    if (!matcher) {
      return;
    }
    const current = matcher.body ?? defaultBodyMatch();
    const body: MockBodyMatch = {
      ...current,
      ...patch,
      bodyType:
        patch.bodyType !== undefined ? (patch.bodyType as MockBodyTypeId) : current.bodyType,
      match: patch.match !== undefined ? (patch.match as MockBodyMatchMode) : current.match,
    };
    this.handlePatch(index, { body });
  }

  protected handleAddHeader(index: number): void {
    const matcher = this.matchers()[index];
    if (!matcher) {
      return;
    }
    const row = { ...createHttpKeyValueRow(), match: 'equals' as MockHeaderMatchMode };
    this.handlePatch(index, { headers: [...matcher.headers, row] });
  }

  protected handleHeaderPatch(
    index: number,
    rowIndex: number,
    patch: Partial<MockHeaderMatchRow>,
  ): void {
    const matcher = this.matchers()[index];
    if (!matcher) {
      return;
    }
    const headers = matcher.headers.map((row, i) => {
      if (i !== rowIndex) {
        return row;
      }
      const match =
        patch.match !== undefined ? (patch.match as MockHeaderMatchMode) : row.match;
      return { ...row, ...patch, match };
    });
    this.handlePatch(index, { headers });
  }

  protected handleRemoveHeader(index: number, rowIndex: number): void {
    const matcher = this.matchers()[index];
    if (!matcher) {
      return;
    }
    this.handlePatch(index, {
      headers: matcher.headers.filter((_, i) => i !== rowIndex),
    });
  }

  protected handleRemoveMatcher(index: number): void {
    this.emitMatchers(this.matchers().filter((_, i) => i !== index));
  }

  protected handleMoveMatcher(index: number, direction: -1 | 1): void {
    if (index <= 0) {
      return;
    }
    this.emitMatchers(moveMockMatcher(this.matchers(), index, direction));
  }

  protected canMoveUp(index: number): boolean {
    return index > 1;
  }

  protected canMoveDown(index: number): boolean {
    return index > 0 && index < this.matchers().length - 1;
  }

  protected bodyMatchUsesEditor(match: MockBodyMatchMode): boolean {
    return match === 'jsonPath' || match === 'jsonSchema';
  }

  private emitMatchers(matchers: readonly MockRuleMatcher[]): void {
    this.matchersChange.emit(matchers);
  }
}
