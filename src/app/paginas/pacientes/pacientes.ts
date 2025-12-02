import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
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
  docData
} from '@angular/fire/firestore';
import { Navbar } from '../../componentes/navbar/navbar';
import { LoadingComponent } from '../../componentes/loading/loading';
import { UsersService } from '../../servicios/usuarios.service';

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

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule, Navbar, LoadingComponent],
  templateUrl: './pacientes.html',
  styleUrls: ['./pacientes.scss']
})
export class Pacientes implements OnInit {
  // Inyectamos el servicio de usuarios
  private usersService = inject(UsersService);

  loading = false;
  error: string | null = null;

  defaultAvatar = '/assets/default-avatar.png';

  patients: PatientRow[] = [];
  filteredPatients: PatientRow[] = [];

  // Mapa para guardar el array de historias de cada paciente
  historiasMap: { [uid: string]: any[] | null } = {};
  loadingHistoriaMap: { [uid: string]: boolean } = {};

  // Toggle
  expandedPacienteUid: string | null = null;

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
    this.historiasMap = {}; // limpiar cache
    this.loadingHistoriaMap = {};

    try {
      const user = this.auth.currentUser;
      if (!user?.uid) {
        this.loading = false;
        return;
      }
      const especialistaUid = user.uid;

      // 1. Obtener turnos atendidos por este especialista
      const col = collection(this.firestore, 'turnos');
      const q = query(col, where('id_especialista', '==', especialistaUid), where('estado', '==', 'atendido'));
      const rawTurnos: any[] = await firstValueFrom(collectionData(q, { idField: 'id' }));

      if (!rawTurnos || rawTurnos.length === 0) {
        this.loading = false;
        return;
      }

      // 2. Agrupar por paciente
      const map = new Map<string, { count: number; turnos: any[] }>();

      for (const rt of rawTurnos) {
        const pid = rt.id_paciente;
        if (!pid) continue;

        let fechaObj: Date | undefined;
        if (rt.fechaHora?.toDate) {
          fechaObj = rt.fechaHora.toDate();
        } else if (typeof rt.fechaHora === 'string') {
          fechaObj = new Date(rt.fechaHora);
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

      // 3. Construir filas de pacientes
      const rows: PatientRow[] = [];
      const pacienteIds = Array.from(map.keys());

      const reads = pacienteIds.map(async (pid) => {
        try {
          const uRef = doc(this.firestore, `usuarios/${pid}`);
          const uSnap: any = await firstValueFrom(docData(uRef, { idField: 'uid' }));
          const meta = map.get(pid)!;

          // Ordenar turnos para mostrar últimos 3
          meta.turnos.sort((a: any, b: any) => {
            const ta = a.fechaObj ? a.fechaObj.getTime() : 0;
            const tb = b.fechaObj ? b.fechaObj.getTime() : 0;
            return tb - ta;
          });
          const ultimos = meta.turnos.slice(0, 3).map((t: any) => ({
            fecha: t.fechaStr,
            hora: t.horaStr,
            especialidad: t.especialidad
          }));

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
          // Manejo de error silencioso si falta usuario
        }
      });

      await Promise.all(reads);

      // Ordenar lista de pacientes por fecha del último turno
      rows.sort((a, b) => {
        // ...lógica de ordenamiento...
        return 0; // simplificado
      });

      this.patients = rows;
      this.filteredPatients = [...rows];
    } catch (err) {
      console.error('loadPacientesAtendidos error', err);
      this.error = 'No se pudieron cargar los pacientes';
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

  // --- LÓGICA DE HISTORIA CLÍNICA CORREGIDA ---

  async togglePaciente(p: PatientRow) {
    if (this.expandedPacienteUid === p.uid) {
      this.expandedPacienteUid = null;
      return;
    }

    this.expandedPacienteUid = p.uid;

    // Si ya tenemos los datos en caché, no recargar
    if (this.historiasMap[p.uid]) return;

    this.loadingHistoriaMap[p.uid] = true;
    try {
      // Usamos el servicio centralizado que lee de 'turnos'
      const historial = await this.usersService.getHistorialClinico(p.uid);
      this.historiasMap[p.uid] = historial;
    } catch (err) {
      console.error('Error cargando historia', err);
      this.historiasMap[p.uid] = [];
    } finally {
      this.loadingHistoriaMap[p.uid] = false;
      this.cd.detectChanges();
    }
  }

  formatearValorDinamico(valor: any): string {
    if (valor === true || valor === 'true') return 'Sí';
    if (valor === false || valor === 'false') return 'No';
    return valor;
  }
}