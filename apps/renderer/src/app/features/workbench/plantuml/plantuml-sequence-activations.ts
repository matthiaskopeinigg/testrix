import { nextPlantumlId, type SequenceStep } from './plantuml-generator';

interface OpenCall {
  readonly alias: string;
  readonly caller: string;
  readonly inferred: boolean;
  readonly callIndex: number;
}

/**
 * Insert `activate` / `deactivate` where a participant is called and later
 * answers. Bars that are already in the steps are left in place, including
 * a bar that stays open across a reply.
 */
export function ensureSequenceActivations(steps: readonly SequenceStep[]): SequenceStep[] {
  const inserts = new Map<number, SequenceStep[]>();
  const stack: OpenCall[] = [];
  const add = (after: number, step: SequenceStep) => {
    const list = inserts.get(after) ?? [];
    list.push(step);
    inserts.set(after, list);
  };

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step)
      continue;
    if (step.kind === 'activate' || step.kind === 'deactivate') {
      const alias = step.target.trim();
      if (!alias)
        continue;
      if (step.kind === 'activate') {
        const provisional = findLastIndex(stack, (frame) => frame.alias === alias && frame.inferred);
        if (provisional >= 0)
          stack.splice(provisional, 1);
        stack.push({
          alias,
          caller: callSender(steps, index, alias),
          inferred: false,
          callIndex: index,
        });
      } else {
        const open = findLastIndex(stack, (frame) => frame.alias === alias);
        if (open >= 0)
          stack.splice(open, 1);
      }
      continue;
    }
    if (step.kind !== 'message')
      continue;
    const { sender, receiver } = messageEnds(step);
    if (!sender || !receiver || sender === receiver)
      continue;
    const top = stack[stack.length - 1];
    if (top && top.alias === sender && top.caller === receiver) {
      if (top.inferred) {
        add(top.callIndex, { kind: 'activate', id: nextPlantumlId('m'), target: sender });
        add(index, { kind: 'deactivate', id: nextPlantumlId('m'), target: sender });
        stack.pop();
      }
      continue;
    }
    if (step.arrow.includes('--'))
      continue;
    if (stack.some((frame) => frame.alias === receiver))
      continue;
    const next = steps[index + 1];
    if (next?.kind === 'activate' && next.target.trim() === receiver)
      continue;
    stack.push({ alias: receiver, caller: sender, inferred: true, callIndex: index });
  }

  if (inserts.size === 0)
    return steps as SequenceStep[];

  const nextSteps: SequenceStep[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step)
      nextSteps.push(step);
    const extra = inserts.get(index);
    if (extra)
      nextSteps.push(...extra);
  }
  return nextSteps;
}

function messageEnds(step: { readonly from: string; readonly to: string; readonly arrow: string }): { sender: string; receiver: string } {
  const backward = step.arrow.startsWith('<');
  return {
    sender: (backward ? step.to : step.from).trim(),
    receiver: (backward ? step.from : step.to).trim(),
  };
}

function callSender(steps: readonly SequenceStep[], index: number, alias: string): string {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const step = steps[cursor];
    if (!step || step.kind !== 'message')
      continue;
    const ends = messageEnds(step);
    return ends.receiver === alias ? ends.sender : '';
  }
  return '';
}

function findLastIndex(frames: readonly OpenCall[], test: (frame: OpenCall) => boolean): number {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame && test(frame))
      return index;
  }
  return -1;
}
