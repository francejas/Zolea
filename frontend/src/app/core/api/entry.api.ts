import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GuestValidation } from './entry.models';

/**
 * El ingreso al balneario. Lo usa el administrador, y solo sobre las reservas de su balneario.
 * Validar **marca el ingreso**: el mismo código no sirve dos veces. Cuando no se puede entrar, el
 * backend responde 400 o 404 con el motivo escrito para mostrarse tal cual.
 */
@Injectable({
  providedIn: 'root',
})
export class EntryApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/guests/validate`;

  /** Con el `qrToken` que lleva el QR de la entrada. Va en la dirección, sin cuerpo. */
  validateQr(qrToken: string): Observable<GuestValidation> {
    return this.http.post<GuestValidation>(`${this.apiUrl}/${encodeURIComponent(qrToken)}`, null);
  }

  /** Con el DNI, para quien no tiene el código a mano. Va en la dirección, sin cuerpo. */
  validateDni(dni: string): Observable<GuestValidation> {
    return this.http.post<GuestValidation>(`${this.apiUrl}/dni/${encodeURIComponent(dni)}`, null);
  }
}
