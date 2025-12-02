import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsersService } from '../../servicios/usuarios.service';
import { EspecialidadesService } from '../../servicios/especialidades.service';
import { PdfService } from '../../servicios/pdf.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Auth } from '@angular/fire/auth';
import { doc, getDoc, Firestore, updateDoc, setDoc } from '@angular/fire/firestore';
import { diasSemana, DiaClave, RangoHorario, DisponibilidadSemanal, Especialista } from '../../componentes/registro/registro.model';
import { rangoValido, rangoCumpleMinimo, normalizarRangos } from '../../utils/horario.utils';
import { Navbar } from '../../componentes/navbar/navbar';
import { map } from 'rxjs';

type TipoUsuario = 'paciente' | 'especialista' | 'admin';

@Component({
  standalone: true,
  selector: 'app-mi-perfil',
  imports: [CommonModule, FormsModule, Navbar],
  templateUrl: './mi-perfil.html',
  styleUrls: ['./mi-perfil.scss']
})
export class MiPerfil implements OnInit, AfterViewInit {
  uid = '';
  especialista: Especialista | null = null;

  historialClinico: any[] = [];
  loadingHistorial = false;
  generandoPdf = false;

  // Filtro de especialidad para descarga
  especialidadSeleccionada: string = 'todas';
  especialidadesDisponiblesHistorial: string[] = [];

  // campos del perfil
  nombre = '';
  apellido = '';
  edad?: number;
  dni?: string;
  mail = '';
  imagenPerfil?: string | null;
  imagenPerfilExtra?: string | null;
  obraSocial?: string | null;
  especialidades: string[] = [];
  tipo: TipoUsuario = 'paciente';

  // horarios
  dias: DiaClave[] = [...diasSemana];
  disponibilidadLocal: Record<DiaClave, RangoHorario[]> = {} as Record<DiaClave, RangoHorario[]>;
  editando: Partial<Record<DiaClave, boolean>> = {};
  nuevo: Partial<Record<DiaClave, RangoHorario>> = {};

  loading = false;
  modalOpen = false;
  modalDisponibilidad: Record<DiaClave, RangoHorario[]> = {} as Record<DiaClave, RangoHorario[]>;
  nuevoModal: Record<DiaClave, RangoHorario> = {} as Record<DiaClave, RangoHorario>;

  editarEspecialidades = false;
  todasEspecialidades: string[] = [];
  seleccionadasLocal: string[] = [];
  mostrarInputNueva = false;
  nuevaEspecialidadLocal = '';
  duracionTurno: number = 30;
  editarDuracion = false;
  duracionTurnoTmp?: number;

  constructor(
    private usersService: UsersService,
    private especialidadesSvc: EspecialidadesService,
    private pdfService: PdfService,
    private snackBar: MatSnackBar,
    private firestore: Firestore,
    private auth: Auth
  ) {
    for (const dia of diasSemana) {
      this.disponibilidadLocal[dia] = [];
      this.modalDisponibilidad[dia] = [];
      this.nuevoModal[dia] = { from: '', to: '' };
    }
  }

  async ngOnInit() {
    const user = this.auth.currentUser;
    if (!user) {
      this.tipo = 'paciente';
      return;
    }
    this.uid = user.uid;
    this.loading = true;

    try {
      const ref = doc(this.firestore, 'usuarios', this.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data() as any;
        this.popularDatosUsuario(data);

        if (this.tipo === 'paciente') {
          await this.cargarHistorialDeTurnos();
        }

        if (this.tipo === 'especialista') {
          this.inicializarEspecialista(data);
        }
      }
    } catch (error) {
      console.error('Error cargando perfil:', error);
    } finally {
      this.loading = false;
      setTimeout(() => this.applyCampoMinPx(), 0);
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.applyCampoMinPx(), 0);
  }

  async cargarHistorialDeTurnos() {
    this.loadingHistorial = true;
    try {
      this.historialClinico = await this.usersService.getHistorialClinico(this.uid);

      const setEsp = new Set(this.historialClinico.map(h => h.especialidad));
      this.especialidadesDisponiblesHistorial = Array.from(setEsp).sort();

    } catch (error) {
      this.snackBar.open('Error cargando historial', 'Cerrar');
    } finally {
      this.loadingHistorial = false;
    }
  }

