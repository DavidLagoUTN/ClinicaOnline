import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../servicios/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private firestore: Firestore,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    const user = typeof this.authService.getUser === 'function' ? this.authService.getUser() : null;
    if (!user?.uid) {
      this.router.navigate(['/login']);
      return false;
    }

    try {
      const snap = await getDoc(doc(this.firestore, 'usuarios', user.uid));
      if (!snap.exists()) {
        this.router.navigate(['/']);
        return false;
      }
      const tipo = (snap.data() as any).tipo || '';
      if (String(tipo).toLowerCase() === 'admin') return true;
    } catch (e) {
      // fallthrough
    }

    this.router.navigate(['/']);
    return false;
  }
}
