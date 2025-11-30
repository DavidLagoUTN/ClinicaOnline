import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'resaltar',
  standalone: true
})
export class ResaltarPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(
    texto: string | null | undefined,
    busqueda: string | null | undefined,
    sensibleAMayusculas = false
  ): SafeHtml {
    if (!texto) return '';
    if (!busqueda) {
      return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(texto));
    }

    const flags = sensibleAMayusculas ? 'g' : 'gi';
    const escapedSearch = this.escapeRegExp(String(busqueda));
    const re = new RegExp(escapedSearch, flags);

    const escapedText = this.escapeHtml(texto);
    const resaltado = escapedText.replace(re, match => `<mark>${match}</mark>`);

    return this.sanitizer.bypassSecurityTrustHtml(resaltado);
  }

  private escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
