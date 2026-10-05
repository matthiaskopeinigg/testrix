import {
  nextPlantumlId,
  type ActivityModel,
  type ActivityStep,
  type ClassModel,
  type ClassRelation,
  type ComponentModel,
  type StateModel,
  type UseCaseModel,
} from './plantuml-generator';

type GraphKind = 'class' | 'usecase' | 'component' | 'state' | 'activity';

type EmittedModel = ClassModel | ActivityModel | UseCaseModel | ComponentModel | StateModel;

const CLASS_ARROW: Record<string, ClassRelation['kind']> = {
  '--|>': 'extends',
  '..|>': 'implements',
  '*--': 'composition',
  'o--': 'aggregation',
  '-->': 'association',
};

/**
 * Parse the PlantUML subset this app writes for class, activity, use case,
 * component, and state diagrams. Returns null when the text is outside that subset.
 * Node positions are not in the source, so parsed nodes have no x or y.
 */
export function parseEmittedDiagram(
  source: string,
  title: string,
  kind: GraphKind,
): EmittedModel | null {
  const lines = diagramLines(source);
  if (kind === 'class')
    return parseClass(lines, title);
  if (kind === 'activity')
    return parseActivity(lines, title);
  if (kind === 'usecase')
    return parseUseCase(lines, title);
  if (kind === 'component')
    return parseComponent(lines, title);
  return parseState(lines, title);
}

function diagramLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line.length > 0
      && !line.startsWith('@')
      && !/^title\b/i.test(line)
      && !/^skinparam\b/i.test(line)
      && !/^hide\s+footbox\b/i.test(line)
      && !/^left to right direction$/i.test(line)
      && !line.startsWith("'"),
    );
}

function parseClass(lines: string[], title: string): ClassModel | null {
  const classes: ClassModel['classes'][number][] = [];
  const relations: ClassRelation[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const opened = line.match(/^class\s+(\S+)(?:\s+<<([^>]*)>>)?\s*(\{)?\s*$/);
    if (opened) {
      const members: string[] = [];
      if (opened[3]) {
        index += 1;
        while (index < lines.length && lines[index] !== '}') {
          const member = (lines[index] ?? '').trim();
          if (member)
            members.push(member);
          index += 1;
        }
      }
      classes.push({
        id: nextPlantumlId('c'),
        name: opened[1] ?? 'Type',
        stereotype: (opened[2] ?? '').trim(),
        members: members.join('\n'),
      });
      continue;
    }
    const link = readArrow(line);
    if (!link)
      continue;
    const kind = CLASS_ARROW[link.arrow];
    if (!kind)
      continue;
    relations.push({
      id: nextPlantumlId('r'),
      from: link.from,
      to: link.to,
      kind,
      label: link.label,
    });
  }
  if (classes.length === 0)
    return null;
  return { kind: 'class', title, classes, relations };
}

function parseActivity(lines: string[], title: string): ActivityModel | null {
  const steps: ActivityStep[] = [];
  for (const line of lines) {
    if (line === 'start') {
      steps.push({ id: nextPlantumlId('a'), label: '', kind: 'start' });
      continue;
    }
    if (line === 'stop') {
      steps.push({ id: nextPlantumlId('a'), label: '', kind: 'stop' });
      continue;
    }
    if (line === 'endif') {
      steps.push({ id: nextPlantumlId('a'), label: '', kind: 'endif' });
      continue;
    }
    if (line === 'fork') {
      steps.push({ id: nextPlantumlId('a'), label: '', kind: 'fork' });
      continue;
    }
    if (line === 'end fork') {
      steps.push({ id: nextPlantumlId('a'), label: '', kind: 'endfork' });
      continue;
    }
    const decision = line.match(/^if\s*\((.*)\)\s*then\s*\([^)]*\)\s*$/i);
    if (decision) {
      steps.push({
        id: nextPlantumlId('a'),
        label: (decision[1] ?? '').trim() || 'Condition?',
        kind: 'if',
      });
      continue;
    }
    const action = line.match(/^:(.*);$/);
    if (action) {
      steps.push({
        id: nextPlantumlId('a'),
        label: (action[1] ?? '').trim() || 'step',
        kind: 'action',
      });
    }
  }
  if (steps.length === 0)
    return null;
  return { kind: 'activity', title, steps };
}

