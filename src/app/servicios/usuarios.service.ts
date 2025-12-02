import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  limit,
  setDoc,
  updateDoc
} from '@angular/fire/firestore';
import type { DiaClave, RangoHorario } from '../componentes/registro/registro.model';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private firestore: Firestore) { }

  async list(limitCount = 200) {
    const col = collection(this.firestore, 'usuarios');
    const q = query(col, limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));
  }

  async updateAprobacion(uid: string, aprobado: boolean): Promise<void> {
    const ref = doc(this.firestore, 'usuarios', uid);
    await updateDoc(ref, { aprobadoPorAdmin: aprobado });
  }

  async guardarDia(uid: string, dia: DiaClave, rangos: RangoHorario[]): Promise<void> {
    if (!uid) throw new Error('UsersService.guardarDia: falta uid');
    const ref = doc(this.firestore, 'usuarios', uid);
    await setDoc(ref, { disponibilidad: { [dia]: rangos } }, { merge: true });
  }

  /**
   * Devuelve los turnos del paciente con los campos originales.
   * No transforma fecha/hora: mantiene `fechaHora` tal cual, y enriquece profesional/especialidad.
   */
  async getTurnosByPaciente(pacienteUid: string): Promise<any[]> {
    if (!pacienteUid) return [];

    // 1) Si el usuario tiene array de IDs, leer cada turno
    const userRef = doc(this.firestore, 'usuarios', pacienteUid);
    const userSnap = await getDoc(userRef);
    let ids: string[] = [];
    if (userSnap.exists()) {
      const data: any = userSnap.data();
      if (Array.isArray(data?.turnos) && data.turnos.length) {
        ids = data.turnos.filter((x: any) => typeof x === 'string');
      }
    }

    let documentos: any[] = [];
    if (ids.length) {
      const reads = ids.map(async id => {
        const tRef = doc(this.firestore, 'turnos', id);
        const tSnap = await getDoc(tRef);
        return tSnap.exists() ? { id, ...(tSnap.data() as any) } : null;
      });
      documentos = (await Promise.all(reads)).filter(Boolean) as any[];
    } else {
      // 2) Si no hay array de IDs, consultar por id_paciente
      const colTurnos = collection(this.firestore, 'turnos');
      const q = query(colTurnos, where('id_paciente', '==', pacienteUid));
      const snap = await getDocs(q);
      documentos = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    }

    // Enriquecer con profesional/especialidad (sin tocar fechaHora)
    const enriched: any[] = [];
    for (const t of documentos) {
      let profesional = '';
      let especialidad = t.especialidad ?? '';

      if (t.id_especialista) {
        try {
          const espRef = doc(this.firestore, 'usuarios', t.id_especialista);
          const espSnap = await getDoc(espRef);
          if (espSnap.exists()) {
            const esp: any = espSnap.data();
            profesional = `${esp?.nombre ?? ''} ${esp?.apellido ?? ''}`.trim();
            especialidad = esp?.especialidad ?? especialidad;
          }
        } catch { }
      } else if (t.usuarios_especialista) {
        profesional = `${t.usuarios_especialista?.nombre ?? ''} ${t.usuarios_especialista?.apellido ?? ''}`.trim();
        especialidad = t.usuarios_especialista?.especialidad ?? especialidad;
      }

      enriched.push({
        ...t,
        profesional,
        especialidad,
        estado: (t.estado ?? '').toString().toLowerCase()
      });
    }

    return enriched;
  }

  // Método antiguo (lo dejo por si acaso)
  async getHistoriaClinica(pacienteUid: string, especialistaUid?: string): Promise<any[]> {
    if (!pacienteUid) return [];

    try {
      if (especialistaUid) {
        const docId = `${pacienteUid}_${especialistaUid}`;
        const dRef = doc(this.firestore, `historias_clinicas/${docId}`);
        const dSnap = await getDoc(dRef);
        if (dSnap.exists()) return [{ id: dSnap.id, ...(dSnap.data() as any) }];
      }

      const dRef2 = doc(this.firestore, `historias_clinicas/${pacienteUid}`);
      const dSnap2 = await getDoc(dRef2);
      if (dSnap2.exists()) return [{ id: dSnap2.id, ...(dSnap2.data() as any) }];

      const col = collection(this.firestore, 'historias_clinicas');
      const q = query(col, where('id_paciente', '==', pacienteUid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      }

      return [];
    } catch (err) {
      console.error('getHistoriaClinica error', err);
      return [];
    }
  }

  /**
   * NUEVO MÉTODO: Obtiene el historial clínico completo basado en los TURNOS finalizados.
   * Busca en la colección 'turnos' y enriquece con datos del especialista.
   */
  async getHistorialClinico(pacienteUid: string): Promise<any[]> {
    try {
      const turnosRef = collection(this.firestore, 'turnos');
      const q = query(turnosRef, where('id_paciente', '==', pacienteUid));
      const querySnapshot = await getDocs(q);

      const historialTemp: any[] = [];

      const promises = querySnapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();

        // Filtramos solo los turnos que están ATENDIDOS y tienen HISTORIA
        if (data['estado'] === 'atendido' && data['historia']) {
          let especialistaNombre = 'Especialista';
          let especialidadAtencion = data['especialidad'] || '';

          // Intentar obtener nombre del especialista
          if (data['id_especialista']) {
            try {
              const espRef = doc(this.firestore, `usuarios/${data['id_especialista']}`);
              const espSnap = await getDoc(espRef);
              if (espSnap.exists()) {
                const espData = espSnap.data();
                especialistaNombre = `${espData['nombre']} ${espData['apellido']}`;
              }
            } catch (e) { /* ignorar error silencioso */ }
          }

          // Normalizar fecha
          let fechaDate = new Date();
          if (data['fechaHora']?.seconds) {
            fechaDate = new Date(data['fechaHora'].seconds * 1000);
          } else if (typeof data['fechaHora'] === 'string') {
            fechaDate = new Date(data['fechaHora']);
          }

          historialTemp.push({
            id: docSnap.id,
            fecha: fechaDate,
            fechaStr: fechaDate.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            especialista: especialistaNombre,
            especialidad: especialidadAtencion,
            resenia: data['resenia'] || '',
            diagnostico: data['diagnostico'] || '',
            // Datos clínicos
            altura: data['historia'].altura,
            peso: data['historia'].peso,
            temperatura: data['historia'].temperatura,
            presion: data['historia'].presion,
            dinamicos: data['historia'].dinamicos || [],
            opcionales: data['historia'].opcionales || []
          });
        }
      });

      await Promise.all(promises);
      // Ordenar: más reciente primero
      return historialTemp.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

    } catch (error) {
      console.error('Error en UsersService.getHistorialClinico:', error);
      throw error;
    }
  }
}