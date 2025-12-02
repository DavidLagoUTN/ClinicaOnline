import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, query, orderBy, collectionData, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TurnosService {

  constructor(private firestore: Firestore) { }

  // --- LOGS ---
  // Llamar a esto desde el LOGIN cuando el ingreso es exitoso
  guardarLogIngreso(usuario: any) {
    const col = collection(this.firestore, 'logs_ingresos');
    addDoc(col, {
      uid: usuario.uid,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      tipo: usuario.tipo, // 'paciente', 'especialista', 'admin'
      fecha: new Date().toISOString() // Guardamos fecha y hora
    });
  }

  // Para mostrar la tabla en Informes
  obtenerLogsIngresos(): Observable<any[]> {
    const col = collection(this.firestore, 'logs_ingresos');
    const q = query(col, orderBy('fecha', 'desc')); // Ordenado por fecha
    return collectionData(q, { idField: 'id' });
  }

  // --- TURNOS PARA ESTADÍSTICAS ---
  obtenerTodosLosTurnos(): Observable<any[]> {
    const col = collection(this.firestore, 'turnos');
    // Traemos todo para filtrar en memoria (si son miles, conviene filtrar en backend, pero para TP está bien así)
    return collectionData(col, { idField: 'id' });
  }

  // Traer turnos de un médico específico
  obtenerTurnosPorEspecialista(uid: string): Observable<any[]> {
    const ref = collection(this.firestore, 'turnos');
    const q = query(ref, where('id_especialista', '==', uid), orderBy('fechaHora', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<any[]>;
  }
}