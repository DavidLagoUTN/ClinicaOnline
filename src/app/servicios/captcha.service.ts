import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CaptchaService {
  private estado$ = new BehaviorSubject<boolean>(true); // habilitado por defecto
  estadoCaptcha$ = this.estado$.asObservable();

  activar() { this.estado$.next(true); }
  desactivar() { this.estado$.next(false); }
}