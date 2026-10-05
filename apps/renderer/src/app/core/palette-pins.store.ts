import { Injectable, computed, inject } from '@angular/core';
import {
  MAX_PALETTE_PINS,
  type PalettePin,
  type PalettePinKind,
} from '@testrix/contracts';

import { DesktopApiService } from './desktop-api.service';
import { WorkspacesStore } from '../features/workspaces/workspaces.store';

@Injectable({ providedIn: 'root' })
export class PalettePinsStore {
  private readonly desktop = inject(DesktopApiService);
  private readonly workspaces = inject(WorkspacesStore);

  readonly pins = computed(() => {
    const workspaceId = this.workspaces.activeId();
    if (!workspaceId)
      return [] as readonly PalettePin[];
    const map = this.desktop.session().palettePinsByWorkspace ?? {};
    return map[workspaceId] ?? [];
  });

  isPinned(kind: PalettePinKind, id: string): boolean {
    return this.pins().some((pin) => pin.kind === kind && pin.id === id);
  }

  async pin(kind: PalettePinKind, id: string, label: string): Promise<void> {
    const workspaceId = this.workspaces.activeId();
    if (!workspaceId)
      return;
    const current = [...this.pins()];
    if (current.some((pin) => pin.kind === kind && pin.id === id))
      return;
    const next = [{ kind, id, label }, ...current].slice(0, MAX_PALETTE_PINS);
    await this.write(workspaceId, next);
  }

  async unpin(kind: PalettePinKind, id: string): Promise<void> {
    const workspaceId = this.workspaces.activeId();
    if (!workspaceId)
      return;
    const next = this.pins().filter((pin) => !(pin.kind === kind && pin.id === id));
    await this.write(workspaceId, next);
  }

  async toggle(kind: PalettePinKind, id: string, label: string): Promise<void> {
    if (this.isPinned(kind, id))
      await this.unpin(kind, id);
    else
      await this.pin(kind, id, label);
  }

  async pruneMissing(valid: ReadonlySet<string>): Promise<void> {
    const workspaceId = this.workspaces.activeId();
    if (!workspaceId)
      return;
    const current = this.pins();
    const next = current.filter((pin) => valid.has(`${pin.kind}:${pin.id}`));
    if (next.length === current.length)
      return;
    await this.write(workspaceId, next);
  }

  private async write(workspaceId: string, pins: readonly PalettePin[]): Promise<void> {
    const session = this.desktop.session();
    const map = { ...(session.palettePinsByWorkspace ?? {}) };
    map[workspaceId] = [...pins];
    await this.desktop.saveSession({ palettePinsByWorkspace: map });
  }
}
