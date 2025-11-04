import { Routes } from '@angular/router';
import { AdminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./paginas/home/home').then(m => m.Home) },
  { path: 'registrar', loadComponent: () => import('./paginas/registrar/registrar').then(m => m.Registrar) },
  { path: 'login', loadComponent: () => import('./paginas/login/login').then(m => m.Login) },
  { path: 'usuarios', loadComponent: () => import('./paginas/usuarios/usuarios').then(m => m.Usuarios), canActivate: [AdminGuard] },
  { path: 'mi-perfil', loadComponent: () => import('./paginas/mi-perfil/mi-perfil').then(m => m.MiPerfil) },
  //{ path: 'mis-turnos', loadComponent: () => import('./paginas/mis-turnos/mis-turnos').then(m => m.MisTurnos) },
  //{ path: 'solicitar-turno', loadComponent: () => import('./paginas/solicitar-turno/solicitar-turno').then(m => m.SolicitarTurno) }
];