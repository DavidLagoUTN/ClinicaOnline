import { Component, HostListener, Renderer2, OnInit } from '@angular/core';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar implements OnInit {
  hasScroll = false;
  scrollbarWidth = 0;
  currentTitle = '';

  constructor(public router: Router, private renderer: Renderer2) {}

  ngOnInit(): void {
    this.checkScroll();
    this.actualizarTitulo(this.router.url); // inicial

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.actualizarTitulo(event.urlAfterRedirects);
      });
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  @HostListener('window:load')
  checkScroll(): void {
  const doc = document.documentElement;
  this.hasScroll = doc.scrollHeight > doc.clientHeight;
  this.scrollbarWidth = this.getScrollbarWidth();

  const navbar = document.querySelector('.navbar');
  if (navbar) {
    this.renderer.setStyle(navbar, '--scrollbar-width', `${this.scrollbarWidth}px`);
  }
}


  get mostrarVolver(): boolean {
    return this.router.url !== '/home';
  }

  private getScrollbarWidth(): number {
    const outer = document.createElement('div');
    outer.style.visibility = 'hidden';
    outer.style.overflow = 'scroll';
    outer.style.width = '100px';
    outer.style.position = 'absolute';
    document.body.appendChild(outer);

    const inner = document.createElement('div');
    inner.style.width = '100%';
    outer.appendChild(inner);

    const width = outer.offsetWidth - inner.offsetWidth;
    outer.remove();

    return width;
  }

  private actualizarTitulo(url: string): void {
    const mapa: Record<string, string> = {
      '/home': 'Clínica Online',
      '/registrar': 'Registro',
      '/login': 'Ingreso',
      '/juegos': 'Sala de juegos',
      '/admin': 'Panel de administración',
      '/turnos': 'Mis turnos',
      '/perfil': 'Mi perfil'
    };

    const ruta = url.split('?')[0]; // eliminar query params
    this.currentTitle = mapa[ruta] || 'Clínica Online';
  }
}
