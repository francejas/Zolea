import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideCalendarDays,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCircleCheck,
  LucideMapPin,
  LucideTent,
  LucideUmbrella,
} from '@lucide/angular';
import { BookingsApi } from '../../../../core/api/bookings.api';
import { Booking } from '../../../../core/api/booking.models';
import { bookingNumber, dayCount, dayRange, money, unitLabel } from '../../booking-format';
import { clearPendingBooking } from '../pending-booking';
import { toUserMessage } from '../../../../core/errors/error-message';
import { GuestQr } from '../../guest-qr/guest-qr';
import { ZAlert } from '../../../../shared/z-alert/z-alert';
import { ZEmpty } from '../../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../../shared/z-skeleton/z-skeleton';

type LoadState =
  'loading' | 'confirmed' | 'confirming' | 'missing' | 'forbidden' | 'not-found' | 'error';

/** Cada cuánto se vuelve a preguntar si el pago ya se acreditó. */
export const POLL_MS = 3000;
/** Cuántas veces más se pregunta antes de rendirse: 20 × 3 s = un minuto. */
export const MAX_RETRIES = 20;

/**
 * Pago confirmado (`/payment/success?bookingId=…`). No confirma nada: el backend ya consultó el
 * pago y redirigió acá. Pide la reserva; si está confirmada muestra el resumen y los QR, y si todavía
 * figura pendiente vuelve a consultar cada 3 segundos hasta un minuto y después lleva al detalle.
 */
@Component({
  selector: 'app-payment-success',
  imports: [
    RouterLink,
    LucideCalendarDays,
    LucideChevronLeft,
    LucideChevronRight,
    LucideCircleCheck,
    LucideMapPin,
    LucideTent,
    LucideUmbrella,
    GuestQr,
    ZAlert,
    ZEmpty,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './payment-success.html',
  styleUrl: '../payment-result.scss',
})
export class PaymentSuccess {
  private readonly bookingsApi = inject(BookingsApi);
  private readonly router = inject(Router);

  /** `?bookingId=`: lo manda el backend al redirigir. */
  readonly bookingId = input<string | string[]>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly booking = signal<Booking | null>(null);
  protected readonly loadError = signal('');
  protected readonly ticketIndex = signal(0);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  /** Cada carga nueva invalida a las anteriores: una respuesta vieja no pisa a la nueva. */
  private run = 0;

  protected readonly unit = computed(() => {
    const booking = this.booking();
    return booking ? unitLabel(booking.rentalUnitType, booking.rentalUnitIdentifier) : '';
  });
  protected readonly days = computed(() => {
    const booking = this.booking();
    if (!booking) return '';
    const count = dayCount(booking.startDate, booking.endDate);
    return `${dayRange(booking.startDate, booking.endDate)} · ${count} ${count === 1 ? 'día' : 'días'}`;
  });
  protected readonly total = computed(() => money(this.booking()?.totalPrice ?? 0));
  protected readonly number = computed(() => bookingNumber(this.booking()?.id ?? 0));
  protected readonly currentGuest = computed(
    () => this.booking()?.guests[this.ticketIndex()] ?? null,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());

    effect(() => {
      const raw = this.bookingId();
      const id = Array.isArray(raw) ? raw[0] : raw;
      untracked(() => this.start(id));
    });
  }

  protected reload(): void {
    const raw = this.bookingId();
    this.start(Array.isArray(raw) ? raw[0] : raw);
  }

  protected showTicket(step: number): void {
    const guests = this.booking()?.guests.length ?? 0;
    this.ticketIndex.update((index) => Math.min(Math.max(index + step, 0), guests - 1));
  }

  protected goToMyBookings(): void {
    void this.router.navigateByUrl('/my-bookings');
  }

  private start(id: string | undefined): void {
    this.stop();
    this.retries = 0;
    this.ticketIndex.set(0);

    if (!id || !/^\d+$/.test(id)) {
      this.state.set('missing');
      return;
    }
    this.state.set('loading');
    this.check(id);
  }

  private stop(): void {
    this.run++;
    clearTimeout(this.timer);
  }

  private check(id: string): void {
    const run = ++this.run;

    this.bookingsApi.get(id).subscribe({
      next: (booking) => {
        if (run === this.run) this.onBooking(id, booking);
      },
      error: (error: HttpErrorResponse) => {
        if (run === this.run) this.onError(id, error);
      },
    });
  }

  private onBooking(id: string, booking: Booking): void {
    this.booking.set(booking);

    if (booking.status === 'CONFIRMED') {
      clearPendingBooking();
      this.state.set('confirmed');
      return;
    }
    // Cancelada: no hay nada que esperar. El detalle explica qué pasó.
    if (booking.status === 'CANCELED') {
      this.goToDetail(id);
      return;
    }
    this.waitAndCheck(id);
  }

  private onError(id: string, error: HttpErrorResponse): void {
    // Con la espera en marcha, un tropiezo de la red no tira la pantalla: se sigue preguntando.
    if (this.state() === 'confirming') {
      this.waitAndCheck(id);
    } else if (error.status === 403) {
      this.state.set('forbidden');
    } else if (error.status === 404) {
      this.state.set('not-found');
    } else {
      this.loadError.set(toUserMessage(error));
      this.state.set('error');
    }
  }

  /** Sigue figurando pendiente: «Estamos confirmando tu pago», y otra consulta en 3 segundos. */
  private waitAndCheck(id: string): void {
    if (this.retries >= MAX_RETRIES) {
      this.goToDetail(id);
      return;
    }
    this.retries++;
    this.state.set('confirming');
    this.timer = setTimeout(() => this.check(id), POLL_MS);
  }

  /** Pasó el minuto y no se confirmó: el detalle muestra el estado de la reserva y deja pagar. */
  private goToDetail(id: string): void {
    this.stop();
    void this.router.navigate(['/bookings', id], { replaceUrl: true });
  }
}
