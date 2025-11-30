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
    if (!u || !u.uid) {
      console.log('exportarTurnosPaciente: usuario inválido', u);
      return;
    }
    try {
      console.log('exportarTurnosPaciente: usuario', { uid: u.uid, nombre: u.nombre, apellido: u.apellido });

      const turnos: any[] = await this.usersService.getTurnosByPaciente(u.uid);
      console.log('exportarTurnosPaciente: turnos obtenidos', turnos);

      const aoa: any[][] = [];
      aoa.push(['Paciente', `${u.nombre ?? ''} ${u.apellido ?? ''}`]);
      aoa.push([]);
      aoa.push(['Fecha', 'Hora', 'Profesional', 'Especialidad', 'Estado']);

      const pickFechaHora = (t: any) =>
        t?.fechaHora ?? t?.FechaHora ?? t?.fecha_hora ?? t?.fechaYHora ?? t?.fecha_y_hora ?? null;

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
        h = h % 12 || 12; // 0 -> 12
        const hh = String(h);
        return `${hh}:${m} ${ampm}`;
      };

      const parseFechaHoraAny = (fh: any, t: any): { fecha: string; hora: string } => {
        // 1) Si es string, separar por coma tal cual
        if (typeof fh === 'string' && fh.trim().length > 0) {
          const cleaned = fh.replace(/\u202f|\u00a0/g, ' ').trim();
          const idx = cleaned.indexOf(',');
          const fecha = idx >= 0 ? cleaned.slice(0, idx).trim() : cleaned;
          const hora = idx >= 0 ? cleaned.slice(idx + 1).trim() : '';
          return { fecha, hora };
        }
        // 2) Si tiene toDate() (Timestamp de Firestore)
        if (fh && typeof fh.toDate === 'function') {
          const d = fh.toDate();
          return { fecha: formatDDMMYYYY(d), hora: formatHoraAMPM(d) };
        }
        // 3) Si es objeto con seconds (Timestamp serializado)
        if (fh && typeof fh === 'object' && typeof fh.seconds === 'number') {
          const d = new Date(fh.seconds * 1000);
          return { fecha: formatDDMMYYYY(d), hora: formatHoraAMPM(d) };
        }
        // 4) Fallback: usar campos separados si existen
        if (typeof t?.fecha === 'string' || typeof t?.hora === 'string') {
          return { fecha: String(t?.fecha ?? ''), hora: String(t?.hora ?? '') };
        }
        // 5) Último recurso: createdAt (si existe)
        const ca = t?.createdAt;
        if (ca && typeof ca.toDate === 'function') {
          const d = ca.toDate();
          return { fecha: formatDDMMYYYY(d), hora: formatHoraAMPM(d) };
        }
        if (ca && typeof ca === 'object' && typeof ca.seconds === 'number') {
          const d = new Date(ca.seconds * 1000);
          return { fecha: formatDDMMYYYY(d), hora: formatHoraAMPM(d) };
        }
        return { fecha: '', hora: '' };
      };

      if (!turnos || turnos.length === 0) {
        console.log('exportarTurnosPaciente: sin turnos para el paciente');
        aoa.push(['No hay turnos registrados para este paciente']);
      } else {
        for (const t of turnos) {
          const fh = pickFechaHora(t);
          console.log('turno raw', t);
          console.log('turno fechaHora (original)', fh);

          const { fecha, hora } = parseFechaHoraAny(fh, t);
          console.log('turno parsed ->', { fecha, hora });

          const profesional =
            t.profesional ??
            `${t.usuarios_especialista?.nombre ?? ''} ${t.usuarios_especialista?.apellido ?? ''}`.trim() ??
            '';
          const especialidad = t.especialidad ?? '';
          const estado = t.estado ?? '';

          aoa.push([fecha, hora, profesional, especialidad, estado]);
          aoa.push([]);
        }
      }

      console.log('exportarTurnosPaciente: aoa final', aoa);

      const nombreArchivo = `turnos_${(u.nombre ?? 'paciente')}_${(u.apellido ?? '')}`
        .replace(/\s+/g, '_')
        .toLowerCase();
      this.excelService.exportarDesdeAoA(aoa, nombreArchivo, 'Turnos');
    } catch (err) {
      console.error('exportarTurnosPaciente error', err);
    }
  }

  async toggleHistoria(u: any): Promise<void> {
  if (!u || !u.uid) return;
  const uid = u.uid;

  // si ya está abierto, cerralo
  if (this.showHistoriaMap[uid]) {
    this.showHistoriaMap[uid] = false;
    return;
  }

  // abrir y cargar si no está en cache
  this.showHistoriaMap[uid] = true;
  if (Array.isArray(this.historiaDataMap[uid]) && this.historiaDataMap[uid].length > 0) return;

  try {
    this.historiaLoadingMap[uid] = true;

    // obtener uid del especialista actual (si lo tenés disponible en authService)
    const especialistaUid = this.authService.getUser?.()?.uid ?? undefined;

    // llamar al servicio (devuelve array de documentos)
    const historias = await this.usersService.getHistoriaClinica(uid, especialistaUid);

    // normalizar para la vista: mostrar campos estáticos y dinamicos; NO mostrar fecha
    const normalized = (historias || []).map((h: any) => {
      // dinamicos puede venir como array de {clave, valor}
      const dinamicos = Array.isArray(h.dinamicos) ? h.dinamicos : [];

      // campos estáticos
      const peso = h.peso ?? h.pesoKg ?? null;
      const altura = h.altura ?? h.talla ?? null;
      const temperatura = h.temperatura ?? null;
      const presion = h.presion ?? h.presionArterial ?? null;

      return {
        id: h.id ?? null,
        peso,
        altura,
        temperatura,
        presion,
        dinamicos,
        raw: h
      };
    });

    this.historiaDataMap[uid] = normalized;
  } catch (err) {
    console.error('toggleHistoria error', err);
    this.historiaDataMap[uid] = [];
  } finally {
    this.historiaLoadingMap[uid] = false;
  }
}



}
