import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';

import { WorkspaceEditorMotionService } from './workspace-editor-motion.service';

describe('WorkspaceEditorMotionService', () => {
  let motion: WorkspaceEditorMotionService;

  beforeEach(() => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      providers: [
        WorkspaceEditorMotionService,
        {
          provide: UiPreferencesService,
          useValue: {
            animationsEnabled: () => true,
          },
        },
      ],
    });

    motion = TestBed.inject(WorkspaceEditorMotionService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs merge transition before mutate callback', () => {
    const order: string[] = [];
    motion.runMergeTransition(() => order.push('mutate'));
    order.push('after-call');
    expect(order).toEqual(['after-call']);
    expect(motion.layoutTransition()).toBe('merge');
    vi.advanceTimersByTime(160);
    expect(order).toEqual(['after-call', 'mutate']);
    expect(motion.layoutTransition()).toBe(null);
  });
});
