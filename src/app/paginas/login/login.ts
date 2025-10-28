import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Navbar } from '../../componentes/navbar/navbar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LoadingComponent } from '../../componentes/loading/loading';
import { AuthService } from '../../servicios/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

interface QuickUser {
  uid: string;
  label: string;
  email: string;
  password: string;
  photoUrl: string;
  tipo?: 'paciente' | 'especialista' | 'admin' | string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    Navbar,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    LoadingComponent
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class Login implements OnInit {
  loginForm: FormGroup;
  isLoading = false;
  private firestore: Firestore = inject(Firestore);

  quickUsers: QuickUser[] = [
    { uid: 'oNgHKhqmrNN0RueQAiFBWiiJbop1', label: 'Paciente 1', email: 'hixal10389@keevle.com', password: 'abc123', photoUrl: 'https://tawymqnjgcgsljweinbh.supabase.co/storage/v1/object/public/imagenes/oNgHKhqmrNN0RueQAiFBWiiJbop1/perfil_1761681988442_paciente1.png', tipo: 'paciente' },
    { uid: 'Mn8xhNcBLsb1tcGzswNyUSbSl4k2', label: 'Paciente 2', email: 'diwala8089@keevle.com', password: 'abc123', photoUrl: 'https://tawymqnjgcgsljweinbh.supabase.co/storage/v1/object/public/imagenes/Mn8xhNcBLsb1tcGzswNyUSbSl4k2/perfil_1761682152180_paciente2.png', tipo: 'paciente' },
    { uid: 'lCjbq8YU3QeLP9TtWpUUMYHRqWq2', label: 'Paciente 3', email: 'kamone6741@hh7f.com', password: 'abc123', photoUrl: 'https://tawymqnjgcgsljweinbh.supabase.co/storage/v1/object/public/imagenes/lCjbq8YU3QeLP9TtWpUUMYHRqWq2/perfil_1761682721856_paciente3.png', tipo: 'paciente' },
    { uid: '2YOERDdDSPWphC9CKksPj7xCPtN2', label: 'Especialista 1', email: 'yovog51097@filipx.com', password: 'abc123', photoUrl: 'https://tawymqnjgcgsljweinbh.supabase.co/storage/v1/object/public/imagenes/2YOERDdDSPWphC9CKksPj7xCPtN2/perfil_1761682802191_especialista1.png', tipo: 'especialista' },
    { uid: '9WCHDvyoLiNRBq3Yye9OLv37Diw2', label: 'Especialista 2', email: 'jedibe2551@lovleo.com', password: 'abc123', photoUrl: 'https://tawymqnjgcgsljweinbh.supabase.co/storage/v1/object/public/imagenes/9WCHDvyoLiNRBq3Yye9OLv37Diw2/perfil_1761683045642_especialista2.png', tipo: 'especialista' },
    { uid: '8AAw1GhJKXgUhGBTYjAxIjctzNA3', label: 'Administrador', email: 'mevav90664@haotuwu.com', password: 'abc123', photoUrl: 'https://tawymqnjgcgsljweinbh.supabase.co/storage/v1/object/public/imagenes/8AAw1GhJKXgUhGBTYjAxIjctzNA3/perfil_1761683206147_administrador.png', tipo: 'admin' }
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  async ngOnInit(): Promise<void> {
  await this.loadQuickUsersPhotos();
  console.log('quickUsers after load:', this.quickUsers); // debug
}

private async loadQuickUsersPhotos(): Promise<void> {
  const defaultAvatar = '/assets/default-avatar.png';
  await Promise.all(this.quickUsers.map(async (u, idx) => {
    u.photoUrl = u.photoUrl || defaultAvatar;
    if (!u.uid) return;
    try {
      const ref = doc(this.firestore, 'usuarios', u.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        console.warn(`user doc not found for uid ${u.uid}`);
        return;
      }
      const data = snap.data() as Record<string, any>;
      const candidate =
        data['imagenPerfil'] ||
        data['imagenPerfilExtra'] ||
        data['photoURL'] ||
        data['foto'] ||
        data['avatar'];
      if (candidate && typeof candidate === 'string' && candidate.trim()) {
        u.photoUrl = candidate;
      } else if (Array.isArray(data['imagenes']) && data['imagenes'].length) {
        u.photoUrl = data['imagenes'][0];
      }
      if ((!u.label || u.label === '') && data['nombre']) u.label = String(data['nombre']);
      if ((!u.email || u.email === '') && data['mail']) u.email = String(data['mail']);
    } catch (e) {
      console.error('error loading user', u.uid, e);
    }
  }));
}


  async submitLogin() {
    const emailCtrl = this.loginForm.get('email');
    const passCtrl = this.loginForm.get('password');

    if (emailCtrl?.hasError('required') && passCtrl?.hasError('required')) {
      this.snackBar.open('Complete los campos correo y contraseña', undefined, { duration: 3000, panelClass: ['snackbar-error'] });
      return;
    }
    if (emailCtrl?.hasError('required')) {
      this.snackBar.open('Complete el campo correo', undefined, { duration: 3000, panelClass: ['snackbar-error'] });
      return;
    }
    if (emailCtrl?.hasError('email')) {
      this.snackBar.open('Ingrese un correo válido', undefined, { duration: 3000, panelClass: ['snackbar-error'] });
      return;
    }
    if (passCtrl?.hasError('required')) {
      this.snackBar.open('Complete el campo contraseña', undefined, { duration: 3000, panelClass: ['snackbar-error'] });
      return;
    }

    const email = emailCtrl!.value;
    const password = passCtrl!.value;

    this.isLoading = true;
    try {
      await this.authService.login(email, password);
      this.snackBar.open('Inicio de sesión exitoso', undefined, { duration: 3000, panelClass: ['snackbar-success'] });
      this.router.navigate(['/home']);
    } catch (err: any) {
      const errorMap: Record<string, string> = {
        'auth/email-not-verified': 'Tu correo no está verificado.',
        'auth/not-approved': 'Tu cuenta aún no fue aprobada por un administrador.',
        'auth/user-not-found': 'Correo o contraseña incorrectos.',
        'auth/wrong-password': 'Correo o contraseña incorrectos.',
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
        'auth/no-profile': 'No se encontró el perfil del usuario.'
      };
      const msg = (err && err.code && errorMap[err.code]) ? errorMap[err.code] : (err?.message || 'Error al iniciar sesión');
      this.snackBar.open(msg, undefined, { duration: 3000, panelClass: ['snackbar-error'] });
    } finally {
      this.isLoading = false;
    }
  }

  quickFill(user: QuickUser) {
    this.loginForm.patchValue({ email: user.email, password: user.password });
  }
}
