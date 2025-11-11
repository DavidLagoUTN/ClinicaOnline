import { Component, OnInit, Input, AfterViewInit, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Auth, createUserWithEmailAndPassword, sendEmailVerification } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { LoadingComponent } from "../loading/loading";
import { supabase } from '../../servicios/supabase';
import { NgxCaptchaModule } from 'ngx-captcha';
import { EspecialidadDoc, EspecialidadesService } from '../../servicios/especialidades.service';
import { map } from 'rxjs';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatSnackBarModule, LoadingComponent, NgxCaptchaModule],
  templateUrl: './registro.html',
  styleUrl: './registro.scss'
})
export class Registro implements OnInit, AfterViewInit {
  @Input() modoAdmin: boolean = false;
  @Output() cerrar = new EventEmitter<void>();

  cancelar(): void {
    this.cerrar.emit();
  }
  isLoading = false;

  form!: FormGroup;
  tipoSeleccionado: '' | 'paciente' | 'especialista' | 'admin' = '';
  especialidades: string[] = [];
  nuevasEspecialidades: string[] = [];

  imagenPreview: string | null = null;
  imagenExtraPreview: string | null = null;

  public validators = Validators;

  captchaToken: string | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private snackBar: MatSnackBar,
    private especialidadesSvc: EspecialidadesService
  ) { }

  ngOnInit(): void {
    this.crearFormulario();

    this.especialidadesSvc.listAll().pipe(
      map((list: EspecialidadDoc[]) =>
        list
          .map(i => i.nombre)
          .filter(Boolean)
          .map(s => s.trim())
          .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      )
    ).subscribe((nombres: string[]) => {
      this.especialidades = nombres;
    }, err => {
      console.error('Error cargando especialidades', err);
    });
  }

  actualizarTipo(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'paciente' | 'especialista' | 'admin';
    this.tipoSeleccionado = value;
    this.crearFormulario();

    setTimeout(() => {
      document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    }, 0);
  }

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
    if (!nueva) {
      return;
    }

    // normalizar (opcional): capitalizar primera letra, trim, etc.
    const nombreNormalizado = nueva;

    try {
      // chequear existencia en Firestore (evita condiciones de carrera mínimas)
      const existe = await this.especialidadesSvc.existsByName(nombreNormalizado);
      if (!existe) {
        await this.especialidadesSvc.add(nombreNormalizado, this.auth.currentUser?.uid);
      }

      // actualizar lista local (collectionData se encargará de sincronizar, pero actualizamos de forma optimista)
      if (!this.especialidades.includes(nombreNormalizado)) {
        this.especialidades.push(nombreNormalizado);
      }

      if (!this.especialidades.includes(nombreNormalizado)) {
        this.especialidades.push(nombreNormalizado);
        // reordenar localmente
        this.especialidades.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
      }


      // añadir al control de seleccionadas si corresponde
      const actuales = this.form.get('especialidadesSeleccionadas')?.value || [];
      if (!actuales.includes(nombreNormalizado)) {
        this.form.get('especialidadesSeleccionadas')?.setValue([...actuales, nombreNormalizado]);
      }

      // limpiar input nuevo
      if (this.form.get('nuevaEspecialidad')) this.form.removeControl('nuevaEspecialidad');

      this.snackBar.open('Especialidad agregada', undefined, { duration: 2000 });
    } catch (err: any) {
      console.error('Error agregando especialidad', err);
      this.snackBar.open('No se pudo agregar la especialidad', undefined, { duration: 3000, panelClass: ['mat-warn'] });
    }
  }

  toggleEspecialidad(esp: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const actuales = this.form.get('especialidadesSeleccionadas')?.value || [];
    const actualizadas = checked
      ? [...actuales, esp]
      : actuales.filter((e: string) => e !== esp);
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

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.85;
    let blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('No se pudo generar el blob'));
      }, 'image/jpeg', quality);
    });


    while (blob.size / 1024 > maxKB && quality > 0.4) {
      quality -= 0.05;
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('No se pudo generar el blob'));
        }, 'image/jpeg', quality);
      });

    }

    return new File([blob], file.name, { type: 'image/jpeg' });
  }

  async subirAStorage(file: File, uid: string, tipo: 'perfil' | 'extra'): Promise<string> {
    const nombre = `${uid}/${tipo}_${Date.now()}_${file.name}`;
    const { error } = await supabase.storage
      .from('imagenes')
      .upload(nombre, file, { upsert: false });

    if (error) throw error;

    const { data } = supabase.storage
      .from('imagenes')
      .getPublicUrl(nombre);

    return data.publicUrl;
  }


  async onFileSelected(event: Event, controlName: string): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const reducido = await this.reducirImagen(file, 500);

      // Guardar el archivo reducido en el formulario (para subirlo luego)
      this.form.get(controlName)?.setValue(reducido);

      // Mostrar preview
      const reader = new FileReader();
      reader.onload = () => {
        if (controlName === 'imagenPerfil') {
          this.imagenPreview = reader.result as string;
        } else {
          this.imagenExtraPreview = reader.result as string;
        }
      };
      reader.readAsDataURL(reducido);
    } catch (err) {
      console.error('Error al procesar imagen:', err);
      this.snackBar.open('Error al procesar la imagen. Probá con otra.', undefined, {
        duration: 4000,
        panelClass: ['mat-warn']
      });
    }
  }

  // dentro de export class Registro { ... }
  removeImage(controlName: 'imagenPerfil' | 'imagenPerfilExtra'): void {
    // limpiar preview local
    if (controlName === 'imagenPerfil') {
      this.imagenPreview = null;
    } else {
      this.imagenExtraPreview = null;
    }

    // limpiar valor y estado del control en el formulario
    const control = this.form?.get(controlName);
    if (control) {
      control.setValue(null);
      control.markAsPristine();
      control.markAsUntouched();
      control.updateValueAndValidity();
    }
  }

  seleccionarTipo(tipo: 'paciente' | 'especialista' | 'admin'): void {
    if (this.tipoSeleccionado === tipo) return;
    this.tipoSeleccionado = tipo;
    this.crearFormulario();

    // small UI refresh para que Angular re-renderice previews/inputs
    setTimeout(() => {
      document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    }, 0);
  }


  ngAfterViewInit(): void {
    const checkInterval = setInterval(() => {
      const captchaDiv = document.getElementById('captcha');
      if (captchaDiv && (window as any).grecaptcha && (window as any).grecaptcha.render) {
        try {
          (window as any).grecaptcha.render('captcha', {
            'sitekey': '6LdOdQIsAAAAAMkXRAYDkTVyVMwW-6xbD6Q4J2gH'
          });
        } catch (e) {
        }
        clearInterval(checkInterval);
      }
    }, 500);
  }



  async onSubmit(): Promise<void> {
    // forzar validación visual
    this.form.markAllAsTouched();

    // validaciones antes de activar loader
    const valores = this.form.getRawValue();
    const campos = Object.keys(valores);
    const todosVacios = campos.every(key => {
      const valor = valores[key];
      return valor === '' || valor === null || valor === undefined;
    });

    if (todosVacios) {
      this.snackBar.open('Complete todos los campos', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    const c = this.form.controls;
    const edadMinima = this.tipoSeleccionado === 'paciente' ? 0 : 18;

    if ((c['nombre'] && c['nombre'].hasError('required')) || (c['apellido'] && c['apellido'].hasError('required'))) {
      this.snackBar.open('Nombre y Apellido son obligatorios y deben ser alfabéticos.', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if ((c['nombre'] && c['nombre'].hasError('pattern')) || (c['apellido'] && c['apellido'].hasError('pattern'))) {
      this.snackBar.open('Solo se permiten letras en nombre y apellido', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (c['edad'] && c['edad'].hasError('required')) {
      this.snackBar.open('La edad es obligatoria y debe ser numérica', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (c['edad'] && (c['edad'].hasError('min') || c['edad'].hasError('max'))) {
      this.snackBar.open(`La edad debe estar entre ${edadMinima} y 120 años`, undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (c['dni'] && c['dni'].hasError('required')) {
      this.snackBar.open('El DNI es obligatorio y debe ser numérico', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (c['dni'] && c['dni'].hasError('pattern')) {
      this.snackBar.open('El DNI debe tener al menos 8 dígitos', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (this.tipoSeleccionado === 'paciente' && c['obraSocial'] && c['obraSocial'].hasError('required')) {
      this.snackBar.open('La obra social es obligatoria', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (this.tipoSeleccionado === 'especialista' && c['especialidadesSeleccionadas'] && c['especialidadesSeleccionadas'].hasError('required')) {
      this.snackBar.open('Debés seleccionar al menos una especialidad', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (c['mail'] && c['mail'].hasError('required')) {
      this.snackBar.open('El correo es obligatorio', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (c['mail'] && c['mail'].hasError('email')) {
      this.snackBar.open('Ingrese un correo válido', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (c['password'] && c['password'].hasError('required')) {
      this.snackBar.open('La contraseña es obligatoria', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (c['password'] && c['password'].hasError('minlength')) {
      this.snackBar.open('La contraseña debe tener al menos 6 caracteres', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (c['imagenPerfil'] && c['imagenPerfil'].hasError('required')) {
      this.snackBar.open('La imagen de perfil es obligatoria', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }

    if (this.tipoSeleccionado === 'paciente') {
      const perfilBase = this.form.get('imagenPerfil')?.value;
      const extraBase = this.form.get('imagenPerfilExtra')?.value;
      if (!perfilBase || !extraBase) {
        this.snackBar.open('La segunda imagen de perfil es obligatoria', undefined, { duration: 3000, panelClass: ['mat-warn'] });
        return;
      }
    }

    const tokenFromWidget = (window as any).grecaptcha ? (window as any).grecaptcha.getResponse() : null;
    if (!tokenFromWidget) {
      this.snackBar.open('Por favor, completá el captcha', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      return;
    }
    this.captchaToken = tokenFromWidget;
    if (!this.form.get('captcha')) {
      this.form.addControl('captcha', this.fb.control(tokenFromWidget, Validators.required));
    } else {
      this.form.get('captcha')?.setValue(tokenFromWidget);
    }

    // validado todo -> activar loader y ejecutar async
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

      await setDoc(doc(this.firestore, 'usuarios', uid), perfil);
      await this.auth.signOut();

      this.snackBar.open('Registro exitoso. Verificá tu correo antes de iniciar sesión.', undefined, { duration: 6000, panelClass: ['mat-success'] });
      this.router.navigate(['/login']);
    } catch (error: any) {
      const msg = error.code === 'auth/email-already-in-use' ? 'El correo que ingresaste ya se encuentra registrado.' : error.message;
      this.snackBar.open(msg, undefined, { duration: 5000, panelClass: ['mat-warn'] });
    } finally {
      this.isLoading = false;
    }
  }

}
