import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, collectionData, query, where, addDoc } from '@angular/fire/firestore';
import { doc, updateDoc, arrayUnion, getDocs } from 'firebase/firestore';
import { firstValueFrom, Observable } from 'rxjs';
import { generarTurnosDesdeRango, hhmmAminutos } from '../../utils/horario.utils';
import { Navbar } from "../../componentes/navbar/navbar";
import { LoadingComponent } from "../../componentes/loading/loading";

/* Tipos para los documentos de Firestore */
interface UsuarioDoc {
  id?: string;
  nombre?: string;
  apellido?: string;
  tipo?: string;
  imagenPerfil?: string;
  especialidades?: string[];
  disponibilidad?: Record<string, { from: string; to: string }[]>;
  duracionTurno?: number;
  aprobadoPorAdmin?: boolean;
  turnos?: string[];
}

interface EspecialidadDoc {
  id?: string;
  nombre?: string;
  imagen?: string;
}

/* Interfaz que usa el componente */
interface EspecialistaListado {
  id: string;
  nombre: string;
  apellido: string;
  imagenPerfil?: string | null;
  especialidades?: string[]; // permanecen como strings
  disponibilidad?: Record<string, { from: string; to: string }[]>;
  duracionTurno?: number;
  aprobadoPorAdmin?: boolean;
  turnos?: string[];
}

@Component({
  selector: 'app-solicitar-turno',
  standalone: true,
  templateUrl: './solicitar-turno.html',
  styleUrls: ['./solicitar-turno.scss'],
  imports: [Navbar, CommonModule, LoadingComponent, FormsModule]
})
export class SolicitarTurno implements OnInit {
  adminVioEspecialistas = false;
  isAdmin = false;
  pacientesLista: { id: string; nombre: string; apellido: string; imagenPerfil?: string | null }[] = [];
  pacienteSeleccionadoId: string | null = null;
  pacienteSeleccionadoNombre = '';

  especialistas: EspecialistaListado[] = [];
  horaSeleccionada: string | null = null;
  cargandoEspecialistas = false;

  seleccionado: EspecialistaListado | null = null;
  defaultAvatar = '/assets/default-avatar.png';
  defaultEspecialidadImg = '/assets/especialidades/especialidad-default.png';

  // selección de flujo
  seleccionadasEspecialidadesDisponibles: string[] = [];
  especialidadSeleccionada: string | null = null;

  diasDisponibles: { date: string; dateObj: Date; rangos: { from: string; to: string }[] }[] = [];
  diaSeleccionado: { date: string; dateObj: Date; rangos: { from: string; to: string }[] } | null = null;
  horariosDisponiblesDia: string[] = [];

  reservando = false;

  constructor(private firestore: Firestore, private auth: Auth) { }

  async ngOnInit() {
    await this.cargarEspecialistas();
    await this.detectarRolYCargarPacientes();
  }

  private async detectarRolYCargarPacientes() {
    // simple: si el usuario tiene claim o uid específico => marcar admin
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;

    // ejemplo: comprobar rol leyendo doc usuarios/{uid}
    try {
      const { getDoc, doc } = await import('firebase/firestore');
      const ref = doc(this.firestore as any, 'usuarios', uid);
      const snap = await getDoc(ref as any);
      const data: any = snap.exists() ? snap.data() : {};
      this.isAdmin = data?.tipo === 'admin';

      if (this.isAdmin) {
        // cargar lista de pacientes para dropdown
        const col = collection(this.firestore, 'usuarios');
        const q = query(col, where('tipo', '==', 'paciente'));
        const obs: Observable<UsuarioDoc[]> = collectionData(q as any, { idField: 'id' }) as Observable<UsuarioDoc[]>;
        const lista = await firstValueFrom(obs);
        this.pacientesLista = lista.map(p => ({
          id: String(p.id || ''),
          nombre: String(p.nombre || ''),
          apellido: String(p.apellido || ''),
          imagenPerfil: (p as any).imagenPerfil ?? null // <-- añadido
        }));

      }
    } catch (err) {
      console.error('No se pudo determinar rol / cargar pacientes', err);
    }
  }

