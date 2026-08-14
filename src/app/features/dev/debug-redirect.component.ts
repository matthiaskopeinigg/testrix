import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

/** Sends legacy `/dev` bookmarks to home with the debug sidebar panel open. */
@Component({
  selector: 'app-debug-redirect',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DebugRedirectComponent implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.router.navigate(['/home'], { queryParams: { panel: 'debug' }, replaceUrl: true });
  }
}
