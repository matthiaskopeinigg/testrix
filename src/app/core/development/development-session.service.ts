import { Injectable, inject } from '@angular/core';

import { ConfigService } from '@app/core/config/config.service';
import {
  createDefaultWorkspaceDevelopment,
  workspaceDevelopmentSchema,
  type DevelopmentToolId,
  type DevelopmentToolStateForId,
  type WorkspaceDevelopmentState,
} from '@shared/config';

const PATCH_DEBOUNCE_MS = 300;

/**
 * Persists Development tool UI state in {@link SessionFile.workspace.development}.
 */
@Injectable({ providedIn: 'root' })
export class DevelopmentSessionService {
  private readonly config = inject(ConfigService);

  private patchTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTools: WorkspaceDevelopmentState['tools'] | null = null;

  /** Ensures session slice exists (no-op when already present). */
  load(): void {
    const current = this.readSlice();
    if (current) {
      return;
    }
    void this.flushPatch({
      tools: createDefaultWorkspaceDevelopment().tools,
    });
  }

  /**
   * Returns persisted state for a tool, merged with defaults.
   */
  getToolState<T extends DevelopmentToolId>(toolId: T): DevelopmentToolStateForId<T> {
    const defaults = createDefaultWorkspaceDevelopment().tools[toolId];
    const saved = this.readSlice()?.tools[toolId];
    return {
      ...defaults,
      ...(saved ?? {}),
    } as DevelopmentToolStateForId<T>;
  }

  /**
   * Merges partial tool state and debounces session persistence.
   */
  patchToolState<T extends DevelopmentToolId>(
    toolId: T,
    partial: Partial<DevelopmentToolStateForId<T>>,
  ): void {
    const current = this.getToolState(toolId);
    const next = { ...current, ...partial };
    const base = this.pendingTools ?? this.readSlice()?.tools ?? createDefaultWorkspaceDevelopment().tools;
    this.pendingTools = { ...base, [toolId]: next };
    this.schedulePatch({ tools: this.pendingTools });
  }

  private readSlice(): WorkspaceDevelopmentState | null {
    return this.config.session()?.workspace.development ?? null;
  }

  private schedulePatch(partial: Partial<WorkspaceDevelopmentState>): void {
    if (this.patchTimer !== null) {
      clearTimeout(this.patchTimer);
    }
    const tools = partial.tools ?? this.pendingTools;
    this.patchTimer = setTimeout(() => {
      this.patchTimer = null;
      const payload: Partial<WorkspaceDevelopmentState> = tools
        ? { tools }
        : {};
      this.pendingTools = null;
      void this.flushPatch(payload);
    }, PATCH_DEBOUNCE_MS);
  }

  private async flushPatch(partial: Partial<WorkspaceDevelopmentState>): Promise<void> {
    const defaults = createDefaultWorkspaceDevelopment();
    const current = this.readSlice() ?? defaults;
    await this.config.patchSession({
      workspace: {
        development: workspaceDevelopmentSchema.parse({
          tools: {
            ...defaults.tools,
            ...current.tools,
            ...partial.tools,
          },
        }),
      },
    });
  }
}