  onPacienteSeleccionado() {
    if (!this.pacienteSeleccionadoId) {
      this.pacienteSeleccionadoNombre = '';
      return;
    }
    const p = this.pacientesLista.find(x => x.id === this.pacienteSeleccionadoId);
    this.pacienteSeleccionadoNombre = p ? `${p.nombre} ${p.apellido}` : '';
  }


  // Carga especialistas desde Firestore manteniendo especialidades como string[]
  async cargarEspecialistas() {
    this.cargandoEspecialistas = true;

    const col = collection(this.firestore, 'usuarios');
    const q = query(col, where('tipo', '==', 'especialista'));
    const obs: Observable<UsuarioDoc[]> = collectionData(q as any, { idField: 'id' }) as Observable<UsuarioDoc[]>;
    const lista = await firstValueFrom(obs);

    this.especialistas = lista
      .map(x => {
        const especialidades = Array.isArray(x.especialidades) ? x.especialidades : [];
        return {
          id: String(x.id || ''),
          nombre: String(x.nombre || ''),
          apellido: String(x.apellido || ''),
          imagenPerfil: x.imagenPerfil ?? null,
          especialidades,
          disponibilidad: x.disponibilidad ?? {},
          duracionTurno: typeof x.duracionTurno === 'number' ? x.duracionTurno : 30,
          aprobadoPorAdmin: typeof x.aprobadoPorAdmin === 'boolean' ? x.aprobadoPorAdmin : true,
          turnos: Array.isArray(x.turnos) ? x.turnos : []
        } as EspecialistaListado;
      })
      .filter(e => e.aprobadoPorAdmin !== false);

    this.cargandoEspecialistas = false;
  }

  seleccionarPaciente(p: { id: string; nombre: string; apellido: string; imagenPerfil?: string | null }) {
  // marcar que el admin ya vio/solicitó ver especialistas
  this.adminVioEspecialistas = true;

  // si clickeás el mismo paciente, no hacemos nada (no deselecciona)
  if (this.pacienteSeleccionadoId === p.id) {
    return;
  }

  // seleccionar un paciente nuevo: limpiamos escalones inferiores para consistencia
  this.pacienteSeleccionadoId = p.id;
  this.pacienteSeleccionadoNombre = `${p.nombre} ${p.apellido}`;

  this.seleccionado = null;
  this.especialidadSeleccionada = null;
  this.diaSeleccionado = null;
  this.horariosDisponiblesDia = [];
  this.horaSeleccionada = null;
}



  // Selecciona especialista y expone su array de especialidades (strings)
  seleccionarEspecialista(e: EspecialistaListado) {
    this.seleccionado = e;
    this.especialidadSeleccionada = null;
    this.diaSeleccionado = null;
    this.horariosDisponiblesDia = [];
    this.seleccionadasEspecialidadesDisponibles = e.especialidades || [];
    // limpiar hora previa
    this.horaSeleccionada = null;
  }

  seleccionarEspecialidad(nombre: string) {
    this.especialidadSeleccionada = nombre;
    this.diaSeleccionado = null;
    this.horariosDisponiblesDia = [];
    this.horaSeleccionada = null; // limpiar hora al cambiar especialidad
    this.calcularDiasDisponibles();
  }

  seleccionarHora(h: string) {
    this.horaSeleccionada = h;
  }

  calcularDiasDisponibles() {
    this.diasDisponibles = [];
    if (!this.seleccionado || !this.especialidadSeleccionada) return;
    const hoy = new Date();
    const dias: Date[] = [];
    for (let i = 0; i < 15; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
      dias.push(d);
    }

    const dispo = this.seleccionado.disponibilidad || {};
    const duracion = this.seleccionado.duracionTurno || 30;

    dias.forEach(d => {
      const diaClave = this.mapDateToDiaClave(d);
      const rangos = (dispo as Record<string, any[]>)[diaClave] || [];
      const rangosValidos = rangos.filter((r: any) => {
        if (!r || typeof r.from !== 'string' || typeof r.to !== 'string') return false;
        const fromMin = hhmmAminutos(r.from);
        const toMin = hhmmAminutos(r.to);
        return toMin - fromMin >= duracion;
      });
      if (rangosValidos.length) {
        this.diasDisponibles.push({
          date: this.dateToISO(d),
          dateObj: d,
          rangos: rangosValidos.map(r => ({ from: r.from, to: r.to }))
        });
      }
    });
  }

