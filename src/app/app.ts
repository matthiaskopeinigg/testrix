import { Component, OnInit, inject } from '@angular/core';

import { RouterOutlet } from '@angular/router';

import { ConfigService } from './core/config/config.service';
import { CollectionsService } from './core/collections/collections.service';
import { EnvironmentsService } from './core/environments/environments.service';
import { HistoryService } from './core/history/history.service';
import { CaptureWorkbenchStore } from './core/testing/capture-workbench.store';
import { InterceptorWorkspaceStore } from './core/testing/interceptor-workspace.store';
import { LoadTestService } from './core/testing/load-test.service';
import { MockServerService } from './core/testing/mock-server.service';
import { RegressionService } from './core/testing/regression.service';
import { TestSuiteService } from './core/testing/test-suite.service';
import { TestingSessionService } from './core/testing/testing-session.service';
import { ProfileService } from './core/profile/profile.service';

import { WindowChromeDocumentService } from './core/electron/window-chrome-document.service';
import { UiPreferencesService } from './core/ui/ui-preferences.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})

export class App implements OnInit {
  private readonly config = inject(ConfigService);
  private readonly collections = inject(CollectionsService);
  private readonly environments = inject(EnvironmentsService);
  private readonly history = inject(HistoryService);
  private readonly profiles = inject(ProfileService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly loadTest = inject(LoadTestService);
  private readonly regression = inject(RegressionService);
  private readonly mockServer = inject(MockServerService);
  private readonly capture = inject(CaptureWorkbenchStore);
  private readonly interceptor = inject(InterceptorWorkspaceStore);
  private readonly testingSession = inject(TestingSessionService);


  /** Registers `data-*` UI preference hooks on `document.documentElement`. */
  private readonly _uiPreferences = inject(UiPreferencesService);

  /** Adds `html.tx-electron-app` for frameless window chrome styles. */
  private readonly _windowChromeDocument = inject(WindowChromeDocumentService);



  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.config.hydrate(),
      this.profiles.hydrate(),
      this.collections.hydrate(),
      this.environments.hydrate(),
      this.history.hydrate(),
    ]);
    this.testingSession.load();
    void Promise.all([
      this.testSuite.hydrate(),
      this.loadTest.hydrate(),
      this.regression.hydrate(),
      this.mockServer.hydrate(),
      this.capture.hydrate(),
      this.interceptor.hydrate(),
    ]);
  }


}
