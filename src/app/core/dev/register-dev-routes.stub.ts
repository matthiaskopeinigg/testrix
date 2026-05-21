import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

/** Production replacement: dev routes are never registered or bundled. */
export function provideDevRoutes(): EnvironmentProviders {
  return makeEnvironmentProviders([]);
}
