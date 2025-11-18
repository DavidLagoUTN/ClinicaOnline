export class Turno {
  constructor(
    public id: string | null,
    public id_paciente: string,
    public id_especialista: string,
    public especialidad: string,
    public fechaHora: Date,
    public comentario: string | null,
    public diagnostico: string | null,
    public resenia: string | null,
    public encuestaCompletada: boolean,
    public estado: string,
    public canceladoPor: string | null,
    public comentarioCancelacion: string | null,
    public comentarioRechazo: string | null,
    public usuarios_paciente?: { nombre: string; apellido: string },
    public usuarios_especialista?: { nombre: string; apellido: string }
  ) {}
}
