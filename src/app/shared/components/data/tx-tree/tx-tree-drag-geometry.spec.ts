import { afterEach, describe, expect, it } from 'vitest';

import {
  applyTxTreeAutoScroll,
  findTxTreeScrollParent,
  resolveTxTreeAutoScrollDelta,
  resolveTxTreeDropReachPx,
  resolveTxTreeRowSpan,
  TxTreeDragGeometry,
} from './tx-tree-drag-geometry';
import type { TxTreeRowBox } from './tx-tree-drop-slots';

function elementAt(top: number, height: number, left = 0): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left,
      right: left + 200,
      width: 200,
      height,
    }) as DOMRect;
  return element;
}

describe('TxTreeDragGeometry', () => {
  it('measures row boxes relative to the tree content box', () => {
    const host = elementAt(100, 300, 40);
    const rows = new Map<string, HTMLElement>([
      ['a', elementAt(100, 40, 40)],
      ['b', elementAt(140, 40, 40)],
    ]);

    const geometry = new TxTreeDragGeometry(
      () => host,
      () => rows,
    );

    expect([...geometry.getBoxes()]).toEqual([
      ['a', { topPx: 0, bottomPx: 40 }],
      ['b', { topPx: 40, bottomPx: 80 }],
    ]);
  });

  it('measures once until invalidated', () => {
    let measurements = 0;
    const host = elementAt(0, 200);
    const row = elementAt(0, 40);
    const rows = new Map([['a', row]]);
    row.getBoundingClientRect = () => {
      measurements++;
      return { top: 0, bottom: 40, left: 0, right: 200, width: 200, height: 40 } as DOMRect;
    };

    const geometry = new TxTreeDragGeometry(
      () => host,
      () => rows,
    );

    geometry.getBoxes();
    geometry.getBoxes();
    expect(measurements).toBe(1);

    geometry.invalidate();
    geometry.getBoxes();
    expect(measurements).toBe(2);
  });

  it('keeps cached boxes valid while the content box scrolls', () => {
    let hostTop = 100;
    const rows = new Map([['a', elementAt(100, 40)]]);
    const geometry = new TxTreeDragGeometry(
      () => elementAt(hostTop, 300),
      () => rows,
    );

    expect(geometry.getBoxes().get('a')).toEqual({ topPx: 0, bottomPx: 40 });
    expect(geometry.toFrame(0, 120).pointerYPx).toBe(20);

    // Scrolling down by 50px moves the content box, not the cached row offsets.
    hostTop = 50;
    expect(geometry.toFrame(0, 120).pointerYPx).toBe(70);
    expect(geometry.getBoxes().get('a')).toEqual({ topPx: 0, bottomPx: 40 });
  });
});

describe('row span and drop reach', () => {
  const boxes = new Map<string, TxTreeRowBox>([
    ['a', { topPx: 0, bottomPx: 28 }],
    ['tall', { topPx: 28, bottomPx: 76 }],
    ['c', { topPx: 76, bottomPx: 104 }],
  ]);

  it('spans from the first row top to the last row bottom', () => {
    expect(resolveTxTreeRowSpan(boxes)).toEqual({ topPx: 0, bottomPx: 104 });
    expect(resolveTxTreeRowSpan(new Map())).toBeNull();
  });

  it('reaches as far as the row under the pointer is tall', () => {
    expect(resolveTxTreeDropReachPx(boxes, 10)).toBe(28);
    expect(resolveTxTreeDropReachPx(boxes, 50)).toBe(48);
  });

  it('falls back to the tallest row outside the span', () => {
    expect(resolveTxTreeDropReachPx(boxes, 500)).toBe(48);
    expect(resolveTxTreeDropReachPx(new Map(), 10)).toBeNull();
  });
});

describe('findTxTreeScrollParent', () => {
  const mounted: HTMLElement[] = [];

  /** Builds `outer > inner > tree` with a stubbed scroll extent on `outer`. */
  function mountTree(options: {
    readonly overflowY: string;
    readonly scrollHeight: number;
    readonly clientHeight: number;
  }) {
    const outer = document.createElement('div');
    outer.style.overflowY = options.overflowY;
    Object.defineProperty(outer, 'scrollHeight', { value: options.scrollHeight });
    Object.defineProperty(outer, 'clientHeight', { value: options.clientHeight });

    const inner = document.createElement('div');
    const tree = document.createElement('div');
    inner.appendChild(tree);
    outer.appendChild(inner);
    document.body.appendChild(outer);
    mounted.push(outer);

    return { outer, tree };
  }

  afterEach(() => {
    for (const element of mounted.splice(0)) {
      element.remove();
    }
  });

  it('finds the scrollable ancestor that sidebars use', () => {
    const { outer, tree } = mountTree({ overflowY: 'auto', scrollHeight: 800, clientHeight: 400 });
    expect(findTxTreeScrollParent(tree)).toBe(outer);
  });

  it('ignores an ancestor that is not overflowing', () => {
    const { tree } = mountTree({ overflowY: 'auto', scrollHeight: 400, clientHeight: 400 });
    expect(findTxTreeScrollParent(tree)).toBeNull();
  });

  it('ignores a clipped ancestor and a missing element', () => {
    const { tree } = mountTree({ overflowY: 'hidden', scrollHeight: 800, clientHeight: 400 });
    expect(findTxTreeScrollParent(tree)).toBeNull();
    expect(findTxTreeScrollParent(null)).toBeNull();
  });
});

describe('resolveTxTreeAutoScrollDelta', () => {
  const rect = { top: 100, bottom: 500 };

  it('stays disengaged away from the edges', () => {
    expect(resolveTxTreeAutoScrollDelta(300, rect)).toBe(0);
  });

  it('ramps up toward each edge', () => {
    const nearTop = resolveTxTreeAutoScrollDelta(120, rect, 28, 14);
    const atTop = resolveTxTreeAutoScrollDelta(100, rect, 28, 14);
    expect(nearTop).toBeLessThan(0);
    expect(atTop).toBeLessThanOrEqual(nearTop);
    expect(atTop).toBe(-14);

    const nearBottom = resolveTxTreeAutoScrollDelta(480, rect, 28, 14);
    const atBottom = resolveTxTreeAutoScrollDelta(500, rect, 28, 14);
    expect(nearBottom).toBeGreaterThan(0);
    expect(atBottom).toBe(14);
  });

  it('clamps to full speed beyond the container', () => {
    expect(resolveTxTreeAutoScrollDelta(-200, rect, 28, 14)).toBe(-14);
    expect(resolveTxTreeAutoScrollDelta(900, rect, 28, 14)).toBe(14);
  });
});

describe('applyTxTreeAutoScroll', () => {
  it('reports the distance actually scrolled', () => {
    const container = document.createElement('div');
    let scrollTop = 0;
    Object.defineProperty(container, 'scrollTop', {
      get: () => scrollTop,
      // Emulate the browser clamping scrollTop to the scrollable range.
      set: (next: number) => {
        scrollTop = Math.max(0, Math.min(60, next));
      },
    });

    expect(applyTxTreeAutoScroll(container, 0)).toBe(0);
    expect(applyTxTreeAutoScroll(container, 40)).toBe(40);
    expect(applyTxTreeAutoScroll(container, 40)).toBe(20);
    expect(applyTxTreeAutoScroll(container, 40)).toBe(0);
  });
});