  async downloadHistoriaPdf(): Promise<void> {
    if (this.generandoPdf) return;
    this.generandoPdf = true;

    try {
      const pacienteData = {
        nombre: this.nombre,
        apellido: this.apellido,
        dni: this.dni,
        edad: this.edad,
        obraSocial: this.obraSocial || ''
      };

      const filename = `Historia_Clinica_${this.apellido}_${this.nombre}.pdf`;

      await this.pdfService.generarHistoriaClinicaPdf(
        filename,
        this.historialClinico,
        pacienteData,
        this.especialidadSeleccionada
      );

    } catch (err) {
      this.snackBar.open('Error al generar el PDF', 'Cerrar');
    } finally {
      this.generandoPdf = false;
    }
  }

  /**
   * Helper para mostrar "Sí" o "No" en lugar de true/false en el HTML
   */
  formatearValorDinamico(valor: any): string {
    if (valor === true || valor === 'true') return 'Sí';
    if (valor === false || valor === 'false') return 'No';
    return valor;
  }

  popularDatosUsuario(data: any) {
    this.nombre = data.nombre || '';
    this.apellido = data.apellido || '';
    this.edad = typeof data.edad === 'number' ? data.edad : data.edad ? Number(data.edad) : undefined;
    this.dni = data.dni || undefined;
    this.mail = data.mail || data.email || (this.auth.currentUser?.email ?? '');
    this.imagenPerfil = data.imagenPerfil ?? null;
    this.imagenPerfilExtra = data.imagenPerfilExtra ?? null;
    this.obraSocial = data.obraSocial ?? null;
    this.especialidades = Array.isArray(data.especialidades) ? data.especialidades : [];

    const tipoBD = String(data.tipo ?? '').toLowerCase();
    this.tipo = (tipoBD === 'paciente' || tipoBD === 'especialista' || tipoBD === 'admin') ? tipoBD as TipoUsuario : 'paciente';
  }

