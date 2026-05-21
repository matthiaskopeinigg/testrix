import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DevelopmentSessionService } from '@app/core/development/development-session.service';
import { createDefaultWorkspaceDevelopment } from '@shared/config';

import { RegexDevToolComponent } from './regex-dev-tool.component';

describe('RegexDevToolComponent', () => {
  it('renders and evaluates regex live', async () => {
    await TestBed.configureTestingModule({
      imports: [RegexDevToolComponent],
      providers: [
        {
          provide: DevelopmentSessionService,
          useValue: {
            load: vi.fn(),
            getToolState: () => createDefaultWorkspaceDevelopment().tools.regex,
            patchToolState: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RegexDevToolComponent);
    fixture.componentInstance['state'].update((s) => ({ ...s, pattern: '\\d+', sample: 'a1 b22' }));
    expect(fixture.componentInstance['evalResult']().matches.length).toBeGreaterThan(0);
  });
});