function parseUseCase(lines: string[], title: string): UseCaseModel | null {
  const actors: UseCaseModel['actors'][number][] = [];
  const useCases: UseCaseModel['useCases'][number][] = [];
  const links: UseCaseModel['links'][number][] = [];
  for (const line of lines) {
    const actor = line.match(/^actor\s+"([^"]*)"(?:\s+as\s+(\w+))?/i)
      ?? line.match(/^actor\s+(\w+)\s*$/i);
    if (actor) {
      const name = actor[1] || 'Actor';
      actors.push({ id: actor[2] || slug(name), name });
      continue;
    }
    const useCase = line.match(/^usecase\s+"([^"]*)"(?:\s+as\s+(\w+))?/i)
      ?? line.match(/^usecase\s+(\w+)\s*$/i);
    if (useCase) {
      const name = useCase[1] || 'Use case';
      useCases.push({ id: useCase[2] || slug(name), name });
      continue;
    }
    const link = readArrow(line);
    if (!link || (link.arrow !== '-->' && link.arrow !== '..>'))
      continue;
    const kind = link.arrow === '..>'
      ? (link.label.toLowerCase() === 'extend' ? 'extend' : 'include')
      : 'assoc';
    links.push({
      id: nextPlantumlId('l'),
      from: link.from,
      to: link.to,
      kind,
    });
  }
  if (actors.length === 0 && useCases.length === 0)
    return null;
  return { kind: 'usecase', title, actors, useCases, links };
}

function parseComponent(lines: string[], title: string): ComponentModel | null {
  const components: ComponentModel['components'][number][] = [];
  const links: ComponentModel['links'][number][] = [];
  for (const line of lines) {
    const named = line.match(/^component\s+"([^"]*)"(?:\s+as\s+(\w+))?(?:\s+<<([^>]*)>>)?/i);
    const bare = named ? null : line.match(/^component\s+(\w+)\s*$/i);
    if (named || bare) {
      const name = (named?.[1] ?? bare?.[1] ?? 'Component') || 'Component';
      components.push({
        id: named?.[2] || slug(name),
        name,
        stereotype: (named?.[3] ?? '').trim(),
      });
      continue;
    }
    const link = readArrow(line);
    if (!link || link.arrow !== '-->')
      continue;
    links.push({
      id: nextPlantumlId('l'),
      from: link.from,
      to: link.to,
      label: link.label,
    });
  }
  if (components.length === 0)
    return null;
  return { kind: 'component', title, components, links };
}

function parseState(lines: string[], title: string): StateModel | null {
  const states: StateModel['states'][number][] = [];
  const transitions: StateModel['transitions'][number][] = [];
  for (const line of lines) {
    if (/^\[\*\]\s+-->/.test(line))
      continue;
    const named = line.match(/^state\s+"([^"]*)"\s+as\s+(\w+)/i);
    const bare = named ? null : line.match(/^state\s+(\w+)\s*$/i);
    if (named || bare) {
      const name = named?.[1] || bare?.[1] || 'State';
      states.push({ id: named?.[2] || slug(name), name });
      continue;
    }
    const link = readArrow(line);
    if (!link || link.arrow !== '-->' || link.from === '[*]' || link.to === '[*]')
      continue;
    transitions.push({
      id: nextPlantumlId('t'),
      from: link.from,
      to: link.to,
      label: link.label,
    });
  }
  if (states.length === 0)
    return null;
  return { kind: 'state', title, states, transitions };
}

function readArrow(line: string): { from: string; arrow: string; to: string; label: string } | null {
  const match = line.match(/^(\S+)\s+(--\|>|\.\.\|>|\*--|o--|-->|\.\.>)\s+(\S+)(?:\s*:\s*(.*))?$/);
  if (!match)
    return null;
  return {
    from: match[1] ?? '',
    arrow: match[2] ?? '',
    to: match[3] ?? '',
    label: (match[4] ?? '').trim(),
  };
}

function slug(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9_]/g, '_') || 'Node';
}
