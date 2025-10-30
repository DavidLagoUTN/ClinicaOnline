// servicios/auth.ts
import { Injectable } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentUser: User | null = null;
  private userSubject = new BehaviorSubject<User | null>(null);
  public user$: Observable<User | null> = this.userSubject.asObservable();
  public nombreUsuario: string | null = null;
  public apellidoUsuario: string | null = null;

  constructor(private auth: Auth, private firestore: Firestore) {
    onAuthStateChanged(this.auth, async (u) => {
      this.currentUser = u;
      this.userSubject.next(u);
      if (u) {
        // intentamos cargar nombre desde Firestore; si falla, dejamos null
        try {
          const ref = doc(this.firestore, 'usuarios', u.uid);
          const snap = await getDoc(ref);
          const data = snap.data();
          this.nombreUsuario = data?.['nombre'] ?? null;
          this.apellidoUsuario = data?.['apellido'] ?? null;
        } catch {
          this.nombreUsuario = null;
          this.apellidoUsuario = null;
        }
      } else {
        this.nombreUsuario = null;
        this.apellidoUsuario = null;
      }
    });
  }

  async login(email: string, password: string): Promise<any> {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    const user = cred.user;

    if (!user.emailVerified) {
      throw { code: 'auth/email-not-verified', message: 'Tu correo no está verificado.' };
    }

    const ref = doc(this.firestore, 'usuarios', user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      throw { code: 'auth/no-profile', message: 'No se encontró el perfil del usuario.' };
    }

    const perfil = snap.data();
    const tipo = perfil['tipo'];
    if (tipo === 'especialista' && !perfil['aprobadoPorAdmin']) {
      throw { code: 'auth/not-approved', message: 'Tu cuenta aún no fue aprobada por un administrador.' };
    }

    // actualizar estado local
    this.currentUser = user;
    this.userSubject.next(user);
    this.nombreUsuario = perfil['nombre'] ?? null;
    this.apellidoUsuario = perfil['apellido'] ?? null;

    return { user, perfil };
  }

  getUser(): User | null {
    return this.currentUser;
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.currentUser = null;
    this.userSubject.next(null);
    this.nombreUsuario = null;
    this.apellidoUsuario = null;
  }

  // Optional compatibility: callback hook used elsewhere in code
  onAuthStateChanged(callback: () => void): void {
    this.user$.subscribe(() => callback());
  }
}