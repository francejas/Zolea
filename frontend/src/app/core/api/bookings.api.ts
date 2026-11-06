import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Booking, PaymentUrlResponse } from './booking.models';

/** Las reservas. Lo usan el Detalle, Reservar y las reservas del balneario: cada uno suma lo suyo. */
@Injectable({
  providedIn: 'root',
})
export class BookingsApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/bookings`;

  get(id: string | number): Observable<Booking> {
    return this.http.get<Booking>(`${this.apiUrl}/${id}`);
  }

  /** Una dirección de pago nueva para una reserva pendiente. */
  pay(id: number): Observable<PaymentUrlResponse> {
    return this.http.post<PaymentUrlResponse>(`${this.apiUrl}/${id}/pay`, null);
  }

  /** Devuelve la reserva cancelada; la unidad queda libre para esas fechas. */
  cancel(id: number): Observable<Booking> {
    return this.http.patch<Booking>(`${this.apiUrl}/${id}/cancel`, null);
  }
}
