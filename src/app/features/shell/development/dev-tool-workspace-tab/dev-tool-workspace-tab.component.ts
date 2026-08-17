import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { Base64DevToolComponent } from '../tools/base64-dev-tool.component';
import { BcryptDevToolComponent } from '../tools/bcrypt-dev-tool.component';
import { CodeEditorDevToolComponent } from '../tools/code-editor-dev-tool.component';
import { CronDevToolComponent } from '../tools/cron-dev-tool.component';
import { JwtDevToolComponent } from '../tools/jwt-dev-tool.component';
import { OpenApiDevToolComponent } from '../tools/openapi-dev-tool.component';
import { HashDevToolComponent } from '../tools/hash-dev-tool.component';
import { JsonpathDevToolComponent } from '../tools/jsonpath-dev-tool.component';
import { CertInspectorDevToolComponent } from '../tools/cert-inspector-dev-tool.component';
import { RsaOaepDevToolComponent } from '../tools/rsa-oaep-dev-tool.component';
import { RequestDiffDevToolComponent } from '../tools/request-diff-dev-tool.component';
import { RegexDevToolComponent } from '../tools/regex-dev-tool.component';
import { UrlDevToolComponent } from '../tools/url-dev-tool.component';
import { UuidGeneratorDevToolComponent } from '../tools/uuid-generator-dev-tool.component';

@Component({
  selector: 'app-dev-tool-workspace-tab',
  standalone: true,
  imports: [
    TxBannerComponent,
    UuidGeneratorDevToolComponent,
    CodeEditorDevToolComponent,
    Base64DevToolComponent,
    JwtDevToolComponent,
    CronDevToolComponent,
    RegexDevToolComponent,
    UrlDevToolComponent,
    BcryptDevToolComponent,
    OpenApiDevToolComponent,
    HashDevToolComponent,
    JsonpathDevToolComponent,
    CertInspectorDevToolComponent,
    RsaOaepDevToolComponent,
    RequestDiffDevToolComponent,
  ],
  templateUrl: './dev-tool-workspace-tab.component.html',
  styleUrl: './dev-tool-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevToolWorkspaceTabComponent {
  /** Development tool resource id (see {@link DEVELOPMENT_TOOLS}). */
  readonly resourceId = input.required<string>();
  readonly active = input(false);
}
