import { Component } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Navbar } from '../../componentes/navbar/navbar';
import { RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NgIf } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LoadingComponent } from "../../componentes/loading/loading";

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, Navbar, ReactiveFormsModule, MatSnackBarModule, NgIf, MatProgressSpinnerModule, LoadingComponent],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class Login {
  loginForm;
  isLoading = false; // 🔹 bandera para overlay

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
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

    const { email, password } = this.loginForm.value;

    this.isLoading = true; // 🔹 mostramos overlay

    try {
      this.snackBar.open('Inicio de sesión exitoso', undefined, { duration: 3000, panelClass: ['snackbar-success'] });
      this.router.navigate(['/home']);
    } catch (err: any) {
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        this.snackBar.open('Correo o contraseña incorrectos', undefined, { duration: 3000, panelClass: ['snackbar-error'] });
      } else {
        this.snackBar.open(err.message, undefined, { duration: 3000, panelClass: ['snackbar-error'] });
      }
    } finally {
      this.isLoading = false; // 🔹 ocultamos overlay
    }
  }

  quickFill(email: string, password: string) {
    this.loginForm.patchValue({ email, password });
  }
}