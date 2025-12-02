import { Directive, ElementRef, Renderer2, Input, OnInit } from '@angular/core';

@Directive({
  selector: '[appBordeRedondeado]',
  standalone: true,
})
export class BordeRedondeadoDirective implements OnInit {
  @Input() colorBorde: string = '#ccc';

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnInit() {
    this.renderer.setStyle(this.el.nativeElement, 'border-radius', '15px');
    this.renderer.setStyle(this.el.nativeElement, 'border', `2px solid ${this.colorBorde}`);
    this.renderer.setStyle(this.el.nativeElement, 'padding', '10px');
  }
}
