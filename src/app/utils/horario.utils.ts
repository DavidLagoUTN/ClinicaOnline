// src/app/utils/horario.utils.ts
import type { RangoHorario } from '../componentes/registro/registro.model';

export const MINIMO_MINUTOS_TURNO = 30;

// Convierte "HH:MM" a minutos desde medianoche
export function hhmmAminutos(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

// Convierte minutos a "HH:MM"
export function minutosAhhmm(minutos: number): string {
  const h = Math.floor(minutos / 60).toString().padStart(2, '0');
  const m = (minutos % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Comprueba que un RangoHorario sea válido (from < to y formato básico)
export function rangoValido(r: RangoHorario): boolean {
  if (!r || !r.from || !r.to) return false;
  const a = hhmmAminutos(r.from);
  const b = hhmmAminutos(r.to);
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

// Comprueba si dos rangos se solapan
export function seSolapan(a: RangoHorario, b: RangoHorario): boolean {
  return hhmmAminutos(a.from) < hhmmAminutos(b.to) && hhmmAminutos(b.from) < hhmmAminutos(a.to);
}

// Normaliza y unifica una lista de rangos: ordena, une solapamientos y rangos contiguos
export function normalizarRangos(rangos: RangoHorario[]): RangoHorario[] {
  if (!rangos?.length) return [];
  const filtrados = rangos.filter(r => rangoValido(r));
  if (!filtrados.length) return [];
  const ordenados = filtrados.sort((x, y) => hhmmAminutos(x.from) - hhmmAminutos(y.from));
  const salida: RangoHorario[] = [];
  let actual = { ...ordenados[0] };

  for (let i = 1; i < ordenados.length; i++) {
    const r = ordenados[i];
    if (hhmmAminutos(r.from) <= hhmmAminutos(actual.to)) {
      actual.to = minutosAhhmm(Math.max(hhmmAminutos(actual.to), hhmmAminutos(r.to)));
    } else {
      salida.push(actual);
      actual = { ...r };
    }
  }
  salida.push(actual);
  return salida;
}

// Trunca un rango por el horario de la clínica (devuelve null si queda vacío)
export function truncarPorHorarioClinica(r: RangoHorario, abrir: string, cerrar: string): RangoHorario | null {
  const inicio = Math.max(hhmmAminutos(r.from), hhmmAminutos(abrir));
  const fin = Math.min(hhmmAminutos(r.to), hhmmAminutos(cerrar));
  if (inicio >= fin) return null;
  return { from: minutosAhhmm(inicio), to: minutosAhhmm(fin) };
}

// Valida que un rango permita al menos MINIMO_MINUTOS_TURNO
export function rangoCumpleMinimo(r: RangoHorario, minMinutos = MINIMO_MINUTOS_TURNO): boolean {
  if (!rangoValido(r)) return false;
  return hhmmAminutos(r.to) - hhmmAminutos(r.from) >= minMinutos;
}

// Genera franjas (turnos) de duración `duracionMinutos` dentro de un rango.
// El último inicio posible es (fin - duracionMinutos). Devuelve array de { from, to }.
export function generarTurnosDesdeRango(r: RangoHorario, duracionMinutos = MINIMO_MINUTOS_TURNO): RangoHorario[] {
  if (!rangoValido(r)) return [];
  const inicio = hhmmAminutos(r.from);
  const fin = hhmmAminutos(r.to);
  const turnos: RangoHorario[] = [];
  const ultimoInicio = fin - duracionMinutos;
  let cursor = inicio;
  while (cursor <= ultimoInicio) {
    turnos.push({ from: minutosAhhmm(cursor), to: minutosAhhmm(cursor + duracionMinutos) });
    cursor += duracionMinutos;
  }
  return turnos;
}