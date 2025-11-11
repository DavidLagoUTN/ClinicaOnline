// src/app/servicios/users.service.ts

import { Injectable } from '@angular/core';
import { Firestore, collection, query, limit, getDocs, doc, updateDoc, setDoc } from '@angular/fire/firestore';
import type { DiaClave, RangoHorario } from '../componentes/registro/registro.model';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private firestore: Firestore) {}

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

  /**
   * Guarda (merge) los rangos de un solo día en el documento del usuario.
   * Se espera que `rangos` ya estén validados y normalizados antes de llamar.
   */
  async guardarDia(uid: string, dia: DiaClave, rangos: RangoHorario[]): Promise<void> {
    if (!uid) throw new Error('UsersService.guardarDia: falta uid');
    const ref = doc(this.firestore, 'usuarios', uid);
    await setDoc(ref, { disponibilidad: { [dia]: rangos } }, { merge: true });
  }
}
