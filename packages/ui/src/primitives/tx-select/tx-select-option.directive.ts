import { Directive, TemplateRef } from '@angular/core';

export interface TxSelectOption {
  readonly value: string;
  readonly label: string;
  readonly fontFamily?: string;
  readonly gapAfter?: boolean;
}

export interface TxSelectOptionContext {
  readonly $implicit: TxSelectOption;
  readonly selected: boolean;
}

@Directive({
  selector: 'ng-template[txSelectOption]',
  standalone: true,
})
export class TxSelectOptionDirective {
  constructor(readonly template: TemplateRef<TxSelectOptionContext>) {}
}
