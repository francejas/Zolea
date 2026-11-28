import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GuestEntry, GuestValidation } from './entry.models';

/**
 * El ingreso al balneario. Lo usa el administrador, y solo sobre las reservas de su balneario.
 * Validar **anota un ingreso**: el mismo código sirve toda la estadía y cada vez queda una fila en
 * el registro. Cuando no se puede entrar, el backend responde 400 o 404 con el motivo escrito para
 * mostrarse tal cual.
 */
@Injectable({
  providedIn: 'root',
})
export class EntryApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/guests/validate`;

  /**
   * Con el `qrToken` que lleva el QR de la entrada. Va en la dirección, sin cuerpo. `typed` dice que
   * se escribió a mano: el ingreso queda como «código» y no como QR.
   */
  validateQr(qrToken: string, typed = false): Observable<GuestValidation> {
    const url = `${this.apiUrl}/${encodeURIComponent(qrToken)}`;
    return this.http.post<GuestValidation>(typed ? `${url}?typed=true` : url, null);
  }

  /** Con el DNI, para quien no tiene el código a mano. Va en la dirección, sin cuerpo. */
  validateDni(dni: string): Observable<GuestValidation> {
    return this.http.post<GuestValidation>(`${this.apiUrl}/dni/${encodeURIComponent(dni)}`, null);
  }

  /** Los ingresos de hoy en el balneario del administrador, del más nuevo al más viejo. */
  today(): Observable<GuestEntry[]> {
    return this.http.get<GuestEntry[]>(`${environment.apiUrl}/api/resorts/my/entries`);
  }
}
