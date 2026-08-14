import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

/** Trusts highlight HTML produced by {@link highlightDynamicVariableTemplate}. */
@Pipe({ name: 'txVariableInputHighlightHtml', standalone: true })
export class TxVariableInputHighlightHtmlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
