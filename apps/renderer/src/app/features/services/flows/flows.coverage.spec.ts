import { describe, expect, it } from 'vitest';

import { articlesForSection, filterHelpHits } from '../../help/help-registry';
import {
  FLOW_CANVAS_STATUS_HINT,
  FLOW_EMPTY_CANVAS_HINT,
  opensCanvasContextMenuOnEmpty,
} from './flow-canvas-actions';

/**
 * Documentation / product coverage for Flows canvas add-node UX.
 */
describe('Flows coverage', () => {
  it('covers Flows help for right-click add and templates in the Add node overlay', () => {
    expect(articlesForSection('services').some((item) => item.id === 'services-flows')).toBe(true);
    expect(filterHelpHits('Add node overlay').some((item) => item.id === 'services-flows')).toBe(true);
    expect(filterHelpHits('right-click empty canvas').some((item) => item.id === 'services-flows')).toBe(true);
  });

  it('keeps empty-canvas policy and hints aligned with help', () => {
    expect(opensCanvasContextMenuOnEmpty()).toBe(false);
    expect(FLOW_EMPTY_CANVAS_HINT.toLowerCase()).toContain('add node');
    expect(FLOW_CANVAS_STATUS_HINT.toLowerCase()).toContain('right-click empty canvas');
  });
});
