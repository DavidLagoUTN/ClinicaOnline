import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  collectionData,
  doc,
  docData,
  setDoc,
  limit
} from '@angular/fire/firestore';
import { Navbar } from '../../componentes/navbar/navbar';
import { LoadingComponent } from '../../componentes/loading/loading';

type PatientRow = {
  uid: string;
  nombre?: string;
  apellido?: string;
  dni?: string;
  mail?: string;
  edad?: number | null;
  obraSocial?: string | null;
  imagenPerfil?: string;
  imagenPerfilExtra?: string;
  turnosAtendidos: number;
  ultimosTurnos: { fecha: string; hora: string; especialidad?: string }[];
};

type HistoriaClinica = {
  altura?: number | null;
  peso?: number | null;
  temperatura?: string | null;
  presion?: string | null;
  dinamicos?: { clave: string; valor: string }[];
  creadoPor?: string;
  actualizadoEn?: any;
};

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule, Navbar, LoadingComponent],
  templateUrl: './pacientes.html',
  styleUrls: ['./pacientes.scss']
})
export class Pacientes implements OnInit {
  loading = false;
  error: string | null = null;

  defaultAvatar = '/assets/default-avatar.png';

  patients: PatientRow[] = [];
  filteredPatients: PatientRow[] = [];

  // mapas para historias y estados
  historiasMap: { [uid: string]: HistoriaClinica | null } = {};
  loadingHistoriaMap: { [uid: string]: boolean } = {};

  // toggles / edición
  expandedPacienteUid: string | null = null;
  editingHistoriaUid: string | null = null;
  historiaDraft: HistoriaClinica & { dinamicos: { clave: string; valor: string }[] } = {
    altura: null,
    peso: null,
    temperatura: null,
    presion: null,
    dinamicos: []
  };

  // servicios
  private auth: Auth;
  private firestore: Firestore;
  private cd: ChangeDetectorRef;

  constructor(auth: Auth, firestore: Firestore, cd: ChangeDetectorRef) {
    this.auth = auth;
    this.firestore = firestore;
    this.cd = cd;
  }

  async ngOnInit(): Promise<void> {
    await this.loadPacientesAtendidos();
  }

