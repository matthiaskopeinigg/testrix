import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  animateTreeRowMoves,
  captureTreeRowRects,
  scheduleTreeRowMoveAnimation,
} from './tx-tree-move.animation';

describe('tx-tree-move.animation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures row rects by node id', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const row = document.createElement('div');
    row.className = 'tx-tree-row-host';
    row.dataset['txTreeNodeId'] = 'a';
    row.setAttribute('aria-level', '1');
    const inner = document.createElement('div');
    inner.className = 'tx-tree-row';
    const label = document.createElement('span');
    label.className = 'tx-tree-row__label';
    inner.appendChild(label);
    row.appendChild(inner);
    Object.defineProperty(label, 'getBoundingClientRect', {
      value: () => new DOMRect(16, 10, 80, 20),
    });
    root.appendChild(row);

    const map = captureTreeRowRects(root);
    expect(map.get('a')?.rect.top).toBe(10);
    expect(map.get('a')?.rect.left).toBe(16);
    expect(map.get('a')?.depth).toBe(0);
    root.remove();
  });

  it('applies transform for vertically moved rows', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const row = document.createElement('div');
    row.className = 'tx-tree-row-host';
    row.dataset['txTreeNodeId'] = 'a';
    row.setAttribute('aria-level', '1');
    const inner = document.createElement('div');
    inner.className = 'tx-tree-row';
    const label = document.createElement('span');
    label.className = 'tx-tree-row__label';
    inner.appendChild(label);
    row.appendChild(inner);

    let top = 40;
    Object.defineProperty(label, 'getBoundingClientRect', {
      value: () => new DOMRect(0, top, 100, 20),
    });
    root.appendChild(row);

    const before = captureTreeRowRects(root);
    top = 10;
    animateTreeRowMoves(root, before);

    expect(row.style.transform).toContain('translate3d');
    expect(row.classList.contains('tx-tree-row-host--moving')).toBe(true);
    root.remove();
  });

  it('applies transform when only horizontal position changes (folder exit)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const row = document.createElement('div');
    row.className = 'tx-tree-row-host';
    row.dataset['txTreeNodeId'] = 'a';
    row.setAttribute('aria-level', '1');
    const inner = document.createElement('div');
    inner.className = 'tx-tree-row';
    const label = document.createElement('span');
    label.className = 'tx-tree-row__label';
    inner.appendChild(label);
    row.appendChild(inner);

    let left = 32;
    Object.defineProperty(label, 'getBoundingClientRect', {
      value: () => new DOMRect(left, 100, 100, 20),
    });
    root.appendChild(row);

    const before = captureTreeRowRects(root);
    left = 16;
    animateTreeRowMoves(root, before);

    expect(row.style.transform).toContain('16px');
    expect(row.style.transform).toContain('translate3d');
    expect(row.classList.contains('tx-tree-row-host--moving')).toBe(true);
    root.remove();
  });

  it('animates reparent moves using indent depth when geometry is unchanged', () => {
    const root = document.createElement('div');
    root.style.setProperty('--tx-tree-indent', '16px');
    document.body.appendChild(root);
    const row = document.createElement('div');
    row.className = 'tx-tree-row-host';
    row.dataset['txTreeNodeId'] = 'a';
    row.setAttribute('aria-level', '2');
    const inner = document.createElement('div');
    inner.className = 'tx-tree-row';
    const label = document.createElement('span');
    label.className = 'tx-tree-row__label';
    inner.appendChild(label);
    row.appendChild(inner);

    Object.defineProperty(label, 'getBoundingClientRect', {
      value: () => new DOMRect(32, 100, 100, 20),
    });
    root.appendChild(row);

    const before = captureTreeRowRects(root);
    row.setAttribute('aria-level', '1');
    animateTreeRowMoves(root, before, { reparentedNodeId: 'a' });

    expect(row.style.transform).toContain('16px');
    root.remove();
  });

  it('schedules FLIP animation on the next frames', () => {
    vi.unstubAllGlobals();
    const callbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb);
      return callbacks.length;
    });

    const root = document.createElement('div');
    scheduleTreeRowMoveAnimation(root, new Map());

    expect(rafSpy).toHaveBeenCalledTimes(1);
    callbacks[0]?.(0);
    expect(rafSpy).toHaveBeenCalledTimes(2);
    callbacks[1]?.(0);

    rafSpy.mockRestore();
  });
});
