import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { localCollabStatus } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollabReviewComponent } from './collab-review.component';
import { CollabStore } from './collab.store';

describe('CollabReviewComponent', () => {
  const reviews = [
    {
      id: 'rev_1',
      itemId: 'req_1',
      label: 'Get users',
      file: 'workspaces/a/collections.json',
      summary: 'URL changed',
      author: 'Alex',
      at: '2026-01-01T00:00:00.000Z',
      ours: { name: 'Get users', method: 'GET', url: '/users' },
      theirs: { name: 'List users', method: 'GET', url: '/v2/users' },
    },
    {
      id: 'rev_2',
      itemId: 'req_2',
      label: 'Create user',
      file: 'workspaces/a/collections.json',
      summary: 'Method changed',
      author: 'Sam',
      at: '2026-01-01T00:00:00.000Z',
      ours: { name: 'Create user', method: 'POST' },
      theirs: { name: 'Create user', method: 'PUT' },
    },
  ];

  beforeEach(() => {
    const status = localCollabStatus();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CollabStore,
          useValue: {
            status: signal({
              ...status,
              reviews,
            }),
            resolve: vi.fn(),
          },
        },
      ],
    });
  });

  it('renders a review card with keep-mine and keep-theirs actions', () => {
    const fixture = TestBed.createComponent(CollabReviewComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Get users');
    expect(text).toContain('Keep mine');
    expect(text).toContain('Keep theirs');
    expect(text).toContain('GET');
    expect(text).toContain('1 of 2');
    expect(text).toContain('/users');
  });
});
