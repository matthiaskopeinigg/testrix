import { inject, Injectable } from '@angular/core';
import { environmentVariableMap } from '@testrix/contracts';

import { scanCollectionHealth } from './collection-health';
import { CollectionHealthDialogService } from './collection-health-dialog.service';
import { CollectionsStore } from './collections.store';
import { EnvironmentsStore } from '../environments/environments.store';

@Injectable({ providedIn: 'root' })
export class CollectionHealthService {
  private readonly collections = inject(CollectionsStore);
  private readonly environments = inject(EnvironmentsStore);
  private readonly dialog = inject(CollectionHealthDialogService);

  run(folderId: string | null = null): void {
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    const issues = scanCollectionHealth({
      tree: this.collections.tree(),
      envVars: env ? environmentVariableMap(env.variables) : {},
      folderId,
    });
    this.dialog.open(issues);
  }
}
