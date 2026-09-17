import { Directive } from '@angular/core';

/**
 * Full-viewport host for overlay sheets so leave animations can fade the
 * subtree without retargeting `position: fixed` chrome.
 */
@Directive({
  selector: '[txOverlayHost]',
  host: {
    class: 'tx-overlay-host',
  },
})
export class TxOverlayHostDirective {}
