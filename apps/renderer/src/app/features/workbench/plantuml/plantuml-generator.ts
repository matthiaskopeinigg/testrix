/** Pure PlantUML model → source generation and plain-text helpers. */

export type PlantumlKind =
  | 'sequence'
  | 'class'
  | 'activity'
  | 'usecase'
  | 'component'
  | 'state'
  | 'freeform';

export type SequenceArrow = '->' | '-->' | '->>' | '-->>' | '<-' | '<--';

export interface SequenceParticipant {
  readonly id: string;
  readonly name: string;
  readonly alias: string;
  /** Optional PlantUML color, e.g. `#magenta` or `LightGreen`. */
  readonly color?: string;
  /** Defaults to participant. */
  readonly role?: 'actor' | 'participant';
  /** Optional Grid canvas position (ignored by PlantUML source). */
  readonly x?: number;
  readonly y?: number;
  /** Grid lifeline color (ignored by PlantUML source). */
  readonly lineColor?: string;
  /** Grid lifeline style. Defaults to dotted. */
  readonly lineStyle?: SequenceLineStyle;
}

export type SequenceLineStyle = 'dotted' | 'dashed' | 'solid' | 'bold';

export interface SequenceMessageStep {
  readonly kind: 'message';
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly arrow: SequenceArrow;
}

export interface SequenceActivateStep {
  readonly kind: 'activate' | 'deactivate';
  readonly id: string;
  readonly target: string;
}

export interface SequenceDividerStep {
  readonly kind: 'divider';
  readonly id: string;
  readonly label: string;
  /** Grid-only section rule style (ignored by PlantUML source). */
  readonly lineStyle?: SequenceLineStyle;
  /** Grid-only section rule color (ignored by PlantUML source). */
  readonly lineColor?: string;
}

export interface SequenceNoteStep {
  readonly kind: 'note';
  readonly id: string;
  /** Comma-separated participant aliases/names, e.g. `Gateway,Auth`. */
  readonly over: string;
  readonly text: string;
}

export interface SequenceBlockStep {
  readonly kind: 'alt' | 'else' | 'loop' | 'group';
  readonly id: string;
  readonly label: string;
}

export interface SequenceEndStep {
  readonly kind: 'end';
  readonly id: string;
}

export type SequenceStep =
  | SequenceMessageStep
  | SequenceActivateStep
  | SequenceDividerStep
  | SequenceNoteStep
  | SequenceBlockStep
  | SequenceEndStep;

export interface SequenceModel {
  readonly kind: 'sequence';
  readonly title: string;
  readonly autonumber: boolean;
  /** When true, omit the participant boxes at the bottom of lifelines. */
  readonly hideFootbox: boolean;
  readonly participants: readonly SequenceParticipant[];
  readonly steps: readonly SequenceStep[];
}

/** @deprecated Prefer SequenceMessageStep via SequenceStep. */
export type SequenceMessage = SequenceMessageStep;


export interface ClassItem {
  readonly id: string;
  readonly name: string;
  readonly stereotype: string;
  readonly members: string;
  /** Canvas position. Stored in the diagram model, never written to PlantUML. */
  readonly x?: number;
  readonly y?: number;
}

export interface ClassRelation {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: 'extends' | 'implements' | 'association' | 'composition' | 'aggregation';
  readonly label: string;
}

export interface ActivityStep {
  readonly id: string;
  readonly label: string;
  readonly kind: 'action' | 'if' | 'endif' | 'start' | 'stop' | 'fork' | 'endfork';
}

export interface UseCaseActor {
  readonly id: string;
  readonly name: string;
  /** Canvas position. Stored in the diagram model, never written to PlantUML. */
  readonly x?: number;
  readonly y?: number;
}

export interface UseCaseItem {
  readonly id: string;
  readonly name: string;
  /** Canvas position. Stored in the diagram model, never written to PlantUML. */
  readonly x?: number;
  readonly y?: number;
}

export interface UseCaseLink {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: 'assoc' | 'include' | 'extend';
}

export interface ComponentItem {
  readonly id: string;
  readonly name: string;
  readonly stereotype: string;
  /** Canvas position. Stored in the diagram model, never written to PlantUML. */
  readonly x?: number;
  readonly y?: number;
}

