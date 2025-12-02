import { Directive, ElementRef, Input, Output, EventEmitter, HostListener, Renderer2, OnInit, OnChanges, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appCaptchaAdmin]',
  standalone: true
})
export class CaptchaAdminDirective implements OnInit, OnChanges {
  @Input() esAdmin: boolean = false;
  @Input() captchaActivo: boolean = true;
  @Output() captchaState = new EventEmitter<boolean>();

  constructor(private el: ElementRef, private renderer: Renderer2) {
    this.renderer.setStyle(this.el.nativeElement, 'display', 'none');
    this.renderer.setStyle(this.el.nativeElement, 'margin', '10px 0');
    this.renderer.setStyle(this.el.nativeElement, 'padding', '8px 16px');
    this.renderer.setStyle(this.el.nativeElement, 'border', 'none');
    this.renderer.setStyle(this.el.nativeElement, 'borderRadius', '4px');
    this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer');
    this.renderer.setStyle(this.el.nativeElement, 'fontWeight', 'bold');
    this.renderer.setStyle(this.el.nativeElement, 'fontSize', '14px');
    this.renderer.setStyle(this.el.nativeElement, 'width', '100%');
    this.actualizarApariencia();
  }

  ngOnInit() {
    this.actualizarVisibilidad();
    this.actualizarApariencia();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['esAdmin']) {
      this.actualizarVisibilidad();
    }
    if (changes['captchaActivo']) {
      this.actualizarApariencia();
    }
  }

  private actualizarVisibilidad() {
    if (this.esAdmin) {
      this.renderer.setStyle(this.el.nativeElement, 'display', 'block');
    } else {
      this.renderer.setStyle(this.el.nativeElement, 'display', 'none');
    }
  }

  @HostListener('click')
  onClick() {
    if (!this.esAdmin) return;
    this.captchaState.emit(!this.captchaActivo);
  }

  private actualizarApariencia() {
    if (this.captchaActivo) {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', 'Desactivar Captcha');
      this.renderer.setStyle(this.el.nativeElement, 'backgroundColor', '#ffc107'); 
      this.renderer.setStyle(this.el.nativeElement, 'color', '#333');
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', 'Activar Captcha');
      this.renderer.setStyle(this.el.nativeElement, 'backgroundColor', '#28a745'); 
      this.renderer.setStyle(this.el.nativeElement, 'color', 'white');
    }
  }
}