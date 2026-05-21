import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';


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





  protected readonly logoSrc = computed(() => (this.variant() === 'dark' ? '/brand/logo-dark.svg' : '/brand/logo.svg'));



}
