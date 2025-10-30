import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UsersService } from '../../servicios/users.service';
import { Navbar } from '../../componentes/navbar/navbar';
import { RouterModule } from '@angular/router';
import { NgZone } from '@angular/core';
import { AuthService } from '../../servicios/auth';
import { Registro } from "../../componentes/registro/registro";
import { LoadingComponent } from "../../componentes/loading/loading";


@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, Navbar, RouterModule, Registro, LoadingComponent],
  templateUrl: './usuarios.html',
  styleUrls: ['./usuarios.scss']
})
export class Usuarios implements OnInit {
  private usersService = inject(UsersService);
  private zone = inject(NgZone);
  private authService = inject(AuthService);
  mostrarRegistro = false;

  usuarios: any[] = [];
  loading = false;

  async ngOnInit(): Promise<void> {
    const user = this.authService.getUser?.();
    if (!user?.uid) return;
    await this.zone.run(() => this.loadUsuarios());
  }

  async loadUsuarios(): Promise<void> {
    this.loading = true;
    try {
      this.usuarios = await this.usersService.list(200);
    } finally {
      this.loading = false;
    }
  }

  async toggleAprobacion(u: any): Promise<void> {
    const nuevoEstado = !u.aprobadoPorAdmin;
    try {
      await this.usersService.updateAprobacion(u.uid, nuevoEstado);
      u.aprobadoPorAdmin = nuevoEstado;
    } catch (err) {
      console.error('Error al actualizar aprobadoPorAdmin:', err);
    }
  }

  generarNuevoUsuario(): void {
    this.mostrarRegistro = true;
  }

  cerrarRegistro(): void {
    this.mostrarRegistro = false;
  }

}
