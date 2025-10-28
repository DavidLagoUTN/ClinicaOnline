import { Component, OnInit, Input } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Auth, createUserWithEmailAndPassword, sendEmailVerification } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { LoadingComponent } from "../loading/loading";
import { supabase } from '../../servicios/supabase'

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatSnackBarModule, LoadingComponent],
  templateUrl: './registro.html',
  styleUrl: './registro.scss'
})
export class Registro implements OnInit {
  @Input() modoAdmin: boolean = false;
  isLoading = false;

  form!: FormGroup;
  tipoSeleccionado: '' | 'paciente' | 'especialista' | 'admin' = '';
  especialidades: string[] = ['Cardiología', 'Dermatología', 'Pediatría', 'Otorrinolaringología'];
  nuevasEspecialidades: string[] = [];

  imagenPreview: string | null = null;
  imagenExtraPreview: string | null = null;

  public validators = Validators;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
    this.form = this.fb.group({});
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

    const base = {
      nombre: ['', [Validators.required, Validators.pattern(soloLetras)]],
      apellido: ['', [Validators.required, Validators.pattern(soloLetras)]],
      edad: ['', [Validators.required, Validators.pattern(soloNumeros), Validators.min(1), Validators.max(120)]],
      dni: ['', [Validators.required, Validators.pattern(dniRegex)]],
      mail: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      imagenPerfil: [null, Validators.required]
    };

