import { Component, OnInit, Input } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Auth, createUserWithEmailAndPassword, sendEmailVerification } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, set } from 'firebase/database';
import { LoadingComponent } from "../loading/loading";

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
  especialidades: string[] = ['Cardiología', 'Dermatología', 'Pediatría'];

  imagenPreview: string | null = null;
  imagenExtraPreview: string | null = null;

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
        imagenPerfilExtra: [null]
      });
    } else if (this.tipoSeleccionado === 'especialista') {
      this.form = this.fb.group({
        ...base,
        especialidad: ['', Validators.required]
      });
    } else if (this.tipoSeleccionado === 'admin') {
      this.form = this.fb.group(base);
    }
  }

  verificarEspecialidad(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'otro') {
      this.form.addControl('nuevaEspecialidad', this.fb.control('', Validators.required));
    } else {
      this.form.removeControl('nuevaEspecialidad');
    }
  }

  onFileSelected(event: Event, controlName: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.form.get(controlName)?.setValue(file);

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        if (controlName === 'imagenPerfil') {
          this.imagenPreview = result;
        } else if (controlName === 'imagenPerfilExtra') {
          this.imagenExtraPreview = result;
        }
      };
      reader.readAsDataURL(file);
    }
  }

  async subirImagen(file: File, path: string): Promise<string> {
    const storage = getStorage();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }

  async onSubmit(): Promise<void> {
  this.isLoading = true; // 🔹 Mostrar spinner apenas se toca el botón

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

  if (this.tipoSeleccionado === 'especialista' && c['especialidad']?.hasError('required')) {
    this.snackBar.open('La especialidad es obligatoria', undefined, { duration: 3000, panelClass: ['mat-warn'] });
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

  // if (c['imagenPerfil'].hasError('required')) {
  //   this.snackBar.open('La imagen de perfil es obligatoria', undefined, { duration: 3000, panelClass: ['mat-warn'] });
  //   this.isLoading = false;
  //   return;
  // }

  // Registro en Firebase
  const { mail, password } = this.form.value;

  try {
    const cred = await createUserWithEmailAndPassword(this.auth, mail, password);
    await sendEmailVerification(cred.user);

    const uid = cred.user.uid;
    const perfil: any = {
      ...this.form.value,
      tipo: this.tipoSeleccionado,
      verificado: false,
      aprobadoPorAdmin: this.tipoSeleccionado === 'especialista' ? false : null,
      uid
    };

    // // Subir imagen de perfil
    // if (imagenPerfilFile) {
    //   perfil.imagenPerfilURL = await this.subirImagen(imagenPerfilFile, `usuarios/${uid}/perfil.jpg`);
    // }

    // // Subir imagen extra si es paciente
    // if (this.tipoSeleccionado === 'paciente' && imagenExtraFile) {
    //   perfil.imagenPerfilExtraURL = await this.subirImagen(imagenExtraFile, `usuarios/${uid}/extra.jpg`);
    // }

    // // Eliminar los objetos File antes de guardar
    // delete perfil.imagenPerfil;
    // delete perfil.imagenPerfilExtra;

    await setDoc(doc(this.firestore, 'usuarios', uid), perfil);

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
    this.snackBar.open(error.message, undefined, {
      duration: 5000,
      panelClass: ['mat-warn']
    });
  } finally {
    this.isLoading = false; // 🔹 Ocultar spinner
  }
}
}
