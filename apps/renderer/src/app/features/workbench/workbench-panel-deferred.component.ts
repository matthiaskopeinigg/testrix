import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FlowTemplateEditorComponent } from '../services/flows/flow-template-editor.component';
import { FlowsEditorComponent } from '../services/flows/flows-editor.component';
import { PlantumlEditorComponent } from './plantuml/plantuml-editor.component';
import type { WorkbenchTab } from './workbench.store';

export type WorkbenchDeferredEditorKind = 'plantuml' | 'flow' | 'flow-template';

/**
 * Hosts heavy workbench editors inside `@defer` blocks so they are not eagerly imported
 * by {@link WorkbenchPanelComponent}.
 */
@Component({
  selector: 'tx-workbench-panel-deferred',
  standalone: true,
  imports: [PlantumlEditorComponent, FlowsEditorComponent, FlowTemplateEditorComponent],
  templateUrl: './workbench-panel-deferred.component.html',
  styleUrl: './workbench-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbenchPanelDeferredComponent {
  readonly tab = input.required<WorkbenchTab>();
  readonly kind = input.required<WorkbenchDeferredEditorKind>();
}
