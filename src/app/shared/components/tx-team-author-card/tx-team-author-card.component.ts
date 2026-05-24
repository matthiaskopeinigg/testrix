import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatCommitTimestamp, formatRelativeCommitTime, isSameTeamAuthor } from '@shared/collaboration';

import { TxAuthorAvatarComponent } from '../tx-author-avatar/tx-author-avatar.component';
import { TxTagComponent } from '../tx-tag/tx-tag.component';

@Component({
  selector: 'tx-team-author-card',
  standalone: true,
  imports: [TxAuthorAvatarComponent, TxTagComponent],
  templateUrl: './tx-team-author-card.component.html',
  styleUrl: './tx-team-author-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxTeamAuthorCardComponent {
  readonly name = input('');
  readonly email = input('');
  readonly committedAt = input('');
  readonly currentAuthorEmail = input<string | null>(null);
  readonly compact = input(false);

  protected readonly isYou = computed(() => isSameTeamAuthor(this.email(), this.currentAuthorEmail()));
  protected readonly relativeWhen = computed(() => formatRelativeCommitTime(this.committedAt()));
  protected readonly fullWhen = computed(() => formatCommitTimestamp(this.committedAt()));
}
