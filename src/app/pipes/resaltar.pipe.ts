import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'resaltar',
  standalone: true, 
})
export class ResaltarPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string, args?: any): SafeHtml {
    if (!value) return '';
    // Ejemplo: Si el valor es 'cancelado', lo pone en rojo y negrita
    if (value.toLowerCase() === 'cancelado') {
      return this.sanitizer.bypassSecurityTrustHtml(
        `<span style="color: red; font-weight: bold;">${value}</span>`
      );
    }
    // Si el valor es 'realizado', lo pone en verde
    if (value.toLowerCase() === 'realizado') {
      return this.sanitizer.bypassSecurityTrustHtml(
        `<span style="color: green; font-weight: bold;">${value}</span>`
      );
    }

    // Si no es ninguno especial, devuelve el texto normal
    return value;
  }
}
