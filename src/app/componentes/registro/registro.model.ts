export interface UsuarioBase {
  nombre: string;
  apellido: string;
  edad: number;
  dni: string;
  mail: string;
  password: string;
  imagenPerfil: File;
}

export interface Paciente extends UsuarioBase {
  obraSocial: string;
  imagenPerfilExtra: File;
}

export interface Especialista extends UsuarioBase {
  especialidad: string;
}

export interface Administrador extends UsuarioBase {}