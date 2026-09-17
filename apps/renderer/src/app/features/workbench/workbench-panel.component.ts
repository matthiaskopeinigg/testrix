import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { DatabaseConnectionEditorComponent } from '../database/database-connection-editor.component';
import { DatabaseQueryEditorComponent } from '../database/database-query-editor.component';
import { DatabaseErdComponent } from '../database/database-erd.component';
import { DatabaseTableEditorComponent } from '../database/database-table-editor.component';
import { Base64EditorComponent } from './base64-editor.component';
import { CronBuilderEditorComponent } from './cron-builder-editor.component';
import { EnvironmentEditorComponent } from './environment-editor.component';
import { JwtToolkitEditorComponent } from './jwt-toolkit-editor.component';
import { PasswordGeneratorEditorComponent } from './password-generator-editor.component';
import { RegexBuilderEditorComponent } from './regex-builder-editor.component';
import { RequestEditorComponent } from './request-editor.component';
import { UrlCodecEditorComponent } from './url-codec-editor.component';
import { UuidGeneratorEditorComponent } from './uuid-generator-editor.component';
import { WebsocketEditorComponent } from './websocket-editor.component';
import type { WorkbenchTab } from './workbench.store';

@Component({
  selector: 'tx-workbench-panel',
  standalone: true,
  imports: [
    RequestEditorComponent,
    WebsocketEditorComponent,
    EnvironmentEditorComponent,
    DatabaseConnectionEditorComponent,
    DatabaseQueryEditorComponent,
    DatabaseTableEditorComponent,
    DatabaseErdComponent,
    UuidGeneratorEditorComponent,
    Base64EditorComponent,
    JwtToolkitEditorComponent,
    CronBuilderEditorComponent,
    UrlCodecEditorComponent,
    RegexBuilderEditorComponent,
    PasswordGeneratorEditorComponent,
  ],
  templateUrl: './workbench-panel.component.html',
  styleUrl: './workbench-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbenchPanelComponent {
  readonly tab = input.required<WorkbenchTab>();

  readonly panelId = computed(() => `workbench-panel-${this.tab().id}`);
  readonly labelledBy = computed(() => `workbench-tab-${this.tab().id}`);
}
