import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideCircleAlert } from '@lucide/angular';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { readPendingBooking } from '../pending-booking';
import { Booking } from '../../../core/api/booking.models';
import { BookingsApi } from '../../../core/api/bookings.api';
import { toUserMessage } from '../../../core/errors/error-message';

/**
 * Pago rechazado (`/payment/failure`, llega sin id): qué pasó, sin culpar a la persona, y cómo
 * reintentar. Reintentar pide una dirección de pago nueva (`POST /api/bookings/{id}/pay`). Si ya
 * pasó el plazo, el backend responde 400 y se muestra que la reserva venció, con un enlace para
 * volver a reservar.
 */
@Component({
  selector: 'app-payment-failure',
  imports: [RouterLink, LucideCircleAlert, ZAlert, ZBtn],
  templateUrl: './payment-failure.html',
  styleUrl: '../payment-result.scss',
})
export class PaymentFailure {
  private readonly bookingsApi = inject(BookingsApi);

  /** El id de la reserva, o `null` si no se guardó. Sin id no se puede reintentar. */
  protected readonly bookingId = readPendingBooking();

  /** La reserva, si se pudo traer: dice si sigue pendiente, si venció y a qué balneario volver. */
  protected readonly booking = signal<Booking | null>(null);
  protected readonly retrying = signal(false);
  protected readonly retryError = signal('');
  /** El reintento respondió 400: la reserva ya no está pendiente. */
  private readonly rejected = signal(false);

  protected readonly confirmed = computed(() => this.booking()?.status === 'CONFIRMED');
  protected readonly expired = computed(
    () => !this.confirmed() && (this.booking()?.status === 'CANCELED' || this.rejected()),
  );

  /** Volver a reservar lo mismo: el mismo balneario, con la unidad y las fechas ya puestas. */
  protected readonly rebook = computed(() => {
    const booking = this.booking();
    if (!booking) return { link: ['/'], query: {} };
    return {
      link: ['/book', booking.resortId],
      query: { unit: booking.rentalUnitId, from: booking.startDate, to: booking.endDate },
    };
  });

  constructor() {
    this.loadBooking();
  }

  /** Una dirección de pago nueva para la misma reserva, y a MercadoPago. */
  protected retry(): void {
    if (!this.bookingId) return;
    this.retrying.set(true);
    this.retryError.set('');

    this.bookingsApi.pay(Number(this.bookingId)).subscribe({
      next: ({ paymentUrl }) => this.redirect(paymentUrl),
      error: (error: HttpErrorResponse) => {
        this.retrying.set(false);
        if (error.status === 400) {
          // Ya no está pendiente: venció, o se confirmó mientras tanto. La reserva dice cuál.
          this.rejected.set(true);
          this.loadBooking();
        } else {
          this.retryError.set(toUserMessage(error));
        }
      },
    });
  }

  private loadBooking(): void {
    if (!this.bookingId) return;
    this.bookingsApi.get(this.bookingId).subscribe({
      next: (booking) => this.booking.set(booking),
      // Sin la reserva igual se puede reintentar: solo falta saber a qué balneario volver.
      error: () => undefined,
    });
  }

  /** Sale de la aplicación hacia MercadoPago. Aparte, para poder reemplazarlo en las pruebas. */
  protected redirect(url: string): void {
    window.location.assign(url);
  }
}
