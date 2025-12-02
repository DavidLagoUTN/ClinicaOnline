import { Routes } from '@angular/router';
import { AdminGuard } from './guards/admin.guard';
import { PacienteGuard } from './guards/paciente.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  
  // 1. Slide Up (Desde abajo - Pedido especial)
  { 
    path: 'home', 
    loadComponent: () => import('./paginas/home/home').then(m => m.Home),
    data: { animation: 'slideUp' } 
  },
  
  // 2. Fade (Suave para registro)
  { 
    path: 'registrar', 
    loadComponent: () => import('./paginas/registrar/registrar').then(m => m.Registrar),
    data: { animation: 'fade' }
  },
  
  // 3. Zoom (Enfocado para login)
  { 
    path: 'login', 
    loadComponent: () => import('./paginas/login/login').then(m => m.Login),
    data: { animation: 'zoom' }
  },
  
  // 4. Slide Left (Lateral para gestión)
  { 
    path: 'usuarios', 
    loadComponent: () => import('./paginas/usuarios/usuarios').then(m => m.Usuarios), 
    canActivate: [AdminGuard],
    data: { animation: 'slideLeft' }
  },
  
  // 5. Slide Right (Lateral opuesto para perfil)
  { 
    path: 'mi-perfil', 
    loadComponent: () => import('./paginas/mi-perfil/mi-perfil').then(m => m.MiPerfil),
    data: { animation: 'slideRight' }
  },
  
  // 6. Elastic (Rebote para acciones importantes)
  { 
    path: 'solicitar-turno', 
    loadComponent: () => import('./paginas/solicitar-turno/solicitar-turno').then(m => m.SolicitarTurno), 
    canActivate: [PacienteGuard],
    data: { animation: 'elastic' }
  },
  
  // 7. Rotate (Distinto para ver turnos)
  { 
    path: 'mis-turnos', 
    loadComponent: () => import('./paginas/mis-turnos/mis-turnos').then(m => m.MisTurnos),
    data: { animation: 'rotate' }
  },
  
  // 8. Slide Down (Desde arriba para listados)
  { 
    path: 'turnos', 
    loadComponent: () => import('./paginas/turnos/turnos').then(m => m.Turnos),
    data: { animation: 'slideDown' }
  },
  
  // Reutilizamos animaciones para las rutas restantes
  { 
    path: 'pacientes', 
    loadComponent: () => import('./paginas/pacientes/pacientes').then(m => m.Pacientes),
    data: { animation: 'slideLeft' }
  },
  { 
    path: 'informes', 
    loadComponent: () => import('./paginas/informes/informes').then((m) => m.Informes), 
    canActivate: [AdminGuard],
    data: { animation: 'fade' }
  },
];