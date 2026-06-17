import { describe, expect, it, vi } from 'vitest';

import { FlowManualInputCoordinator } from './flow-manual-input-coordinator.service';

describe('FlowManualInputCoordinator', () => {
  it('resolves submitted values to the waiting prompt', async () => {
    const coordinator = new FlowManualInputCoordinator();
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    coordinator.bindSender(sender as never);

    const pending = coordinator.prompt({
      flowId: 'flow-1',
      stepId: 'step-1',
      stepName: 'Enter code',
      prompt: 'Type the OTP',
      variableName: 'otp',
    });

    const sentPayload = (sender.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      requestId: string;
    };

    const ack = coordinator.submit({ requestId: sentPayload.requestId, value: '123456' });
    expect(ack.ok).toBe(true);

    await expect(pending).resolves.toEqual({ ok: true, value: '123456' });
  });

  it('resolves cancelled submissions', async () => {
    const coordinator = new FlowManualInputCoordinator();
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    coordinator.bindSender(sender as never);

    const pending = coordinator.prompt({
      flowId: 'flow-1',
      stepId: 'step-1',
      stepName: 'Enter code',
      prompt: 'Type the OTP',
      variableName: 'otp',
    });

    const sentPayload = (sender.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      requestId: string;
    };

    coordinator.submit({ requestId: sentPayload.requestId, cancelled: true });
    await expect(pending).resolves.toEqual({
      ok: false,
      cancelled: true,
      error: 'Manual input cancelled.',
    });
  });

  it('rejects active prompts when the run is cancelled', async () => {
    const coordinator = new FlowManualInputCoordinator();
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    coordinator.bindSender(sender as never);

    const pending = coordinator.prompt({
      flowId: 'flow-1',
      stepId: 'step-1',
      stepName: 'Enter code',
      prompt: 'Type the OTP',
      variableName: 'otp',
    });

    coordinator.cancelActivePrompts();
    await expect(pending).resolves.toEqual({
      ok: false,
      cancelled: true,
      error: 'Run cancelled.',
    });
  });
});
