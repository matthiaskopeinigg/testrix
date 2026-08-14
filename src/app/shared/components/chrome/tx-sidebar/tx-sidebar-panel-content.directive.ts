import { Directive } from '@angular/core';

/**
 * Marks optional toolbar content projected into {@link TxSidebarComponent}
 * (`select="[txSidebarToolbar]"`).
 */
@Directive({
  selector: '[txSidebarToolbar]',
  standalone: true,
})
export class TxSidebarToolbarDirective {}
