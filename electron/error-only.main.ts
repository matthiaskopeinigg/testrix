import { app } from 'electron';

import { configureAppIdentity } from './config/app-icon';
import { startErrorPreview } from './boot/start-error-preview';

configureAppIdentity();

const previewEnvKey = ['T', 'E', 'S', 'T', 'R', 'I', 'X', '_', 'E', 'R', 'R', 'O', 'R', '_', 'P', 'R', 'E', 'V', 'I', 'E', 'W', '_', 'M', 'E', 'S', 'S', 'A', 'G', 'E'].join('');

function resolvePreviewCopy(env: NodeJS.ProcessEnv): string {
  const trimmed = env[previewEnvKey]?.trim();
  if (typeof trimmed === 'string' && trimmed.length > 0) {
    return trimmed;
  }


  return 'Preview of the Electron error shell. Append your message after npm run error:preview --.';
}



void startErrorPreview(resolvePreviewCopy(process.env)).catch((reason: unknown) => {
  console.error('[electron error-only]', reason);


  app.quit();


});
