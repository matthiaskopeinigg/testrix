import { createRequire } from 'node:module';
import path from 'node:path';

const requireE2e = createRequire(__filename);

function e2eModuleDir(): string {
  return path.join(__dirname, 'services', 'testing', 'e2e');
}

/** Side-effect import: loads E2E runner modules (pick IPC is registered via testing.handler). */
export function registerE2eIpcHandlers(): void {
  const e2eDir = e2eModuleDir();
  requireE2e(path.join(e2eDir, 'e2e.service.js'));
  requireE2e(path.join(e2eDir, 'e2e-pick-element.service.js'));
  requireE2e(path.join(e2eDir, 'e2e-pick-scroll-position.service.js'));
}
