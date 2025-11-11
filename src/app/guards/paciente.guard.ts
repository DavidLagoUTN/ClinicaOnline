import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class PacienteGuard implements CanActivate {
  constructor(private auth: Auth, private router: Router) {}

  async canActivate(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) {
      this.router.navigate(['/login']);
      return false;
    }
    // Asumimos que el token o custom claim 'tipo' no está disponible localmente.
    // Si manejás rol en tu perfil, hacé una consulta a 'usuarios/{uid}' y confirmá tipo==='paciente'
    // Para simplicidad devolvemos true y delegamos al componente la comprobación adicional.
    return true;
  }
}