  private toLocaleDateString(fecha?: Date): string | undefined {
    if (!fecha) return undefined;
    return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  private toLocaleTimeString(fecha?: Date): string | undefined {
    if (!fecha) return undefined;
    return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  async loadPacientesAtendidos(): Promise<void> {
    this.loading = true;
    this.patients = [];
    this.filteredPatients = [];
    this.historiasMap = {};
    this.loadingHistoriaMap = {};

    try {
      const user = this.auth.currentUser;
      if (!user?.uid) {
        this.loading = false;
        return;
      }
      const especialistaUid = user.uid;

      // obtener todos los turnos atendidos por este especialista
      const col = collection(this.firestore, 'turnos');
      const q = query(col, where('id_especialista', '==', especialistaUid), where('estado', '==', 'atendido'));
      const rawTurnos: any[] = await firstValueFrom(collectionData(q, { idField: 'id' }));

      if (!rawTurnos || rawTurnos.length === 0) {
        this.loading = false;
        return;
      }

      // agrupar por paciente y recolectar últimos turnos
      const map = new Map<string, { count: number; turnos: any[] }>();

      for (const rt of rawTurnos) {
        const pid = rt.id_paciente;
        if (!pid) continue;

        // determinar fecha
        let fechaObj: Date | undefined;
        if (rt.fechaHora?.toDate && typeof rt.fechaHora.toDate === 'function') {
          fechaObj = rt.fechaHora.toDate();
        } else if (typeof rt.fechaHora === 'object' && typeof rt.fechaHora.seconds === 'number') {
          fechaObj = new Date(rt.fechaHora.seconds * 1000);
        } else if (rt.fechaHora instanceof Date) {
          fechaObj = rt.fechaHora;
        } else if (typeof rt.fechaHora === 'string') {
          const parsed = new Date(rt.fechaHora);
          if (!isNaN(parsed.getTime())) fechaObj = parsed;
        }

        const entry = map.get(pid) || { count: 0, turnos: [] };
        entry.count += 1;
        entry.turnos.push({
          fechaObj,
          especialidad: rt.especialidad,
          fechaStr: fechaObj ? this.toLocaleDateString(fechaObj) : (rt.fecha || ''),
          horaStr: fechaObj ? this.toLocaleTimeString(fechaObj) : (rt.hora || '')
        });
        map.set(pid, entry);
      }

      // para cada paciente, obtener perfil y construir fila
      const rows: PatientRow[] = [];
      const pacienteIds = Array.from(map.keys());

      const reads = pacienteIds.map(async (pid) => {
        try {
          const uRef = doc(this.firestore, `usuarios/${pid}`);
          const uSnap: any = await firstValueFrom(docData(uRef, { idField: 'uid' }));
          const meta = map.get(pid)!;

          // ordenar turnos por fecha descendente y tomar últimos 3
          meta.turnos.sort((a: any, b: any) => {
            const ta = a.fechaObj ? a.fechaObj.getTime() : 0;
            const tb = b.fechaObj ? b.fechaObj.getTime() : 0;
            return tb - ta;
          });
          const ultimos = meta.turnos.slice(0, 3).map((t: any) => ({ fecha: t.fechaStr, hora: t.horaStr, especialidad: t.especialidad }));

          rows.push({
            uid: pid,
            nombre: uSnap?.nombre || '—',
            apellido: uSnap?.apellido || '—',
            dni: uSnap?.dni || '',
            mail: uSnap?.mail || uSnap?.email || '',
            edad: uSnap?.edad ?? null,
            obraSocial: uSnap?.obraSocial || uSnap?.obra_social || null,
            imagenPerfil: uSnap?.imagenPerfil || '',
            imagenPerfilExtra: uSnap?.imagenPerfilExtra || '',
            turnosAtendidos: meta.count,
            ultimosTurnos: ultimos
          });
        } catch (e) {
          const meta = map.get(pid)!;
          rows.push({
            uid: pid,
            nombre: '—',
            apellido: '—',
            dni: '',
            mail: '',
            edad: null,
            obraSocial: null,
            imagenPerfil: '',
            imagenPerfilExtra: '',
            turnosAtendidos: meta.count,
            ultimosTurnos: meta.turnos.slice(0, 3).map((t: any) => ({ fecha: t.fechaStr, hora: t.horaStr, especialidad: t.especialidad }))
          });
        }
      });

      await Promise.all(reads);

      // ordenar por última atención descendente
      rows.sort((a, b) => {
        const ta = a.ultimosTurnos && a.ultimosTurnos[0] ? new Date(a.ultimosTurnos[0].fecha + ' ' + a.ultimosTurnos[0].hora).getTime() : 0;
        const tb = b.ultimosTurnos && b.ultimosTurnos[0] ? new Date(b.ultimosTurnos[0].fecha + ' ' + b.ultimosTurnos[0].hora).getTime() : 0;
        return tb - ta;
      });

      this.patients = rows;
      this.filteredPatients = [...rows];
    } catch (err) {
      console.error('loadPacientesAtendidos error', err);
      this.error = 'No se pudieron cargar los pacientes';
      this.patients = [];
      this.filteredPatients = [];
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  filtrarPacientes(valor: string) {
    const texto = (valor || '').toLowerCase().trim();
    if (!texto) {
      this.filteredPatients = [...this.patients];
      return;
    }

    this.filteredPatients = this.patients.filter(p => {
      const nombre = (p.nombre || '').toLowerCase();
      const apellido = (p.apellido || '').toLowerCase();
      const dni = (p.dni || '').toLowerCase();
      const obra = (p.obraSocial || '').toLowerCase();
      return nombre.includes(texto) || apellido.includes(texto) || dni.includes(texto) || obra.includes(texto);
    });
  }

  obtenerValorInput(event: Event): string {
    return (event.target as HTMLInputElement).value || '';
  }

  limpiarFiltro(input: HTMLInputElement) {
    input.value = '';
    this.filtrarPacientes('');
  }

  trackByUid(_: number, item: PatientRow) {
    return item?.uid || _;
  }

  // Toggle paciente: al expandir, cargar historia si no está en cache
  async togglePaciente(p: PatientRow) {
    if (this.expandedPacienteUid === p.uid) {
      this.expandedPacienteUid = null;
      this.editingHistoriaUid = null;
      return;
    }

    this.expandedPacienteUid = p.uid;
    // cargar historia si no existe en cache
    if (this.historiasMap[p.uid] === undefined) {
      await this.loadHistoria(p.uid);
    }
  }

  private historiaDocId(pacienteUid: string, especialistaUid: string) {
    // identificador por paciente+especialista para que cada especialista tenga su propia historia si se desea
    return `${pacienteUid}_${especialistaUid}`;
  }

  async loadHistoria(pacienteUid: string) {
    this.loadingHistoriaMap[pacienteUid] = true;
    try {
      const user = this.auth.currentUser;
      if (!user?.uid) {
        console.log('loadHistoria: usuario no autenticado');
        this.historiasMap[pacienteUid] = null;
        this.loadingHistoriaMap[pacienteUid] = false;
        return;
      }
      const especialistaUid = user.uid;
      const docIdComposite = this.historiaDocId(pacienteUid, especialistaUid);
      console.log('loadHistoria: buscando historia con docId composite:', docIdComposite);

      // 1) Intento directo por docId composite (paciente_especialista)
      try {
        const hRef = doc(this.firestore, `historias_clinicas/${docIdComposite}`);
        const snap: any = await firstValueFrom(docData(hRef, { idField: 'id' })).catch(() => null);
        console.log('loadHistoria: resultado doc composite:', snap);
        if (snap) {
          this.historiasMap[pacienteUid] = {
            altura: snap.altura ?? null,
            peso: snap.peso ?? null,
            temperatura: snap.temperatura ?? null,
            presion: snap.presion ?? null,
            dinamicos: snap.dinamicos ?? []
          };
          return;
        }
      } catch (err) {
        console.warn('loadHistoria: error leyendo doc composite', err);
      }

      // 2) Intento por docId igual al pacienteUid (si guardaron así)
      try {
        const hRef2 = doc(this.firestore, `historias_clinicas/${pacienteUid}`);
        const snap2: any = await firstValueFrom(docData(hRef2, { idField: 'id' })).catch(() => null);
        console.log('loadHistoria: resultado doc pacienteUid:', snap2);
        if (snap2) {
          this.historiasMap[pacienteUid] = {
            altura: snap2.altura ?? null,
            peso: snap2.peso ?? null,
            temperatura: snap2.temperatura ?? null,
            presion: snap2.presion ?? null,
            dinamicos: snap2.dinamicos ?? []
          };
          return;
        }
      } catch (err) {
        console.warn('loadHistoria: error leyendo doc pacienteUid', err);
      }

      // 3) Intento query por campo id_paciente (si guardaron id_paciente dentro del doc)
      try {
        console.log('loadHistoria: consultando collection where id_paciente ==', pacienteUid);
        const col = collection(this.firestore, 'historias_clinicas');
        const q = query(col, where('id_paciente', '==', pacienteUid));
        const list: any[] = await firstValueFrom(collectionData(q, { idField: 'id' })).catch(() => []);
        console.log('loadHistoria: resultados query id_paciente:', list);
        if (list && list.length > 0) {
          // si hay varios, preferir el que tenga creadoPor === especialistaUid o el primero
          const preferido = list.find((x: any) => x.creadoPor === especialistaUid) || list[0];
          this.historiasMap[pacienteUid] = {
            altura: preferido.altura ?? null,
            peso: preferido.peso ?? null,
            temperatura: preferido.temperatura ?? null,
            presion: preferido.presion ?? null,
            dinamicos: preferido.dinamicos ?? []
          };
          return;
        }
      } catch (err) {
        console.warn('loadHistoria: error en query id_paciente', err);
      }

      // 4) Último recurso: listar todos y filtrar por pacienteUid en campos comunes
      try {
        console.log('loadHistoria: fallback - listando primeros 200 docs de historias_clinicas para buscar coincidencias');
        const colAll = collection(this.firestore, 'historias_clinicas');
        const qAll = query(colAll, limit(200));
        const all: any[] = await firstValueFrom(collectionData(qAll, { idField: 'id' })).catch(() => []);
        console.log('loadHistoria: cantidad docs leidos en fallback:', all.length);
        const found = all.find((x: any) => x.id_paciente === pacienteUid || x.pacienteUid === pacienteUid || x.paciente === pacienteUid);
        console.log('loadHistoria: encontrado en fallback:', found);
        if (found) {
          this.historiasMap[pacienteUid] = {
            altura: found.altura ?? null,
            peso: found.peso ?? null,
            temperatura: found.temperatura ?? null,
            presion: found.presion ?? null,
            dinamicos: found.dinamicos ?? []
          };
          return;
        }
      } catch (err) {
        console.warn('loadHistoria: error en fallback list', err);
      }

      // si llegamos acá, no hay historia
      console.log('loadHistoria: no se encontró historia para paciente', pacienteUid);
      this.historiasMap[pacienteUid] = null;
    } catch (err) {
      console.error('loadHistoria error', err);
      this.historiasMap[pacienteUid] = null;
    } finally {
      this.loadingHistoriaMap[pacienteUid] = false;
      this.cd.detectChanges();
    }
  }


  iniciarCrearHistoria(p: PatientRow) {
    this.editingHistoriaUid = p.uid;
    this.historiaDraft = {
      altura: null,
      peso: null,
      temperatura: null,
      presion: null,
      dinamicos: []
    };
  }

  editarHistoria(p: PatientRow) {
    this.editingHistoriaUid = p.uid;
    const existing = this.historiasMap[p.uid] || { altura: null, peso: null, temperatura: null, presion: null, dinamicos: [] };
    this.historiaDraft = {
      altura: existing.altura ?? null,
      peso: existing.peso ?? null,
      temperatura: existing.temperatura ?? null,
      presion: existing.presion ?? null,
      dinamicos: (existing.dinamicos || []).slice(0, 3)
    };
  }

  cancelarEdicionHistoria() {
    this.editingHistoriaUid = null;
    this.historiaDraft = { altura: null, peso: null, temperatura: null, presion: null, dinamicos: [] };
  }

  addDinamico() {
    if (this.historiaDraft.dinamicos.length >= 3) return;
    this.historiaDraft.dinamicos.push({ clave: '', valor: '' });
  }

  removeDinamico(index: number) {
    this.historiaDraft.dinamicos.splice(index, 1);
  }

  validarHistoriaDraft(): boolean {
    // validar campos fijos (pueden ser opcionales, pero pedimos al menos uno no nulo)
    const anyFixed = this.historiaDraft.altura !== null || this.historiaDraft.peso !== null || (this.historiaDraft.temperatura || '').toString().trim() !== '' || (this.historiaDraft.presion || '').toString().trim() !== '';
    // validar dinamicos: claves no vacías si existen
    const dinamicosValidos = this.historiaDraft.dinamicos.every(d => (d.clave || '').toString().trim() !== '' && (d.valor || '').toString().trim() !== '');
    return anyFixed && dinamicosValidos;
  }

  async guardarHistoria(p: PatientRow) {
    if (!this.validarHistoriaDraft()) return;
    const user = this.auth.currentUser;
    if (!user?.uid) return;

    const especialistaUid = user.uid;
    const docId = this.historiaDocId(p.uid, especialistaUid);
    const hRef = doc(this.firestore, `historias_clinicas/${docId}`);

    const payload: any = {
      id_paciente: p.uid,
      altura: this.historiaDraft.altura ?? null,
      peso: this.historiaDraft.peso ?? null,
      temperatura: this.historiaDraft.temperatura ?? null,
      presion: this.historiaDraft.presion ?? null,
      dinamicos: (this.historiaDraft.dinamicos || []).slice(0, 3),
      creadoPor: especialistaUid,
      actualizadoEn: new Date().toISOString()
    };


    try {
      await setDoc(hRef, payload, { merge: true });
      // actualizar cache y cerrar edición
      this.historiasMap[p.uid] = {
        altura: payload.altura,
        peso: payload.peso,
        temperatura: payload.temperatura,
        presion: payload.presion,
        dinamicos: payload.dinamicos
      };
      this.editingHistoriaUid = null;
      this.cd.detectChanges();
    } catch (err) {
      console.error('guardarHistoria error', err);
      // no bloquear UI, mostrar error mínimo
      this.error = 'No se pudo guardar la historia clínica';
    }
  }
}
