import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

window.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape')
      return;
    if (!document.querySelector('vite-error-overlay'))
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.reload();
  },
  true,
);

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  // eslint-disable-next-line no-console -- bootstrap failed, so no app logger exists yet
  console.error(error);
});
