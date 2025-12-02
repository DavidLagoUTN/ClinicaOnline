import { Component, OnInit, Input, AfterViewInit, Output, EventEmitter, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Auth, createUserWithEmailAndPassword, sendEmailVerification } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Firestore, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { LoadingComponent } from "../loading/loading";
import { supabase } from '../../servicios/supabase';
import { EspecialidadDoc, EspecialidadesService } from '../../servicios/especialidades.service';
import { map } from 'rxjs';
import { CaptchaAdminDirective } from '../../directivas/captcha-admin.directive';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    ReactiveFormsModule, 
    MatSnackBarModule, 
    LoadingComponent,
    CaptchaAdminDirective
  ],
  templateUrl: './registro.html',
  styleUrls: ['./registro.scss']
})
export class Registro implements OnInit, OnDestroy {
  @Input() modoAdmin: boolean = false;
  @Output() cerrar = new EventEmitter<void>();

  cancelar(): void {
    this.cerrar.emit();
  }
  isLoading = false;
  
  // Configuración de BD
  captchaHabilitado: boolean = false;
  // Flag para destruir/recrear el div en el HTML
  reloadingCaptcha: boolean = false;

  form!: FormGroup;
  tipoSeleccionado: '' | 'paciente' | 'especialista' | 'admin' = '';
  especialidades: string[] = [];
  
  imagenPreview: string | null = null;
  imagenExtraPreview: string | null = null;

  public validators = Validators;
  captchaToken: string | null = null;
  
  private captchaInterval: any;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private snackBar: MatSnackBar,
    private especialidadesSvc: EspecialidadesService,
    private cd: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    this.crearFormulario();
    
    // 1. Inyectar script de Google si no existe (solo una vez)
    this.cargarScriptCaptcha();

    // 2. Cargar configuración y luego renderizar
    await this.cargarConfiguracionCaptcha();

