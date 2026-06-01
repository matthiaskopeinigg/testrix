import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { PublicAssetService } from '../../assets/public-asset-url';


@Component({
  selector: 'tx-brand-logo',
  standalone: true,

  imports: [],
  templateUrl: './tx-brand-logo.component.html',

  styleUrl: './tx-brand-logo.component.scss',

  changeDetection: ChangeDetectionStrategy.OnPush,

})

export class TxBrandLogoComponent {


  readonly variant = input<'default' | 'dark'>('default');




  readonly size = input(40);

  private readonly assets = inject(PublicAssetService);
  private readonly sanitizer = inject(DomSanitizer);


  protected readonly logoSrc = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(
      this.assets.url(this.variant() === 'dark' ? 'brand/logo-dark.svg' : 'brand/logo.svg'),
    ),
  );



}
