import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { Auth } from '@angular/fire/auth';
import { Firestore, doc, docData, collection, query, where, collectionData, updateDoc, limit } from '@angular/fire/firestore';
import { Navbar } from '../../componentes/navbar/navbar';

export type Turno = {
  id: string;
  especialidad?: string;
  estado?: string; // 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado' | 'atendido'
  fechaHora?: Date;
  fecha?: string;
  hora?: string;
  usuarios_paciente?: { nombre?: string; apellido?: string; id?: string; avatar?: string; dni?: string; obraSocial?: string };
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
  historia?: any;
  [k: string]: any;
  encuesta?: {
    pregunta1?: 'si' | 'no' | null;
    pregunta2?: 'si' | 'no' | null;
    calificacion?: number | null;
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

  // Acciones: Cancelar
  cancelingTurnoId: string | null = null;
  cancelMotivoMap: { [turnoId: string]: string } = {};

  // Acciones: Rechazar
  rejectingTurnoId: string | null = null;
  rejectMotivoMap: { [turnoId: string]: string } = {};

  // Acciones: Finalizar
  finalizingTurnoId: string | null = null;
  finalReseniaMap: { [turnoId: string]: string } = {};
  finalDiagnosticoMap: { [turnoId: string]: string } = {};

  // Visualización
  expandedResenaId: string | null = null;
  expandedCalificacionId: string | null = null;

  // Acciones: Encuesta
  surveyFillingTurnoId: string | null = null;
  encuestaDraftMap: { [turnoId: string]: { pregunta1?: string; pregunta2?: string } } = {};

  // Acciones: Calificación
  ratingTurnoId: string | null = null;
  ratingDraftMap: { [turnoId: string]: { comentario?: string; calificacion?: number } } = {};

  maxOptionalDinamicos = 3;

  // Edición de Historia Clínica (Draft)
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
  filteredTurnos: Turno[] = []; // Variable enlazada en el HTML

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
    // Cache simple para no leer mil veces la misma historia
    const historiaCache = (this as any).historiaCache ?? ((this as any).historiaCache = {});

    try {
      const user = this.auth.currentUser;
      if (!user) {
        this.error = 'Usuario no autenticado';
        this.loading = false;
        return;
      }
      const uid = user.uid;

      // Determinar rol
      const perfilRef = doc(this.firestore, `usuarios/${uid}`);
      const perfilSnap: any = await firstValueFrom(docData(perfilRef, { idField: 'id' }));
      const role = (perfilSnap?.tipo as 'paciente' | 'especialista' | undefined) || 'paciente';
      this.viewMode = role === 'especialista' ? 'especialista' : 'paciente';

      // Obtener turnos
      const ids: string[] = Array.isArray(perfilSnap?.turnos) ? perfilSnap.turnos : [];
      let lista: Turno[] = [];

      // Estrategia 1: Leer por lista de IDs en el usuario
      if (ids.length > 0) {
        const reads = ids.map(async (id) => {
          try {
            const tRef = doc(this.firestore, `turnos/${id}`);
            const raw: any = await firstValueFrom(docData(tRef, { idField: 'id' }));
            if (!raw) return null;
            return await this.enrichTurno(raw, uid, historiaCache);
          } catch { return null; }
        });
        lista = (await Promise.all(reads)).filter(Boolean) as Turno[];
      } 
      // Estrategia 2: Fallback query por colección
      else {
        const col = collection(this.firestore, 'turnos');
        const q = this.viewMode === 'especialista'
          ? query(col, where('id_especialista', '==', uid))
          : query(col, where('id_paciente', '==', uid));
        const rawList: any[] = await firstValueFrom(collectionData(q, { idField: 'id' }));
        const enrichedReads = rawList.map(raw => this.enrichTurno(raw, uid, historiaCache));
        lista = (await Promise.all(enrichedReads)).filter(Boolean) as Turno[];
      }

      // Ordenar y asignar
      lista.sort((a, b) => this.compareFecha(a, b));

      this.turnos = lista;
      this.turnosOriginales = [...lista];
      this.turnosFiltrados = [...lista];
      this.syncFiltered();

    } catch (err) {
      console.error('cargarTurnos error', err);
      this.error = 'No se pudieron cargar los turnos';
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  // Enriquece el turno con datos de usuario y la historia clínica
  private async enrichTurno(raw: any, uid: string, cache: any): Promise<Turno> {
    let turno = this.normalizeTurno({ id: raw.id, ...raw });

    // Cargar datos del OTRO usuario (para mostrar nombre y avatar)
    if (this.viewMode === 'paciente' && turno.id_especialista) {
      turno.usuarios_especialista = await this.getUserData(turno.id_especialista);
      turno.avatar = turno.usuarios_especialista?.avatar;
    } else if (this.viewMode === 'especialista' && turno.id_paciente) {
      turno.usuarios_paciente = await this.getUserData(turno.id_paciente);
      turno.avatar = turno.usuarios_paciente?.avatar;
    }

    // Cargar Historia Clínica
    const pid = turno.id_paciente;
    // 1. Si el turno ya tiene historia incrustada (nueva forma)
    if (raw.historia) {
        turno.historia = this.normalizeHistoria(raw.historia);
    } 
    // 2. Si no, buscar en colección historica (retrocompatibilidad)
    else if (pid) {
      if (cache[pid] === undefined) {
        try {
          const rawH = await this.fetchHistoriaPaciente(pid);
          cache[pid] = this.normalizeHistoria(rawH);
        } catch { cache[pid] = null; }
      }
      turno.historia = cache[pid];
    }

    return turno;
  }

  private async getUserData(uid: string) {
    try {
      const s: any = await firstValueFrom(docData(doc(this.firestore, `usuarios/${uid}`)));
      return {
        nombre: s?.nombre || '',
        apellido: s?.apellido || '',
        dni: s?.dni || '',
        obraSocial: s?.obraSocial || '',
        id: s?.uid,
        avatar: s?.imagenPerfil || this.defaultAvatar
      };
    } catch { return undefined; }
  }

  // --- FILTRADO ---
  
  filtrarTurnosComoPaciente(valor: string) {
    this.filtrarTurnosGeneral(valor);
  }

  filtrarTurnosComoEspecialista(valor: string) {
    this.filtrarTurnosGeneral(valor);
  }

  private filtrarTurnosGeneral(valor: string) {
    const texto = (valor || '').toLowerCase().trim();
    if (!texto) {
      this.turnosFiltrados = [...this.turnosOriginales];
    } else {
      this.turnosFiltrados = this.turnosOriginales.filter(t => this.matchesTurno(t, texto));
    }
    this.syncFiltered();
  }

  // *** LÓGICA DE BUSQUEDA AVANZADA ***
  private matchesTurno(turno: Turno, q: string): boolean {
    const includes = (text: any) => String(text || '').toLowerCase().includes(q);

    // 1. Campos básicos
    if (includes(turno.especialidad)) return true;
    
    // 2. Filtro por Persona (Cruzado)
    if (this.viewMode === 'paciente') {
        if (includes(turno.usuarios_especialista?.nombre)) return true;
        if (includes(turno.usuarios_especialista?.apellido)) return true;
        if (includes(`${turno.usuarios_especialista?.nombre} ${turno.usuarios_especialista?.apellido}`)) return true;
    } else {
        if (includes(turno.usuarios_paciente?.nombre)) return true;
        if (includes(turno.usuarios_paciente?.apellido)) return true;
        if (includes(`${turno.usuarios_paciente?.nombre} ${turno.usuarios_paciente?.apellido}`)) return true;
        // Extras para el especialista
        if (includes(turno.usuarios_paciente?.dni)) return true;
        if (includes(turno.usuarios_paciente?.obraSocial)) return true;
    }

    // 3. Historia Clínica (Fijos, Dinámicos, Opcionales)
    const h = turno.historia;
    if (h) {
      if (includes(h.altura)) return true;
      if (includes(h.peso)) return true;
      if (includes(h.temperatura)) return true;
      if (includes(h.presion)) return true;
      
      if (Array.isArray(h.dinamicos)) {
        for (const d of h.dinamicos) {
          if (includes(d.clave)) return true;
          if (includes(d.valor)) return true;
        }
      }
      if (Array.isArray(h.opcionales)) {
        for (const o of h.opcionales) {
          if (includes(o.clave)) return true;
          if (includes(o.valor)) return true;
        }
      }
    }

    // 4. Textos del turno
    if (includes(turno.diagnostico)) return true;
    if (includes(turno.resenia)) return true;
    if (includes(turno.comentario)) return true;
    if (includes(turno.fecha)) return true;
    if (includes(turno.hora)) return true;
    if (includes(turno.estado)) return true;

    return false;
  }

  obtenerValorInput(event: Event): string {
    return (event.target as HTMLInputElement).value || '';
  }

  limpiarFiltro(input: HTMLInputElement) {
    input.value = '';
    this.filtrarTurnosGeneral('');
  }

  private syncFiltered() {
    this.filteredTurnos = [...this.turnosFiltrados];
  }

  // --- NORMALIZADORES ---

  private normalizeTurno(raw: any): Turno {
    let fechaHoraDate: Date | undefined;
    if (raw.fechaHora?.toDate) fechaHoraDate = raw.fechaHora.toDate();
    else if (typeof raw.fechaHora === 'string') fechaHoraDate = new Date(raw.fechaHora);
    else if (raw.fechaHora?.seconds) fechaHoraDate = new Date(raw.fechaHora.seconds * 1000);

    const diaStr = fechaHoraDate ? fechaHoraDate.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    const horaStr = fechaHoraDate ? fechaHoraDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

    return {
      ...raw,
      id: raw.id,
      estado: (raw.estado || '').toLowerCase(),
      fechaHora: fechaHoraDate,
      fecha: diaStr,
      hora: horaStr,
      encuesta: raw.encuesta || (raw.encuestaCompletada ? { completada: true } : null)
    };
  }

  private compareFecha(a: Turno, b: Turno): number {
    const ta = a.fechaHora ? a.fechaHora.getTime() : 0;
    const tb = b.fechaHora ? b.fechaHora.getTime() : 0;
    return tb - ta; 
  }

  private async fetchHistoriaPaciente(pacienteUid: string): Promise<any | null> {
    try {
      const col = collection(this.firestore, 'historias_clinicas');
      const q = query(col, where('id_paciente', '==', pacienteUid), limit(1));
      const snap = await firstValueFrom(collectionData(q));
      return snap && snap.length ? snap[0] : null;
    } catch { return null; }
  }

  private normalizeHistoria(raw: any): any {
    if (!raw) return null;
    const normalizeDato = (d: any) => ({
      clave: String(d?.clave ?? d?.key ?? '').trim(),
      valor: d?.valor ?? d?.value ?? ''
    });
    const obj = Array.isArray(raw) ? raw[0] : raw;
    if (!obj) return null;
    
    return {
      ...obj,
      dinamicos: Array.isArray(obj.dinamicos) ? obj.dinamicos.map(normalizeDato) : [],
      opcionales: Array.isArray(obj.opcionales) ? obj.opcionales.map(normalizeDato) : []
    };
  }

  trackById(_: number, item: Turno) { return item.id; }

  // --- ACCIONES DEL TURNO (CANCELAR, RECHAZAR, FINALIZAR) ---

  // 1. Cancelar
  startCancelarTurno(t: Turno) { 
    this.rejectingTurnoId = null; 
    this.cancelingTurnoId = t.id; 
    this.cancelMotivoMap[t.id] = t.comentarioCancelacion ?? ''; 
  }
  abortCancelarTurno() { 
    this.cancelingTurnoId = null; 
  }
  async confirmCancelarTurno(turno: Turno) {
    const motivo = (this.cancelMotivoMap[turno.id] || '').trim();
    if (!motivo) return;
    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, { estado: 'cancelado', comentarioCancelacion: motivo, canceladoPor: this.viewMode });
      this.cancelingTurnoId = null;
      await this.cargarTurnos();
    } catch { this.error = 'Error al cancelar'; }
  }

  // 2. Rechazar
  startRechazarTurno(t: Turno) { 
    this.cancelingTurnoId = null; 
    this.rejectingTurnoId = t.id; 
    this.rejectMotivoMap[t.id] = t.comentarioRechazo ?? ''; 
  }
  abortRechazarTurno() { 
    this.rejectingTurnoId = null; 
  }
  async confirmRechazarTurno(turno: Turno) {
    const motivo = (this.rejectMotivoMap[turno.id] || '').trim();
    if (!motivo) return;
    try {
      const ref = doc(this.firestore, `turnos/${turno.id}`);
      await updateDoc(ref, { estado: 'rechazado', comentarioRechazo: motivo });
      this.rejectingTurnoId = null;
      await this.cargarTurnos();
    } catch { this.error = 'Error al rechazar'; }
  }

  // 3. Aceptar
  async aceptarTurno(turno: Turno) {
    try {
      await updateDoc(doc(this.firestore, `turnos/${turno.id}`), { estado: 'aceptado' });
      await this.cargarTurnos();
    } catch { this.error = 'Error al aceptar'; }
  }

  // 4. Finalizar (Con Historia Clínica Completa)
  startFinalizarTurno(t: Turno) { 
    this.cancelingTurnoId = null;
    this.rejectingTurnoId = null;
    this.finalizingTurnoId = t.id; 
    this.finalReseniaMap[t.id] = t.resenia ?? '';
    this.finalDiagnosticoMap[t.id] = t.diagnostico ?? '';

    // Pre-llenar con historia existente o vacía
    const existing = (t as any).historia ?? null;
    const dinamicos = Array.isArray(existing?.dinamicos) ? existing.dinamicos : [];
    
    this.historiaDraftMap[t.id] = {
      altura: existing?.altura ?? null,
      peso: existing?.peso ?? null,
      temperatura: existing?.temperatura ?? null,
      presion: existing?.presion ?? null,
      // Garantizar 3 fijos mínimos
      dinamicos: [
        dinamicos[0] ? { ...dinamicos[0], valor: this.normalizeRangeValue(dinamicos[0].valor) } : { clave: '', valor: 0 },
        dinamicos[1] ? { ...dinamicos[1], valor: Number(dinamicos[1].valor) || null } : { clave: '', valor: null },
        dinamicos[2] ? { ...dinamicos[2], valor: Boolean(dinamicos[2].valor) } : { clave: '', valor: false }
      ],
      opcionales: existing?.opcionales ? [...existing.opcionales] : []
    };
  }

  abortFinalizarTurno() { this.finalizingTurnoId = null; }

  async confirmFinalizarTurno(turno: Turno) {
    const resenia = (this.finalReseniaMap[turno.id] || '').trim();
    const diagnostico = (this.finalDiagnosticoMap[turno.id] || '').trim();
    const draft = this.historiaDraftMap[turno.id];

    if (!resenia || !diagnostico || !draft || !this.validarHistoriaDraft(turno.id)) {
      this.error = 'Completa todos los datos obligatorios'; return;
    }

    try {
      const historiaPayload = {
        altura: draft.altura, peso: draft.peso, temperatura: draft.temperatura, presion: draft.presion,
        dinamicos: draft.dinamicos.map(d => ({ clave: d.clave, valor: d.valor })),
        opcionales: draft.opcionales.map(o => ({ clave: o.clave, valor: o.valor })),
        actualizadoEn: new Date().toISOString()
      };

      await updateDoc(doc(this.firestore, `turnos/${turno.id}`), {
        estado: 'atendido', resenia, diagnostico, historia: historiaPayload
      });

      this.finalizingTurnoId = null;
      await this.cargarTurnos();
    } catch { this.error = 'Error al finalizar'; }
  }

  // 5. Encuesta y Calificación
  startEncuesta(t: Turno) { 
    this.surveyFillingTurnoId = t.id; 
    this.encuestaDraftMap[t.id] = { pregunta1: '', pregunta2: '' };
  }
  abortEncuesta() { this.surveyFillingTurnoId = null; }
  async confirmEncuesta(t: Turno) {
    const draft = this.encuestaDraftMap[t.id];
    if (!draft?.pregunta1 || !draft?.pregunta2) return;
    try {
      await updateDoc(doc(this.firestore, `turnos/${t.id}`), { 
        encuesta: { ...draft, completada: true }, encuestaCompletada: true 
      });
      this.surveyFillingTurnoId = null;
      await this.cargarTurnos();
    } catch { this.error = 'Error al guardar encuesta'; }
  }

  startRating(t: Turno) { 
    this.ratingTurnoId = t.id; 
    this.ratingDraftMap[t.id] = { comentario: '', calificacion: 5 };
  }
  abortRating() { this.ratingTurnoId = null; }
  async confirmRating(t: Turno) {
    const draft = this.ratingDraftMap[t.id];
    if (!draft?.comentario) return;
    try {
      await updateDoc(doc(this.firestore, `turnos/${t.id}`), { 
        comentario: draft.comentario, 
        'encuesta.calificacion': draft.calificacion,
        encuestaCompletada: true 
      });
      this.ratingTurnoId = null;
      await this.cargarTurnos();
    } catch { this.error = 'Error al calificar'; }
  }

  // Toggles visuales
  toggleResena(t: Turno) { this.expandedResenaId = this.expandedResenaId === t.id ? null : t.id; }
  toggleCalificacion(t: Turno) { this.expandedCalificacionId = this.expandedCalificacionId === t.id ? null : t.id; }
  
  // Helpers Dinámicos
  addDinamico(id: string) { /* ... logica interna de draft ... */ } 
  addOptionalDinamico(id: string) {
    const draft = this.historiaDraftMap[id];
    if (draft && draft.opcionales.length < this.maxOptionalDinamicos) {
        draft.opcionales.push({ clave: '', valor: '' });
    }
  }
  removeOptionalDinamico(id: string, i: number) {
    this.historiaDraftMap[id]?.opcionales.splice(i, 1);
  }
  normalizeRangeValue(v: any) { return Math.min(100, Math.max(0, Number(v) || 0)); }
  onRangeChange(id: string, i: number) {}
  onRangeNumberInput(e: any, id: string, i: number) {
     this.historiaDraftMap[id].dinamicos[i].valor = this.normalizeRangeValue(e.target.value);
  }
  onlyNumberKey(event: any) { /* ... */ }
  
  validarHistoriaDraft(id: string): boolean {
    const d = this.historiaDraftMap[id];
    if (!d) return false;
    // Al menos un fijo y dinámicos con clave
    const fixed = d.altura || d.peso || d.temperatura || d.presion;
    const dyn = d.dinamicos.every(x => x.clave && x.valor !== null);
    return !!fixed && dyn;
  }
}