    // 3. Cargar especialidades
    this.especialidadesSvc.listAll().pipe(
      map((list: EspecialidadDoc[]) =>
        list.map(i => i.nombre).filter(Boolean).map(s => s.trim())
            .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      )
    ).subscribe((nombres: string[]) => {
      this.especialidades = nombres;
    });
  }

  ngOnDestroy(): void {
    if (this.captchaInterval) clearInterval(this.captchaInterval);
  }

  cargarScriptCaptcha() {
    if (document.getElementById('google-recaptcha-script')) return;
    const script = document.createElement('script');
    script.id = 'google-recaptcha-script';
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }

  async cargarConfiguracionCaptcha() {
    try {
      const ref = doc(this.firestore, 'configuracion', 'registro');
      const snap = await getDoc(ref);
      
      if (snap.exists()) {
        const data = snap.data();
        this.captchaHabilitado = data['captchaHabilitado'] !== false;
      } else {
        this.captchaHabilitado = true; 
      }
    } catch (e) {
      console.log('No se pudo leer config (usuario invitado), activando captcha por defecto.');
      this.captchaHabilitado = true;
    }

    // Una vez tenemos el valor, si es true, iniciamos el proceso de renderizado limpio
    if (this.captchaHabilitado) {
      this.recargarCaptcha();
    }
  }

  async manejarCaptcha(estado: boolean) {
    this.captchaHabilitado = estado;
    
    // Guardar en DB solo si es admin (si no, es solo cambio visual local para pruebas)
    if (this.modoAdmin) {
        try {
        const ref = doc(this.firestore, 'configuracion', 'registro');
        await setDoc(ref, { captchaHabilitado: estado }, { merge: true });
        } catch (e) {
        console.error('Error guardando config', e);
        }
    }

    if (this.captchaHabilitado) {
      this.recargarCaptcha();
    } else {
      this.captchaToken = null;
      if (this.form.get('captcha')) this.form.removeControl('captcha');
    }
  }

  // Método Mágico: Destruye y recrea el componente visual para evitar "Already Rendered"
  recargarCaptcha() {
    this.reloadingCaptcha = true;
    this.cd.detectChanges(); // Angular elimina el div del DOM

    setTimeout(() => {
      this.reloadingCaptcha = false;
      this.cd.detectChanges(); // Angular crea un div NUEVO y limpio
      
      // Ahora sí, intentamos renderizar en el nuevo div
      this.iniciarRenderizadoCaptcha();
    }, 100);
  }

  iniciarRenderizadoCaptcha() {
    if (this.captchaInterval) clearInterval(this.captchaInterval);

    this.captchaInterval = setInterval(() => {
      const w = window as any;
      const container = document.getElementById('captcha-container');
      
      if (w.grecaptcha && w.grecaptcha.render && container) {
        clearInterval(this.captchaInterval);
        try {
            // Limpiamos por seguridad, aunque el div debería ser nuevo
            container.innerHTML = ''; 
            
            w.grecaptcha.render('captcha-container', {
                'sitekey': '6LdOdQIsAAAAAMkXRAYDkTVyVMwW-6xbD6Q4J2gH',
                'theme': 'light',
                'callback': (response: string) => {
                    this.captchaToken = response;
                    if (this.form.get('captcha')) {
                        this.form.get('captcha')?.setValue(response);
                    } else {
                        this.form.addControl('captcha', this.fb.control(response, Validators.required));
                    }
                },
                'expired-callback': () => {
                    this.captchaToken = null;
                    this.form.get('captcha')?.setValue(null);
                }
            });
        } catch (e) {
           // Si falla, reintentamos
           console.log('Reintentando render...', e);
        }
      }
    }, 200);
  }

  seleccionarTipo(tipo: 'paciente' | 'especialista' | 'admin'): void {
    if (this.tipoSeleccionado === tipo) return;
    this.tipoSeleccionado = tipo;
    this.crearFormulario();
    
    // Al cambiar de tipo, si el captcha está activo, lo regeneramos desde cero
    if (this.captchaHabilitado) {
        this.recargarCaptcha();
    }
  }

  // ... (Resto de métodos: crearFormulario, imágenes, submit se mantienen igual) ...
  
  crearFormulario(): void {
    const soloLetras = /^[a-zA-ZÁÉÍÓÚáéíóúÑñ\s]+$/;
    const soloNumeros = /^\d+$/;
    const dniRegex = /^\d{8,}$/;
    const edadMinima = this.tipoSeleccionado === 'paciente' ? 0 : 18;

    const base = {
      nombre: ['', [Validators.required, Validators.pattern(soloLetras)]],
      apellido: ['', [Validators.required, Validators.pattern(soloLetras)]],
      edad: ['', [Validators.required, Validators.pattern(soloNumeros), Validators.min(edadMinima), Validators.max(120)]],
      dni: ['', [Validators.required, Validators.pattern(dniRegex)]],
      mail: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      imagenPerfil: [null, Validators.required]
    };

    this.form = this.fb.group(base);

    if (this.tipoSeleccionado === 'paciente') {
      if (!this.form.get('obraSocial')) this.form.addControl('obraSocial', this.fb.control('', Validators.required));
      if (!this.form.get('imagenPerfilExtra')) this.form.addControl('imagenPerfilExtra', this.fb.control(null, Validators.required));
    } else {
      if (this.form.get('obraSocial')) this.form.removeControl('obraSocial');
      if (this.form.get('imagenPerfilExtra')) this.form.removeControl('imagenPerfilExtra');
    }

    if (this.tipoSeleccionado === 'especialista') {
      if (!this.form.get('especialidadesSeleccionadas')) this.form.addControl('especialidadesSeleccionadas', this.fb.control([], Validators.required));
    } else {
      if (this.form.get('especialidadesSeleccionadas')) this.form.removeControl('especialidadesSeleccionadas');
    }
  }

  agregarCampoNuevaEspecialidad(): void {
    if (!this.form.get('nuevaEspecialidad')) {
      this.form.addControl('nuevaEspecialidad', this.fb.control('', Validators.required));
    }
  }

  async agregarNuevaEspecialidad(): Promise<void> {
    const nueva = (this.form.get('nuevaEspecialidad')?.value || '').trim();
    if (!nueva) return;

    const nombreNormalizado = nueva;
    try {
      const existe = await this.especialidadesSvc.existsByName(nombreNormalizado);
      if (!existe) {
        await this.especialidadesSvc.add(nombreNormalizado, this.auth.currentUser?.uid);
      }
      if (!this.especialidades.includes(nombreNormalizado)) {
        this.especialidades.push(nombreNormalizado);
        this.especialidades.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
      }
      const actuales = this.form.get('especialidadesSeleccionadas')?.value || [];
      if (!actuales.includes(nombreNormalizado)) {
        this.form.get('especialidadesSeleccionadas')?.setValue([...actuales, nombreNormalizado]);
      }
      if (this.form.get('nuevaEspecialidad')) this.form.removeControl('nuevaEspecialidad');
      this.snackBar.open('Especialidad agregada', undefined, { duration: 2000 });
    } catch (err: any) {
      this.snackBar.open('Error al agregar especialidad', undefined, { duration: 3000, panelClass: ['mat-warn'] });
    }
  }

  toggleEspecialidad(esp: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const actuales = this.form.get('especialidadesSeleccionadas')?.value || [];
    const actualizadas = checked ? [...actuales, esp] : actuales.filter((e: string) => e !== esp);
    this.form.get('especialidadesSeleccionadas')?.setValue(actualizadas);
  }
  
  actualizarEspecialidadesSeleccionadas(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const seleccionadas = Array.from(select.selectedOptions).map(opt => opt.value);
    this.form.get('especialidadesSeleccionadas')?.setValue(seleccionadas);
  }

  async reducirImagen(file: File, maxKB = 500): Promise<File> {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => res(image);
        image.onerror = rej;
        image.src = reader.result as string;
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const ratio = img.width / img.height;
    const maxWidth = 1200;
    const width = img.width > maxWidth ? maxWidth : img.width;
    const height = img.width > maxWidth ? Math.round(maxWidth / ratio) : img.height;
    canvas.width = width; canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    let quality = 0.85;
    let blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Error blob')), 'image/jpeg', quality);
    });
    while (blob.size / 1024 > maxKB && quality > 0.4) {
      quality -= 0.05;
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Error blob')), 'image/jpeg', quality);
      });
    }
    return new File([blob], file.name, { type: 'image/jpeg' });
  }

  async subirAStorage(file: File, uid: string, tipo: 'perfil' | 'extra'): Promise<string> {
    const nombre = `${uid}/${tipo}_${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('imagenes').upload(nombre, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('imagenes').getPublicUrl(nombre);
    return data.publicUrl;
  }

  async onFileSelected(event: Event, controlName: string): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const reducido = await this.reducirImagen(file, 500);
      this.form.get(controlName)?.setValue(reducido);
      const reader = new FileReader();
      reader.onload = () => {
        if (controlName === 'imagenPerfil') this.imagenPreview = reader.result as string;
        else this.imagenExtraPreview = reader.result as string;
      };
      reader.readAsDataURL(reducido);
    } catch (err) {
      this.snackBar.open('Error al procesar imagen', undefined, { duration: 4000, panelClass: ['mat-warn'] });
    }
  }

  removeImage(controlName: 'imagenPerfil' | 'imagenPerfilExtra'): void {
    if (controlName === 'imagenPerfil') this.imagenPreview = null;
    else this.imagenExtraPreview = null;
    const control = this.form?.get(controlName);
    if (control) {
      control.setValue(null);
      control.markAsPristine();
      control.markAsUntouched();
      control.updateValueAndValidity();
    }
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
        this.snackBar.open('Complete todos los campos correctamente', undefined, { duration: 3000, panelClass: ['mat-warn'] });
        return;
    }

    // IMPORTANTE: Solo validar captcha si está habilitado y cargó la config
    if (this.captchaHabilitado) {
       if (!this.captchaToken) {
         this.snackBar.open('Por favor, completá el captcha', undefined, { duration: 3000, panelClass: ['mat-warn'] });
         return;
       }
    }

    this.isLoading = true;
    try {
      const { mail, password } = this.form.value;
      const cred = await createUserWithEmailAndPassword(this.auth, mail, password);
      this.auth.languageCode = 'es';
      await sendEmailVerification(cred.user);

      const uid = cred.user.uid;
      const perfilFile: File = this.form.get('imagenPerfil')?.value;
      const extraFile: File = this.form.get('imagenPerfilExtra')?.value;

      const imagenPerfilUrl = perfilFile ? await this.subirAStorage(perfilFile, uid, 'perfil') : null;
      const imagenExtraUrl = extraFile ? await this.subirAStorage(extraFile, uid, 'extra') : null;

      const perfil: any = {
        ...this.form.value,
        imagenPerfil: imagenPerfilUrl,
        tipo: this.tipoSeleccionado,
        uid
      };

      if (this.tipoSeleccionado === 'paciente') {
        perfil.imagenPerfilExtra = imagenExtraUrl;
        perfil.obraSocial = this.form.get('obraSocial')?.value;
      }

      if (this.tipoSeleccionado === 'especialista') {
        perfil.especialidades = this.form.get('especialidadesSeleccionadas')?.value;
        perfil.aprobadoPorAdmin = this.modoAdmin ? true : false;
        perfil.duracionTurno = 30;
      }

      delete perfil.password;
      delete perfil.especialidadesSeleccionadas;
      delete perfil.nuevaEspecialidad;
      delete perfil.captcha;

      await setDoc(doc(this.firestore, 'usuarios', uid), perfil);
      await this.auth.signOut();

      this.snackBar.open('Registro exitoso. Verificá tu correo.', undefined, { duration: 6000, panelClass: ['mat-success'] });
      this.router.navigate(['/login']);
    } catch (error: any) {
      const msg = error.code === 'auth/email-already-in-use' ? 'El correo ya está registrado.' : error.message;
      this.snackBar.open(msg, undefined, { duration: 5000, panelClass: ['mat-warn'] });
    } finally {
      this.isLoading = false;
    }
  }
}