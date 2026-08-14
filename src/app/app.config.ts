import { ApplicationConfig, ErrorHandler } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';

import { provideRouter, withHashLocation } from '@angular/router';

import { routes } from './app.routes';

import { provideDevRoutes } from './core/dev/register-dev-routes';
import { GlobalErrorHandler } from './core/errors/global-error.handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideRouter(routes, withHashLocation()),
    provideDevRoutes(),
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler,
    },
  ],
};
