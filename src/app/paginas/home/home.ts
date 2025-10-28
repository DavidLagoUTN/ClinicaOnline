import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../servicios/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Navbar } from "../../componentes/navbar/navbar";

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, Navbar],
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrls: ['./home.scss']
})
export class Home implements OnInit {
  private firestore = inject(Firestore);
  constructor(private authService: AuthService) {}

  isLoading = true;
  isLoggedIn = false;
  displayName: string = '';
  role: 'paciente' | 'especialista' | 'admin' | null = null;
  photoUrl: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.syncUserProfile();
  }

  private async syncUserProfile(): Promise<void> {
    this.isLoading = true;

    try {
      const user = typeof this.authService.getUser === 'function' ? this.authService.getUser() : null;
      this.isLoggedIn = !!user?.uid;

      if (!this.isLoggedIn) {
        this.displayName = '';
        this.role = null;
        this.photoUrl = null;
        return;
      }

      // Intentar cargar perfil desde Firestore y establecer displayName, role y photoUrl
      try {
        const ref = doc(this.firestore, 'usuarios', user!.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as Record<string, any>;

          // displayName preferente: nombre del doc > email del user > 'Usuario'
          this.displayName = (data['nombre'] as string) || user!.email || 'Usuario';

          // role: respetar campo tipo o campo admin; fallback a paciente
          const tipo = (data['tipo'] as string) || '';
          if (tipo.toLowerCase() === 'especialista') this.role = 'especialista';
          else if (tipo.toLowerCase() === 'admin' || !!data['admin']) this.role = 'admin';
          else this.role = 'paciente';

          // photoUrl: prioridad de campos comunes en tu proyecto
          this.photoUrl =
            (data['imagenPerfil'] as string) ||
            (data['imagenPerfilExtra'] as string) ||
            (data['photoURL'] as string) ||
            (data['foto'] as string) ||
            (data['avatar'] as string) ||
            null;

        } else {
          // si no existe documento, fallback a datos del user
          this.displayName = user!.email || 'Usuario';
          this.role = 'paciente';
          this.photoUrl = null;
        }
      } catch {
        // fallback si falla la lectura de Firestore
        this.displayName = user!.email || 'Usuario';
        this.role = 'paciente';
        this.photoUrl = null;
      }
    } finally {
      this.isLoading = false;
    }
  }
}
