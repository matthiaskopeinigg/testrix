import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import type { PackSecretReport } from '@testrix/contracts'
import { formatPackSecretGroup } from '@testrix/contracts'

@Component({
  selector: 'tx-secret-audit',
  standalone: true,
  templateUrl: './secret-audit.component.html',
  styleUrl: './secret-audit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecretAuditComponent {
  readonly report = input.required<PackSecretReport>()
  readonly omitSecrets = input(true)

  lines(): readonly string[] {
    return this.report().groups.map(formatPackSecretGroup)
  }
}
