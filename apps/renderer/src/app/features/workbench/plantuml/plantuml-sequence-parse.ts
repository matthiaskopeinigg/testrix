import {
  nextPlantumlId,
  sequenceBreaks,
  type SequenceArrow,
  type SequenceModel,
  type SequenceParticipant,
  type SequenceStep,
} from './plantuml-generator';
import { ensureSequenceActivations } from './plantuml-sequence-activations';

const ARROWS = ['-->>', '->>', '-->', '->', '<--', '<-'] as const;

const BLOCK_OPEN = /^(alt|loop|group)\s*(.*)$/i;
const PARTICIPANT = /^(actor|participant)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?(?:\s+(#\S+))?\s*$/i;
const MESSAGE = /^(\S+)\s+(-->>|->>|-->|->|<--|<-)\s+(\S+)\s*:\s*(.*)$/;

/**
 * Parse a PlantUML sequence diagram into the builder model.
 * Supports participants, messages, activations, dividers, notes, and alt/loop/group.
 */
export function parsePlantumlSequence(source: string, fallbackTitle = 'Sequence'): SequenceModel {
  const lines = source.split(/\r?\n/);
  const participants: SequenceParticipant[] = [];
  const steps: SequenceStep[] = [];
  let title = fallbackTitle;
  let autonumber = false;
  let hideFootbox = false;
  let note: { over: string; lines: string[] } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (note) {
      if (/^end note$/i.test(line)) {
        steps.push({
          kind: 'note',
          id: nextPlantumlId('m'),
          over: note.over,
          text: note.lines.join('\n').trim() || 'note',
        });
        note = null;
      } else if (line.length > 0) {
        note.lines.push(sequenceBreaks(line));
      }
      continue;
    }
    if (!line || line.startsWith("'") || /^@startuml/i.test(line) || /^@enduml/i.test(line) || /^skinparam\b/i.test(line))
      continue;
    if (/^autonumber\b/i.test(line)) {
      autonumber = true;
      continue;
    }
    if (/^hide\s+footbox\b/i.test(line)) {
      hideFootbox = true;
      continue;
    }
    const titleMatch = /^title\s+(.+)$/i.exec(line);
    if (titleMatch) {
      title = sequenceBreaks(titleMatch[1] ?? '') || title;
      continue;
    }
    const participant = PARTICIPANT.exec(line);
    if (participant) {
      const role = participant[1]?.toLowerCase() === 'actor' ? 'actor' : 'participant';
      const name = sequenceBreaks(participant[2] || participant[3] || 'Participant');
      const alias = (participant[4] || name).trim();
      const color = participant[5]?.trim();
      participants.push({
        id: nextPlantumlId('p'),
        name,
        alias,
        role,
        color: color || undefined,
      });
      continue;
    }
    const divider = /^==\s*(.*?)\s*==\s*$/.exec(line);
    if (divider) {
      steps.push({ kind: 'divider', id: nextPlantumlId('m'), label: sequenceBreaks(divider[1] ?? '') || 'Section' });
      continue;
    }
    const noteOver = /^note\s+over\s+(.+)$/i.exec(line);
    if (noteOver) {
      note = { over: (noteOver[1] ?? '').trim(), lines: [] };
      continue;
    }
    const activate = /^(activate|deactivate)\s+(\S+)\s*$/i.exec(line);
    if (activate) {
      const kind = activate[1]?.toLowerCase() === 'deactivate' ? 'deactivate' : 'activate';
      steps.push({ kind, id: nextPlantumlId('m'), target: activate[2] ?? '' });
      continue;
    }
    if (/^else\b/i.test(line)) {
      steps.push({ kind: 'else', id: nextPlantumlId('m'), label: sequenceBreaks(line.replace(/^else\s*/i, '')) });
      continue;
    }
    if (/^end$/i.test(line)) {
      steps.push({ kind: 'end', id: nextPlantumlId('m') });
      continue;
    }
    const block = BLOCK_OPEN.exec(line);
    if (block) {
      const kind = block[1]?.toLowerCase();
      if (kind === 'alt' || kind === 'loop' || kind === 'group') {
        steps.push({ kind, id: nextPlantumlId('m'), label: sequenceBreaks(block[2] ?? '') });
        continue;
      }
    }
    const message = MESSAGE.exec(line);
    if (message) {
      const arrow = message[2] as SequenceArrow;
      if (ARROWS.includes(arrow)) {
        steps.push({
          kind: 'message',
          id: nextPlantumlId('m'),
          from: message[1] ?? '',
          to: message[3] ?? '',
          arrow,
          label: sequenceBreaks(message[4] ?? ''),
        });
      }
    }
  }

  return {
    kind: 'sequence',
    title,
    autonumber,
    hideFootbox,
    participants,
    steps: ensureSequenceActivations(steps),
  };
}

