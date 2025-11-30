import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appFondoPorRol]',
  standalone: true
})
export class FondoPorRolDirective implements OnChanges {
  /** Valor esperado: 'paciente' | 'especialista' | 'administrador' (o cualquier string) */
  @Input('appFondoPorRol') rol: string | null = null;

  /** Si es true aplica un color de resaltado alternativo */
  @Input() destacado = false;

  constructor(private el: ElementRef<HTMLElement>, private r: Renderer2) {}

  ngOnChanges(_: SimpleChanges): void {
    this.aplicarFondo();
  }

  private aplicarFondo(): void {
    const role = (this.rol || '').toString().toLowerCase().trim();
    let bg = '#ffffff'; // por defecto

    if (this.destacado) {
      bg = '#fff7e6'; // color de resaltado cuando está destacado
    } else {
      switch (role) {
        case 'paciente':
          bg = 'rgba(194, 213, 255, 1)'; // azul claro
          break;
        case 'especialista':
          bg = '#e6ffef'; // verde claro
          break;
        case 'administrador':
        case 'administrador(a)':
          bg = '#fff6f0ff'; // naranja claro
          break;
        default:
          bg = '#ffffff'; // blanco por defecto
      }
    }

    this.r.setStyle(this.el.nativeElement, 'backgroundColor', bg);
  }
}
