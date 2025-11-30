import { Directive, ElementRef, EventEmitter, Input, OnChanges, Output, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHabilitarCaptcha]',
  standalone: true
})
export class HabilitarCaptchaDirective implements OnChanges {
  @Input('appHabilitarCaptcha') rol: string | null = null;
  @Output() captchaEstado = new EventEmitter<boolean>();

  constructor(private el: ElementRef<HTMLElement>, private renderer: Renderer2) {}

  ngOnChanges(_: SimpleChanges): void {
    this.actualizarEstado();
  }

  private actualizarEstado(): void {
    const esAdmin = (this.rol || '').toLowerCase() === 'admin';
    if (esAdmin) {
      this.renderer.setStyle(this.el.nativeElement, 'display', 'block');
      this.captchaEstado.emit(true);
    } else {
      this.renderer.setStyle(this.el.nativeElement, 'display', 'none');
      this.captchaEstado.emit(false);
    }
  }
}
