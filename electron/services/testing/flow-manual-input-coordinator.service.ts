import { randomUUID } from 'node:crypto';

import type { WebContents } from 'electron';

import {
  flowManualInputPromptSchema,
  flowManualInputSubmitPayloadSchema,
  type FlowManualInputRequest,
  type FlowManualInputResult,
  type FlowManualInputSubmitPayload,
} from '../../../shared/testing/flow-manual-input.schema';

import { TestingChannels } from '../../ipc/channels/testing.channels';

interface PendingManualInput {
  readonly resolve: (result: FlowManualInputResult) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: ReturnType<typeof setTimeout> | null;
}

/**
 * Bridges flow manual-input steps between the main-process executor and the renderer modal.
 */
export class FlowManualInputCoordinator {
  private readonly pending = new Map<string, PendingManualInput>();
  private sender: WebContents | null = null;

  /** Associates the active interactive flow run with a renderer WebContents. */
  bindSender(sender: WebContents | null | undefined): void {
    this.sender = sender && !sender.isDestroyed() ? sender : null;
  }

  /** Clears bindings and rejects any outstanding prompts. */
  reset(reason = 'Run ended.'): void {
    this.rejectAll(reason);
    this.sender = null;
  }

  /** Rejects outstanding prompts when a flow run is cancelled. */
  cancelActivePrompts(reason = 'Run cancelled.'): void {
    this.rejectAll(reason);
  }

  /**
   * Prompts the renderer and waits until the user submits or cancels.
   */
  async prompt(request: FlowManualInputRequest): Promise<FlowManualInputResult> {
    const sender = this.sender;
    if (!sender || sender.isDestroyed()) {
      return { ok: false, error: 'Manual input is only available during an interactive flow run.' };
    }

    const requestId = randomUUID();
    const payload = flowManualInputPromptSchema.parse({
      requestId,
      flowId: request.flowId,
      stepId: request.stepId,
      stepName: request.stepName,
      prompt: request.prompt,
      variableName: request.variableName,
    });

    return new Promise<FlowManualInputResult>((resolve, reject) => {
      const timeoutId =
        request.timeoutMs && request.timeoutMs > 0
          ? setTimeout(() => {
              this.finish(requestId, {
                ok: false,
                error: `Manual input timed out after ${request.timeoutMs} ms.`,
              });
            }, request.timeoutMs)
          : null;

      this.pending.set(requestId, { resolve, reject, timeoutId });
      sender.send(TestingChannels.flowManualInputPrompt, payload);
    });
  }

  /** Handles renderer submission for a pending prompt. */
  submit(raw: unknown): { readonly ok: boolean; readonly error?: string } {
    const payload = flowManualInputSubmitPayloadSchema.parse(raw);
    const pending = this.pending.get(payload.requestId);
    if (!pending) {
      return { ok: false, error: 'Manual input request was not found or already completed.' };
    }

    if (payload.cancelled) {
      this.finish(payload.requestId, { ok: false, cancelled: true, error: 'Manual input cancelled.' });
      return { ok: true };
    }

    this.finish(payload.requestId, { ok: true, value: String(payload.value ?? '') });
    return { ok: true };
  }

  private finish(requestId: string, result: FlowManualInputResult): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    if (pending.timeoutId !== null) {
      clearTimeout(pending.timeoutId);
    }
    this.pending.delete(requestId);
    pending.resolve(result);
  }

  private rejectAll(reason: string): void {
    for (const [requestId, pending] of this.pending.entries()) {
      if (pending.timeoutId !== null) {
        clearTimeout(pending.timeoutId);
      }
      pending.resolve({ ok: false, cancelled: true, error: reason });
      this.pending.delete(requestId);
    }
  }
}

export type { FlowManualInputSubmitPayload };
