import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollabAttentionComponent } from './collab-attention.component';
import { CollabStore } from './collab.store';

interface FakeStatus {
  kind: 'local' | 'shared';
  attention: 'none' | 'review' | 'auth' | 'tooling';
  lastError: string | null;
  reviews: { label: string }[];
}

describe('CollabAttentionComponent', () => {
  const status = signal<FakeStatus>({ kind: 'shared', attention: 'none', lastError: null, reviews: [] });
  const openReview = vi.fn();
  const openDock = vi.fn();
  const openUpdateToken = vi.fn();

  beforeEach(() => {
    openReview.mockClear();
    openDock.mockClear();
    openUpdateToken.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: CollabStore, useValue: { status, openReview, openDock, openUpdateToken } }],
    });
  });

  function render(next: Partial<FakeStatus>): HTMLElement {
    status.set({ kind: 'shared', attention: 'none', lastError: null, reviews: [], ...next });
    const fixture = TestBed.createComponent(CollabAttentionComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('stays hidden for local workspaces and quiet shared ones', () => {
    // Act
    const local = render({ kind: 'local', attention: 'auth' });
    const quiet = render({ attention: 'none' });

    // Assert
    expect(local.querySelector('[role="status"]')).toBeNull();
    expect(quiet.querySelector('[role="status"]')).toBeNull();
  });

  it('names the single review and opens the review on click', () => {
    // Arrange
    const element = render({ attention: 'review', reviews: [{ label: 'Login request' }] });

    // Act
    element.querySelector<HTMLButtonElement>('tx-button button')?.click();

    // Assert
    expect(element.textContent).toContain('Login request changed on another PC.');
    expect(openReview).toHaveBeenCalledTimes(1);
    expect(openDock).not.toHaveBeenCalled();
  });

  it('counts several reviews', () => {
    // Act
    const element = render({ attention: 'review', reviews: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] });

    // Assert
    expect(element.textContent).toContain('3 changes need you.');
  });

  it('shows the credential error and opens the token sheet', () => {
    // Arrange
    const element = render({ attention: 'auth', lastError: 'Update the access token to keep syncing.' });

    // Act
    element.querySelector<HTMLButtonElement>('tx-button button')?.click();

    // Assert
    expect(element.textContent).toContain('Update the access token to keep syncing.');
    expect(element.textContent).toContain('Update access token');
    expect(openUpdateToken).toHaveBeenCalledTimes(1);
    expect(openDock).not.toHaveBeenCalled();
  });
});
