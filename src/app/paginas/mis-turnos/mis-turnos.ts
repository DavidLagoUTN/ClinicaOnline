import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { Auth } from '@angular/fire/auth';
import { Firestore, doc, docData, collection, query, where, collectionData, updateDoc } from '@angular/fire/firestore';
import { Navbar } from '../../componentes/navbar/navbar';
import { ResaltarPipe } from '../../pipes/resaltar.pipe';

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
  historia?: any;
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
  imports: [CommonModule, FormsModule, Navbar, ResaltarPipe],
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

  maxOptionalDinamicos = 3;

  // Estructura del draft por turno (añadir opcionales)
  historiaDraftMap: {
    [turnoId: string]: {
      altura?: number | null;
      peso?: number | null;
      temperatura?: string | null;
      presion?: string | null;
      dinamicos: { clave: string; valor: any }[];
      opcionales: { clave: string; valor: any }[];
    };
  } = {};


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

    const historiaCache = (this as any).historiaCache ?? ((this as any).historiaCache = {});

    try {
      const user = this.auth.currentUser;
      if (!user) {
        this.error = 'Usuario no autenticado';
        this.loading = false;
        this.syncFiltered();
        return;
      }
      const uid = user.uid;

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
            if (!raw) return null;

            let turno = this.normalizeTurno({ id, ...raw });

            // enriquecer con datos del otro usuario
            if (this.viewMode === 'paciente' && turno.id_especialista) {
              try {
                const especialistaRef = doc(this.firestore, `usuarios/${turno.id_especialista}`);
                const especialistaSnap: any = await firstValueFrom(docData(especialistaRef, { idField: 'id' }));
                turno.usuarios_especialista = {
                  nombre: especialistaSnap?.nombre || '',
                  apellido: especialistaSnap?.apellido || '',
                  id: especialistaSnap?.uid,
                  avatar: especialistaSnap?.imagenPerfil || this.defaultAvatar
                };
                turno.avatar = turno.usuarios_especialista.avatar;
              } catch (err) {
                console.warn('Error leyendo especialista para turno', id, err);
              }
            }

            if (this.viewMode === 'especialista' && turno.id_paciente) {
              try {
                const pacienteRef = doc(this.firestore, `usuarios/${turno.id_paciente}`);
                const pacienteSnap: any = await firstValueFrom(docData(pacienteRef, { idField: 'id' }));
                turno.usuarios_paciente = {
                  nombre: pacienteSnap?.nombre || '',
                  apellido: pacienteSnap?.apellido || '',
                  id: pacienteSnap?.uid,
                  avatar: pacienteSnap?.imagenPerfil || this.defaultAvatar
                };
                turno.avatar = turno.usuarios_paciente.avatar;
              } catch (err) {
                console.warn('Error leyendo paciente para turno', id, err);
              }
            }

            // Adjuntar historia clínica (si existe) — siempre normalizar y cachear
            const pacienteUid = turno.id_paciente ?? turno.usuarios_paciente?.id;
            if (pacienteUid) {
              if (historiaCache[pacienteUid] !== undefined) {
                turno.historia = historiaCache[pacienteUid];
              } else {
                try {
                  const rawHistoria = await this.fetchHistoriaPaciente(pacienteUid);
                  const historiaNorm = this.normalizeHistoria(rawHistoria);
                  historiaCache[pacienteUid] = historiaNorm;
                  turno.historia = historiaNorm;
                } catch (err) {
                  console.warn('Error cargando historia para paciente', pacienteUid, err);
                  historiaCache[pacienteUid] = null;
                  turno.historia = null;
                }
              }
            } else {
              turno.historia = null;
            }

            console.log('Historia asignada para paciente', pacienteUid, turno.historia);
            return turno;
          } catch (err) {
            console.warn('Error leyendo turno', id, err);
            return null;
          }
        });

        const results = await Promise.all(reads);
        lista = (results.filter(Boolean) as Turno[]).sort((a, b) => this.compareFecha(a, b));
      } else {
        // fallback: consulta por id del usuario
        const col = collection(this.firestore, 'turnos');
        const q =
          this.viewMode === 'especialista'
            ? query(col, where('id_especialista', '==', uid))
            : query(col, where('id_paciente', '==', uid));

        const rawList: any[] = await firstValueFrom(collectionData(q, { idField: 'id' }));
        const enriched: Turno[] = [];

        for (const raw of rawList || []) {
          try {
            let turno = this.normalizeTurno(raw);

            if (this.viewMode === 'paciente' && turno.id_especialista) {
              try {
                const especialistaRef = doc(this.firestore, `usuarios/${turno.id_especialista}`);
                const especialistaSnap: any = await firstValueFrom(docData(especialistaRef, { idField: 'id' }));
                turno.usuarios_especialista = {
                  nombre: especialistaSnap?.nombre || '',
                  apellido: especialistaSnap?.apellido || '',
                  id: especialistaSnap?.uid,
                  avatar: especialistaSnap?.imagenPerfil || this.defaultAvatar
                };
                turno.avatar = turno.usuarios_especialista.avatar;
              } catch (err) {
                console.warn('Error leyendo especialista en fallback', err);
              }
            }

            if (this.viewMode === 'especialista' && turno.id_paciente) {
              try {
                const pacienteRef = doc(this.firestore, `usuarios/${turno.id_paciente}`);
                const pacienteSnap: any = await firstValueFrom(docData(pacienteRef, { idField: 'id' }));
                turno.usuarios_paciente = {
                  nombre: pacienteSnap?.nombre || '',
                  apellido: pacienteSnap?.apellido || '',
                  id: pacienteSnap?.uid,
                  avatar: pacienteSnap?.imagenPerfil || this.defaultAvatar
                };
                turno.avatar = turno.usuarios_paciente.avatar;
              } catch (err) {
                console.warn('Error leyendo paciente en fallback', err);
              }
            }

            const pacienteUid = turno.id_paciente ?? turno.usuarios_paciente?.id;
            if (pacienteUid) {
              if (historiaCache[pacienteUid] !== undefined) {
                turno.historia = historiaCache[pacienteUid];
              } else {
                try {
                  const rawHistoria = await this.fetchHistoriaPaciente(pacienteUid);
                  const historiaNorm = this.normalizeHistoria(rawHistoria);
                  historiaCache[pacienteUid] = historiaNorm;
                  turno.historia = historiaNorm;
                } catch (err) {
                  console.warn('Error cargando historia en fallback para paciente', pacienteUid, err);
                  historiaCache[pacienteUid] = null;
                  turno.historia = null;
                }
              }
            } else {
              turno.historia = null;
            }

            enriched.push(turno);
          } catch (err) {
            console.warn('Error procesando raw turno', err);
          }
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

    console.log('Buscando texto:', texto);
    this.turnosOriginales.forEach(t => {
      const matched = this.matchesTurno(t, texto);
      if (matched) {
        console.log('Coincidencia en turno', t.id, 'paciente', t.usuarios_paciente?.nombre, t.usuarios_paciente?.apellido, 'historia:', (t as any).historia);
      }
    });

    this.turnosFiltrados = this.turnosOriginales.filter(t => {
      try {
        return this.matchesTurno(t, texto);
      } catch (err) {
        console.warn('Error evaluando matchesTurno', err);
        return false;
      }
    });

    this.syncFiltered();
  }

  filtrarTurnosComoEspecialista(valor: string) {
    this.filtrarTurnosComoPaciente(valor);
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
    this.cancelingTurnoId = null;
    this.rejectingTurnoId = null;

    this.finalizingTurnoId = turno.id;
    this.finalReseniaMap[turno.id] = turno.resenia ?? '';
    this.finalDiagnosticoMap[turno.id] = turno.diagnostico ?? '';

    const existing = (turno as any).historia ?? null;
    const dinamicosFromExisting = Array.isArray(existing?.dinamicos) ? existing.dinamicos : [];

    const dinamicos: { clave: string; valor: any }[] = [
      dinamicosFromExisting[0] ? { clave: dinamicosFromExisting[0].clave || '', valor: this.normalizeRangeValue(dinamicosFromExisting[0].valor) } : { clave: '', valor: 0 },
      dinamicosFromExisting[1] ? { clave: dinamicosFromExisting[1].clave || '', valor: Number(dinamicosFromExisting[1].valor) || null } : { clave: '', valor: null },
      dinamicosFromExisting[2] ? { clave: dinamicosFromExisting[2].clave || '', valor: Boolean(dinamicosFromExisting[2].valor) } : { clave: '', valor: false }
    ];

    const opcionalesFromExisting = Array.isArray(dinamicosFromExisting) && dinamicosFromExisting.length > 3
      ? dinamicosFromExisting.slice(3).map((d: any) => ({ clave: d.clave ?? '', valor: d.valor ?? '' }))
      : [];

    this.historiaDraftMap[turno.id] = {
      altura: existing?.altura ?? null,
      peso: existing?.peso ?? null,
      temperatura: existing?.temperatura ?? null,
      presion: existing?.presion ?? null,
      dinamicos,
      opcionales: opcionalesFromExisting
    };

    try { this.cd.detectChanges(); } catch (e) { /* noop */ }
  }


  // Opcionales: agregar / eliminar
  addOptionalDinamico(turnoId: string) {
    if (!this.historiaDraftMap[turnoId]) {
      this.historiaDraftMap[turnoId] = {
        altura: null,
        peso: null,
        temperatura: null,
        presion: null,
        dinamicos: [
          { clave: '', valor: 0 },
          { clave: '', valor: null },
          { clave: '', valor: false }
        ],
        opcionales: []
      };
    }
    const list = this.historiaDraftMap[turnoId].opcionales || [];
    if (list.length >= this.maxOptionalDinamicos) return;
    list.push({ clave: '', valor: '' });
    this.historiaDraftMap[turnoId].opcionales = list;
    try { this.cd.detectChanges(); } catch (e) { /* noop */ }
  }


  removeOptionalDinamico(turnoId: string, index: number) {
    const list = this.historiaDraftMap[turnoId]?.opcionales;
    if (!list) return;
    list.splice(index, 1);
    try { this.cd.detectChanges(); } catch (e) { /* noop */ }
  }

  normalizeRangeValue(v: any): number {
    const n = Number(v);
    if (Number.isNaN(n)) return 0;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return Math.round(n);
  }

  // Evento cuando se mueve el range: actualiza el valor numérico ligado
  onRangeChange(turnoId: string, index: number) {
    const draft = this.historiaDraftMap[turnoId];
    if (!draft) return;
    // Angular ya actualiza el valor por ngModel; forzamos detección si hace falta
    try { this.cd.detectChanges(); } catch (e) { /* noop */ }
  }

  // Cuando se edita el número al lado del range, sincronizar con el range y limitar 0-100
  onRangeNumberInput(event: Event, turnoId: string, index: number) {
    const input = event.target as HTMLInputElement;
    let val = Number(input.value);
    if (Number.isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;
    if (!this.historiaDraftMap[turnoId]) return;
    this.historiaDraftMap[turnoId].dinamicos[index].valor = Math.round(val);
    try { this.cd.detectChanges(); } catch (e) { /* noop */ }
  }

  // Evitar caracteres no numéricos en el segundo control (solo números)
  onlyNumberKey(event: KeyboardEvent) {
    const allowed = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete'];
    if (allowed.includes(event.key)) return;
    const isNumber = /^[0-9]$/.test(event.key);
    if (!isNumber) event.preventDefault();
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


  private async fetchHistoriaPaciente(pacienteUid: string): Promise<any | null> {
    if (!pacienteUid) return null;

    try {
      // 1) doc 'historias/{uid}'
      try {
        const hRef = doc(this.firestore, `historias/${pacienteUid}`);
        const hSnap: any = await firstValueFrom(docData(hRef, { idField: 'id' }));
        if (hSnap && Object.keys(hSnap).length) {
          if (Array.isArray(hSnap)) {
            return hSnap;
          }
          return {
            ...hSnap,
            dinamicos: Array.isArray(hSnap.dinamicos) ? hSnap.dinamicos : []
          };
        }
      } catch (e) {
        // continuar con siguiente intento
      }

      // 2) subcolección 'usuarios/{uid}/historia'
      try {
        const colRef = collection(this.firestore, `usuarios/${pacienteUid}/historia`);
        const list: any[] = await firstValueFrom(collectionData(colRef, { idField: 'id' }));
        if (Array.isArray(list) && list.length) {
          return list.map((h: any) => ({
            ...h,
            dinamicos: Array.isArray(h.dinamicos) ? h.dinamicos : []
          }));
        }
      } catch (e) {
        // continuar
      }

      // 3) campo dentro del documento de usuario: usuarios/{uid}.historia*
      try {
        const uRef = doc(this.firestore, `usuarios/${pacienteUid}`);
        const uSnap: any = await firstValueFrom(docData(uRef, { idField: 'id' }));
        if (uSnap) {
          const h = uSnap.historia || uSnap.historiaClinica || uSnap.historia_clinica;
          if (h) {
            if (Array.isArray(h)) {
              return h.map((x: any) => ({ ...x, dinamicos: Array.isArray(x.dinamicos) ? x.dinamicos : [] }));
            } else if (typeof h === 'object') {
              return { ...h, dinamicos: Array.isArray(h.dinamicos) ? h.dinamicos : [] };
            }
          }
        }
      } catch (e) {
        // continuar
      }

      // no encontrada
      return null;
    } catch (err) {
      console.warn('fetchHistoriaPaciente error', err);
      return null;
    }
  }

  private matchesTurno(turno: Turno, texto: string): boolean {
    if (!texto) return true;
    const q = texto.toLowerCase().trim();
    if (!q) return true;

    const inspect = (val: any): boolean => {
      if (val === null || val === undefined) return false;

      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        return String(val).toLowerCase().includes(q);
      }

      if (Array.isArray(val)) {
        for (const item of val) {
          if (inspect(item)) return true;
        }
        return false;
      }

      if (typeof val === 'object') {
        // dato dinámico normalizado {clave, valor}
        if ('clave' in val && 'valor' in val) {
          if (String(val.clave || '').toLowerCase().includes(q)) return true;
          if (String(val.valor || '').toLowerCase().includes(q)) return true;
        }

        // revisar propiedades relevantes primero
        const priorityKeys = ['nombre', 'apellido', 'dni', 'email', 'especialidad', 'fecha', 'hora'];
        for (const k of priorityKeys) {
          if (k in val && inspect(val[k])) return true;
        }

        // inspección general recursiva
        for (const k of Object.keys(val)) {
          try {
            if (inspect(val[k])) return true;
          } catch (e) {
            // ignorar propiedades problemáticas
          }
        }
        return false;
      }

      return false;
    };

    // campos principales del turno
    if (inspect(turno.especialidad)) return true;
    if (inspect(turno.fecha)) return true;
    if (inspect(turno.hora)) return true;
    if (inspect(turno.estado)) return true;
    if (inspect(turno.comentario)) return true;

    // datos del paciente / especialista
    if (turno.usuarios_paciente && inspect(turno.usuarios_paciente)) return true;
    if (turno.usuarios_especialista && inspect(turno.usuarios_especialista)) return true;

    // historia clínica (puede ser array u objeto)
    const h = (turno as any).historia;
    if (h && inspect(h)) return true;

    // fallback: cualquier otro campo del turno
    if (inspect(turno)) return true;

    return false;
  }




  private normalizeHistoria(raw: any): any {
    if (!raw) return null;

    const normalizeDato = (d: any) => {
      const clave = String(d?.clave ?? d?.key ?? d?.nombre ?? d?.name ?? '').trim();
      const valorRaw = d?.valor ?? d?.value ?? d?.valorTexto ?? d?.text ?? d;
      const valor = valorRaw === undefined || valorRaw === null ? '' : String(valorRaw).trim();
      return { clave, valor };
    };

    if (Array.isArray(raw)) {
      return raw.map((entry: any) => ({
        ...entry,
        dinamicos: Array.isArray(entry.dinamicos) ? entry.dinamicos.map((d: any) => normalizeDato(d)) : []
      }));
    }

    if (typeof raw === 'object') {
      const obj: any = { ...raw };
      obj.dinamicos = Array.isArray(raw.dinamicos) ? raw.dinamicos.map((d: any) => normalizeDato(d)) : [];
      return obj;
    }

    return null;
  }

  // Helpers para dinamicos (por turno)
  addDinamico(turnoId: string) {
    if (!this.historiaDraftMap[turnoId]) {
      this.historiaDraftMap[turnoId] = {
        altura: null,
        peso: null,
        temperatura: null,
        presion: null,
        dinamicos: [],
        opcionales: []
      };

    }
    const draft = this.historiaDraftMap[turnoId];
    if (draft.dinamicos.length >= 3) return;
    draft.dinamicos.push({ clave: '', valor: '' });
    // forzar detección si hace falta
    try { this.cd.detectChanges(); } catch (e) { /* noop */ }
  }

  removeDinamico(turnoId: string, index: number) {
    const draft = this.historiaDraftMap[turnoId];
    if (!draft) return;
    draft.dinamicos.splice(index, 1);
    try { this.cd.detectChanges(); } catch (e) { /* noop */ }
  }

  // Validación del draft para el turno (al menos un campo fijo no nulo y dinamicos válidos)
  validarHistoriaDraft(turnoId: string): boolean {
    const draft = this.historiaDraftMap[turnoId];
    if (!draft) return false;

    // al menos un campo fijo no nulo (mantener regla previa)
    const anyFixed =
      (draft.altura !== null && draft.altura !== undefined && draft.altura !== undefined) ||
      (draft.peso !== null && draft.peso !== undefined && draft.peso !== undefined) ||
      ((draft.temperatura || '').toString().trim() !== '') ||
      ((draft.presion || '').toString().trim() !== '');
    if (!anyFixed) return false;

    if (!Array.isArray(draft.dinamicos) || draft.dinamicos.length < 3) return false;

    // 1) rango 0..100
    const d0 = draft.dinamicos[0];
    if (!d0 || (d0.clave || '').toString().trim() === '') return false;
    const v0 = Number(d0.valor);
    if (Number.isNaN(v0) || v0 < 0 || v0 > 100) return false;

    // 2) número
    const d1 = draft.dinamicos[1];
    if (!d1 || (d1.clave || '').toString().trim() === '') return false;
    const v1 = Number(d1.valor);
    if (Number.isNaN(v1)) return false;

    // 3) booleano
    const d2 = draft.dinamicos[2];
    if (!d2 || (d2.clave || '').toString().trim() === '') return false;
    if (typeof d2.valor !== 'boolean') return false;

    return true;
  }

  // Modificar confirmFinalizarTurno para incluir la historia clínica en el update del turno
  async confirmFinalizarTurno(turno: Turno) {
    const resenia = (this.finalReseniaMap[turno.id] || '').trim();
    const diagnostico = (this.finalDiagnosticoMap[turno.id] || '').trim();
    if (!resenia || !diagnostico) return;

    const draft = this.historiaDraftMap[turno.id];
    if (!draft || !this.validarHistoriaDraft(turno.id)) {
      this.error = 'Completá la historia clínica del turno antes de finalizar.';
      return;
    }

    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      const historiaPayload: any = {
        altura: draft.altura ?? null,
        peso: draft.peso ?? null,
        temperatura: draft.temperatura ?? null,
        presion: draft.presion ?? null,
        dinamicos: [
          { clave: draft.dinamicos[0].clave, valor: Number(draft.dinamicos[0].valor) },
          { clave: draft.dinamicos[1].clave, valor: Number(draft.dinamicos[1].valor) },
          { clave: draft.dinamicos[2].clave, valor: Boolean(draft.dinamicos[2].valor) }
        ],
        opcionales: (draft.opcionales || []).map(o => ({ clave: o.clave, valor: o.valor })),
        actualizadoEn: new Date().toISOString()
      };




      await updateDoc(ref, {
        estado: 'atendido',
        resenia,
        diagnostico,
        historia: historiaPayload
      });

      this.finalizingTurnoId = null;
      delete this.historiaDraftMap[turno.id];
      delete this.finalReseniaMap[turno.id];
      delete this.finalDiagnosticoMap[turno.id];

      await this.cargarTurnos();
    } catch (err) {
      console.error('confirmFinalizarTurno error', err);
      this.error = 'No se pudo finalizar el turno';
    }
  }

}
