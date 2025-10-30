import { Component, HostListener, Renderer2, OnInit, inject } from '@angular/core';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../servicios/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

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

  // Auth / UI state
  nombreUsuario: string | null = null;
  apellidoUsuario: string | null = null;
  isLoggedIn = false;
  esAdmin = false;
  tipoUsuario: string = '';

  private firestore: Firestore = inject(Firestore);

  constructor(
    public router: Router,
    private renderer: Renderer2,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.checkScroll();
    this.actualizarTitulo(this.router.url);
    this.syncUserInfo();

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.actualizarTitulo(event.urlAfterRedirects);
        this.syncUserInfo();
      });

    // Si AuthService expone un observable o callback para cambios de sesión, suscribirse.
    // Intentamos suscribir a `onAuthStateChanged` o a `user$` si existen.
    if ((this.authService as any).onAuthStateChanged) {
      (this.authService as any).onAuthStateChanged(() => this.syncUserInfo());
    } else if ((this.authService as any).user$ && (this.authService as any).user$.subscribe) {
      (this.authService as any).user$.subscribe(() => this.syncUserInfo());
    }
  }

  async syncUserInfo(): Promise<void> {
    const user = typeof this.authService.getUser === 'function' ? this.authService.getUser() : null;
    this.isLoggedIn = !!user?.uid;

    if (!this.isLoggedIn) {
      this.esAdmin = false;
      this.nombreUsuario = null;
      this.apellidoUsuario = null;
      return;
    }

    try {
      const ref = doc(this.firestore, 'usuarios', user!.uid);
      const snapshot = await getDoc(ref);
      const data = snapshot.data();
      this.nombreUsuario = data?.['nombre'] || null;
      this.apellidoUsuario = data?.['apellido'] || null;
      this.tipoUsuario = data?.['tipo'] || '';
      this.esAdmin = this.tipoUsuario === 'admin';

    } catch {
      this.esAdmin = false;
    }
  }

  logout(): void {
  this.authService.logout().then(() => {
    this.router.navigate(['/login']);
  }).catch(() => {
    // en caso de error, igualmente redirigimos
    this.router.navigate(['/login']);
  });
}

  @HostListener('window:scroll')
  @HostListener('window:resize')
  @HostListener('window:load')
  checkScroll(): void {
    const docEl = document.documentElement;
    this.hasScroll = docEl.scrollHeight > docEl.clientHeight;
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
      '/usuarios': 'Panel de administración de usuarios',
      '/turnos': 'Mis turnos',
      '/perfil': 'Mi perfil'
    };

    const ruta = url.split('?')[0];
    this.currentTitle = mapa[ruta] || 'Clínica Online';
  }
}
