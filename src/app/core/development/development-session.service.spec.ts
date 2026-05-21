import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { createDefaultSession } from '@shared/config';

import { DevelopmentSessionService } from './development-session.service';

describe('DevelopmentSessionService', () => {
  let patchSession: ReturnType<typeof vi.fn>;
  let sessionState: ReturnType<typeof signal<ReturnType<typeof createDefaultSession>>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    patchSession = vi.fn().mockResolvedValue(undefined);
    sessionState = signal(createDefaultSession());

    await TestBed.configureTestingModule({
      providers: [
        DevelopmentSessionService,
        {
          provide: ConfigService,
          useValue: {
            session: sessionState.asReadonly(),
            patchSession,
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns merged tool state from session defaults', () => {
    const service = TestBed.inject(DevelopmentSessionService);
    const state = service.getToolState('base64');
    expect(state.mode).toBe('encode');
    expect(state.input).toBe('');
  });

  it('debounces patchToolState into session workspace.development', async () => {
    const service = TestBed.inject(DevelopmentSessionService);
    service.patchToolState('base64', { input: 'hello' });
    expect(patchSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);

    expect(patchSession).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: {
          development: expect.objectContaining({
            tools: expect.objectContaining({
              base64: expect.objectContaining({ input: 'hello' }),
            }),
          }),
        },
      }),
    );
  });
});