  seleccionarDia(d: { date: string; dateObj: Date; rangos: any[] }) {
    this.diaSeleccionado = d;
    this.horariosDisponiblesDia = [];
    this.horaSeleccionada = null; // limpiar hora al cambiar día
    this.calcularHorariosDisponiblesParaDia();
  }

  // reemplazar calcularHorariosDisponiblesParaDia existente por esto
  async calcularHorariosDisponiblesParaDia() {
    if (!this.diaSeleccionado || !this.seleccionado) return;
    const duracion = this.seleccionado.duracionTurno || 30;
    const turnosGenerados: string[] = [];

    // 1) generar slots desde rangos
    this.diaSeleccionado.rangos.forEach((r: { from: string; to: string }) => {
      const franjas = generarTurnosDesdeRango({ from: r.from, to: r.to }, duracion);
      franjas.forEach(f => turnosGenerados.push(f.from));
    });

    // normalizamos fecha del día actual
    const fechaDia = this.diaSeleccionado.dateObj;

    // 2) obtener turnos del especialista y marcar ocupados por fechaHora exacta (start ms)
    const turnosOcupadosFechas = new Set<number>();
    if (this.seleccionado.turnos?.length) {
      try {
        const turnosDocs = await this.getTurnosDeEspecialista(this.seleccionado.turnos);
        turnosDocs.forEach((td: any) => {
          if (!td || !td.fechaHora) return;
          const fechaHoraDate: Date = (td.fechaHora?.toDate) ? td.fechaHora.toDate() : new Date(td.fechaHora);
          // solo considerar turnos del mismo día
          if (fechaHoraDate.getFullYear() === fechaDia.getFullYear() &&
            fechaHoraDate.getMonth() === fechaDia.getMonth() &&
            fechaHoraDate.getDate() === fechaDia.getDate()) {
            // añadimos el start en ms
            turnosOcupadosFechas.add(fechaHoraDate.getTime());
          }
        });
      } catch (err) {
        console.error('Error obteniendo turnos del especialista para filtrar horarios:', err);
      }
    }

    // 3) obtener turnos del paciente (si está logueado) y construir lista de intervalos ocupados
    const pacienteIntervals: Array<{ start: number; end: number }> = [];
    const uidPaciente = this.isAdmin && this.pacienteSeleccionadoId ? this.pacienteSeleccionadoId : this.auth.currentUser?.uid;
    if (uidPaciente) {
      try {
        const pacienteDocRef = doc(this.firestore as any, 'usuarios', uidPaciente);
        const { getDoc } = await import('firebase/firestore');
        const snapPaciente = await getDoc(pacienteDocRef as any);
        const pacienteData: any = snapPaciente.exists() ? snapPaciente.data() : {};
        const pacienteTurnosIds: string[] = Array.isArray(pacienteData?.turnos) ? pacienteData.turnos : [];

        if (pacienteTurnosIds.length) {
          const turnosPacienteDocs = await this.getTurnosDePaciente(pacienteTurnosIds);
          turnosPacienteDocs.forEach((t: any) => {
            if (!t || !t.fechaHora) return;
            if (t.estado === 'cancelado') return;
            const fechaT = this.normalizeFecha(t.fechaHora);
            if (!fechaT) return;
            // si el turno del paciente no es del mismo día, igual puede solapar si la fecha coincide - consideramos solo turnos que afecten la misma fecha
            // aquí consideramos solapamiento absoluto en datetime
            const startExist = fechaT.getTime();
            const durExist = typeof t.duracion === 'number' ? t.duracion : (t.duracionMin ?? 30);
            const endExist = startExist + durExist * 60_000;
            pacienteIntervals.push({ start: startExist, end: endExist });
          });
        }
      } catch (err) {
        console.error('Error obteniendo turnos del paciente para filtrar horarios:', err);
      }
    }

    // 4) filtrar los turnosGenerados:
    // - quitar los que coinciden exactamente con un turno del especialista (turnosOcupadosFechas)
    // - quitar los que se solapan con cualquiera de los intervals del paciente
    const horariosDisponibles: string[] = turnosGenerados.filter(horaStr => {
      const [hh, mm] = horaStr.split(':').map(x => parseInt(x, 10));
      const dt = new Date(fechaDia.getFullYear(), fechaDia.getMonth(), fechaDia.getDate(), hh, mm);
      const startMs = dt.getTime();
      const endMs = startMs + duracion * 60_000;

      // si especialista ya tiene turno exacto en ese start -> excluir
      if (turnosOcupadosFechas.has(startMs)) return false;

      // si paciente tiene algún intervalo que se solape -> excluir
      for (const iv of pacienteIntervals) {
        if (this.intervalsOverlap(startMs, endMs, iv.start, iv.end)) return false;
      }

      return true;
    });

    this.horariosDisponiblesDia = Array.from(new Set(horariosDisponibles)).sort((a, b) => hhmmAminutos(a) - hhmmAminutos(b));
  }


