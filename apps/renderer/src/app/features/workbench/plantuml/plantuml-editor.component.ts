import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { fileSlug, type PlantumlDiagramKind } from '@testrix/contracts';
import { TxEmptyStateComponent, TxHintComponent, TxHintLayerService, type TxSelectOption } from '@testrix/ui';

import { PlantumlStore } from '../../tools/plantuml/plantuml.store';
import {
  elseInsertBefore,
  detectBuilderKind,
  emptyModel,
  generatePlantuml,
  nextPlantumlId,
  repairSequenceElse,
  PLANTUML_KINDS,
  SEQUENCE_STEP_KINDS,
  sequenceBreaks,
  sequenceFromText,
  type ActivityModel,
  type ActivityStep,
  type ClassModel,
  type ComponentModel,
  type PlantumlKind,
  type PlantumlModel,
  type SequenceArrow,
  type SequenceModel,
  type SequenceStep,
  type StateModel,
  type UseCaseModel,
} from './plantuml-generator';
import { PlantumlActivityGridComponent } from './plantuml-activity-grid.component';
import { parseEmittedDiagram } from './plantuml-diagram-parse';
import { PlantumlGraphGridComponent } from './plantuml-graph-grid.component';
import { ensureSequenceActivations } from './plantuml-sequence-activations';
import { parsePlantumlSequence } from './plantuml-sequence-parse';
import { moveFrameBlock, moveSequenceStep, resizeFrameEdge } from './plantuml-sequence-layout';
import { renderPlantumlSvg } from './plantuml-render';
import { sanitizeSvgMarkup } from '../request/svg-sanitize';
import { PLANTUML_TEMPLATES, templatesForKind } from './plantuml-templates';
import { copyToolText } from '../tools/tool-clipboard';
import { WorkbenchStore, type WorkbenchTab } from '../workbench.store';
import {
  PlantumlSequenceGridComponent,
  type PlantumlGridCamera,
  type PlantumlGridAddAlt,
  type PlantumlGridAddBlock,
  type PlantumlGridFrameEdit,
  type PlantumlGridAddMessage,
  type PlantumlGridAddParticipant,
  type PlantumlGridStepChange,
} from './plantuml-sequence-grid.component';

type BuilderKind = Exclude<PlantumlKind, 'freeform'>;
type ViewMode = 'build' | 'grid' | 'source';

function defaultViewMode(_kind: BuilderKind | PlantumlModel['kind']): ViewMode {
  return 'grid';
}

function isRetiredDiagram(kind: string): kind is 'usecase' | 'component' | 'state' {
  return kind === 'usecase' || kind === 'component' || kind === 'state';
}

const BUILDER_WIDTH_MIN = 300;
const BUILDER_WIDTH_MAX = 720;
const BUILDER_WIDTH_DEFAULT = 440;

const ROLE_OPTIONS: readonly TxSelectOption[] = [
  { value: 'participant', label: 'participant' },
  { value: 'actor', label: 'actor' },
];

const ARROW_OPTIONS: readonly TxSelectOption[] = [
  { value: '->', label: '->' },
  { value: '-->', label: '-->' },
  { value: '->>', label: '->>' },
  { value: '-->>', label: '-->>' },
  { value: '<-', label: '<-' },
  { value: '<--', label: '<--' },
];

const STEP_KIND_OPTIONS: readonly TxSelectOption[] = SEQUENCE_STEP_KINDS.map((kind) => ({
  value: kind.id,
  label: kind.label,
}));

const CLASS_RELATION_OPTIONS: readonly TxSelectOption[] = [
  { value: 'association', label: 'association' },
  { value: 'extends', label: 'extends' },
  { value: 'implements', label: 'implements' },
  { value: 'composition', label: 'composition' },
  { value: 'aggregation', label: 'aggregation' },
];

const ACTIVITY_KIND_OPTIONS: readonly TxSelectOption[] = [
  { value: 'action', label: 'action' },
  { value: 'if', label: 'if' },
  { value: 'endif', label: 'endif' },
  { value: 'fork', label: 'fork' },
  { value: 'endfork', label: 'end fork' },
  { value: 'start', label: 'start' },
  { value: 'stop', label: 'stop' },
];

const USE_CASE_LINK_KIND_OPTIONS: readonly TxSelectOption[] = [
  { value: 'assoc', label: 'assoc' },
  { value: 'include', label: 'include' },
  { value: 'extend', label: 'extend' },
];
const SAVE_DEBOUNCE_MS = 400;

function parseBuilderJson(raw: string | null | undefined): PlantumlModel | null {
  if (!raw?.trim())
    return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record['kind'] !== 'string')
      return null;
    if (record['kind'] === 'sequence' && !Array.isArray(record['steps']) && Array.isArray(record['messages'])) {
      const messages = record['messages'] as readonly {
        readonly id: string;
        readonly from: string;
        readonly to: string;
        readonly label: string;
        readonly arrow: SequenceArrow;
      }[];
      const { messages: _drop, ...rest } = record;
      return {
        ...(rest as unknown as SequenceModel),
        kind: 'sequence',
        steps: messages.map((item) => ({ kind: 'message' as const, ...item })),
      };
    }
    return parsed as PlantumlModel;
  } catch {
    return null;
  }
}

