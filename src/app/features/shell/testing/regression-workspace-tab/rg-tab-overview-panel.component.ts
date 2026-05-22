import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { RegressionTabSectionId } from '@shared/config';
import type { RegressionProfile, RegressionRun, RegressionThresholds } from '@shared/testing';
import {
  buildRegressionHealthOverview,
  compareRegressionRunSummaries,
  regressionHealthTagVariant,
} from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

interface RgOverviewConfigCard {
  readonly section: RegressionTabSectionId;
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

interface RgOverviewRunStat {
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

@Component({
  selector: 'app-rg-tab-overview-panel',
  standalone: true,
  imports: [
    TxButtonComponent,
    TxIconComponent,
    TxTagComponent,
  ],
  template: `
    <div class="rg-overview">
      <header class="rg-overview__hero">
        <div>
          <h2 class="rg-overview__title">Overview</h2>
          <p class="rg-overview__subtitle">
            Linked flows, profile settings, and the most recent run at a glance.
          </p>
        </div>
      </header>

      <div class="rg-overview__layout">
        <section class="rg-overview-card rg-overview-card--about" aria-label="About this regression">
          <h3 class="rg-overview-card__title">About</h3>
          @if (release()) {
            <p class="rg-overview-about__line"><strong>Release:</strong> {{ release() }}</p>
          }
          @if (tags().length > 0) {
            <div class="rg-overview-about__tags">
              @for (tag of tags(); track tag) {
                <tx-tag variant="default" casing="normal">{{ tag }}</tx-tag>
              }
            </div>
          }
          @if (description()) {
            <p class="rg-overview-about__desc">{{ description() }}</p>
          } @else {
            <p class="rg-overview-about__hint">Add a description in Settings.</p>
          }
        </section>

        <section class="rg-overview-card rg-overview-card--run" aria-label="Last run">
          <div class="rg-overview-card__head">
            <h3 class="rg-overview-card__title">Last run</h3>
            @if (lastRun()) {
              <div class="rg-overview-card__tags">
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
            <p class="rg-overview-run__time">{{ formatRunTime(run) }}</p>

            <div class="rg-overview-run__stats">
              @for (stat of lastRunStats(); track stat.label) {
                <article class="rg-overview-run-stat">
                  <tx-icon [name]="stat.icon" [size]="14" aria-hidden="true" />
                  <span class="rg-overview-run-stat__label">{{ stat.label }}</span>
                  <strong class="rg-overview-run-stat__value">{{ stat.value }}</strong>
                </article>
              }
            </div>

            @if (baselineDeltaLabel()) {
              <p class="rg-overview-run__delta">{{ baselineDeltaLabel() }}</p>
            }

            <div class="rg-overview-run__footer">
              <p class="rg-overview-run__history">{{ runCountLabel() }}</p>
              <tx-button variant="secondary" (pressed)="openResults.emit()">Open results</tx-button>
            </div>
          } @else {
            <div class="rg-overview-empty">
              <span class="rg-overview-empty__icon" aria-hidden="true">
                <tx-icon name="target" [size]="18" />
              </span>
              <p class="rg-overview-empty__title">No runs yet</p>
              <p class="rg-overview-empty__hint">
                Run this regression from the toolbar to capture pass rates and flow results.
              </p>
            </div>
          }
        </section>
      </div>

      <section class="rg-overview-config" aria-label="Configuration summary">
        <div class="rg-overview-config__head">
          <h3 class="rg-overview-card__title">Configuration</h3>
          <p class="rg-overview-config__hint">Jump to a section to edit settings.</p>
        </div>

        <div class="rg-overview-config__grid">
          @for (card of configCards(); track card.label) {
            <button
              type="button"
              class="rg-overview-config-card"
              (click)="sectionSelect.emit(card.section)"
            >
              <span class="rg-overview-config-card__icon" aria-hidden="true">
                <tx-icon [name]="card.icon" [size]="16" />
              </span>
              <span class="rg-overview-config-card__body">
                <span class="rg-overview-config-card__label">{{ card.label }}</span>
                <span class="rg-overview-config-card__value">{{ card.value }}</span>
              </span>
              <tx-icon
                class="rg-overview-config-card__chevron"
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
  styleUrl: './rg-tab-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgTabOverviewPanelComponent {
  readonly description = input('');
  readonly release = input('');
  readonly tags = input<readonly string[]>([]);
  readonly profile = input<RegressionProfile | undefined>(undefined);
  readonly thresholds = input<RegressionThresholds | undefined>(undefined);
  readonly flowCount = input(0);
  readonly runs = input<readonly RegressionRun[]>([]);
  readonly pinnedBaselineRunId = input<string | null>(null);

  readonly openResults = output<void>();
  readonly sectionSelect = output<RegressionTabSectionId>();

  protected readonly lastRun = computed(() => this.runs()[0] ?? null);

  protected readonly lastRunHealth = computed(() => {
    const run = this.lastRun();
    if (!run?.summary) {
      return null;
    }
    return buildRegressionHealthOverview(run.summary);
  });

  protected readonly lastRunHealthTagVariant = computed(() => {
    const health = this.lastRunHealth();
    if (!health) {
      return 'default' as const;
    }
    return regressionHealthTagVariant(health.level);
  });

  protected readonly lastRunStats = computed((): readonly RgOverviewRunStat[] => {
    const run = this.lastRun();
    const summary = run?.summary;
    if (!run || !summary) {
      return [];
    }
    return [
      {
        label: 'Pass rate',
        value: `${summary.passRatePercent.toFixed(1)}%`,
        icon: 'checkCircle',
      },
      {
        label: 'Flows',
        value: `${run.passedCount} passed · ${run.failedCount} failed`,
        icon: 'testing',
      },
      {
        label: 'Duration',
        value: `${Math.round(summary.totalDurationMs / 1000)}s`,
        icon: 'clock',
      },
      {
        label: 'Acceptance',
        value: summary.meetsAcceptance ? 'Met' : 'Missed',
        icon: 'target',
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

  protected readonly configCards = computed((): readonly RgOverviewConfigCard[] => {
    const profile = this.profile();
    const allAtOnce = profile?.allFlowsAtOnce ? ' · all at once' : '';
    const profileValue = profile
      ? `${profile.executionMode}${allAtOnce} · parallelism ${profile.allFlowsAtOnce ? 'auto' : profile.maxParallelism}`
      : '—';
    const thresholds = this.thresholds();
    const acceptanceValue = thresholds
      ? `${thresholds.acceptancePercent}% acceptance`
      : '—';
    const releaseValue = this.release().trim() || '—';
    const tagsValue = this.tags().length > 0 ? this.tags().join(', ') : '—';

    return [
      { section: 'flows', label: 'Flows', value: `${this.flowCount()} linked`, icon: 'testing' },
      { section: 'settings', label: 'Release', value: releaseValue, icon: 'tag' },
      { section: 'settings', label: 'Tags', value: tagsValue, icon: 'tag' },
      { section: 'settings', label: 'Settings', value: profileValue, icon: 'sliders' },
      { section: 'settings', label: 'Thresholds', value: acceptanceValue, icon: 'checkCircle' },
    ];
  });

  protected readonly baselineDeltaLabel = computed(() => {
    const last = this.lastRun();
    const baselineId = this.pinnedBaselineRunId();
    if (!last?.summary || !baselineId) {
      return '';
    }
    const baseline = this.runs().find((run) => run.id === baselineId);
    if (!baseline?.summary || baseline.id === last.id) {
      return '';
    }
    const deltas = compareRegressionRunSummaries(baseline.summary, last.summary);
    const passRate = deltas.find((d) => d.label === 'Pass rate');
    if (!passRate) {
      return '';
    }
    return `Vs baseline: pass rate ${passRate.delta}`;
  });

  protected formatRunTime(run: RegressionRun): string {
    return new Date(run.startedAt).toLocaleString();
  }

  protected statusVariant(
    status: RegressionRun['status'],
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
