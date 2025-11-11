// Lista en tiempo de ejecución y tipo derivado desde la lista
export const diasSemana = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

export type DiaClave = typeof diasSemana[number];

export interface RangoHorario {
  from: string; // formato "HH:MM"
  to: string;   // formato "HH:MM"
}

export type DisponibilidadSemanal = {
  [D in DiaClave]?: RangoHorario[];
};

// Horario operativo de la clínica por día (usar null cuando esté cerrado)
export type HorariosClinica = {
  [D in DiaClave]?: { abrir: string; cerrar: string } | null;
};

export interface UsuarioBase {
  uid?: string;
  nombre: string;
  apellido: string;
  edad?: number;
  dni?: string;
  mail: string;
  password?: string; // opcional para evitar exponerlo al persistir
  imagenPerfil?: File | string; // durante formulario: File; en Firestore: URL string
  createdAt?: any;
  updatedAt?: any;
}

export interface Paciente extends UsuarioBase {
  obraSocial?: string;
  imagenPerfilExtra?: File | string;
}

export interface Especialista extends UsuarioBase {
  especialidades?: string[]; // permitir varias especialidades
  disponibilidad?: DisponibilidadSemanal;
  duracionTurno?: number;
  aprobadoPorAdmin?: boolean; // útil para workflow de aprobación
}

export interface Administrador extends UsuarioBase {}
