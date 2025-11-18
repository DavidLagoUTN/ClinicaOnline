import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { Auth } from '@angular/fire/auth';
import { Firestore, collectionData, collection, doc, docData, updateDoc } from '@angular/fire/firestore';
import { Navbar } from '../../componentes/navbar/navbar';

export type Turno = {
  id: string;
  especialidad?: string;
  estado?: string;
  fechaHora?: Date;
  fecha?: string;
  hora?: string;
  usuarios_paciente?: { nombre?: string; apellido?: string; id?: string; avatar?: string };
  usuarios_especialista?: { nombre?: string; apellido?: string; id?: string; avatar?: string };
  comentario?: string | null;
  comentarioCancelacion?: string | null;
  comentarioRechazo?: string | null;
  encuestaCompletada?: boolean;
  resenia?: string | null;
  diagnostico?: string | null;
  canceladoPor?: string | null;
  avatar?: string;
  id_paciente?: string;
  id_especialista?: string;
  encuesta?: {
    pregunta1?: 'si' | 'no' | null;
    pregunta2?: 'si' | 'no' | null;
    calificacion?: number | null;
    comentario?: string | null;
    completada?: boolean;
  } | null;
  [k: string]: any;
};

@Component({
  selector: 'app-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule, Navbar],
  templateUrl: './turnos.html',
  styleUrls: ['./turnos.scss']
})
export class Turnos implements OnInit {
  loading = true;
  error: string | null = null;

  defaultAvatar = '/assets/default-avatar.png';

  turnos: Turno[] = [];
  turnosOriginales: Turno[] = [];
  turnosFiltrados: Turno[] = [];
  filteredTurnos: Turno[] = [];

  // Cancel inline
  cancelingTurnoId: string | null = null;
  cancelMotivoMap: { [turnoId: string]: string } = {};

  // Formularios / panels reutilizados (compatibilidad con MisTurnos)
  rejectingTurnoId: string | null = null;
  finalizingTurnoId: string | null = null;

  // Encuesta / rating inline controls (admin no los usa pero es seguro tenerlos)
  surveyFillingTurnoId: string | null = null;
  ratingTurnoId: string | null = null;

  // Panel toggles
  expandedResenaId: string | null = null;
  expandedCalificacionId: string | null = null;

  // services
  private auth: Auth;
  private firestore: Firestore;
  private cd: ChangeDetectorRef;

  constructor(auth: Auth, firestore: Firestore, cd: ChangeDetectorRef) {
    this.auth = auth;
    this.firestore = firestore;
    this.cd = cd;
  }

  async ngOnInit() {
    await this.cargarTurnos();
  }

  async cargarTurnos() {
    this.loading = true;
    this.error = null;

    try {
      // Verificar usuario (y en tu flujo podrías chequear rol admin)
      const user = this.auth.currentUser;
      if (!user) {
        this.error = 'Usuario no autenticado';
        this.loading = false;
        this.syncFiltered();
        return;
      }

      // Cargar todos los turnos de la colección 'turnos' (administrador)
      const col = collection(this.firestore, 'turnos');
      const rawList: any[] = await firstValueFrom(collectionData(col, { idField: 'id' }));
      const enriched: Turno[] = [];

      for (const raw of rawList || []) {
        const turno = this.normalizeTurno(raw);

        // Enriquecer paciente
        if (turno.id_paciente) {
          try {
            const pRef = doc(this.firestore, `usuarios/${turno.id_paciente}`);
            const pSnap: any = await firstValueFrom(docData(pRef, { idField: 'id' }));
            turno.usuarios_paciente = {
              nombre: pSnap?.nombre || '',
              apellido: pSnap?.apellido || '',
              id: pSnap?.uid,
              avatar: pSnap?.imagenPerfil || this.defaultAvatar
            };
            turno.avatar = turno.usuarios_paciente.avatar;
          } catch (e) { /* ignore individual failures */ }
        }

        // Enriquecer especialista
        if (turno.id_especialista) {
          try {
            const eRef = doc(this.firestore, `usuarios/${turno.id_especialista}`);
            const eSnap: any = await firstValueFrom(docData(eRef, { idField: 'id' }));
            turno.usuarios_especialista = {
              nombre: eSnap?.nombre || '',
              apellido: eSnap?.apellido || '',
              id: eSnap?.uid,
              avatar: eSnap?.imagenPerfil || this.defaultAvatar
            };
            turno.avatar = turno.usuarios_especialista.avatar;
          } catch (e) { /* ignore individual failures */ }
        }

        enriched.push(turno);
      }

      // Ordenar por fecha (robusto) y asignar
      enriched.sort((a, b) => this.compareFecha(a, b));
      this.turnos = enriched;
      this.turnosOriginales = [...this.turnos];
      this.turnosFiltrados = [...this.turnos];
      // asegurar que la lista mostrada respete el orden
      this.turnosFiltrados.sort((a, b) => this.compareFecha(a, b));
      this.syncFiltered();

      this.loading = false;
      this.cd.detectChanges();
    } catch (err) {
      console.error('cargarTurnos admin error', err);
      this.error = 'No se pudieron cargar los turnos';
      this.loading = false;
      this.syncFiltered();
    }
  }