  // crear turno en Firestore (ejemplo, id_paciente reemplazar en integración real)
  async confirmarTurno(hora: string) {
    if (!this.seleccionado || !this.diaSeleccionado || !this.especialidadSeleccionada || !hora) return;

    // UID del paciente actual
    const uidPaciente = this.pacienteSeleccionadoId ?? this.auth.currentUser?.uid;
    if (!uidPaciente) {
      alert('No se pudo identificar al paciente. Iniciá sesión o seleccioná un paciente (administrador).');
      return;
    }

    // referencias reutilizables
    const pacienteDocRef = doc(this.firestore as any, 'usuarios', uidPaciente);
    const especialistaDocRef = doc(this.firestore as any, 'usuarios', this.seleccionado.id);

    // Preparar fechaHora y duración (minutos)
    const fecha = this.diaSeleccionado.dateObj;
    const [hh, mm] = hora.split(':').map(x => parseInt(x, 10));
    const fechaHora = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hh, mm);
    const duracionMin = this.seleccionado?.duracionTurno ?? 30;
    const startNew = fechaHora.getTime();
    const endNew = startNew + duracionMin * 60_000;

    // 1) comprobar si el especialista ya tiene un turno en esa fecha/hora
    try {
      const turnosCol = collection(this.firestore, 'turnos');
      const q = query(
        turnosCol,
        where('id_especialista', '==', this.seleccionado.id),
        where('fechaHora', '==', fechaHora)
      );
      const existentesSnap = await getDocs(q as any);
      const ocupados = existentesSnap.docs.some(d => {
        const data = d.data() as any;
        return data.estado !== 'cancelado';
      });
      if (ocupados) {
        alert('Ese horario ya está reservado para el especialista. Elegí otro horario.');
        this.horaSeleccionada = null;
        return;
      }
    } catch (err) {
      console.error('Error comprobando turnos existentes del especialista', err);
      alert('No se pudo comprobar disponibilidad del especialista. Intentá de nuevo en un momento.');
      return;
    }

    // 2) comprobar solapamiento con los turnos del paciente actual
    try {
      const { getDoc } = await import('firebase/firestore');
      const snapPaciente = await getDoc(pacienteDocRef as any);
      const pacienteData: any = snapPaciente.exists() ? snapPaciente.data() : {};
      const pacienteTurnosIds: string[] = Array.isArray(pacienteData?.turnos) ? pacienteData.turnos : [];

      if (pacienteTurnosIds.length) {
        const turnosPacienteDocs = await this.getTurnosDePaciente(pacienteTurnosIds);

        const overlapFound = turnosPacienteDocs.some((t: any) => {
          if (!t || !t.fechaHora) return false;
          const fechaExist = this.normalizeFecha(t.fechaHora);
          if (!fechaExist) return false;
          const startExist = fechaExist.getTime();
          const durExist = typeof t.duracion === 'number'
            ? t.duracion
            : (t.duracionMin ?? (this.seleccionado?.duracionTurno ?? 30));
          const endExist = startExist + durExist * 60_000;
          // ignorar turnos cancelados
          if (t.estado === 'cancelado') return false;
          return this.intervalsOverlap(startNew, endNew, startExist, endExist);
        });

        if (overlapFound) {
          alert('Tenés un turno que se superpone con este horario. No podés sacar dos turnos solapados.');
          this.horaSeleccionada = null;
          return;
        }
      }
    } catch (err) {
      console.error('Error comprobando turnos del paciente', err);
      alert('No se pudo comprobar tus turnos. Intentá de nuevo en un momento.');
      return;
    }