@Component({
  selector: 'tx-plantuml-editor',
  standalone: true,
  imports: [
    TxEmptyStateComponent,
    TxHintComponent,
    PlantumlSequenceGridComponent,
    PlantumlGraphGridComponent,
    PlantumlActivityGridComponent,
  ],
  templateUrl: './plantuml-editor.component.html',
  styleUrl: './plantuml-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'handleWindowKey($event)',
  },
})
export class PlantumlEditorComponent {
  private readonly hints = inject(TxHintLayerService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private readonly plantuml = inject(PlantumlStore);
  private readonly workbench = inject(WorkbenchStore);
  private renderGen = 0;
  private debounceTimer: number | null = null;
  private saveTimer: number | null = null;
  private skipNextSave = false;
  private hydratedNodeId: string | null = null;
  private panning = false;
  private panOrigin = { x: 0, y: 0, left: 0, top: 0 };
  private resizing = false;
  private resizeOrigin = { x: 0, width: BUILDER_WIDTH_DEFAULT };

  readonly tab = input.required<WorkbenchTab>();
  readonly previewHost = viewChild<ElementRef<HTMLElement>>('previewHost');

  readonly kinds = PLANTUML_KINDS;
  readonly allTemplates = PLANTUML_TEMPLATES;
  readonly roleOptions = ROLE_OPTIONS;
  readonly arrowOptions = ARROW_OPTIONS;
  readonly stepKindOptions = STEP_KIND_OPTIONS;
  readonly classRelationOptions = CLASS_RELATION_OPTIONS;
  readonly activityKindOptions = ACTIVITY_KIND_OPTIONS;
  readonly useCaseLinkKindOptions = USE_CASE_LINK_KIND_OPTIONS;

  readonly model = signal<PlantumlModel>(emptyModel('sequence', 'Sequence'));
  readonly viewMode = signal<ViewMode>('grid');
  readonly lastBuilderKind = signal<BuilderKind>('sequence');
  readonly builderCollapsed = signal(false);
  readonly participantsCollapsed = signal(false);
  readonly builderWidth = signal(BUILDER_WIDTH_DEFAULT);
  readonly fromText = signal('');
  readonly importBanner = signal<string | null>(null);
  readonly svgHtml = signal<SafeHtml | null>(null);
  readonly svgRaw = signal('');
  readonly renderError = signal<string | null>(null);
  readonly rendering = signal(false);
  readonly zoom = signal(1);
  readonly pan = signal({ x: 0, y: 0 });

  readonly source = computed(() => generatePlantuml(this.model()));
  readonly builderKind = computed((): BuilderKind => {
    const model = this.model();
    if (model.kind === 'freeform')
      return detectBuilderKind(model.source) ?? this.lastBuilderKind();
    return model.kind;
  });
  readonly kindTemplates = computed(() => templatesForKind(this.builderKind()));
  readonly isFreeform = computed(() => this.model().kind === 'freeform');
  readonly kindLabel = computed(() => {
    const kind = this.builderKind();
    return this.kinds.find((item) => item.id === kind)?.label ?? 'Diagram';
  });
  readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  readonly sequenceModel = computed(() => {
    const model = this.model();
    return model.kind === 'sequence' ? model : null;
  });
  readonly classModel = computed(() => {
    const model = this.model();
    return model.kind === 'class' ? model : null;
  });
  readonly activityModel = computed(() => {
    const model = this.model();
    return model.kind === 'activity' ? model : null;
  });
  readonly useCaseModel = computed(() => {
    const model = this.model();
    return model.kind === 'usecase' ? model : null;
  });
  readonly componentModel = computed(() => {
    const model = this.model();
    return model.kind === 'component' ? model : null;
  });
  readonly stateModel = computed(() => {
    const model = this.model();
    return model.kind === 'state' ? model : null;
  });
  readonly canvasModel = computed(() => {
    const model = this.model();
    if (model.kind === 'class')
      return model;
    return null;
  });

  constructor() {
    effect(() => {
      const model = this.model();
      if (model.kind !== 'sequence')
        return;
      const steps = repairSequenceElse(model.steps);
      if (steps === model.steps)
        return;
      untracked(() => this.model.set({ ...model, steps }));
    });

    effect(() => {
      const tab = this.tab();
      const artifact = this.plantuml.findArtifact(tab.nodeId);
      untracked(() => this.hydrateFromArtifact(tab.nodeId, artifact));
    });

    effect(() => {
      const source = this.source();
      this.scheduleRender(source);
      this.scheduleSave();
    });

    this.destroyRef.onDestroy(() => {
      if (this.debounceTimer !== null)
        window.clearTimeout(this.debounceTimer);
      if (this.saveTimer !== null)
        window.clearTimeout(this.saveTimer);
      this.endResize();
    });
  }

  private hydrateFromArtifact(
    nodeId: string,
    artifact: ReturnType<PlantumlStore['findArtifact']>,
  ): void {
    if (this.hydratedNodeId === nodeId)
      return;
    this.hydratedNodeId = nodeId;
    this.skipNextSave = true;
    this.importBanner.set(null);
    if (!artifact) {
      this.model.set(emptyModel('sequence', 'Diagram'));
      this.applySavedView(defaultViewMode('sequence'));
      this.restoreChrome();
      return;
    }
    const built = parseBuilderJson(artifact.builderJson);
    if (built && isRetiredDiagram(built.kind)) {
      this.model.set({
        kind: 'freeform',
        title: built.title,
        source: artifact.source || generatePlantuml(built),
      });
      this.lastBuilderKind.set('class');
      this.applySavedView('source');
      this.restoreChrome();
      return;
    }
    if (built && built.kind !== 'freeform' && artifact.diagramKind !== 'freeform') {
      this.model.set(built);
      this.lastBuilderKind.set(built.kind);
      this.applySavedView(defaultViewMode(built.kind));
      this.restoreChrome();
      return;
    }
    if (isRetiredDiagram(artifact.diagramKind)) {
      this.model.set({
        kind: 'freeform',
        title: artifact.name,
        source: artifact.source,
      });
      this.lastBuilderKind.set('class');
      this.applySavedView('source');
      this.restoreChrome();
      return;
    }
    if (artifact.diagramKind !== 'freeform') {
      const kind = artifact.diagramKind;
      const model = emptyModel(kind, artifact.name);
      this.model.set(model);
      this.lastBuilderKind.set(kind);
      this.applySavedView(defaultViewMode(kind));
      this.restoreChrome();
      return;
    }
    const guessed = detectBuilderKind(artifact.source);
    if (guessed === 'sequence' || (!guessed && artifact.source.includes('->'))) {
      this.model.set(parsePlantumlSequence(artifact.source, artifact.name));
      this.lastBuilderKind.set('sequence');
      this.applySavedView('grid');
      this.restoreChrome();
      return;
    }
    this.model.set({
      kind: 'freeform',
      title: artifact.name,
      source: artifact.source,
    });
    if (guessed)
      this.lastBuilderKind.set(guessed);
    this.applySavedView('source');
    this.restoreChrome();
  }

  private scheduleSave(): void {
    if (this.skipNextSave) {
      this.skipNextSave = false;
      return;
    }
    const nodeId = this.tab().nodeId;
    if (!nodeId || this.hydratedNodeId !== nodeId)
      return;
    if (this.saveTimer !== null)
      window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.persistModel();
    }, SAVE_DEBOUNCE_MS);
  }

  private async persistModel(): Promise<void> {
    const nodeId = this.tab().nodeId;
    const model = this.model();
    const source = generatePlantuml(model);
    const diagramKind = (model.kind === 'freeform' ? 'freeform' : model.kind) as PlantumlDiagramKind;
    const builderJson = model.kind === 'freeform' ? null : JSON.stringify(model);
    await this.plantuml.patchDiagram(nodeId, { source, diagramKind, builderJson });
  }

  continueInBuilder(): void {
    this.importBanner.set(null);
    this.setViewMode('grid');
  }

  replaceDiagram(next: PlantumlModel): void {
    this.model.set(next);
  }

  setViewMode(mode: ViewMode): void {
    if (mode === 'build')
      mode = 'grid';
    if (mode === 'grid' && !this.restoreVisualModel())
      mode = 'source';
    this.viewMode.set(mode);
    if (mode === 'grid')
      this.builderCollapsed.set(false);
    this.rememberView(mode);
  }

  private applySavedView(fallback: ViewMode): void {
    const saved = this.tab().plantumlView;
    const mode = saved === 'grid' || saved === 'source' || saved === 'build' ? saved : fallback;
    this.setViewMode(mode);
  }

  private rememberView(mode: ViewMode): void {
    this.rememberChrome({ plantumlView: mode });
  }

  readonly gridCamera = computed((): PlantumlGridCamera | null => {
    const tab = this.tab();
    if (tab.plantumlGridZoom == null && tab.plantumlGridPanX == null && tab.plantumlGridPanY == null)
      return null;
    return {
      zoom: clampPlantumlZoom(tab.plantumlGridZoom, 0.4, 2.4),
      x: finitePlantuml(tab.plantumlGridPanX),
      y: finitePlantuml(tab.plantumlGridPanY),
    };
  });

  rememberGridCamera(camera: PlantumlGridCamera): void {
    this.rememberChrome({
      plantumlGridZoom: Number(camera.zoom.toFixed(3)),
      plantumlGridPanX: camera.x,
      plantumlGridPanY: camera.y,
    });
  }

  private restoreChrome(): void {
    const tab = this.tab();
    this.zoom.set(clampPlantumlZoom(tab.plantumlPreviewZoom, 0.35, 3));
    this.pan.set({
      x: finitePlantuml(tab.plantumlPreviewPanX),
      y: finitePlantuml(tab.plantumlPreviewPanY),
    });
    const width = finitePlantuml(tab.plantumlBuilderWidth, BUILDER_WIDTH_DEFAULT);
    this.builderWidth.set(Math.min(BUILDER_WIDTH_MAX, Math.max(BUILDER_WIDTH_MIN, width)));
    if (typeof tab.plantumlBuilderCollapsed === 'boolean')
      this.builderCollapsed.set(tab.plantumlBuilderCollapsed);
  }

  private rememberPreviewCamera(): void {
    this.rememberChrome({
      plantumlPreviewZoom: Number(this.zoom().toFixed(2)),
      plantumlPreviewPanX: Math.round(this.pan().x),
      plantumlPreviewPanY: Math.round(this.pan().y),
    });
  }

  private rememberChrome(patch: Partial<WorkbenchTab>): void {
    const tab = this.tab();
    const next: Partial<WorkbenchTab> = {};
    for (const key of Object.keys(patch) as (keyof WorkbenchTab)[]) {
      if (patch[key] !== tab[key])
        Object.assign(next, { [key]: patch[key] });
    }
    if (Object.keys(next).length === 0)
      return;
    this.workbench.patchTab(tab.id, next);
  }

  private restoreVisualModel(): boolean {
    const model = this.model();
    if (model.kind !== 'freeform')
      return true;
    const guessed = detectBuilderKind(model.source) ?? this.lastBuilderKind();
    if (guessed === 'sequence') {
      this.model.set(parsePlantumlSequence(model.source, model.title || 'Sequence'));
      this.lastBuilderKind.set('sequence');
      this.importBanner.set(null);
      return true;
    }
    if (guessed !== 'class' && guessed !== 'activity') {
      this.importBanner.set('This source does not match a diagram the grid can edit. Staying in Source mode.');
      return false;
    }
    const parsed = parseEmittedDiagram(model.source, model.title, guessed);
    if (!parsed) {
      this.lastBuilderKind.set(guessed);
      this.importBanner.set('This source does not match a diagram the grid can edit. Staying in Source mode.');
      return false;
    }
    this.model.set(parsed);
    this.lastBuilderKind.set(parsed.kind);
    this.importBanner.set(null);
    return true;
  }

  setKind(kind: BuilderKind): void {
    this.lastBuilderKind.set(kind);
    if (this.model().kind !== kind) {
      this.model.set(emptyModel(kind));
      this.fromText.set('');
      this.fitPreview();
    }
    this.setViewMode(defaultViewMode(kind));
  }

  resumeVisualBuilder(): void {
    this.model.set(emptyModel(this.lastBuilderKind()));
    this.fromText.set('');
    this.fitPreview();
    this.setViewMode(defaultViewMode(this.lastBuilderKind()));
  }

  toggleBuilder(): void {
    this.builderCollapsed.update((value) => !value);
    this.rememberChrome({ plantumlBuilderCollapsed: this.builderCollapsed() });
  }

  startResize(event: PointerEvent): void {
    if (event.button !== 0 || this.builderCollapsed() || this.viewMode() === 'grid')
      return;
    this.resizing = true;
    this.resizeOrigin = { x: event.clientX, width: this.builderWidth() };
    const target = event.currentTarget;
    if (target instanceof HTMLElement)
      target.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  moveResize(event: PointerEvent): void {
    if (!this.resizing)
      return;
    const next = this.resizeOrigin.width + (event.clientX - this.resizeOrigin.x);
    this.builderWidth.set(Math.min(BUILDER_WIDTH_MAX, Math.max(BUILDER_WIDTH_MIN, next)));
  }

  endResize(event?: PointerEvent): void {
    if (!this.resizing)
      return;
    this.resizing = false;
    this.rememberChrome({ plantumlBuilderWidth: Math.round(this.builderWidth()) });
    const target = event?.currentTarget;
    if (target instanceof HTMLElement && event && target.hasPointerCapture(event.pointerId))
      target.releasePointerCapture(event.pointerId);
  }

  zoomIn(): void {
    this.zoom.update((value) => Math.min(3, Number((value + 0.1).toFixed(2))));
    this.rememberPreviewCamera();
  }

  zoomOut(): void {
    this.zoom.update((value) => Math.max(0.25, Number((value - 0.1).toFixed(2))));
    this.rememberPreviewCamera();
  }

  handleWindowKey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey))
      return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable)
        return;
    }
    if (event.key === '=' || event.key === '+') {
      event.preventDefault();
      this.zoomIn();
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      this.zoomOut();
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      this.fitPreview();
    }
  }

  applyTemplate(id: string): void {
    const template = this.allTemplates.find((item) => item.id === id);
    if (!template)
      return;
    this.lastBuilderKind.set(template.kind);
    const next = template.create();
    this.model.set(next);
    this.fromText.set('');
    this.fitPreview();
    this.setViewMode(defaultViewMode(template.kind));
  }

  setTitle(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.setTitleValue(target.value);
  }

  setTitleValue(title: string): void {
    this.model.update((model) => ({ ...model, title: sequenceBreaks(title) }));
  }

  plantField(value: string): string {
    return sequenceBreaks(value).replace(/\n/g, '\\n');
  }

  cycleViewMode(): void {
    const order: readonly ViewMode[] = ['grid', 'source'];
    const index = order.indexOf(this.viewMode());
    const next = order[(index + 1) % order.length] ?? order[0] ?? 'grid';
    this.setViewMode(next);
  }

  toggleSource(): void {
    this.cycleViewMode();
  }

  editAsSource(): void {
    this.setViewMode('source');
  }

  handleSourceEdit(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    this.model.set({
      kind: 'freeform',
      title: this.model().title,
      source: target.value,
    });
  }

  handleFromText(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement)
      this.fromText.set(target.value);
  }

  generateFromText(): void {
    const text = this.fromText().trim();
    if (!text)
      return;
    this.model.set(sequenceFromText(text, this.model().title || 'From text'));
    this.fitPreview();
  }

  addParticipant(
    roleOrEvent?: 'actor' | 'participant' | PlantumlGridAddParticipant,
    at?: { x: number; y: number },
  ): void {
    const payload =
      typeof roleOrEvent === 'object' && roleOrEvent
        ? roleOrEvent
        : {
            role: roleOrEvent === 'actor' ? 'actor' as const : 'participant' as const,
            x: at?.x,
            y: at?.y,
          };
    this.patchSequence((model) => {
      const index = model.participants.length + 1;
      const role = payload.role;
      const name = role === 'actor' ? `Actor ${index}` : `Participant ${index}`;
      const alias = name.replace(/\s+/g, '');
      return {
        ...model,
        participants: [
          ...model.participants,
          {
            id: nextPlantumlId('p'),
            name,
            alias,
            role,
            color: role === 'actor' ? undefined : '#magenta',
            x: payload.x ?? 72 + model.participants.length * 168,
            y: payload.y ?? 96,
          },
        ],
      };
    });
  }

  toggleParticipantsCollapsed(): void {
    this.participantsCollapsed.update((value) => !value);
  }

  setAutonumber(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.setAutonumberValue(target.checked);
  }

  setAutonumberValue(autonumber: boolean): void {
    this.patchSequence((model) => ({ ...model, autonumber }));
  }

  setHideFootbox(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.setHideFootboxValue(target.checked);
  }

  setHideFootboxValue(hideFootbox: boolean): void {
    this.patchSequence((model) => ({ ...model, hideFootbox }));
  }

  updateParticipant(id: string, field: 'name' | 'alias' | 'color' | 'role' | 'lineColor' | 'lineStyle', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement))
      return;
    this.setParticipantValue(id, field, target.value);
  }

  setParticipantValue(
    id: string,
    field: 'name' | 'alias' | 'color' | 'role' | 'lineColor' | 'lineStyle',
    value: string,
  ): void {
    this.patchSequence((model) => ({
      ...model,
      participants: model.participants.map((item) => {
        if (item.id !== id)
          return item;
        if (field === 'name') {
          const name = sequenceBreaks(value);
          return { ...item, name, alias: item.alias || name.replace(/\s+/g, '_') };
        }
        if (field === 'color')
          return { ...item, color: value.trim() ? value.trim() : undefined };
        if (field === 'role')
          return { ...item, role: value === 'actor' ? 'actor' : 'participant' };
        if (field === 'lineColor')
          return { ...item, lineColor: value.trim() ? value.trim() : undefined };
        if (field === 'lineStyle') {
          const style = value === 'dashed' || value === 'solid' || value === 'bold' || value === 'dotted'
            ? value
            : 'dotted';
          return { ...item, lineStyle: style };
        }
        return { ...item, alias: value };
      }),
    }));
  }

  removeParticipant(id: string): void {
    this.patchSequence((model) => ({
      ...model,
      participants: model.participants.filter((item) => item.id !== id),
    }));
  }

  addStep(kind: SequenceStep['kind'] = 'message'): void {
    this.patchSequence((model) => {
      const from = model.participants[0]?.alias ?? 'A';
      const to = model.participants[1]?.alias ?? model.participants[0]?.alias ?? 'B';
      let step: SequenceStep;
      if (kind === 'message') {
        step = { kind: 'message', id: nextPlantumlId('m'), from, to, label: 'message', arrow: '->' };
        return { ...model, steps: ensureSequenceActivations([...model.steps, step]) };
      }
      else if (kind === 'activate' || kind === 'deactivate')
        step = { kind, id: nextPlantumlId('m'), target: from };
      else if (kind === 'divider')
        step = { kind: 'divider', id: nextPlantumlId('m'), label: 'Section' };
      else if (kind === 'note')
        step = { kind: 'note', id: nextPlantumlId('m'), over: from, text: 'Note' };
      else if (kind === 'end')
        step = { kind: 'end', id: nextPlantumlId('m') };
      else
        step = { kind, id: nextPlantumlId('m'), label: kind === 'alt' ? 'condition' : kind };
      return { ...model, steps: [...model.steps, step] };
    });
  }

  addGridSection(label: string): void {
    const text = label.trim() || 'Section';
    this.patchSequence((model) => ({
      ...model,
      steps: [...model.steps, { kind: 'divider', id: nextPlantumlId('m'), label: text }],
    }));
  }

  addGridMessage(event: PlantumlGridAddMessage): void {
    this.patchSequence((model) => {
      const from = model.participants.find((item) => item.id === event.fromId);
      const to = model.participants.find((item) => item.id === event.toId);
      if (!from || !to)
        return model;
      const step: SequenceStep = {
        kind: 'message',
        id: nextPlantumlId('m'),
        from: from.alias || from.name,
        to: to.alias || to.name,
        label: event.label.trim() || 'message',
        arrow: '->',
      };
      const steps = [...model.steps];
      const index = event.beforeStepId
        ? steps.findIndex((item) => item.id === event.beforeStepId)
        : -1;
      if (index >= 0)
        steps.splice(index, 0, step);
      else
        steps.push(step);
      return { ...model, autonumber: true, steps: ensureSequenceActivations(steps) };
    });
  }

  addGridAlt(event: PlantumlGridAddAlt): void {
    this.patchSequence((model) => ({
      ...model,
      steps: insertFrame(model.steps, event.beforeStepId, {
        kind: 'alt',
        id: nextPlantumlId('m'),
        label: event.label.trim() || 'condition',
      }),
    }));
  }

  editGridFrame(event: PlantumlGridFrameEdit): void {
    this.patchSequence((model) => {
      const steps = event.mode === 'move'
        ? moveFrameBlock(model.steps, event.id, event.beforeStepId)
        : resizeFrameEdge(model.steps, event.id, event.mode, event.beforeStepId);
      return steps === model.steps ? model : { ...model, steps };
    });
  }

  moveGridStep(event: { id: string; beforeStepId: string | null }): void {
    this.patchSequence((model) => {
      const steps = moveSequenceStep(model.steps, event.id, event.beforeStepId);
      return steps === model.steps ? model : { ...model, steps };
    });
  }

  addGridBlock(event: PlantumlGridAddBlock): void {
    this.patchSequence((model) => {
      const over = event.overId
        ? model.participants.find((item) => item.id === event.overId)
        : model.participants[0];
      const alias = over ? (over.alias || over.name) : 'A';
      if (event.kind === 'note') {
        return {
          ...model,
          steps: insertSequenceSteps(model.steps, event.beforeStepId, [
            { kind: 'note', id: nextPlantumlId('m'), over: alias, text: event.label || 'Note' },
          ]),
        };
      }
      if (event.kind === 'else') {
        return {
          ...model,
          steps: insertSequenceSteps(model.steps, elseInsertBefore(model.steps, event.beforeStepId), [
            { kind: 'else', id: nextPlantumlId('m'), label: event.label },
          ]),
        };
      }
      return {
        ...model,
        steps: insertFrame(model.steps, event.beforeStepId, {
          kind: event.kind,
          id: nextPlantumlId('m'),
          label: event.label || event.kind,
        }),
      };
    });
  }

  reorderParticipants(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex)
      return;
    this.patchSequence((model) => {
      if (
        fromIndex < 0
        || toIndex < 0
        || fromIndex >= model.participants.length
        || toIndex >= model.participants.length
      )
        return model;
      const next = [...model.participants];
      const [item] = next.splice(fromIndex, 1);
      if (!item)
        return model;
      next.splice(toIndex, 0, item);
      return { ...model, participants: next };
    });
  }

  setSectionValue(id: string, field: 'label', value: string): void {
    this.patchSequence((model) => ({
      ...model,
      steps: model.steps.map((step) => {
        if (step.id !== id || step.kind !== 'divider')
          return step;
        return { ...step, label: value.trim() || step.label };
      }),
    }));
  }

  setStepKind(id: string, kindValue: string): void {
    const kind = kindValue as SequenceStep['kind'];
    this.patchSequence((model) => {
      const from = model.participants[0]?.alias ?? 'A';
      const to = model.participants[1]?.alias ?? from;
      return {
        ...model,
        steps: model.steps.map((step) => {
          if (step.id !== id)
            return step;
          if (kind === 'message')
            return { kind: 'message', id, from, to, label: 'message', arrow: '->' };
          if (kind === 'activate' || kind === 'deactivate')
            return { kind, id, target: from };
          if (kind === 'divider')
            return { kind: 'divider', id, label: 'Section' };
          if (kind === 'note')
            return { kind: 'note', id, over: from, text: 'Note' };
          if (kind === 'end')
            return { kind: 'end', id };
          return { kind, id, label: kind === 'alt' ? 'condition' : kind };
        }),
      };
    });
  }

  updateStepField(id: string, field: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement))
      return;
    this.setStepField(id, field, target.value);
  }

  setStepField(id: string, field: string, value: string): void {
    this.patchSequence((model) => {
      const steps = model.steps.map((step) => {
        if (step.id !== id)
          return step;
        const next = field === 'label' || field === 'text' ? sequenceBreaks(value) : value;
        return { ...step, [field]: next } as SequenceStep;
      });
      const synced = field === 'arrow' || field === 'from' || field === 'to'
        ? ensureSequenceActivations(steps)
        : steps;
      return { ...model, steps: synced };
    });
  }

  removeStep(id: string): void {
    this.patchSequence((model) => ({
      ...model,
      steps: model.steps.filter((item) => item.id !== id),
    }));
  }

  applyGridStep(event: PlantumlGridStepChange): void {
    this.setStepField(event.id, event.field, event.value);
  }

  removeGridSteps(ids: readonly string[]): void {
    const drop = new Set(ids);
    this.patchSequence((model) => ({
      ...model,
      steps: model.steps.filter((step) => !drop.has(step.id)),
    }));
  }

  addClass(): void {
    this.patchClass((model) => ({
      ...model,
      classes: [
        ...model.classes,
        {
          id: nextPlantumlId('c'),
          name: `Type${model.classes.length + 1}`,
          stereotype: '',
          members: '+field: string',
        },
      ],
    }));
  }

  updateClass(id: string, field: 'name' | 'stereotype' | 'members', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement))
      return;
    const value = target.value;
    this.patchClass((model) => ({
      ...model,
      classes: model.classes.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  }

  removeClass(id: string): void {
    this.patchClass((model) => ({
      ...model,
      classes: model.classes.filter((item) => item.id !== id),
    }));
  }

  addClassRelation(): void {
    this.patchClass((model) => {
      const from = model.classes[0]?.name ?? 'A';
      const to = model.classes[1]?.name ?? model.classes[0]?.name ?? 'B';
      return {
        ...model,
        relations: [
          ...model.relations,
          { id: nextPlantumlId('r'), from, to, kind: 'association', label: '' },
        ],
      };
    });
  }

  updateClassRelation(
    id: string,
    field: 'from' | 'to' | 'kind' | 'label',
    event: Event,
  ): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement))
      return;
    this.setClassRelationValue(id, field, target.value);
  }

  setClassRelationValue(id: string, field: 'from' | 'to' | 'kind' | 'label', value: string): void {
    this.patchClass((model) => ({
      ...model,
      relations: model.relations.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  }

  removeClassRelation(id: string): void {
    this.patchClass((model) => ({
      ...model,
      relations: model.relations.filter((item) => item.id !== id),
    }));
  }

  addActivityStep(kind: ActivityStep['kind'] = 'action'): void {
    this.patchActivity((model) => ({
      ...model,
      steps: [
        ...model.steps,
        {
          id: nextPlantumlId('a'),
          label: kind === 'action' ? 'Step' : kind === 'if' ? 'Condition?' : '',
          kind,
        },
      ],
    }));
  }

  updateActivityStep(id: string, field: 'label' | 'kind', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement))
      return;
    this.setActivityStepValue(id, field, target.value);
  }

  setActivityStepValue(id: string, field: 'label' | 'kind', value: string): void {
    this.patchActivity((model) => ({
      ...model,
      steps: model.steps.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  }

  removeActivityStep(id: string): void {
    this.patchActivity((model) => ({
      ...model,
      steps: model.steps.filter((item) => item.id !== id),
    }));
  }

  addActor(): void {
    this.patchUseCase((model) => ({
      ...model,
      actors: [...model.actors, { id: nextPlantumlId('actor'), name: `Actor ${model.actors.length + 1}` }],
    }));
  }

  updateActor(id: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patchUseCase((model) => ({
      ...model,
      actors: model.actors.map((item) => (item.id === id ? { ...item, name: target.value } : item)),
    }));
  }

  removeActor(id: string): void {
    this.patchUseCase((model) => ({
      ...model,
      actors: model.actors.filter((item) => item.id !== id),
      links: model.links.filter((item) => item.from !== id && item.to !== id),
    }));
  }

  addUseCase(): void {
    this.patchUseCase((model) => ({
      ...model,
      useCases: [
        ...model.useCases,
        { id: nextPlantumlId('uc'), name: `Use case ${model.useCases.length + 1}` },
      ],
    }));
  }

  updateUseCase(id: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patchUseCase((model) => ({
      ...model,
      useCases: model.useCases.map((item) => (item.id === id ? { ...item, name: target.value } : item)),
    }));
  }

  removeUseCase(id: string): void {
    this.patchUseCase((model) => ({
      ...model,
      useCases: model.useCases.filter((item) => item.id !== id),
      links: model.links.filter((item) => item.from !== id && item.to !== id),
    }));
  }

  addUseCaseLink(): void {
    this.patchUseCase((model) => {
      const from = model.actors[0]?.id ?? model.useCases[0]?.id ?? 'A';
      const to = model.useCases[0]?.id ?? model.actors[0]?.id ?? 'B';
      return {
        ...model,
        links: [...model.links, { id: nextPlantumlId('l'), from, to, kind: 'assoc' }],
      };
    });
  }

  updateUseCaseLink(id: string, field: 'from' | 'to' | 'kind', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement))
      return;
    this.setUseCaseLinkValue(id, field, target.value);
  }

  setUseCaseLinkValue(id: string, field: 'from' | 'to' | 'kind', value: string): void {
    this.patchUseCase((model) => ({
      ...model,
      links: model.links.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  }

  useCaseNodeOptions(model: UseCaseModel): readonly TxSelectOption[] {
    return [
      ...model.actors.map((actor) => ({ value: actor.id, label: actor.name })),
      ...model.useCases.map((item) => ({ value: item.id, label: item.name })),
    ];
  }

  removeUseCaseLink(id: string): void {
    this.patchUseCase((model) => ({
      ...model,
      links: model.links.filter((item) => item.id !== id),
    }));
  }

  addComponent(): void {
    this.patchComponent((model) => ({
      ...model,
      components: [
        ...model.components,
        {
          id: nextPlantumlId('cmp'),
          name: `Component ${model.components.length + 1}`,
          stereotype: '',
        },
      ],
    }));
  }

  updateComponent(id: string, field: 'name' | 'stereotype', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patchComponent((model) => ({
      ...model,
      components: model.components.map((item) =>
        item.id === id ? { ...item, [field]: target.value } : item,
      ),
    }));
  }

  removeComponent(id: string): void {
    this.patchComponent((model) => ({
      ...model,
      components: model.components.filter((item) => item.id !== id),
      links: model.links.filter((item) => item.from !== id && item.to !== id),
    }));
  }

  addComponentLink(): void {
    this.patchComponent((model) => {
      const from = model.components[0]?.id ?? 'A';
      const to = model.components[1]?.id ?? model.components[0]?.id ?? 'B';
      return {
        ...model,
        links: [...model.links, { id: nextPlantumlId('l'), from, to, label: '' }],
      };
    });
  }

  updateComponentLink(id: string, field: 'from' | 'to' | 'label', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement))
      return;
    this.setComponentLinkValue(id, field, target.value);
  }

  setComponentLinkValue(id: string, field: 'from' | 'to' | 'label', value: string): void {
    this.patchComponent((model) => ({
      ...model,
      links: model.links.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  }

  componentNodeOptions(model: ComponentModel): readonly TxSelectOption[] {
    return model.components.map((item) => ({ value: item.id, label: item.name }));
  }

  removeComponentLink(id: string): void {
    this.patchComponent((model) => ({
      ...model,
      links: model.links.filter((item) => item.id !== id),
    }));
  }

  addState(): void {
    this.patchState((model) => ({
      ...model,
      states: [...model.states, { id: nextPlantumlId('st'), name: `State ${model.states.length + 1}` }],
    }));
  }

  updateState(id: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patchState((model) => ({
      ...model,
      states: model.states.map((item) => (item.id === id ? { ...item, name: target.value } : item)),
    }));
  }

  removeState(id: string): void {
    this.patchState((model) => ({
      ...model,
      states: model.states.filter((item) => item.id !== id),
      transitions: model.transitions.filter((item) => item.from !== id && item.to !== id),
    }));
  }

  addTransition(): void {
    this.patchState((model) => {
      const from = model.states[0]?.id ?? 'A';
      const to = model.states[1]?.id ?? model.states[0]?.id ?? 'B';
      return {
        ...model,
        transitions: [...model.transitions, { id: nextPlantumlId('t'), from, to, label: 'event' }],
      };
    });
  }

  updateTransition(id: string, field: 'from' | 'to' | 'label', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement))
      return;
    this.setTransitionValue(id, field, target.value);
  }

  setTransitionValue(id: string, field: 'from' | 'to' | 'label', value: string): void {
    this.patchState((model) => ({
      ...model,
      transitions: model.transitions.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  }

  stateNodeOptions(model: StateModel): readonly TxSelectOption[] {
    return model.states.map((item) => ({ value: item.id, label: item.name }));
  }

  removeTransition(id: string): void {
    this.patchState((model) => ({
      ...model,
      transitions: model.transitions.filter((item) => item.id !== id),
    }));
  }

  async copySource(event: Event): Promise<void> {
    await copyToolText(this.hints, this.source(), event);
  }

  async copySvg(event: Event): Promise<void> {
    await copyToolText(this.hints, this.svgRaw(), event);
  }

  downloadSvg(): void {
    const svg = this.svgRaw();
    if (!svg)
      return;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileSlug(this.model().title || 'diagram', 'diagram')}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  fitPreview(): void {
    this.zoom.set(1);
    this.pan.set({ x: 0, y: 0 });
    this.rememberPreviewCamera();
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    this.zoom.update((value) => Math.min(3, Math.max(0.35, Number((value + delta).toFixed(2)))));
    this.rememberPreviewCamera();
  }

  startPan(event: PointerEvent): void {
    if (event.button !== 0)
      return;
    const host = this.previewHost()?.nativeElement;
    if (!host)
      return;
    this.panning = true;
    this.panOrigin = {
      x: event.clientX,
      y: event.clientY,
      left: this.pan().x,
      top: this.pan().y,
    };
    host.setPointerCapture(event.pointerId);
  }

  movePan(event: PointerEvent): void {
    if (!this.panning)
      return;
    this.pan.set({
      x: this.panOrigin.left + (event.clientX - this.panOrigin.x),
      y: this.panOrigin.top + (event.clientY - this.panOrigin.y),
    });
  }

  endPan(event: PointerEvent): void {
    if (!this.panning)
      return;
    this.panning = false;
    const host = this.previewHost()?.nativeElement;
    if (host?.hasPointerCapture(event.pointerId))
      host.releasePointerCapture(event.pointerId);
    this.rememberPreviewCamera();
  }

  private patchSequence(update: (model: SequenceModel) => SequenceModel): void {
    const model = this.model();
    if (model.kind !== 'sequence')
      return;
    this.model.set(update(model));
  }

  private patchClass(update: (model: ClassModel) => ClassModel): void {
    const model = this.model();
    if (model.kind !== 'class')
      return;
    this.model.set(update(model));
  }

  private patchActivity(update: (model: ActivityModel) => ActivityModel): void {
    const model = this.model();
    if (model.kind !== 'activity')
      return;
    this.model.set(update(model));
  }

  private patchUseCase(update: (model: UseCaseModel) => UseCaseModel): void {
    const model = this.model();
    if (model.kind !== 'usecase')
      return;
    this.model.set(update(model));
  }

  private patchComponent(update: (model: ComponentModel) => ComponentModel): void {
    const model = this.model();
    if (model.kind !== 'component')
      return;
    this.model.set(update(model));
  }

  private patchState(update: (model: StateModel) => StateModel): void {
    const model = this.model();
    if (model.kind !== 'state')
      return;
    this.model.set(update(model));
  }

  private scheduleRender(source: string): void {
    if (this.debounceTimer !== null)
      window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.runRender(source);
    }, 250);
  }

  private async runRender(source: string): Promise<void> {
    const gen = ++this.renderGen;
    this.rendering.set(true);
    const result = await renderPlantumlSvg(source, true);
    if (gen !== this.renderGen)
      return;
    this.rendering.set(false);
    if (result.error || !result.svg) {
      this.renderError.set(result.error ?? 'Render failed');
      this.svgRaw.set('');
      this.svgHtml.set(null);
      return;
    }
    const svg = sanitizeSvgMarkup(result.svg);
    this.renderError.set(null);
    this.svgRaw.set(svg);
    this.svgHtml.set(this.sanitizer.bypassSecurityTrustHtml(svg));
  }
}

function insertFrame(
  steps: readonly SequenceStep[],
  beforeStepId: string | null,
  opener: SequenceStep,
): SequenceStep[] {
  const next = [...steps];
  const found = beforeStepId ? next.findIndex((step) => step.id === beforeStepId) : -1;
  const at = found < 0 ? next.length : found;
  const endAt = frameEndIndex(next, at);
  const end: SequenceStep = { kind: 'end', id: nextPlantumlId('m') };
  if (endAt <= at) {
    next.splice(at, 0, opener, end);
    return next;
  }
  next.splice(endAt, 0, end);
  next.splice(at, 0, opener);
  return next;
}

function frameEndIndex(steps: readonly SequenceStep[], at: number): number {
  let depth = 0;
  for (let index = 0; index < at; index += 1) {
    const kind = steps[index]?.kind;
    if (kind === 'alt' || kind === 'loop' || kind === 'group')
      depth += 1;
    else if (kind === 'end')
      depth = Math.max(0, depth - 1);
  }
  if (depth > 0) {
    let nested = depth;
    for (let index = at; index < steps.length; index += 1) {
      const kind = steps[index]?.kind;
      if (kind === 'alt' || kind === 'loop' || kind === 'group')
        nested += 1;
      else if (kind === 'end') {
        nested -= 1;
        if (nested < depth)
          return index;
      }
    }
    return steps.length;
  }
  for (let index = at; index < steps.length; index += 1) {
    if (steps[index]?.kind === 'divider')
      return index;
  }
  return steps.length;
}

function insertSequenceSteps(
  steps: readonly SequenceStep[],
  beforeStepId: string | null,
  insert: readonly SequenceStep[],
): SequenceStep[] {
  const next = [...steps];
  const index = beforeStepId ? next.findIndex((step) => step.id === beforeStepId) : -1;
  if (index >= 0)
    next.splice(index, 0, ...insert);
  else
    next.push(...insert);
  return next;
}

function clampPlantumlZoom(value: number | undefined, min: number, max: number): number {
  const next = finitePlantuml(value, 1);
  return Math.min(max, Math.max(min, next));
}

function finitePlantuml(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
