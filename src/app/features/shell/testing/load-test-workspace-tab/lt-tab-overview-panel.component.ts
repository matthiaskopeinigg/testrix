import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { LoadTestTabSectionId } from '@shared/config';
import type { LoadTestProfile, LoadTestRunRecord } from '@shared/testing';
import {
  buildLoadTestHealthOverview,
  compareLoadTestRunSummaries,
  loadTestHealthTagVariant,
  metricsFromRunRecord,
} from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

interface LtOverviewConfigCard {
  readonly section: LoadTestTabSectionId;
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

interface LtOverviewRunStat {
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

@Component({
  selector: 'app-lt-tab-overview-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxTagComponent,
    TxTextareaComponent,
  ],
  template: `
    <div class="lt-overview">
      <header class="lt-overview__hero">
        <div>
          <h2 class="lt-overview__title">Overview</h2>
          <p class="lt-overview__subtitle">
            Profile, target, and the most recent run at a glance.
          </p>
        </div>
      </header>

      <div class="lt-overview__layout">
        <section class="lt-overview-card lt-overview-card--about" aria-label="About this load test">
          <h3 class="lt-overview-card__title">About</h3>
          <tx-form-field label="Description" controlId="lt-description">
            <tx-textarea
              id="lt-description"
              [ngModel]="description()"
              (ngModelChange)="descriptionChange.emit($event)"
              placeholder="Short summary of this load test"
            />
          </tx-form-field>
        </section>

        <section class="lt-overview-card lt-overview-card--run" aria-label="Last run">
          <div class="lt-overview-card__head">
            <h3 class="lt-overview-card__title">Last run</h3>
            @if (lastRun()) {
              <div class="lt-overview-card__tags">
                @if (lastRunHealth()) {
                  <tx-tag [variant]="lastRunHealthTagVariant()" casing="normal">
                    Score {{ lastRunHealth()!.score }}
                  </tx-tag>
                }
                <tx-tag [variant]="statusVariant(lastRun()!.status)" casing="normal">
                  {{ lastRun()!.status }}
                </tx-tag>
              </div>
            }
          </div>

          @if (lastRun(); as run) {
            <p class="lt-overview-run__time">{{ formatRunTime(run) }}</p>

            <div class="lt-overview-run__stats">
              @for (stat of lastRunStats(); track stat.label) {
                <article class="lt-overview-run-stat">
                  <tx-icon [name]="stat.icon" [size]="14" aria-hidden="true" />
                  <span class="lt-overview-run-stat__label">{{ stat.label }}</span>
                  <strong class="lt-overview-run-stat__value">{{ stat.value }}</strong>
                </article>
              }
            </div>

            @if (baselineDeltaLabel()) {
              <p class="lt-overview-run__delta">
                <tx-icon name="barChart" [size]="12" aria-hidden="true" />
                {{ baselineDeltaLabel() }}
              </p>
            }

            <div class="lt-overview-run__footer">
              <p class="lt-overview-run__history">{{ runCountLabel() }}</p>
              <tx-button variant="secondary" (pressed)="openHistory.emit()">Open run history</tx-button>
            </div>
          } @else {
            <div class="lt-overview-empty">
              <span class="lt-overview-empty__icon" aria-hidden="true">
                <tx-icon name="zap" [size]="18" />
              </span>
              <p class="lt-overview-empty__title">No runs yet</p>
              <p class="lt-overview-empty__hint">
                Start a load test from the toolbar to capture throughput, latency, and success metrics here.
              </p>
            </div>
          }
        </section>
      </div>

      <section class="lt-overview-config" aria-label="Configuration summary">
        <div class="lt-overview-config__head">
          <h3 class="lt-overview-card__title">Configuration</h3>
          <p class="lt-overview-config__hint">Jump to a section to edit settings.</p>
        </div>

        <div class="lt-overview-config__grid">
          @for (card of configCards(); track card.section) {
            <button
              type="button"
              class="lt-overview-config-card"
              (click)="sectionSelect.emit(card.section)"
            >
              <span class="lt-overview-config-card__icon" aria-hidden="true">
                <tx-icon [name]="card.icon" [size]="16" />
              </span>
              <span class="lt-overview-config-card__body">
                <span class="lt-overview-config-card__label">{{ card.label }}</span>
                <span class="lt-overview-config-card__value">{{ card.value }}</span>
              </span>
              <tx-icon
                class="lt-overview-config-card__chevron"
                name="chevronRight"
                [size]="14"
                aria-hidden="true"
              />
            </button>
          }
        </div>
      </section>
    </div>
  `,
  styleUrl: './lt-tab-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTabOverviewPanelComponent {
  readonly description = input('');
  readonly profile = input<LoadTestProfile | undefined>(undefined);
  readonly targetSummary = input('—');
  readonly runs = input<readonly LoadTestRunRecord[]>([]);
  readonly pinnedBaselineRunId = input<string | null>(null);

  readonly descriptionChange = output<string>();
  readonly openHistory = output<void>();
  readonly sectionSelect = output<LoadTestTabSectionId>();

  protected readonly lastRun = computed(() => this.runs()[0] ?? null);

  protected readonly lastRunHealth = computed(() => {
    const run = this.lastRun();
    if (!run) {
      return null;
    }
    return buildLoadTestHealthOverview(metricsFromRunRecord(run), run.thresholdsSnapshot);
  });

  protected readonly lastRunHealthTagVariant = computed(() => {
    const health = this.lastRunHealth();
    if (!health) {
      return 'default' as const;
    }
    return loadTestHealthTagVariant(health.level);
  });

  protected readonly lastRunStats = computed((): readonly LtOverviewRunStat[] => {
    const run = this.lastRun();
    if (!run) {
      return [];
    }
    const { summary } = run;
    return [
      {
        label: 'Success',
        value: `${summary.successRatePercent.toFixed(2)}%`,
        icon: 'checkCircle',
      },
      {
        label: 'Throughput',
        value: `${summary.requestsPerSec.toFixed(1)} rps`,
        icon: 'zap',
      },
      {
        label: 'Duration',
        value: `${summary.elapsedSec.toFixed(1)}s`,
        icon: 'clock',
      },
      {
        label: 'P95 latency',
        value: `${Math.round(summary.latencyMs.p95)} ms`,
        icon: 'activity',
      },
    ];
  });

  protected readonly runCountLabel = computed(() => {
    const count = this.runs().length;
    if (count === 0) {
      return 'No saved runs yet.';
    }
    return `${count} saved run${count === 1 ? '' : 's'} in history`;
  });

  protected readonly configCards = computed((): readonly LtOverviewConfigCard[] => {
    const profile = this.profile();
    const profileValue = profile
      ? `${profile.virtualUsers} VUs · ${profile.durationSec}s · ${profile.rampUpSec}s ramp`
      : '—';

    return [
      { section: 'profile', label: 'Profile', value: profileValue, icon: 'sliders' },
      { section: 'target', label: 'Target', value: this.targetSummary(), icon: 'target' },
      { section: 'thresholds', label: 'Thresholds', value: 'Pass / fail gates', icon: 'checkCircle' },
    ];
  });

  protected readonly baselineDeltaLabel = computed(() => {
    const last = this.lastRun();
    const baselineId = this.pinnedBaselineRunId();
    if (!last || !baselineId) {
      return '';
    }
    const baseline = this.runs().find((run) => run.id === baselineId);
    if (!baseline || baseline.id === last.id) {
      return '';
    }
    const deltas = compareLoadTestRunSummaries(baseline.summary, last.summary);
    const success = deltas.find((d) => d.label === 'Success rate');
    const throughput = deltas.find((d) => d.label === 'Throughput');
    if (!success || !throughput) {
      return '';
    }
    return `Vs baseline: success ${success.delta}, throughput ${throughput.delta}`;
  });

  protected formatRunTime(run: LoadTestRunRecord): string {
    return new Date(run.startedAt).toLocaleString();
  }

  protected statusVariant(
    status: LoadTestRunRecord['status'],
  ): 'success' | 'warning' | 'error' | 'default' {
    if (status === 'passed') {
      return 'success';
    }
    if (status === 'failed') {
      return 'error';
    }
    if (status === 'cancelled') {
      return 'warning';
    }
    return 'default';
  }
}
