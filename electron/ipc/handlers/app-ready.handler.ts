import type { AppReadyCoordinator } from '../../boot/app-ready-coordinator';
import { isDevMode } from '../../config/environment';
import { AppChannels } from '../channels/app.channels';
import type { IpcMainBinder } from '../register-ipc';

export function registerAppReadyHandlers(
  ipc: IpcMainBinder,
  coordinator: AppReadyCoordinator,
): void {
  // One-way send — renderer must not await invoke here (handoff runs during first paint).
  ipc.on(AppChannels.ready, () => {
    coordinator.markAngularReady();
    if (isDevMode()) {
      // eslint-disable-next-line no-console
      console.log('[boot] notifyReady IPC received');
    }
  });
}
