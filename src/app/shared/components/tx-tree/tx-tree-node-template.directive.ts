import { Directive, TemplateRef } from '@angular/core';

import type { TxTreeNodeTemplateContext } from './tx-tree.types';

/**
 * Marks an `ng-template` as the custom body for {@link TxTreeComponent} rows.
 *
 * @example
 * ```html
 * <ng-template txTreeNode let-row>
 *   <span>{{ row.node.label }}</span>
 * </ng-template>
 * ```
 */
@Directive({
  selector: '[txTreeNode]',
  standalone: true,
})
export class TxTreeNodeTemplateDirective<TMeta = unknown> {
  constructor(readonly template: TemplateRef<TxTreeNodeTemplateContext<TMeta>>) {}
}
