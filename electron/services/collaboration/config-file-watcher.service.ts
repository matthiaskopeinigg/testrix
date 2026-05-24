import * as chokidar from 'chokidar';
import * as path from 'node:path';

import { resolveShareScopeFileNames, type TeamShareScope } from '../../../shared/collaboration';

import { teamSyncEngine } from './team-sync-engine.service';

export interface TeamWatchTarget {
  readonly dir: string;
  readonly shareScope: TeamShareScope;
}

/**
 * Watches share-scoped profile files for external changes (e.g. git pull).
 */
export class ConfigFileWatcherService {
  private watcher: chokidar.FSWatcher | null = null;

  async start(targets: readonly TeamWatchTarget[]): Promise<void> {
    await this.stop();
    const watchPaths: string[] = [];
    for (const target of targets) {
      for (const fileName of resolveShareScopeFileNames(target.shareScope)) {
        watchPaths.push(path.join(target.dir, fileName));
      }
    }
    if (watchPaths.length === 0) {
      return;
    }

    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      persistent: true,
    });

    this.watcher.on('change', (filePath) => {
      const workspaceDir = path.dirname(filePath);
      if (teamSyncEngine.isSelfWriteWindow(workspaceDir)) {
        return;
      }
      teamSyncEngine.handleExternalFileChange(path.basename(filePath), workspaceDir);
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}

export const configFileWatcherService = new ConfigFileWatcherService();