  filtrarTurnosAdmin(valor: string) {
    const texto = (valor || '').toLowerCase().trim();
    if (!texto) {
      this.turnosFiltrados = [...this.turnosOriginales];
      this.turnosFiltrados.sort((a, b) => this.compareFecha(a, b));
      this.syncFiltered();
      return;
    }

    this.turnosFiltrados = this.turnosOriginales.filter(t => {
      const especialidad = (t.especialidad || '').toLowerCase();
      const especialista = (
        (t.usuarios_especialista?.nombre || '') + ' ' + (t.usuarios_especialista?.apellido || '')
      ).toLowerCase();
      return especialidad.includes(texto) || especialista.includes(texto);
    });

    // ordenar resultado del filtro
    this.turnosFiltrados.sort((a, b) => this.compareFecha(a, b));
    this.syncFiltered();
  }

  obtenerValorInput(event: Event): string {
    return (event.target as HTMLInputElement).value || '';
  }

  // --- Cancel flow (admin) ---
  // botón de cancelar se muestra sólo si t.estado === 'pendiente' en el template
  startCancelarTurno(turno: Turno) {
    this.cancelingTurnoId = turno.id;
    this.cancelMotivoMap[turno.id] = turno.comentarioCancelacion ?? '';
  }

  abortCancelarTurno() {
    if (this.cancelingTurnoId) delete this.cancelMotivoMap[this.cancelingTurnoId];
    this.cancelingTurnoId = null;
  }

  async confirmCancelarTurno(turno: Turno) {
    const motivo = (this.cancelMotivoMap[turno.id] || '').trim();
    if (!motivo) return;

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, {
        estado: 'cancelado',
        comentarioCancelacion: motivo,
        canceladoPor: 'admin'
      });

      this.cancelingTurnoId = null;
      await this.cargarTurnos();
    } catch (err) {
      console.error('confirmCancelarTurno admin error', err);
      this.error = 'No se pudo cancelar el turno';
    }
  }

  // small helpers (kept for parity with MisTurnos if needed)
  canAdminCancel(turno: Turno) {
    return (turno.estado || '').toString().toLowerCase() === 'pendiente';
  }

  trackById(_: number, item: Turno) {
    return item?.id || _;
  }

  private syncFiltered() {
    // clone the array preserving order
    this.filteredTurnos = this.turnosFiltrados.slice();
  }

  private normalizeTurno(raw: any): Turno {
    let fechaHoraDate: Date | undefined;
    if (raw.fechaHora?.toDate && typeof raw.fechaHora.toDate === 'function') {
      fechaHoraDate = raw.fechaHora.toDate();
    } else if (typeof raw.fechaHora === 'object' && typeof raw.fechaHora.seconds === 'number') {
      fechaHoraDate = new Date(raw.fechaHora.seconds * 1000);
    } else if (raw.fechaHora instanceof Date) {
      fechaHoraDate = raw.fechaHora;
    } else if (typeof raw.fechaHora === 'string') {
      const parsed = new Date(raw.fechaHora);
      if (!isNaN(parsed.getTime())) fechaHoraDate = parsed;
    }

    const diaStr = fechaHoraDate ? fechaHoraDate.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : undefined;
    const horaStr = fechaHoraDate ? fechaHoraDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : undefined;

    const rawEstado = (raw.estado ?? raw.status ?? '').toString();
    const estadoNorm = rawEstado.trim().toLowerCase();

    return {
      id: raw.id,
      especialidad: raw.especialidad,
      estado: estadoNorm,
      fechaHora: fechaHoraDate,
      fecha: diaStr,
      hora: horaStr,
      usuarios_paciente: raw.usuarios_paciente,
      usuarios_especialista: raw.usuarios_especialista,
      comentario: raw.comentario ?? null,
      comentarioCancelacion: raw.comentarioCancelacion ?? null,
      comentarioRechazo: raw.comentarioRechazo ?? null,
      encuestaCompletada: raw.encuestaCompletada ?? false,
      resenia: raw.resenia ?? null,
      diagnostico: raw.diagnostico ?? null,
      canceladoPor: raw.canceladoPor ?? null,
      avatar: raw.avatar || this.defaultAvatar,
      id_paciente: raw.id_paciente,
      id_especialista: raw.id_especialista,
      encuesta: raw.encuesta ?? null,
      ...raw
    } as Turno;
  }

  // robust compareFecha: turnos sin fecha van al final
  private compareFecha(a: Turno, b: Turno): number {
    const ta = a?.fechaHora instanceof Date ? a.fechaHora.getTime() : Number.POSITIVE_INFINITY;
    const tb = b?.fechaHora instanceof Date ? b.fechaHora.getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  }

  // toggles for panels (allow both open)
  toggleResena(turno: Turno) {
    if (this.expandedResenaId === turno.id) {
      this.expandedResenaId = null;
      return;
    }

    // close only inline forms that should collapse
    this.cancelingTurnoId = null;
    this.rejectingTurnoId = null;
    this.finalizingTurnoId = null;
    this.surveyFillingTurnoId = null;
    this.ratingTurnoId = null;

    this.expandedResenaId = turno.id;
  }

  toggleCalificacion(turno: Turno) {
    if (this.expandedCalificacionId === turno.id) {
      this.expandedCalificacionId = null;
      return;
    }

    // close only inline forms that should collapse
    this.cancelingTurnoId = null;
    this.rejectingTurnoId = null;
    this.finalizingTurnoId = null;
    this.surveyFillingTurnoId = null;
    this.ratingTurnoId = null;

    this.expandedCalificacionId = turno.id;
  }

  limpiarFiltro(input: HTMLInputElement) {
    // limpiar visual del input
    input.value = '';

    // limpiar modelo/estado y re-ejecutar filtro vacío
    this.filtrarTurnosAdmin('');
  }
}
