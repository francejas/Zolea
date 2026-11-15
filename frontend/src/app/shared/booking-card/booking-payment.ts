import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { BookingsApi } from '../../core/api/bookings.api';
import { toUserMessage } from '../../core/errors/error-message';

export type BookingPaymentResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'error'; message: string };

/** Unifica el pago y la recuperación cuando la reserva cambió en otra pantalla. */
@Injectable({ providedIn: 'root' })
export class BookingPayment {
  private readonly bookingsApi = inject(BookingsApi);

  pay(id: number): Observable<BookingPaymentResult> {
    return this.bookingsApi.pay(id).pipe(
      map(({ paymentUrl }) => ({ kind: 'redirect', url: paymentUrl }) as const),
      catchError((error: HttpErrorResponse) => {
        if (error.status !== 400) {
          return of({ kind: 'error', message: toUserMessage(error) } as const);
        }

        return of({ kind: 'rejected', message: toUserMessage(error) } as const);
      }),
    );
  }
}