    if (this.tipoSeleccionado === 'paciente') {
      this.form = this.fb.group({
        ...base,
        obraSocial: ['', Validators.required],
        imagenPerfilExtra: [null, Validators.required]
      });
    } else if (this.tipoSeleccionado === 'especialista') {
      this.form = this.fb.group({
        ...base,
        especialidadesSeleccionadas: [[], Validators.required]
      });
    }
    else if (this.tipoSeleccionado === 'admin') {
      this.form = this.fb.group(base);
    }
  }

  agregarCampoNuevaEspecialidad(): void {
    if (!this.form.get('nuevaEspecialidad')) {
      this.form.addControl('nuevaEspecialidad', this.fb.control('', Validators.required));
    }
  }

  agregarNuevaEspecialidad(): void {
    const nueva = this.form.get('nuevaEspecialidad')?.value?.trim();
    if (nueva && !this.especialidades.includes(nueva)) {
      this.especialidades.push(nueva);
    }
    if (nueva) {
      const actuales = this.form.get('especialidadesSeleccionadas')?.value || [];
      if (!actuales.includes(nueva)) {
        this.form.get('especialidadesSeleccionadas')?.setValue([...actuales, nueva]);
      }
    }
    this.form.removeControl('nuevaEspecialidad');
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



  async onSubmit(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0)); //renderizar rápidamente loading
    this.isLoading = true;
    const c = this.form.controls;

    // Validación: si todos los campos están vacíos
    const valores = this.form.getRawValue();
    const campos = Object.keys(valores);
    const todosVacios = campos.every(key => {
      const valor = valores[key];
      return valor === '' || valor === null || valor === undefined;
    });

    if (todosVacios) {
      this.snackBar.open('Complete todos los campos', undefined, {
        duration: 3000,
        panelClass: ['mat-warn']
      });
      this.isLoading = false;
      return;
    }

    // Validaciones específicas
    if (c['nombre'].hasError('required') || c['apellido'].hasError('required')) {
      this.snackBar.open('Nombre y Apellido son obligatorios y deben ser alfabéticos.', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (c['nombre'].hasError('pattern') || c['apellido'].hasError('pattern')) {
      this.snackBar.open('Solo se permiten letras en nombre y apellido', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (c['edad'].hasError('required')) {
      this.snackBar.open('La edad es obligatoria y debe ser numérica', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (c['edad'].hasError('min') || c['edad'].hasError('max')) {
      this.snackBar.open('La edad debe estar entre 1 y 120 años', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (c['dni'].hasError('required')) {
      this.snackBar.open('El DNI es obligatorio y debe ser numérico', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (c['dni'].hasError('pattern')) {
      this.snackBar.open('El DNI debe tener al menos 8 dígitos', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (this.tipoSeleccionado === 'paciente' && c['obraSocial']?.hasError('required')) {
      this.snackBar.open('La obra social es obligatoria', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (this.tipoSeleccionado === 'especialista' && c['especialidadesSeleccionadas']?.hasError('required')) {
      this.snackBar.open('Debés seleccionar al menos una especialidad', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }


    if (c['mail'].hasError('required')) {
      this.snackBar.open('El correo es obligatorio', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (c['mail'].hasError('email')) {
      this.snackBar.open('Ingrese un correo válido', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (c['password'].hasError('required')) {
      this.snackBar.open('La contraseña es obligatoria', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (c['password'].hasError('minlength')) {
      this.snackBar.open('La contraseña debe tener al menos 6 caracteres', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    if (c['imagenPerfil'].hasError('required')) {
      this.snackBar.open('La imagen de perfil es obligatoria', undefined, { duration: 3000, panelClass: ['mat-warn'] });
      this.isLoading = false;
      return;
    }

    // Requerir imagen adicional solo para paciente
    if (this.tipoSeleccionado === 'paciente') {
      const perfilBase = this.form.get('imagenPerfil')?.value;
      const extraBase = this.form.get('imagenPerfilExtra')?.value;
      if (!perfilBase || !extraBase) {
        this.snackBar.open('La segunda imagen de perfil es obligatoria', undefined, {
          duration: 3000,
          panelClass: ['mat-warn']
        });
        this.isLoading = false;
        return;
      }
    }


    // Registro en Firebase y mostrar loading
    const { mail, password } = this.form.value;
    try {
      const cred = await createUserWithEmailAndPassword(this.auth, mail, password);
      this.auth.languageCode = 'es';
      await sendEmailVerification(cred.user);

      const uid = cred.user.uid;

      // Subir imágenes a Supabase si existen
      const perfilFile: File = this.form.get('imagenPerfil')?.value;
      const extraFile: File = this.form.get('imagenPerfilExtra')?.value;

      const imagenPerfilUrl = perfilFile ? await this.subirAStorage(perfilFile, uid, 'perfil') : null;
      const imagenExtraUrl = extraFile ? await this.subirAStorage(extraFile, uid, 'extra') : null;

      // Armar objeto de perfil con URLs
      const perfil: any = {
        ...this.form.value,
        imagenPerfil: imagenPerfilUrl,
        tipo: this.tipoSeleccionado,
        uid
      };

      // Solo para paciente
      if (this.tipoSeleccionado === 'paciente') {
        perfil.imagenPerfilExtra = imagenExtraUrl;
        perfil.obraSocial = this.form.get('obraSocial')?.value;
      }

      // Solo para especialista
      if (this.tipoSeleccionado === 'especialista') {
        perfil.especialidades = this.form.get('especialidadesSeleccionadas')?.value;
        perfil.aprobadoPorAdmin = false;
      }

      // Limpieza
      delete perfil.password;
      delete perfil.especialidadesSeleccionadas;
      delete perfil.nuevaEspecialidad;



      await setDoc(doc(this.firestore, 'usuarios', uid), perfil);

      await this.auth.signOut();

      this.snackBar.open(
        'Registro exitoso. Verificá tu correo antes de iniciar sesión.',
        undefined,
        {
          duration: 6000,
          panelClass: ['mat-success']
        }
      );

      this.router.navigate(['/login']);
    } catch (error: any) {
      const msg = error.code === 'auth/email-already-in-use'
        ? 'El correo que ingresaste ya se encuentra registrado.'
        : error.message;

      this.snackBar.open(msg, undefined, {
        duration: 5000,
        panelClass: ['mat-warn']
      });

    } finally {
      this.isLoading = false;
    }

  }
}