  inicializarEspecialista(data: any) {
    this.especialista = data as Especialista;
    this.duracionTurno = typeof data.duracionTurno === 'number' ? data.duracionTurno : 30;
    this.duracionTurnoTmp = this.duracionTurno;
    const fromDb: DisponibilidadSemanal = this.especialista.disponibilidad || {};
    for (const dia of diasSemana) {
      this.disponibilidadLocal[dia] = Array.isArray(fromDb[dia]) ? [...fromDb[dia]!] : [];
    }
    this.seleccionadasLocal = Array.isArray(this.especialidades) ? [...this.especialidades] : [];

    this.especialidadesSvc.listAll().pipe(
      map((list: any[]) =>
        list.map(i => i.nombre).filter(Boolean).map((s: string) => s.trim())
          .sort((a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      )
    ).subscribe((nombres: string[]) => {
      this.todasEspecialidades = nombres;
    });
  }

  cancelarEditarDuracion() { this.duracionTurnoTmp = this.duracionTurno; this.editarDuracion = false; }
  async guardarDuracion() {
    const val = Number(this.duracionTurnoTmp ?? this.duracionTurno);
    if (!Number.isFinite(val) || val < 5) return;
    try {
      const userRef = doc(this.firestore, 'usuarios', this.uid);
      await updateDoc(userRef, { duracionTurno: val });
      this.duracionTurno = val; this.editarDuracion = false;
      this.snackBar.open('Duración guardada', undefined, { duration: 2000 });
    } catch (err) { this.snackBar.open('Error guardando duración', undefined, { duration: 3000 }); }
  }
  activarEdicionEspecialidades() { this.editarEspecialidades = true; this.mostrarInputNueva = false; }
  cancelarEdicionEspecialidades() { this.editarEspecialidades = false; this.seleccionadasLocal = [...this.especialidades]; }
  toggleEspecialidadLocalFromCheckbox(esp: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) { if (!this.seleccionadasLocal.includes(esp)) this.seleccionadasLocal.push(esp); }
    else { this.seleccionadasLocal = this.seleccionadasLocal.filter(e => e !== esp); }
  }
  closeEspecialidadesDetails() { const details = document.querySelector<HTMLDetailsElement>('.especialidades-details'); if (details) details.open = false; }
  async confirmarAgregarNuevaEspecialidad() {
    const nueva = (this.nuevaEspecialidadLocal || '').trim();
    if (!nueva) return;
    try {
      const existe = await this.especialidadesSvc.existsByName(nueva);
      if (!existe) await this.especialidadesSvc.add(nueva, this.uid);
      if (!this.todasEspecialidades.includes(nueva)) this.todasEspecialidades.push(nueva);
      if (!this.seleccionadasLocal.includes(nueva)) this.seleccionadasLocal.push(nueva);
      this.nuevaEspecialidadLocal = ''; this.mostrarInputNueva = false;
    } catch (e) { console.error(e); }
  }
  async guardarEspecialidades() {
    try {
      const userRef = doc(this.firestore, 'usuarios', this.uid);
      await updateDoc(userRef, { especialidades: this.seleccionadasLocal });
      this.especialidades = [...this.seleccionadasLocal];
      this.editarEspecialidades = false;
      this.snackBar.open('Especialidades actualizadas', undefined, { duration: 2000 });
    } catch (e) { console.error(e); }
  }

  comenzarAgregar(dia: DiaClave) { this.editando[dia] = true; this.nuevo[dia] = { from: '', to: '' }; }
  cancelarNuevo(dia: DiaClave) { this.editando[dia] = false; delete this.nuevo[dia]; }
  async confirmarNuevoRango(dia: DiaClave) {
    const r = this.nuevo[dia]; if (!r || !rangoValido(r)) return;
    const act = normalizarRangos([...(this.disponibilidadLocal[dia] || []), r]);
    this.disponibilidadLocal[dia] = act;
    await this.usersService.guardarDia(this.uid, dia, act); this.cancelarNuevo(dia);
  }
  async eliminarRango(dia: DiaClave, i: number) {
    const act = [...(this.disponibilidadLocal[dia] || [])]; act.splice(i, 1);
    this.disponibilidadLocal[dia] = act; await this.usersService.guardarDia(this.uid, dia, act);
  }
  tieneHorarios(): boolean { return Object.values(this.disponibilidadLocal).some(arr => arr && arr.length > 0); }
  abrirModalHorarios() {
    this.modalOpen = true;
    for (const d of this.dias) {
      this.modalDisponibilidad[d] = [...(this.disponibilidadLocal[d] || [])];
      this.nuevoModal[d] = { from: '', to: '' };
    }
  }
  cerrarModal() { this.modalOpen = false; }
  opcionesDesde(dia: DiaClave): string[] { return this.generarHoras('08:00', dia === 'sábado' ? '14:00' : '19:00'); }
  opcionesHasta(dia: DiaClave): string[] { return this.generarHoras('08:30', dia === 'sábado' ? '14:00' : '19:00'); }
  private generarHoras(desde: string, hasta: string): string[] {
    const res = [];
    let [h, m] = desde.split(':').map(Number);
    const [hf, mf] = hasta.split(':').map(Number);
    while (h < hf || (h === hf && m <= mf)) {
      res.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += 30; if (m >= 60) { m = 0; h++; }
    }
    return res;
  }
  agregarRangoModal(dia: DiaClave) {
    const s = this.nuevoModal[dia]; if (!s?.from || !s?.to) return;
    this.modalDisponibilidad[dia] = normalizarRangos([...(this.modalDisponibilidad[dia] || []), { from: s.from, to: s.to }]);
    this.nuevoModal[dia] = { from: '', to: '' };
  }
  eliminarRangoModal(dia: DiaClave, i: number) {
    const arr = [...(this.modalDisponibilidad[dia] || [])]; arr.splice(i, 1); this.modalDisponibilidad[dia] = arr;
  }
  async guardarDisponibilidad() {
    for (const d of this.dias) {
      this.disponibilidadLocal[d] = this.modalDisponibilidad[d];
      await this.usersService.guardarDia(this.uid, d, this.disponibilidadLocal[d]);
    }
    this.modalOpen = false;
  }
  formatDisponibilidad(dia: DiaClave): string { return (this.disponibilidadLocal[dia] || []).map(r => `${r.from}-${r.to}`).join(', '); }
  onNuevoFromChange(dia: DiaClave, v: string) { if (!this.nuevoModal[dia]) this.nuevoModal[dia] = { from: '', to: '' }; this.nuevoModal[dia]!.from = v; }
  onNuevoToChange(dia: DiaClave, v: string) { if (!this.nuevoModal[dia]) this.nuevoModal[dia] = { from: '', to: '' }; this.nuevoModal[dia]!.to = v; }
  private applyCampoMinPx(selector = '.campo'): number { return 0; }
}