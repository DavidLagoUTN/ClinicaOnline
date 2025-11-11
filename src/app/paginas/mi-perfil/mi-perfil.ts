import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsersService } from '../../servicios/usuarios.service';
import { EspecialidadesService } from '../../servicios/especialidades.service';
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

  // campos del perfil, cargados desde Firestore
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
  // garantizamos que cada día existe como clave; inicializamos en constructor
  disponibilidadLocal: Record<DiaClave, RangoHorario[]> = {} as Record<DiaClave, RangoHorario[]>;
  editando: Partial<Record<DiaClave, boolean>> = {};
  nuevo: Partial<Record<DiaClave, RangoHorario>> = {};

  loading = false;

  // modal / edición local (garantizamos claves inicializadas en constructor)
  modalOpen = false;
  modalDisponibilidad: Record<DiaClave, RangoHorario[]> = {} as Record<DiaClave, RangoHorario[]>;
  nuevoModal: Record<DiaClave, RangoHorario> = {} as Record<DiaClave, RangoHorario>;

  // ======================
  // NUEVAS PROPIEDADES para edición de especialidades
  // ======================
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
    private especialidadesSvc: EspecialidadesService, // <-- servicio para listar/crear/comprobar especialidades
    private snackBar: MatSnackBar,                    // <-- notificaciones (ajustá si no usás Material)
    private firestore: Firestore,
    private auth: Auth
  ) {
    // inicializar estructuras para todos los días (evita undefined en plantilla)
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
    if (!snap.exists()) {
      this.loading = false;
      return;
    }

    const data = snap.data() as any;

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
    if (tipoBD === 'paciente' || tipoBD === 'especialista' || tipoBD === 'admin') {
      this.tipo = tipoBD as TipoUsuario;
    } else {
      console.warn(`Tipo de usuario inválido en DB para uid=${this.uid}:`, data.tipo);
      this.tipo = 'paciente';
    }

    if (this.tipo === 'especialista') {
      this.especialista = data as Especialista;
      // asignar duración con fallback 30
      this.duracionTurno = typeof data.duracionTurno === 'number' ? data.duracionTurno : 30;
      this.duracionTurnoTmp = this.duracionTurno;
      // sobreescribimos disponibilidadLocal con la que venga de la DB, asegurando claves
      const fromDb: DisponibilidadSemanal = this.especialista.disponibilidad || {};
      for (const dia of diasSemana) {
        this.disponibilidadLocal[dia] = Array.isArray(fromDb[dia]) ? [...fromDb[dia]!] : [];
      }

      // preparar selección local de especialidades
      this.seleccionadasLocal = Array.isArray(this.especialidades) ? [...this.especialidades] : [];

      // Suscribirse al catálogo completo de especialidades (mismo pipeline que en registro.ts)
      this.especialidadesSvc.listAll().pipe(
        map((list: any[]) =>
          list
            .map(i => i.nombre)
            .filter(Boolean)
            .map((s: string) => s.trim())
            .sort((a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
        )
      ).subscribe((nombres: string[]) => {
        this.todasEspecialidades = nombres;
        // asegurar que la selección local existe y marque correctamente las casillas
        if (!Array.isArray(this.seleccionadasLocal)) {
          this.seleccionadasLocal = Array.isArray(this.especialidades) ? [...this.especialidades] : [];
        }
      }, err => {
        console.error('Error cargando especialidades', err);
      });
    }

    // forzar recálculo del ancho de .campo después del render
    setTimeout(() => this.applyCampoMinPx(), 0);
  } finally {
    this.loading = false;
  }
}

  ngAfterViewInit(): void {
    setTimeout(() => this.applyCampoMinPx(), 0);
  }

  cancelarEditarDuracion(): void {
  this.duracionTurnoTmp = this.duracionTurno;
  this.editarDuracion = false;
}

async guardarDuracion(): Promise<void> {
  const val = Number(this.duracionTurnoTmp ?? this.duracionTurno);
  if (!Number.isFinite(val) || !Number.isInteger(val) || val < 5) {
    this.snackBar.open('Ingresá un número válido (min 5 minutos)', undefined, { duration: 3000, panelClass: ['mat-warn'] });
    return;
  }

  try {
    const uid = this.uid || (this.auth.currentUser?.uid ?? '');
    if (!uid) throw new Error('Usuario no identificado');

    const userRef = doc(this.firestore, 'usuarios', uid);

    try {
      await updateDoc(userRef, { duracionTurno: val });
    } catch (err) {
      await setDoc(userRef, { duracionTurno: val }, { merge: true });
    }

    this.duracionTurno = val;
    this.editarDuracion = false;
    this.snackBar.open('Duración guardada', undefined, { duration: 2000 });
  } catch (err) {
    console.error('Error guardando duración', err);
    this.snackBar.open('No se pudo guardar la duración', undefined, { duration: 3000, panelClass: ['mat-warn'] });
  }
}


  // ======================
  // Métodos para edición de especialidades (inline)
  // ======================

  async cargarEspecialidadesParaEdicion(): Promise<void> {
    try {
      // la implementación de listAll() depende de tu servicio; puede retornar Promise<string[]> o Observable
      const list = await this.especialidadesSvc.listAll(); // si es observable, adaptá con firstValueFrom
      this.todasEspecialidades = Array.isArray(list) ? [...list] : [];
      this.todasEspecialidades.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
      // asegurar que seleccionadasLocal está inicializada
      if (!Array.isArray(this.seleccionadasLocal)) this.seleccionadasLocal = [];
    } catch (err) {
      console.error('Error cargando especialidades', err);
      this.snackBar.open('No se pudieron cargar las especialidades', undefined, { duration: 3000, panelClass: ['mat-warn'] });
    }
  }

  activarEdicionEspecialidades(): void {
    this.editarEspecialidades = true;
    this.mostrarInputNueva = false;
    this.nuevaEspecialidadLocal = '';
    // cargar lista completa y preparar copia local
    this.cargarEspecialidadesParaEdicion();
    this.seleccionadasLocal = Array.isArray(this.especialidades) ? [...this.especialidades] : [];
  }

  cancelarEdicionEspecialidades(): void {
    this.editarEspecialidades = false;
    this.mostrarInputNueva = false;
    this.nuevaEspecialidadLocal = '';
    // restaurar copia local desde la fuente original
    this.seleccionadasLocal = Array.isArray(this.especialidades) ? [...this.especialidades] : [];
  }

  toggleEspecialidadLocalFromCheckbox(esp: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.seleccionadasLocal.includes(esp)) this.seleccionadasLocal.push(esp);
    } else {
      this.seleccionadasLocal = this.seleccionadasLocal.filter(e => e !== esp);
    }
  }

  // Cerrar (plegar) el details de especialidades
  closeEspecialidadesDetails(): void {
    // buscar el primer details con la clase y quitar el atributo open
    const details = document.querySelector<HTMLDetailsElement>('.especialidades-details');
    if (details) details.open = false;
  }

  quitarSeleccionada(esp: string): void {
    this.seleccionadasLocal = this.seleccionadasLocal.filter(e => e !== esp);
  }

  async confirmarAgregarNuevaEspecialidad(): Promise<void> {
    const nueva = (this.nuevaEspecialidadLocal || '').trim();
    if (!nueva) return;

    const nombreNormalizado = nueva; // opcional: normalizar caso

    try {
      const existe = await this.especialidadesSvc.existsByName(nombreNormalizado);
      if (!existe) {
        await this.especialidadesSvc.add(nombreNormalizado, this.auth.currentUser?.uid);
      }

      // actualizar lista local y seleccionadas
      if (!this.todasEspecialidades.includes(nombreNormalizado)) {
        this.todasEspecialidades.push(nombreNormalizado);
      }
      if (!this.seleccionadasLocal.includes(nombreNormalizado)) {
        this.seleccionadasLocal.push(nombreNormalizado);
      }

      this.todasEspecialidades.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
      this.nuevaEspecialidadLocal = '';
      this.mostrarInputNueva = false;
      this.snackBar.open('Especialidad agregada', undefined, { duration: 2000 });
    } catch (err) {
      console.error('Error agregando especialidad', err);
      this.snackBar.open('No se pudo agregar la especialidad', undefined, { duration: 3000, panelClass: ['mat-warn'] });
    }
  }

  async guardarEspecialidades(): Promise<void> {
    try {
      const uid = this.uid || (this.auth.currentUser?.uid ?? '');
      if (!uid) throw new Error('Usuario no identificado');

      const userRef = doc(this.firestore, 'usuarios', uid);

      // Intentar update; si falla por ausencia de doc, hacemos set con merge
      try {
        await updateDoc(userRef, { especialidades: this.seleccionadasLocal });
      } catch (err) {
        // si la doc no existe o update falla, creamos/mezclamos el campo
        await setDoc(userRef, { especialidades: this.seleccionadasLocal }, { merge: true });
      }

      // actualizar vista local y cerrar edición
      this.especialidades = [...this.seleccionadasLocal];
      this.editarEspecialidades = false;
      this.snackBar.open('Especialidades actualizadas', undefined, { duration: 2000 });
    } catch (err) {
      console.error('Error guardando especialidades', err);
      this.snackBar.open('No se pudo guardar. Reintentá.', undefined, { duration: 3000, panelClass: ['mat-warn'] });
    }
  }

  cancelarNuevaEspecialidad(): void {
    this.nuevaEspecialidadLocal = '';
    this.mostrarInputNueva = false;
  }

  // --- edición de rangos inline ---
  comenzarAgregar(dia: DiaClave) {
    this.editando[dia] = true;
    this.nuevo[dia] = { from: '', to: '' };
  }

  cancelarNuevo(dia: DiaClave) {
    this.editando[dia] = false;
    delete this.nuevo[dia];
  }

  async confirmarNuevoRango(dia: DiaClave) {
    const nuevoRango = this.nuevo[dia];
    if (!nuevoRango || !rangoValido(nuevoRango) || !rangoCumpleMinimo(nuevoRango)) {
      alert('El rango debe ser válido y permitir al menos un turno de 30 minutos.');
      return;
    }

    const actuales = this.disponibilidadLocal[dia] ? [...this.disponibilidadLocal[dia]] : [];
    const actualizados = normalizarRangos([...actuales, nuevoRango]);
    this.disponibilidadLocal[dia] = actualizados;

    await this.usersService.guardarDia(this.uid, dia, actualizados);
    this.cancelarNuevo(dia);
    setTimeout(() => this.applyCampoMinPx(), 0);
  }

  async eliminarRango(dia: DiaClave, index: number) {
    const actuales = this.disponibilidadLocal[dia] ? [...this.disponibilidadLocal[dia]] : [];
    actuales.splice(index, 1);
    const actualizados = normalizarRangos(actuales);
    this.disponibilidadLocal[dia] = actualizados;
    await this.usersService.guardarDia(this.uid, dia, actualizados);
    setTimeout(() => this.applyCampoMinPx(), 0);
  }

  tieneHorarios(): boolean {
    return Object.values(this.disponibilidadLocal).some(arr => arr && arr.length > 0);
  }

  // --- modal ---
  abrirModalHorarios() {
    for (const dia of this.dias) {
      this.modalDisponibilidad[dia] = this.disponibilidadLocal[dia] ? [...this.disponibilidadLocal[dia]] : [];
      this.nuevoModal[dia] = { from: '', to: '' };
    }
    this.modalOpen = true;
  }

  cerrarModal() {
    this.modalOpen = false;
  }

  opcionesDesde(dia: DiaClave): string[] {
    const fin = dia === 'sábado' ? '14:00' : '19:00';
    return this.generarHoras('08:00', fin);
  }

  opcionesHasta(dia: DiaClave): string[] {
    const fin = dia === 'sábado' ? '14:00' : '19:00';
    return this.generarHoras('08:30', fin);
  }

  private generarHoras(desde: string, hasta: string): string[] {
    const result: string[] = [];
    let [h, m] = desde.split(':').map(Number);
    const [hFin, mFin] = hasta.split(':').map(Number);

    while (h < hFin || (h === hFin && m <= mFin)) {
      result.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += 30;
      if (m >= 60) {
        m = 0;
        h += 1;
      }
    }

    return result;
  }

  agregarRangoModal(dia: DiaClave) {
    const sel = this.nuevoModal[dia];
    if (!sel || !sel.from || !sel.to) return;
    const rango: RangoHorario = { from: sel.from, to: sel.to };
    if (!rangoValido(rango) || !rangoCumpleMinimo(rango)) {
      alert('Rango inválido o menor a 30 minutos');
      return;
    }

    const actuales = this.modalDisponibilidad[dia] ? [...this.modalDisponibilidad[dia]] : [];
    this.modalDisponibilidad[dia] = normalizarRangos([...actuales, rango]);
    this.nuevoModal[dia] = { from: '', to: '' };
  }

  eliminarRangoModal(dia: DiaClave, index: number) {
    const arr = this.modalDisponibilidad[dia] ? [...this.modalDisponibilidad[dia]] : [];
    arr.splice(index, 1);
    this.modalDisponibilidad[dia] = normalizarRangos(arr);
  }

  async guardarDisponibilidad() {
    for (const dia of this.dias) {
      const arr = this.modalDisponibilidad[dia] ? [...this.modalDisponibilidad[dia]] : [];
      const normalized = normalizarRangos(arr);
      this.disponibilidadLocal[dia] = normalized;
      await this.usersService.guardarDia(this.uid, dia, normalized);
    }
    this.modalOpen = false;
  }

  // --- helpers para plantilla ---
  formatDisponibilidad(dia: DiaClave): string {
    const arr = this.disponibilidadLocal[dia];
    if (!arr || !arr.length) return '';
    return arr.map(r => `${r.from} - ${r.to}`).join(', ');
  }

  onNuevoFromChange(dia: DiaClave, val: string) {
    if (!this.nuevoModal[dia]) this.nuevoModal[dia] = { from: '', to: '' };
    this.nuevoModal[dia].from = val;
  }

  onNuevoToChange(dia: DiaClave, val: string) {
    if (!this.nuevoModal[dia]) this.nuevoModal[dia] = { from: '', to: '' };
    this.nuevoModal[dia].to = val;
  }

  // --- medición .campo (sin cambios) ---
  private applyCampoMinPx(selector = '.campo'): number {
    const elems = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (!elems.length) {
      document.documentElement.style.setProperty('--campo-min-px', '0px');
      return 0;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;

    const style = getComputedStyle(elems[0]);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    let max = 0;
    for (const el of elems) {
      const text = (el.textContent ?? '').trim();
      const width = Math.ceil(ctx.measureText(text).width);
      if (width > max) max = width;
    }

    const final = max + 8;
    document.documentElement.style.setProperty('--campo-min-px', `${final}px`);
    return final;
  }
}
