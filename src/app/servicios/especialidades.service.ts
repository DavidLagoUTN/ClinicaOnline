import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, query, orderBy, collectionData, where, getDocs } from '@angular/fire/firestore';
import {Observable } from 'rxjs';

export interface EspecialidadDoc {
  id?: string;
  nombre: string;
  createdAt?: any;
  createdBy?: string;
}

@Injectable({ providedIn: 'root' })
export class EspecialidadesService {
  constructor(private firestore: Firestore) {}

  listAll(): Observable<EspecialidadDoc[]> {
    const col = collection(this.firestore, 'especialidades');
    const q = query(col, orderBy('nombre'));
    return collectionData(q, { idField: 'id' }) as Observable<EspecialidadDoc[]>;
  }

  async existsByName(nombre: string): Promise<boolean> {
    const col = collection(this.firestore, 'especialidades');
    const q = query(col, where('nombre', '==', nombre));
    const snap = await getDocs(q as any);
    return !snap.empty;
  }

  add(nombre: string, createdBy?: string) {
    const col = collection(this.firestore, 'especialidades');
    return addDoc(col, {
      nombre,
      createdAt: new Date(),
      createdBy: createdBy ?? null
    });
  }
}