    // 3) crear turno con campo duracion y guardar referencias
    this.reservando = true;
    try {
      const turnoDoc: any = {
        id_paciente: uidPaciente,
        id_especialista: this.seleccionado.id,
        especialidad: this.especialidadSeleccionada,
        fechaHora,
        duracion: duracionMin, // duración en minutos
        comentario: null,
        resenia: null,
        encuestaCompletada: false,
        estado: 'pendiente',
        canceladoPor: null,
        comentarioCancelacion: null,
        comentarioRechazo: null,
        createdAt: new Date()
      };

      const turnosColRef = collection(this.firestore, 'turnos');
      const docRef = await addDoc(turnosColRef as any, turnoDoc);

      // actualizar arrays turnos en usuario y especialista
      await updateDoc(pacienteDocRef, { turnos: arrayUnion(docRef.id) } as any);
      await updateDoc(especialistaDocRef, { turnos: arrayUnion(docRef.id) } as any);

      this.reservando = false;
      alert('Turno solicitado correctamente');

      // resetear selección al completar
      this.seleccionado = null;
      this.especialidadSeleccionada = null;
      this.diaSeleccionado = null;
      this.horariosDisponiblesDia = [];
      this.horaSeleccionada = null;
    } catch (err) {
      console.error('Error creando turno', err);
      this.reservando = false;
      alert('Error al solicitar turno');
    }
  }


  // Asigna ruta según nombre exacto; devuelve default si no coincide
  obtenerImagenEspecialidad(nombre: string | null | undefined): string {
    if (!nombre) return this.defaultEspecialidadImg;

    switch (nombre) {
      case 'Cardiología':
        return '/assets/especialidades/cardiologia.png';
      case 'Clínico':
        return '/assets/especialidades/clinico.png';
      case 'Dermatología':
        return '/assets/especialidades/dermatologia.png';
      case 'Otorrinolaringología':
        return '/assets/especialidades/otorrinolaringologia.png';
      case 'Pediatría':
        return '/assets/especialidades/pediatria.png';
      case 'Traumatología':
        return '/assets/especialidades/traumatologia.png';
      default:
        return this.defaultEspecialidadImg;
    }
  }

  mapDateToDiaClave(d: Date): string {
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return dias[d.getDay()];
  }

  private async getTurnosDePaciente(turnosIds: string[]) {
    if (!turnosIds?.length) return [];
    const { getDoc, doc } = await import('firebase/firestore');
    const docs = await Promise.all(turnosIds.map(async id => {
      try {
        const ref = doc(this.firestore as any, 'turnos', id);
        const snap = await getDoc(ref as any);
        return snap.exists() ? snap.data() : null;
      } catch {
        return null;
      }
    }));
    return docs.filter(Boolean) as any[];
  }


  private async getTurnosDeEspecialista(turnosIds: string[]) {
    if (!turnosIds?.length) return [];

    const { getDoc, doc } = await import('firebase/firestore');

    const docs = await Promise.all(turnosIds.map(async id => {
      try {
        const ref = doc(this.firestore as any, 'turnos', id);
        const snap = await getDoc(ref as any);
        return snap.exists() ? snap.data() : null;
      } catch {
        return null;
      }
    }));

    return docs.filter(Boolean) as any[];
  }

  /** normaliza a Date desde Date | Firestore Timestamp | string | number */
  private normalizeFecha(fecha: any): Date | null {
    if (!fecha) return null;
    if (fecha instanceof Date) return fecha;
    if (typeof fecha === 'number') return new Date(fecha);
    if (typeof fecha === 'string') {
      const d = new Date(fecha);
      return isNaN(d.getTime()) ? null : d;
    }
    if (fecha.toDate && typeof fecha.toDate === 'function') return fecha.toDate();
    return null;
  }

  /** devuelve true si dos intervalos [startA, endA) y [startB, endB) se solapan */
  private intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
    return startA < endB && startB < endA;
  }


  dateToISO(d: Date) {
    return d.toISOString().slice(0, 10);
  }
}
