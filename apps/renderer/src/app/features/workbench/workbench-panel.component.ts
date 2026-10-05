import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { CollabReviewComponent } from '../collab/collab-review.component';
import { CollectionFolderEditorComponent } from '../collections/collection-folder-editor.component';
import { DatabaseConnectionEditorComponent } from '../database/database-connection-editor.component';
import { DatabaseQueryEditorComponent } from '../database/database-query-editor.component';
import { DatabaseErdComponent } from '../database/database-erd.component';
import { DatabaseTableEditorComponent } from '../database/database-table-editor.component';
import { HistoryViewerComponent } from '../history/history-viewer.component';
import { ServiceEditorComponent } from '../services/service-editor.component';
import { LoadEditorComponent } from '../services/load/load-editor.component';
import { RegressionEditorComponent } from '../services/regression/regression-editor.component';
import { EmulatorDeviceEditorComponent } from '../services/emulator/emulator-device-editor.component';
import { MockEditorComponent } from '../services/mock/mock-editor.component';
import { ListenerEditorComponent } from '../services/listener/listener-editor.component';
import { InterceptEditorComponent } from '../services/intercept/intercept-editor.component';
import { Base64EditorComponent } from './tools/base64-editor.component';
import { CronBuilderEditorComponent } from './tools/cron-builder-editor.component';
import { EnvironmentEditorComponent } from './environment/environment-editor.component';
import { JwtToolkitEditorComponent } from './tools/jwt-toolkit-editor.component';
import { PasswordGeneratorEditorComponent } from './tools/password-generator-editor.component';
import { RegexBuilderEditorComponent } from './tools/regex-builder-editor.component';
import { RequestEditorComponent } from './request/request-editor.component';
import { UrlCodecEditorComponent } from './tools/url-codec-editor.component';
import { UuidGeneratorEditorComponent } from './tools/uuid-generator-editor.component';
import { WebsocketEditorComponent } from './request/websocket-editor.component';
import { WorkbenchPanelDeferredComponent } from './workbench-panel-deferred.component';
import type { WorkbenchTab } from './workbench.store';

@Component({
  selector: 'tx-workbench-panel',
  standalone: true,
  imports: [
    RequestEditorComponent,
    HistoryViewerComponent,
    CollectionFolderEditorComponent,
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
    ServiceEditorComponent,
    LoadEditorComponent,
    RegressionEditorComponent,
    EmulatorDeviceEditorComponent,
    MockEditorComponent,
    ListenerEditorComponent,
    InterceptEditorComponent,
    CollabReviewComponent,
    WorkbenchPanelDeferredComponent,
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
