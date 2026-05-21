import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { ElectronService } from '../electron/electron.service';

/** Blocks `/dev` unless Angular dev build + Electron dev toolkit (`npm run dev`). */
export const devToolkitGuard: CanActivateFn = () => {
  if (typeof ngDevMode !== 'undefined' && ngDevMode && inject(ElectronService).isDevToolkit()) {
    return true;
  }
  return inject(Router).createUrlTree(['/home']);
};
