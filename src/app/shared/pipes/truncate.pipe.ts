import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  standalone: true,
  name: 'truncate',
})

export class TruncatePipe implements PipeTransform {
  transform(value: string | null | undefined, maxLength = 80): string {


    if (!value) {


      return '';





    }



    const normalized = String(value);


    return normalized.length > maxLength ? `${normalized.slice(0, Math.max(maxLength - 1, 0))}…` : normalized;



  }



}
