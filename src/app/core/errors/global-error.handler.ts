import { ErrorHandler, Injectable, inject } from '@angular/core';

import { ErrorNotificationService } from './error-notification.service';

@Injectable()


export class GlobalErrorHandler implements ErrorHandler {


  private readonly notifier = inject(ErrorNotificationService);



  handleError(error: unknown): void {


    console.error('[GlobalErrorHandler]', error);



    this.notifier.reportUnknown(error);





  }



}
