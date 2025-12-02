import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UsersService } from '../../servicios/usuarios.service';
import { Navbar } from '../../componentes/navbar/navbar';
import { RouterModule } from '@angular/router';
import { NgZone } from '@angular/core';
import { AuthService } from '../../servicios/auth';
import { Registro } from "../../componentes/registro/registro";
import { LoadingComponent } from "../../componentes/loading/loading";
import { ExcelService } from '../../servicios/excel.service';
import { FondoPorRolDirective } from '../../directivas/fondo-por-rol.directive';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, Navbar, RouterModule, Registro, LoadingComponent, FondoPorRolDirective],
  templateUrl: './usuarios.html',
  styleUrls: ['./usuarios.scss']
})
export class Usuarios implements OnInit {
  private usersService = inject(UsersService);
  private zone = inject(NgZone);
  private authService = inject(AuthService);
  private excelService = inject(ExcelService);

  mostrarRegistro = false;

  showHistoriaMap: { [uid: string]: boolean } = {};
  historiaDataMap: { [uid: string]: any[] } = {};
  historiaLoadingMap: { [uid: string]: boolean } = {};

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

  trackByUid(_: number, item: any) {
    return item?.uid || _;
  }

  exportarUsuariosExcel(): void {
    if (!this.usuarios || this.usuarios.length === 0) return;

    const datos = this.usuarios.map(u => ({
      Nombre: u.nombre ?? '',
      Apellido: u.apellido ?? '',
      Edad: u.edad ?? '',
      DNI: u.dni ?? '',
      'Correo electrónico': u.mail ?? '',
      Tipo: u.tipo === 'admin' ? 'administrador' : (u.tipo ?? ''),
      'Aprobado por admin': u.tipo === 'especialista' ? (u.aprobadoPorAdmin ? 'Sí' : 'No') : ''
    }));

    this.excelService.exportarComoExcel(datos, 'usuarios_export');
  }

  async exportarTurnosPaciente(u: any): Promise<void> {
    if (!u || !u.uid) return;
    try {
      const turnos: any[] = await this.usersService.getTurnosByPaciente(u.uid);
      const aoa: any[][] = [];
      aoa.push(['Paciente', `${u.nombre ?? ''} ${u.apellido ?? ''}`]);
      aoa.push([]);
      aoa.push(['Fecha', 'Hora', 'Profesional', 'Especialidad', 'Estado']);

      // ... lógica de fechas existente ...
      const pickFechaHora = (t: any) => t?.fechaHora ?? t?.FechaHora ?? t?.fecha_hora ?? t?.fechaYHora ?? null;
      const formatDDMMYYYY = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      };
      const formatHoraAMPM = (d: Date) => {
        let h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, '0');
        const ampm = h >= 12 ? 'p.m.' : 'a.m.';
        h = h % 12 || 12; 
        const hh = String(h);
        return `${hh}:${m} ${ampm}`;
      };
      const parseFechaHoraAny = (fh: any, t: any): { fecha: string; hora: string } => {
        if (typeof fh === 'string' && fh.trim().length > 0) {
          const cleaned = fh.replace(/\u202f|\u00a0/g, ' ').trim();
          const idx = cleaned.indexOf(',');
          const fecha = idx >= 0 ? cleaned.slice(0, idx).trim() : cleaned;
          const hora = idx >= 0 ? cleaned.slice(idx + 1).trim() : '';
          return { fecha, hora };
        }
        if (fh && typeof fh.toDate === 'function') {
          const d = fh.toDate();
          return { fecha: formatDDMMYYYY(d), hora: formatHoraAMPM(d) };
        }
        if (fh && typeof fh === 'object' && typeof fh.seconds === 'number') {
          const d = new Date(fh.seconds * 1000);
          return { fecha: formatDDMMYYYY(d), hora: formatHoraAMPM(d) };
        }
        return { fecha: '', hora: '' };
      };

      if (!turnos || turnos.length === 0) {
        aoa.push(['No hay turnos registrados para este paciente']);
      } else {
        for (const t of turnos) {
          const fh = pickFechaHora(t);
          const { fecha, hora } = parseFechaHoraAny(fh, t);
          const profesional = t.profesional ?? `${t.usuarios_especialista?.nombre ?? ''} ${t.usuarios_especialista?.apellido ?? ''}`.trim() ?? '';
          const especialidad = t.especialidad ?? '';
          const estado = t.estado ?? '';
          aoa.push([fecha, hora, profesional, especialidad, estado]);
          aoa.push([]);
        }
      }
      const nombreArchivo = `turnos_${(u.nombre ?? 'paciente')}_${(u.apellido ?? '')}`.replace(/\s+/g, '_').toLowerCase();
      this.excelService.exportarDesdeAoA(aoa, nombreArchivo, 'Turnos');
    } catch (err) {
      console.error('exportarTurnosPaciente error', err);
    }
  }

  // --- LÓGICA CORREGIDA PARA VER HISTORIA ---
  async toggleHistoria(u: any): Promise<void> {
    if (!u || !u.uid) return;
    const uid = u.uid;

    if (this.showHistoriaMap[uid]) {
      this.showHistoriaMap[uid] = false;
      return;
    }

    this.showHistoriaMap[uid] = true;
    // Si ya cargamos, no repetir
    if (this.historiaDataMap[uid]) return;

    try {
      this.historiaLoadingMap[uid] = true;
      // Usamos el NUEVO método del servicio que busca en TURNOS
      this.historiaDataMap[uid] = await this.usersService.getHistorialClinico(uid);
    } catch (err) {
      console.error('toggleHistoria error', err);
      this.historiaDataMap[uid] = [];
    } finally {
      this.historiaLoadingMap[uid] = false;
    }
  }

  formatearValorDinamico(valor: any): string {
    if (valor === true || valor === 'true') return 'Sí';
    if (valor === false || valor === 'false') return 'No';
    return valor;
  }
}