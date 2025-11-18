import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { Auth } from '@angular/fire/auth';
import { Firestore, doc, docData, collection, query, where, collectionData, updateDoc } from '@angular/fire/firestore';
import { Navbar } from '../../componentes/navbar/navbar';

export type Turno = {
  id: string;
  especialidad?: string;
  estado?: string; // normalizado: 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado' | 'atendido'
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
  avatar?: string; // usado por el HTML para mostrar la imagen
  id_paciente?: string;
  id_especialista?: string;
  [k: string]: any;
  encuesta?: {
    pregunta1?: 'si' | 'no' | null;
    pregunta2?: 'si' | 'no' | null;
    calificacion?: number | null; // 1..5 opcional
    comentario?: string | null;
    completada?: boolean;
  } | null;
};

@Component({
  selector: 'app-mis-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule, Navbar],
  templateUrl: './mis-turnos.html',
  styleUrls: ['./mis-turnos.scss']
})
export class MisTurnos implements OnInit {
  loading = true;
  error: string | null = null;
  cancelingTurnoId: string | null = null;
  cancelMotivoMap: { [turnoId: string]: string } = {};

  rejectingTurnoId: string | null = null;
  rejectMotivoMap: { [turnoId: string]: string } = {};

  // Finalizar turno
  finalizingTurnoId: string | null = null;
  finalReseniaMap: { [turnoId: string]: string } = {};
  finalDiagnosticoMap: { [turnoId: string]: string } = {};

  expandedResenaId: string | null = null;

  // Encuesta
  surveyFillingTurnoId: string | null = null;
  encuestaDraftMap: { [turnoId: string]: { pregunta1?: string; pregunta2?: string } } = {};

  // Calificación (inline)
  ratingTurnoId: string | null = null;
  ratingDraftMap: { [turnoId: string]: { comentario?: string; calificacion?: number } } = {};

  // Toggle para panel de calificación/encuesta
  expandedCalificacionId: string | null = null;



  viewMode: 'paciente' | 'especialista' = 'paciente';

  defaultAvatar = '/assets/default-avatar.png';
  turnos: Turno[] = [];
  turnosOriginales: Turno[] = [];
  turnosFiltrados: Turno[] = [];
  filteredTurnos: Turno[] = [];

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
      const user = this.auth.currentUser;
      if (!user) {
        this.error = 'Usuario no autenticado';
        this.loading = false;
        this.syncFiltered();
        return;
      }
      const uid = user.uid;

      // Perfil del usuario actual (colección correcta: 'usuarios')
      const perfilRef = doc(this.firestore, `usuarios/${uid}`);
      const perfilSnap: any = await firstValueFrom(docData(perfilRef, { idField: 'id' }));

      const role = (perfilSnap?.tipo as 'paciente' | 'especialista' | undefined) || 'paciente';
      this.viewMode = role === 'especialista' ? 'especialista' : 'paciente';

      const ids: string[] = Array.isArray(perfilSnap?.turnos) ? perfilSnap.turnos : [];
      let lista: Turno[] = [];