export interface ComponentLink {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

export interface StateItem {
  readonly id: string;
  readonly name: string;
  /** Canvas position. Stored in the diagram model, never written to PlantUML. */
  readonly x?: number;
  readonly y?: number;
}

export interface StateTransition {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

export interface ClassModel {
  readonly kind: 'class';
  readonly title: string;
  readonly classes: readonly ClassItem[];
  readonly relations: readonly ClassRelation[];
}

export interface ActivityModel {
  readonly kind: 'activity';
  readonly title: string;
  readonly steps: readonly ActivityStep[];
}

export interface UseCaseModel {
  readonly kind: 'usecase';
  readonly title: string;
  readonly actors: readonly UseCaseActor[];
  readonly useCases: readonly UseCaseItem[];
  readonly links: readonly UseCaseLink[];
}

export interface ComponentModel {
  readonly kind: 'component';
  readonly title: string;
  readonly components: readonly ComponentItem[];
  readonly links: readonly ComponentLink[];
}

export interface StateModel {
  readonly kind: 'state';
  readonly title: string;
  readonly states: readonly StateItem[];
  readonly transitions: readonly StateTransition[];
}

export interface FreeformModel {
  readonly kind: 'freeform';
  readonly title: string;
  readonly source: string;
}

export type PlantumlModel =
  | SequenceModel
  | ClassModel
  | ActivityModel
  | UseCaseModel
  | ComponentModel
  | StateModel
  | FreeformModel;

export interface PlantumlKindOption {
  readonly id: Exclude<PlantumlKind, 'freeform'>;
  readonly label: string;
  readonly hint: string;
}

/**
 * Guess which builder a PlantUML file belongs to.
 * Skin settings are ignored. Sequence, class, and activity are the kinds the grid edits.
 */
export function detectBuilderKind(source: string): Exclude<PlantumlKind, 'freeform'> | null {
  const text = source
    .split(/\r?\n/)
    .filter((line) => !/^\s*skinparam\b/i.test(line))
    .join('\n')
    .toLowerCase();
  if (
    /\bparticipant\b/.test(text)
    || /\bautonumber\b/.test(text)
    || /\bnote\s+over\b/.test(text)
    || /\bactivate\b/.test(text)
  )
    return 'sequence';
  if (/\bclass\s+\w/.test(text))
    return 'class';
  if (/\bstart\b/.test(text))
    return 'activity';
  if (/->/.test(text))
    return 'sequence';
  return null;
}

export const PLANTUML_KINDS: readonly PlantumlKindOption[] = [
  { id: 'sequence', label: 'Sequence', hint: 'Actors and messages over time' },
  { id: 'class', label: 'Class', hint: 'Types, fields, and relationships' },
  { id: 'activity', label: 'Activity', hint: 'Steps, decisions, and flow' },
];


let idCounter = 0;

export function nextPlantumlId(prefix = 'n'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function resetPlantumlIdCounter(value = 0): void {
  idCounter = value;
}

function escapePlant(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Turn a real line break, or the two characters `\n`, into a newline.
 * Leading and trailing breaks are removed. Blank lines in the middle stay.
 */
export function sequenceBreaks(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim();
}

/** Keep line breaks as PlantUML `\\n`. */
function escapeMessage(value: string): string {
  const text = sequenceBreaks(value);
  if (!text)
    return '';
  return text.split('\n').map((line) => line.trim()).join('\\n');
}

function aliasOf(name: string, alias: string): string {
  const cleanAlias = alias.trim() || name.trim().replace(/\s+/g, '_') || 'P';
  return cleanAlias.replace(/[^A-Za-z0-9_]/g, '_');
}

function normalizePlantColor(value: string | undefined): string {
  const raw = value?.trim() ?? '';
  if (!raw)
    return '';
  if (raw.startsWith('#'))
    return raw;
  return `#${raw}`;
}

/**
 * Step an else should be inserted before so it stays inside an alt.
 * An else placed on the alt header, or above the alt, moves just inside it.
 */
export function elseInsertBefore(
  steps: readonly { readonly id: string; readonly kind: string }[],
  beforeStepId: string | null,
): string | null {
  const index = beforeStepId ? steps.findIndex((step) => step.id === beforeStepId) : steps.length;
  const at = index < 0 ? steps.length : index;
  if (steps[at]?.kind === 'alt')
    return steps[at + 1]?.id ?? null;
  if (openFrameKind(steps, at) === 'alt')
    return beforeStepId;
  for (let cursor = at; cursor < steps.length; cursor += 1) {
    if (steps[cursor]?.kind !== 'alt')
      continue;
    return steps[cursor + 1]?.id ?? null;
  }
  return beforeStepId;
}

/**
 * Move an else that is not inside an alt to just after the next alt opener.
 * PlantUML rejects `else` before its `alt` with "Cannot create group".
 */
export function repairSequenceElse<T extends { readonly kind: string }>(steps: readonly T[]): readonly T[] {
  const next: T[] = [];
  const pending: T[] = [];
  const stack: string[] = [];
  let moved = false;
  for (const step of steps) {
    if (step.kind === 'alt' || step.kind === 'loop' || step.kind === 'group') {
      next.push(step);
      stack.push(step.kind);
      if (step.kind === 'alt' && pending.length > 0) {
        next.push(...pending);
        pending.length = 0;
        moved = true;
      }
      continue;
    }
    if (step.kind === 'else') {
      if (stack[stack.length - 1] === 'alt')
        next.push(step);
      else {
        pending.push(step);
        moved = true;
      }
      continue;
    }
    if (step.kind === 'end')
      stack.pop();
    next.push(step);
  }
  if (pending.length > 0) {
    next.push(...pending);
    moved = true;
  }
  return moved ? next : steps;
}

function openFrameKind(steps: readonly { readonly kind: string }[], index: number): string | null {
  const stack: string[] = [];
  for (let cursor = 0; cursor < index; cursor += 1) {
    const kind = steps[cursor]?.kind;
    if (kind === 'alt' || kind === 'loop' || kind === 'group')
      stack.push(kind);
    else if (kind === 'end')
      stack.pop();
  }
  return stack[stack.length - 1] ?? null;
}

function withoutSkin(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*skinparam\b/i.test(line) && !/^\s*hide\s+footbox\b/i.test(line))
    .join('\n');
}

function wrap(title: string, body: readonly string[]): string {
  const lines = ['@startuml'];
  const cleanTitle = escapeMessage(title);
  if (cleanTitle)
    lines.push(`title ${cleanTitle}`);
  lines.push(...body.filter((line) => line.length > 0), '@enduml');
  return lines.join('\n');
}

function relationArrow(kind: ClassRelation['kind']): string {
  if (kind === 'extends')
    return '--|>';
  if (kind === 'implements')
    return '..|>';
  if (kind === 'composition')
    return '*--';
  if (kind === 'aggregation')
    return 'o--';
  return '-->';
}

function resolveAlias(
  participants: readonly SequenceParticipant[],
  ref: string,
): string {
  const trimmed = ref.trim();
  const hit = participants.find((item) => {
    const alias = aliasOf(item.name, item.alias);
    return (
      item.alias === trimmed
      || item.name === trimmed
      || alias === trimmed
      || alias === aliasOf(trimmed, trimmed)
    );
  });
  return hit ? aliasOf(hit.name, hit.alias) : aliasOf(trimmed, trimmed);
}

/**
 * PlantUML `note over` accepts one lifeline, or the two ends of a span.
 * A note dragged across more lifelines still covers the ones in between.
 */
function noteSpan(over: string, participants: readonly SequenceParticipant[]): string {
  const unique: string[] = [];
  for (const part of over.split(',')) {
    const alias = resolveAlias(participants, part);
    if (alias && !unique.includes(alias))
      unique.push(alias);
  }
  if (unique.length <= 1)
    return unique[0] || 'User';
  const rank = new Map(participants.map((item, index) => [aliasOf(item.name, item.alias), index]));
  const sorted = [...unique].sort((left, right) => (rank.get(left) ?? 999) - (rank.get(right) ?? 999));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first)
    return 'User';
  if (!last || first === last)
    return first;
  return `${first}, ${last}`;
}

function emitSequenceStep(
  step: SequenceStep,
  participants: readonly SequenceParticipant[],
): string[] {
  if (step.kind === 'message') {
    const from = resolveAlias(participants, step.from);
    const to = resolveAlias(participants, step.to);
    const label = escapeMessage(step.label) || 'message';
    return [`${from} ${step.arrow} ${to} : ${label}`];
  }
  if (step.kind === 'activate' || step.kind === 'deactivate') {
    const target = resolveAlias(participants, step.target);
    return [`${step.kind} ${target}`];
  }
  if (step.kind === 'divider') {
    const label = escapeMessage(step.label) || 'Section';
    return [`== ${label} ==`];
  }
  if (step.kind === 'note') {
    const text = sequenceBreaks(step.text) || 'note';
    return [`note over ${noteSpan(step.over, participants)}`, ...text.split('\n').map((line) => `  ${line}`), 'end note'];
  }
  if (step.kind === 'alt')
    return [`alt ${escapeMessage(step.label) || 'condition'}`];
  if (step.kind === 'else')
    return [`else ${escapeMessage(step.label) || ''}`.trimEnd()];
  if (step.kind === 'loop')
    return [`loop ${escapeMessage(step.label) || 'loop'}`];
  if (step.kind === 'group')
    return [`group ${escapeMessage(step.label) || 'group'}`];
  return ['end'];
}

export function generatePlantuml(model: PlantumlModel): string {
  if (model.kind === 'freeform') {
    const trimmed = withoutSkin(model.source).trim();
    if (trimmed)
      return trimmed.includes('@startuml') ? trimmed : wrap(model.title, trimmed.split('\n'));
    return wrap(model.title, ['Alice -> Bob : hello']);
  }

  if (model.kind === 'sequence') {
    const body: string[] = [];
    if (model.autonumber)
      body.push('autonumber "<font color=magenta><b>[00]"');
    for (const participant of model.participants) {
      const alias = aliasOf(participant.name, participant.alias);
      const name = escapeMessage(participant.name) || alias;
      const color = normalizePlantColor(participant.color);
      const keyword = participant.role === 'actor' ? 'actor' : 'participant';
      body.push(color ? `${keyword} "${name}" as ${alias} ${color}` : `${keyword} "${name}" as ${alias}`);
    }
    for (const step of repairSequenceElse(model.steps))
      body.push(...emitSequenceStep(step, model.participants));
    const preamble = model.autonumber ? 1 : 0;
    if (body.length === 0 || (preamble > 0 && body.length === preamble && model.steps.length === 0))
      body.push('Alice -> Bob : hello');
    return wrap(model.title, body);
  }

  if (model.kind === 'class') {
    const body: string[] = [];
    for (const item of model.classes) {
      const name = escapePlant(item.name) || 'Type';
      const stereo = escapePlant(item.stereotype);
      body.push(stereo ? `class ${name} <<${stereo}>> {` : `class ${name} {`);
      for (const member of item.members.split('\n')) {
        const line = member.trim();
        if (line)
          body.push(`  ${line}`);
      }
      body.push('}');
    }
    for (const relation of model.relations) {
      const from = escapePlant(relation.from);
      const to = escapePlant(relation.to);
      if (!from || !to)
        continue;
      const label = escapePlant(relation.label);
      body.push(label ? `${from} ${relationArrow(relation.kind)} ${to} : ${label}` : `${from} ${relationArrow(relation.kind)} ${to}`);
    }
    if (body.length === 0)
      body.push('class Example');
    return wrap(model.title, body);
  }

  if (model.kind === 'activity') {
    const body: string[] = [];
    if (!model.steps.some((step) => step.kind === 'start'))
      body.push('start');
    for (const step of model.steps) {
      const label = escapePlant(step.label) || 'step';
      if (step.kind === 'start')
        body.push('start');
      else if (step.kind === 'stop')
        body.push('stop');
      else if (step.kind === 'if')
        body.push(`if (${label}) then (yes)`);
      else if (step.kind === 'endif')
        body.push('endif');
      else if (step.kind === 'fork')
        body.push('fork');
      else if (step.kind === 'endfork')
        body.push('end fork');
      else
        body.push(`:${label};`);
    }
    if (!model.steps.some((step) => step.kind === 'stop'))
      body.push('stop');
    return wrap(model.title, body);
  }

  if (model.kind === 'usecase') {
    const body: string[] = ['left to right direction'];
    for (const actor of model.actors)
      body.push(`actor "${escapePlant(actor.name) || 'Actor'}" as ${aliasOf(actor.name, actor.id)}`);
    for (const useCase of model.useCases)
      body.push(`usecase "${escapePlant(useCase.name) || 'Use case'}" as ${aliasOf(useCase.name, useCase.id)}`);
    for (const link of model.links) {
      const from = aliasOf(link.from, link.from);
      const to = aliasOf(link.to, link.to);
      if (link.kind === 'include')
        body.push(`${from} ..> ${to} : include`);
      else if (link.kind === 'extend')
        body.push(`${from} ..> ${to} : extend`);
      else
        body.push(`${from} --> ${to}`);
    }
    if (body.length === 1)
      body.push('actor User', 'usecase Goal', 'User --> Goal');
    return wrap(model.title, body);
  }

  if (model.kind === 'component') {
    const body: string[] = [];
    for (const item of model.components) {
      const name = escapePlant(item.name) || 'Component';
      const alias = aliasOf(item.name, item.id);
      const stereo = escapePlant(item.stereotype);
      body.push(stereo ? `component "${name}" as ${alias} <<${stereo}>>` : `component "${name}" as ${alias}`);
    }
    for (const link of model.links) {
      const from = aliasOf(link.from, link.from);
      const to = aliasOf(link.to, link.to);
      const label = escapePlant(link.label);
      body.push(label ? `${from} --> ${to} : ${label}` : `${from} --> ${to}`);
    }
    if (body.length === 0)
      body.push('component App', 'component API', 'App --> API');
    return wrap(model.title, body);
  }

  const body: string[] = ['[*] --> ' + (model.states[0] ? aliasOf(model.states[0].name, model.states[0].id) : 'Idle')];
  for (const state of model.states) {
    const alias = aliasOf(state.name, state.id);
    body.push(`state "${escapePlant(state.name) || alias}" as ${alias}`);
  }
  for (const transition of model.transitions) {
    const from = aliasOf(transition.from, transition.from);
    const to = aliasOf(transition.to, transition.to);
    const label = escapePlant(transition.label);
    body.push(label ? `${from} --> ${to} : ${label}` : `${from} --> ${to}`);
  }
  if (model.states.length === 0)
    body.push('state Idle', '[*] --> Idle');
  return wrap(model.title, body);
}

/**
 * Turn plain lines into a sequence model.
 * Accepts `A -> B: label`, `A calls B`, or bare step labels.
 */
export function sequenceFromText(text: string, title = 'From text'): SequenceModel {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const participants = new Map<string, SequenceParticipant>();
  const steps: SequenceStep[] = [];

  function ensure(name: string): string {
    const clean = escapePlant(name) || 'Actor';
    const alias = aliasOf(clean, clean);
    if (!participants.has(alias)) {
      participants.set(alias, {
        id: nextPlantumlId('p'),
        name: clean,
        alias,
      });
    }
    return alias;
  }

  for (const line of lines) {
    const arrowMatch = line.match(/^(.+?)\s*(->>|-->>|->|-->|<-|<--)\s*(.+?)(?:\s*:\s*(.*))?$/);
    if (arrowMatch) {
      const from = ensure(arrowMatch[1] ?? 'A');
      const to = ensure(arrowMatch[3] ?? 'B');
      const arrow = (arrowMatch[2] ?? '->') as SequenceArrow;
      steps.push({
        kind: 'message',
        id: nextPlantumlId('m'),
        from,
        to,
        label: escapePlant(arrowMatch[4] ?? 'message') || 'message',
        arrow,
      });
      continue;
    }

    const callsMatch = line.match(/^(.+?)\s+(calls|requests|sends|returns|notifies)\s+(.+)$/i);
    if (callsMatch) {
      const from = ensure(callsMatch[1] ?? 'A');
      const to = ensure(callsMatch[3] ?? 'B');
      const verb = (callsMatch[2] ?? 'calls').toLowerCase();
      steps.push({
        kind: 'message',
        id: nextPlantumlId('m'),
        from: verb === 'returns' ? to : from,
        to: verb === 'returns' ? from : to,
        label: verb === 'returns' ? 'response' : verb,
        arrow: verb === 'returns' ? '-->' : '->',
      });
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const from = ensure(parts[0] ?? 'A');
      const to = ensure(parts[1] ?? 'B');
      steps.push({
        kind: 'message',
        id: nextPlantumlId('m'),
        from,
        to,
        label: escapePlant(parts.slice(2).join(' ')) || 'step',
        arrow: '->',
      });
      continue;
    }

    steps.push({
      kind: 'message',
      id: nextPlantumlId('m'),
      from: ensure('User'),
      to: ensure('System'),
      label: escapePlant(line) || 'step',
      arrow: '->',
    });
  }

  if (steps.length === 0) {
    ensure('Client');
    ensure('Server');
    steps.push({
      kind: 'message',
      id: nextPlantumlId('m'),
      from: 'Client',
      to: 'Server',
      label: 'request',
      arrow: '->',
    });
  }

  return {
    kind: 'sequence',
    title,
    autonumber: true,
    hideFootbox: true,
    participants: [...participants.values()],
    steps,
  };
}

export function emptyModel(kind: Exclude<PlantumlKind, 'freeform'>, title = ''): PlantumlModel {
  if (kind === 'sequence') {
    return {
      kind,
      title: title || 'Sequence',
      autonumber: true,
      hideFootbox: true,
      participants: [
        { id: nextPlantumlId('p'), name: 'Client', alias: 'Client', color: '#magenta' },
        { id: nextPlantumlId('p'), name: 'Server', alias: 'Server', color: '#LightGreen' },
      ],
      steps: [
        {
          kind: 'message',
          id: nextPlantumlId('m'),
          from: 'Client',
          to: 'Server',
          label: 'request',
          arrow: '->',
        },
      ],
    };
  }
  if (kind === 'class') {
    return {
      kind,
      title: title || 'Classes',
      classes: [
        {
          id: nextPlantumlId('c'),
          name: 'User',
          stereotype: '',
          members: '+id: string\n+email: string',
        },
      ],
      relations: [],
    };
  }
  if (kind === 'activity') {
    return {
      kind,
      title: title || 'Activity',
      steps: [
        { id: nextPlantumlId('a'), label: 'Receive request', kind: 'action' },
        { id: nextPlantumlId('a'), label: 'Valid?', kind: 'if' },
        { id: nextPlantumlId('a'), label: 'Process', kind: 'action' },
        { id: nextPlantumlId('a'), label: '', kind: 'endif' },
      ],
    };
  }
  if (kind === 'usecase') {
    const actor = { id: 'actor_User', name: 'User' };
    const useCase = { id: 'uc_SignIn', name: 'Sign in' };
    return {
      kind,
      title: title || 'Use cases',
      actors: [actor],
      useCases: [useCase],
      links: [{ id: nextPlantumlId('l'), from: actor.id, to: useCase.id, kind: 'assoc' }],
    };
  }
  if (kind === 'component') {
    const app = { id: 'cmp_App', name: 'App', stereotype: '' };
    const api = { id: 'cmp_API', name: 'API', stereotype: '' };
    return {
      kind,
      title: title || 'Components',
      components: [app, api],
      links: [{ id: nextPlantumlId('l'), from: app.id, to: api.id, label: 'HTTP' }],
    };
  }
  const idle = { id: 'st_Idle', name: 'Idle' };
  const active = { id: 'st_Active', name: 'Active' };
  return {
    kind: 'state',
    title: title || 'States',
    states: [idle, active],
    transitions: [{ id: nextPlantumlId('t'), from: idle.id, to: active.id, label: 'start' }],
  };
}

export function toFreeform(model: PlantumlModel): FreeformModel {
  return {
    kind: 'freeform',
    title: model.kind === 'freeform' ? model.title : model.title,
    source: generatePlantuml(model),
  };
}

export const SEQUENCE_STEP_KINDS = [
  { id: 'message', label: 'Message' },
  { id: 'divider', label: 'Section' },
  { id: 'note', label: 'Note' },
  { id: 'alt', label: 'Alt' },
  { id: 'else', label: 'Else' },
  { id: 'loop', label: 'Loop' },
  { id: 'group', label: 'Group' },
  { id: 'end', label: 'End' },
  { id: 'activate', label: 'Activate' },
  { id: 'deactivate', label: 'Deactivate' },
] as const;

export function seqMsg(
  from: string,
  arrow: SequenceArrow,
  to: string,
  label: string,
): SequenceMessageStep {
  return { kind: 'message', id: nextPlantumlId('m'), from, to, label, arrow };
}

export function seqDivider(label: string): SequenceDividerStep {
  return { kind: 'divider', id: nextPlantumlId('m'), label };
}

export function seqNote(over: string, text: string): SequenceNoteStep {
  return { kind: 'note', id: nextPlantumlId('m'), over, text };
}

export function seqAlt(label: string): SequenceBlockStep {
  return { kind: 'alt', id: nextPlantumlId('m'), label };
}

export function seqElse(label = ''): SequenceBlockStep {
  return { kind: 'else', id: nextPlantumlId('m'), label };
}

export function seqLoop(label: string): SequenceBlockStep {
  return { kind: 'loop', id: nextPlantumlId('m'), label };
}

export function seqGroup(label: string): SequenceBlockStep {
  return { kind: 'group', id: nextPlantumlId('m'), label };
}

export function seqEnd(): SequenceEndStep {
  return { kind: 'end', id: nextPlantumlId('m') };
}

export function seqActivate(target: string): SequenceActivateStep {
  return { kind: 'activate', id: nextPlantumlId('m'), target };
}

export function seqDeactivate(target: string): SequenceActivateStep {
  return { kind: 'deactivate', id: nextPlantumlId('m'), target };
}
