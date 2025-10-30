import { Injectable } from '@angular/core';
import { Firestore, collection, query, limit, getDocs } from '@angular/fire/firestore';
import { doc, updateDoc } from '@angular/fire/firestore';

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
}