      if (ids.length > 0) {
        const reads = ids.map(async (id) => {
          try {
            const tRef = doc(this.firestore, `turnos/${id}`);
            const raw: any = await firstValueFrom(docData(tRef, { idField: 'id' }));
            console.log('Turno RAW desde Firebase:', raw);
            if (!raw) return null;

            let turno = this.normalizeTurno({ id, ...raw });
            console.log('Turno normalizado:', turno);

            if (this.viewMode === 'paciente' && turno.id_especialista) {
              const especialistaRef = doc(this.firestore, `usuarios/${turno.id_especialista}`);
              const especialistaSnap: any = await firstValueFrom(docData(especialistaRef, { idField: 'id' }));
              console.log('Datos del especialista:', especialistaSnap);
              turno.usuarios_especialista = {
                nombre: especialistaSnap?.nombre || '',
                apellido: especialistaSnap?.apellido || '',
                id: especialistaSnap?.uid,
                avatar: especialistaSnap?.imagenPerfil || this.defaultAvatar
              };
              turno.avatar = turno.usuarios_especialista.avatar;
            }

            if (this.viewMode === 'especialista' && turno.id_paciente) {
              const pacienteRef = doc(this.firestore, `usuarios/${turno.id_paciente}`);
              const pacienteSnap: any = await firstValueFrom(docData(pacienteRef, { idField: 'id' }));
              console.log('Datos del paciente:', pacienteSnap);
              turno.usuarios_paciente = {
                nombre: pacienteSnap?.nombre || '',
                apellido: pacienteSnap?.apellido || '',
                id: pacienteSnap?.uid,
                avatar: pacienteSnap?.imagenPerfil || this.defaultAvatar
              };
              turno.avatar = turno.usuarios_paciente.avatar;
            }

            return turno;
          } catch (err) {
            console.warn('Error leyendo turno', id, err);
            return null;
          }
        });

        const results = await Promise.all(reads);
        lista = (results.filter(Boolean) as Turno[]).sort((a, b) => this.compareFecha(a, b));
        console.log('Turnos finales listos para renderizar:', lista);
      } else {
        // Fallback: consulta por id del usuario
        const col = collection(this.firestore, 'turnos');
        const q =
          this.viewMode === 'especialista'
            ? query(col, where('id_especialista', '==', uid))
            : query(col, where('id_paciente', '==', uid));

        const rawList: any[] = await firstValueFrom(collectionData(q, { idField: 'id' }));
        const enriched: Turno[] = [];
        for (const raw of rawList || []) {
          let turno = this.normalizeTurno(raw);

          if (this.viewMode === 'paciente' && turno.id_especialista) {
            const especialistaRef = doc(this.firestore, `usuarios/${turno.id_especialista}`);
            const especialistaSnap: any = await firstValueFrom(docData(especialistaRef, { idField: 'id' }));
            turno.usuarios_especialista = {
              nombre: especialistaSnap?.nombre || '',
              apellido: especialistaSnap?.apellido || '',
              id: especialistaSnap?.uid,
              avatar: especialistaSnap?.imagenPerfil || this.defaultAvatar
            };
            turno.avatar = turno.usuarios_especialista.avatar;
          }

          if (this.viewMode === 'especialista' && turno.id_paciente) {
            const pacienteRef = doc(this.firestore, `usuarios/${turno.id_paciente}`);
            const pacienteSnap: any = await firstValueFrom(docData(pacienteRef, { idField: 'id' }));
            turno.usuarios_paciente = {
              nombre: pacienteSnap?.nombre || '',
              apellido: pacienteSnap?.apellido || '',
              id: pacienteSnap?.uid,
              avatar: pacienteSnap?.imagenPerfil || this.defaultAvatar
            };
            turno.avatar = turno.usuarios_paciente.avatar;
          }

          enriched.push(turno);
        }

        lista = enriched.sort((a, b) => this.compareFecha(a, b));
      }

      this.turnos = lista;
      this.turnosOriginales = [...lista];
      this.turnosFiltrados = [...lista];
      this.syncFiltered();

