import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Booking,
  BookingCheckout,
  BookingRequest,
  CancellationResponse,
  PaymentUrlResponse,
  WalkInBookingRequest,
  WalkInBookingResponse,
} from './booking.models';

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

  /** Las reservas de un cliente. Tiene que ser el de la sesión: las de otro responden 403. */
  byClient(clientId: number): Observable<Booking[]> {
    return this.http.get<Booking[]>(`${this.apiUrl}/client/${clientId}`);
  }

  /** Crea la reserva (queda pendiente) y trae la dirección de MercadoPago para pagarla. */
  create(request: BookingRequest): Observable<BookingCheckout> {
    return this.http.post<BookingCheckout>(this.apiUrl, request);
  }

  /**
   * La reserva en mostrador, para quien llega sin cuenta. Se confirma en el acto, sin MercadoPago:
   * se cobra en el mostrador. Solo sobre unidades del balneario del administrador.
   */
  walkIn(request: WalkInBookingRequest): Observable<WalkInBookingResponse> {
    return this.http.post<WalkInBookingResponse>(`${this.apiUrl}/walkin`, request);
  }

  /** Una dirección de pago nueva para una reserva pendiente. */
  pay(id: number): Observable<PaymentUrlResponse> {
    return this.http.post<PaymentUrlResponse>(`${this.apiUrl}/${id}/pay`, null);
  }

  /** Devuelve la reserva cancelada; la unidad queda libre para esas fechas. */
  cancel(id: number): Observable<Booking> {
    return this.http.patch<Booking>(`${this.apiUrl}/${id}/cancel`, null);
  }

  /** El servidor limita el listado al balneario del administrador autenticado. */
  list(): Observable<Booking[]> {
    return this.http.get<Booking[]>(this.apiUrl);
  }

  cancellation(id: number): Observable<CancellationResponse> {
    return this.http.get<CancellationResponse>(`${this.apiUrl}/${id}/cancellation`);
  }
}
