export class Horario {
  constructor(
    public id: string | null,
    public id_especialista: string,
    public especialidad: string,
    public dias: string[],
    public horaInicio: string,
    public horaFin: string,
    public usuarios_especialista?: {
      nombre: string;
      apellido: string;
      imagen: string;
    }
  ) {}
}
