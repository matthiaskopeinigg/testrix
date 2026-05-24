import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

import { parseUnifiedDiffLines, type TeamCommitDetail, type TeamCommitFileChange } from '@shared/collaboration';

import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxSpinnerComponent } from '../tx-spinner/tx-spinner.component';
import { TxTagComponent } from '../tx-tag/tx-tag.component';
import { TxTeamAuthorCardComponent } from '../tx-team-author-card/tx-team-author-card.component';

@Component({
  selector: 'tx-team-commit-diff',
  standalone: true,
  imports: [TxIconComponent, TxSpinnerComponent, TxTagComponent, TxTeamAuthorCardComponent],
  templateUrl: './tx-team-commit-diff.component.html',
  styleUrl: './tx-team-commit-diff.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxTeamCommitDiffComponent {
  readonly detail = input<TeamCommitDetail | null>(null);
  readonly loading = input(false);
  readonly currentAuthorEmail = input<string | null>(null);

  protected readonly selectedFilePath = signal<string | null>(null);

  constructor() {
    effect(() => {
      const firstPath = this.detail()?.files[0]?.path ?? null;
      this.selectedFilePath.set(firstPath);
    });
  }

  protected readonly selectedFile = computed((): TeamCommitFileChange | null => {
    const d = this.detail();
    if (!d || d.files.length === 0) {
      return null;
    }
    const path = this.selectedFilePath() ?? d.files[0]?.path ?? null;
    return d.files.find((file) => file.path === path) ?? d.files[0] ?? null;
  });

  protected readonly diffLines = computed(() => {
    const file = this.selectedFile();
    if (!file?.diff.trim()) {
      return [];
    }
    return parseUnifiedDiffLines(file.diff);
  });

  protected handleSelectFile(path: string): void {
    this.selectedFilePath.set(path);
  }

  protected fileStatusLabel(status: TeamCommitFileChange['status']): string {
    switch (status) {
      case 'added':
        return 'Added';
      case 'deleted':
        return 'Deleted';
      case 'renamed':
        return 'Renamed';
      default:
        return 'Modified';
    }
  }

  protected fileStatusVariant(status: TeamCommitFileChange['status']): 'success' | 'warning' | 'error' | 'info' | 'default' {
    switch (status) {
      case 'added':
        return 'success';
      case 'deleted':
        return 'error';
      case 'renamed':
        return 'info';
      default:
        return 'default';
    }
  }
}
