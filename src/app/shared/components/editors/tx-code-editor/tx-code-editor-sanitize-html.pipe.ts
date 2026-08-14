import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

/** Trusts editor highlight HTML produced by {@link highlightCodeEditorContent}. */
@Pipe({ name: 'txCodeEditorHtml', standalone: true })
export class TxCodeEditorSanitizeHtmlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
