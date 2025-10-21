import { Routes } from '@angular/router';
import { Home } from './paginas/home/home';
import { Registrar } from './paginas/registrar/registrar';
import { Login } from './paginas/login/login';
export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: Home },
  { path: 'registrar', component: Registrar },
  { path: 'login', component: Login },
];