      this.loading = false;
      this.cd.detectChanges();
    } catch (err) {
      console.error('cargarTurnos error', err);
      this.error = 'No se pudieron cargar los turnos';
      this.loading = false;
      this.syncFiltered();
    }
  }


  filtrarTurnosComoPaciente(valor: string) {
    const texto = (valor || '').toLowerCase().trim();
    if (!texto) {
      this.turnosFiltrados = [...this.turnosOriginales];
      this.syncFiltered();
      return;
    }

    this.turnosFiltrados = this.turnosOriginales.filter(t => {
      const especialidad = (t.especialidad || '').toLowerCase();
      const especialista = (
        (t.usuarios_especialista?.nombre || '') + ' ' + (t.usuarios_especialista?.apellido || '')
      ).toLowerCase();
      const fecha = String(t.fechaHora || t.fecha || '').toLowerCase();
      return especialidad.includes(texto) || especialista.includes(texto) || fecha.includes(texto);
    });

    this.syncFiltered();
  }

  filtrarTurnosComoEspecialista(valor: string) {
    const texto = (valor || '').toLowerCase().trim();
    if (!texto) {
      this.turnosFiltrados = [...this.turnosOriginales];
      this.syncFiltered();
      return;
    }

    this.turnosFiltrados = this.turnosOriginales.filter(t => {
      const especialidad = (t.especialidad || '').toLowerCase();
      const paciente = (
        (t.usuarios_paciente?.nombre || '') + ' ' + (t.usuarios_paciente?.apellido || '')
      ).toLowerCase();
      const fecha = String(t.fechaHora || t.fecha || '').toLowerCase();
      return especialidad.includes(texto) || paciente.includes(texto) || fecha.includes(texto);
    });

    this.syncFiltered();
  }

  obtenerValorInput(event: Event): string {
    return (event.target as HTMLInputElement).value || '';
  }

  // Acciones PACIENTE
  async cancelarTurno(turno: Turno) {
    const motivo = prompt('Motivo de cancelación (obligatorio):');
    if (motivo === null || motivo.trim() === '') return;

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, {
        estado: 'cancelado',
        comentarioCancelacion: motivo,
        canceladoPor: 'paciente'
      });
      await this.cargarTurnos();
    } catch (err) {
      console.error('cancelarTurno error', err);
      this.error = 'No se pudo cancelar el turno';
    }
  }

  async completarEncuesta(turno: Turno) {
    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, { encuestaCompletada: true });
      await this.cargarTurnos();
    } catch (err) {
      console.error('completarEncuesta error', err);
      this.error = 'No se pudo marcar la encuesta';
    }
  }

  async calificarAtencion(turno: Turno) {
    const comentario = prompt('Dejá tu comentario sobre la atención (obligatorio):');
    if (comentario === null || comentario.trim() === '') return;

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, { comentario });
      await this.cargarTurnos();
    } catch (err) {
      console.error('calificarAtencion error', err);
      this.error = 'No se pudo guardar la calificación';
    }
  }

  // Acciones ESPECIALISTA
  async aceptarTurno(turno: Turno) {
    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, { estado: 'aceptado' });
      await this.cargarTurnos();
    } catch (err) {
      console.error('aceptarTurno error', err);
      this.error = 'No se pudo aceptar el turno';
    }
  }

  async rechazarTurno(turno: Turno) {
    const motivo = prompt('Motivo de rechazo (obligatorio):');
    if (motivo === null || motivo.trim() === '') return;

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, { estado: 'rechazado', comentarioRechazo: motivo });
      await this.cargarTurnos();
    } catch (err) {
      console.error('rechazarTurno error', err);
      this.error = 'No se pudo rechazar el turno';
    }
  }

  async finalizarTurno(turno: Turno) {
    const resenia = prompt('Reseña / comentario del diagnóstico (obligatorio):');
    if (resenia === null || resenia.trim() === '') return;

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, { estado: 'atendido', resenia });
      await this.cargarTurnos();
    } catch (err) {
      console.error('finalizarTurno error', err);
      this.error = 'No se pudo finalizar el turno';
    }
  }

  verDetalle(turno: Turno) {
    console.log('verDetalle', turno);
  }

  verComentario(turno: Turno) {
    console.log('verComentario', turno?.comentario);
  }

  trackById(_: number, item: Turno) {
    return item?.id || _;
  }

  private syncFiltered() {
    this.filteredTurnos = [...this.turnosFiltrados];
  }

  private normalizeTurno(raw: any): Turno {
    // --- convertir fechaHora como ya tenés (omito para no repetir demasiado) ---
    let fechaHoraDate: Date | undefined;
    if (raw.fechaHora?.toDate && typeof raw.fechaHora.toDate === 'function') {
      fechaHoraDate = raw.fechaHora.toDate();
    } else if (typeof raw.fechaHora === 'object' && typeof raw.fechaHora.seconds === 'number') {
      fechaHoraDate = new Date(raw.fechaHora.seconds * 1000);
    } else if (raw.fechaHora instanceof Date) {
      fechaHoraDate = raw.fechaHora;
    } else if (typeof raw.fechaHora === 'string') {
      fechaHoraDate = new Date(raw.fechaHora);
    }

    // strings legibles
    const diaStr = fechaHoraDate ? fechaHoraDate.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : undefined;
    const horaStr = fechaHoraDate ? fechaHoraDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : undefined;

    // Normalizar estado a minúsculas y mapear alias si hace falta
    const rawEstado = (raw.estado ?? raw.status ?? '').toString();
    const estadoNorm = rawEstado.trim().toLowerCase();

    const turno: Turno = {
      id: raw.id,
      especialidad: raw.especialidad,
      estado: estadoNorm, // GUARDA EN MINÚSCULAS
      fechaHora: fechaHoraDate,
      fecha: diaStr,
      hora: horaStr,
      usuarios_paciente: raw.usuarios_paciente || (raw.id_paciente ? { id: raw.id_paciente } : undefined),
      usuarios_especialista: raw.usuarios_especialista || (raw.id_especialista ? { id: raw.id_especialista } : undefined),
      comentario: raw.comentario ?? null,
      comentarioCancelacion: raw.comentarioCancelacion ?? null,
      comentarioRechazo: raw.comentarioRechazo ?? null,
      encuestaCompletada: raw.encuestaCompletada ?? false,
      resenia: raw.resenia ?? null,
      diagnostico: raw.diagnostico ?? null,
      // Normalizar objeto encuesta si viene como objeto o como campos sueltos
      encuesta: raw.encuesta
        ? {
          pregunta1: raw.encuesta?.pregunta1 ?? null,
          pregunta2: raw.encuesta?.pregunta2 ?? null,
          calificacion: raw.encuesta?.calificacion ?? null,
          comentario: raw.encuesta?.comentario ?? null,
          completada: raw.encuesta?.completada ?? (raw.encuestaCompletada ?? false)
        }
        : raw.encuestaCompletada
          ? {
            pregunta1: null,
            pregunta2: null,
            calificacion: null,
            comentario: null,
            completada: true
          }
          : null,
      canceladoPor: raw.canceladoPor ?? null,
      avatar: raw.avatar || this.defaultAvatar,
      id_paciente: raw.id_paciente,
      id_especialista: raw.id_especialista,
      ...raw
    };

    console.log('normalizeTurno result:', turno);
    return turno;
  }


  private compareFecha(a: Turno, b: Turno): number {
    const ta = a.fechaHora instanceof Date ? a.fechaHora.getTime() : 0;
    const tb = b.fechaHora instanceof Date ? b.fechaHora.getTime() : 0;
    return ta - tb;
  }

  startCancelarTurno(turno: Turno) {
    // cerrar formulario de rechazo si estaba abierto en otra tarjeta
    this.rejectingTurnoId = null;

    this.cancelingTurnoId = turno.id;
    this.cancelMotivoMap[turno.id] = turno.comentarioCancelacion ?? '';
  }

  // Abrir formulario inline de rechazo
  startRechazarTurno(turno: Turno) {
    // cerrar formulario de cancelación si estaba abierto en otra tarjeta
    this.cancelingTurnoId = null;

    this.rejectingTurnoId = turno.id;
    this.rejectMotivoMap[turno.id] = turno.comentarioRechazo ?? '';
  }

  startFinalizarTurno(turno: Turno) {
    // cerrar otros formularios abiertos
    this.cancelingTurnoId = null;
    this.rejectingTurnoId = null;

    this.finalizingTurnoId = turno.id;
    this.finalReseniaMap[turno.id] = turno.resenia ?? '';
    this.finalDiagnosticoMap[turno.id] = turno.diagnostico ?? '';
  }

  // cancelar el flujo (oculta form sin guardar)
  abortCancelarTurno() {
    if (this.cancelingTurnoId) {
      delete this.cancelMotivoMap[this.cancelingTurnoId];
    }
    this.cancelingTurnoId = null;
  }

  // Cancelar/ocultar el formulario de rechazo sin guardar
  abortRechazarTurno() {
    if (this.rejectingTurnoId) {
      delete this.rejectMotivoMap[this.rejectingTurnoId];
    }
    this.rejectingTurnoId = null;
  }

  abortFinalizarTurno() {
    if (this.finalizingTurnoId) {
      delete this.finalReseniaMap[this.finalizingTurnoId];
      delete this.finalDiagnosticoMap[this.finalizingTurnoId];
    }
    this.finalizingTurnoId = null;
  }

  // confirmar y guardar en Firestore
  async confirmCancelarTurno(turno: Turno) {
    const motivo = (this.cancelMotivoMap[turno.id] || '').trim();
    if (!motivo) return;

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, {
        estado: 'cancelado',
        comentarioCancelacion: motivo,
        canceladoPor: 'paciente'
      });

      // cerrar form
      this.cancelingTurnoId = null;

      // refrescar turnos (tu método ya existente)
      await this.cargarTurnos();

      // opcional: mostrar un toast / feedback
    } catch (err) {
      console.error('confirmCancelarTurno error', err);
      this.error = 'No se pudo cancelar el turno';
    }
  }

  // Confirmar rechazo y guardar en Firestore
  async confirmRechazarTurno(turno: Turno) {
    const motivo = (this.rejectMotivoMap[turno.id] || '').trim();
    if (!motivo) return;

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, {
        estado: 'rechazado',
        comentarioRechazo: motivo
      });

      // cerrar form
      this.rejectingTurnoId = null;

      // refrescar lista
      await this.cargarTurnos();
    } catch (err) {
      console.error('confirmRechazarTurno error', err);
      this.error = 'No se pudo rechazar el turno';
    }
  }

  async confirmFinalizarTurno(turno: Turno) {
    const resenia = (this.finalReseniaMap[turno.id] || '').trim();
    const diagnostico = (this.finalDiagnosticoMap[turno.id] || '').trim();
    if (!resenia || !diagnostico) return;

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, {
        estado: 'atendido',
        resenia,
        diagnostico
      });

      // cerrar form
      this.finalizingTurnoId = null;

      // refrescar
      await this.cargarTurnos();
    } catch (err) {
      console.error('confirmFinalizarTurno error', err);
      this.error = 'No se pudo finalizar el turno';
    }
  }

  toggleResena(turno: Turno) {
    if (this.expandedResenaId === turno.id) {
      this.expandedResenaId = null;
      return;
    }

    // cerrar solo formularios activos que deberían colapsar
    this.cancelingTurnoId = null;
    this.rejectingTurnoId = null;
    this.finalizingTurnoId = null;
    this.surveyFillingTurnoId = null;
    this.ratingTurnoId = null;

    // NO tocar expandedCalificacionId para permitir ambos panels abiertos
    this.expandedResenaId = turno.id;
  }

  // --- Abrir / cancelar encuesta ---
  startEncuesta(turno: Turno) {
    // cerrar otros formularios
    this.cancelingTurnoId = null;
    this.rejectingTurnoId = null;
    this.finalizingTurnoId = null;
    this.expandedResenaId = null;
    this.ratingTurnoId = null;

    this.surveyFillingTurnoId = turno.id;
    this.encuestaDraftMap[turno.id] = {
      pregunta1: turno.encuesta?.pregunta1 ?? '',
      pregunta2: turno.encuesta?.pregunta2 ?? ''
    };
  }

  abortEncuesta() {
    if (this.surveyFillingTurnoId) delete this.encuestaDraftMap[this.surveyFillingTurnoId];
    this.surveyFillingTurnoId = null;
  }

  // Guardar encuesta (marca completada = false inicialmente si no calificó aún)
  async confirmEncuesta(turno: Turno) {
    const draft = this.encuestaDraftMap[turno.id] || {};
    const p1 = (draft.pregunta1 || '').trim();
    const p2 = (draft.pregunta2 || '').trim();
    if (!p1 || !p2) return; // validar

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      const encuestaObj = { pregunta1: p1, pregunta2: p2, completada: true };
      await updateDoc(ref, { encuesta: encuestaObj, encuestaCompletada: true });
      this.surveyFillingTurnoId = null;
      await this.cargarTurnos();
    } catch (err) {
      console.error('confirmEncuesta error', err);
      this.error = 'No se pudo guardar la encuesta';
    }
  }

  // --- Abrir / cancelar calificación ---
  startRating(turno: Turno) {
    // cerrar otros formularios
    this.cancelingTurnoId = null;
    this.rejectingTurnoId = null;
    this.finalizingTurnoId = null;
    this.surveyFillingTurnoId = null;
    this.expandedResenaId = null;

    this.ratingTurnoId = turno.id;
    this.ratingDraftMap[turno.id] = {
      comentario: turno.comentario ?? '',
      calificacion: turno.encuesta?.calificacion ?? undefined
    };
  }

  abortRating() {
    if (this.ratingTurnoId) delete this.ratingDraftMap[this.ratingTurnoId];
    this.ratingTurnoId = null;
  }

  // Guardar calificación + marcar encuesta completada si no lo estaba
  async confirmRating(turno: Turno) {
    const draft = this.ratingDraftMap[turno.id] || {};
    const comentario = (draft.comentario || '').trim();
    const calificacion = draft.calificacion ?? null;

    if (!comentario) return; // hacé obligatorio el comentario como pediste antes

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      // actualizar comentario y encuesta.calificacion + completada true
      const updates: any = { comentario };
      if (!turno.encuesta) {
        updates.encuesta = { pregunta1: null, pregunta2: null, calificacion: calificacion, comentario, completada: true };
        updates.encuestaCompletada = true;
      } else {
        updates['encuesta.calificacion'] = calificacion;
        updates['encuesta.comentario'] = comentario;
        updates['encuesta.completada'] = true;
        updates.encuestaCompletada = true;
      }
      await updateDoc(ref, updates);
      this.ratingTurnoId = null;
      await this.cargarTurnos();
    } catch (err) {
      console.error('confirmRating error', err);
      this.error = 'No se pudo guardar la calificación';
    }
  }

  toggleCalificacion(turno: Turno) {
    if (this.expandedCalificacionId === turno.id) {
      this.expandedCalificacionId = null;
      return;
    }

    // cerrar solo formularios activos que deberían colapsar
    this.cancelingTurnoId = null;
    this.rejectingTurnoId = null;
    this.finalizingTurnoId = null;
    this.surveyFillingTurnoId = null;
    this.ratingTurnoId = null;

    // NO tocar expandedResenaId para permitir ambos panels abiertos
    this.expandedCalificacionId = turno.id;
  }

  limpiarFiltro(input: HTMLInputElement) {
  // limpiar el input visual
  input.value = '';

  // re-ejecutar el filtrado vacío según el modo actual
  if (this.viewMode === 'paciente') {
    this.filtrarTurnosComoPaciente('');
  } else {
    this.filtrarTurnosComoEspecialista('');
  }
}



}
