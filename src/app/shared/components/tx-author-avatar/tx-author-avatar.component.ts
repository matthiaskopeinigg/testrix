import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { getAuthorAvatarHue, getAuthorInitials } from '@shared/collaboration';

export type TxAuthorAvatarSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'tx-author-avatar',
  standalone: true,
  templateUrl: './tx-author-avatar.component.html',
  styleUrl: './tx-author-avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-author-avatar-host',
    '[class.tx-author-avatar-host--sm]': 'size() === "sm"',
    '[class.tx-author-avatar-host--md]': 'size() === "md"',
    '[class.tx-author-avatar-host--lg]': 'size() === "lg"',
    '[style.--tx-author-avatar-hue]': 'avatarHue()',
  },
})
export class TxAuthorAvatarComponent {
  readonly name = input('');
  readonly email = input('');
  readonly size = input<TxAuthorAvatarSize>('md');
  readonly title = input<string | undefined>(undefined);

  protected readonly initials = computed(() => getAuthorInitials(this.name(), this.email()));
  protected readonly avatarHue = computed(() => String(getAuthorAvatarHue(this.email(), this.name())));
  protected readonly tooltip = computed(
    () => this.title() ?? `${this.name().trim() || 'Unknown'} · ${this.email().trim() || 'no email'}`,
  );
}
