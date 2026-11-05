import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideCalendarDays,
  LucideChevronLeft,
  LucideChevronRight,
  LucideMapPin,
  LucideTent,
  LucideUmbrella,
} from '@lucide/angular';
import { Booking } from '../../../core/api/booking.models';
import { BookingsApi } from '../../../core/api/bookings.api';
import { toUserMessage } from '../../../core/errors/error-message';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import {
  BOOKING_STATUS,
  bookingNumber,
  dayCount,
  dayRange,
  money,
  unitLabel,
} from '../booking-format';
import { GuestQr } from '../guest-qr/guest-qr';

type LoadState = 'loading' | 'ready' | 'forbidden' | 'not-found' | 'error';

/**
 * Una reserva del cliente: el balneario, la unidad, los días y el total, y una entrada con QR por
 * cada persona cuando está confirmada. Si está pendiente, se paga o se cancela desde acá.
 */
@Component({
  selector: 'app-booking-detail',
  imports: [
    RouterLink,
    LucideCalendarDays,
    LucideChevronLeft,
    LucideChevronRight,
    LucideMapPin,
    LucideTent,
    LucideUmbrella,
    GuestQr,
    ZAlert,
    ZBtn,
    ZEmpty,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './booking-detail.html',
  styleUrl: './booking-detail.scss',
})
export class BookingDetail {
  private bookingsApi = inject(BookingsApi);
  private router = inject(Router);
  private cancelDialog = viewChild<ElementRef<HTMLDialogElement>>('cancelDialog');

  /** El `:id` de la ruta. */
  id = input.required<string>();

  protected state = signal<LoadState>('loading');
  protected booking = signal<Booking | null>(null);
  protected loadError = signal('');
  /** El error de pagar o cancelar: se muestra arriba de las acciones. */
  protected actionError = signal('');
  protected paying = signal(false);
  protected canceling = signal(false);
  protected ticketIndex = signal(0);

  protected status = computed(() => {
    const booking = this.booking();
    return booking ? BOOKING_STATUS[booking.status] : null;
  });
  protected unit = computed(() => {
    const booking = this.booking();
    return booking ? unitLabel(booking.rentalUnitType, booking.rentalUnitIdentifier) : '';
  });
  protected days = computed(() => {
    const booking = this.booking();
    if (!booking) return '';
    const count = dayCount(booking.startDate, booking.endDate);
    return `${dayRange(booking.startDate, booking.endDate)} · ${count} ${count === 1 ? 'día' : 'días'}`;
  });
  protected total = computed(() => money(this.booking()?.totalPrice ?? 0));
  protected number = computed(() => bookingNumber(this.booking()?.id ?? 0));
  protected currentGuest = computed(() => this.booking()?.guests[this.ticketIndex()] ?? null);

  constructor() {
    // Si cambia el :id sin salir de la pantalla, se trae la reserva nueva.
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected load(id = this.id()): void {
    this.state.set('loading');
    this.actionError.set('');
    this.ticketIndex.set(0);

    this.bookingsApi.get(id).subscribe({
      next: (booking) => {
        this.booking.set(booking);
        this.state.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 403) {
          this.state.set('forbidden');
        } else if (error.status === 404) {
          this.state.set('not-found');
        } else {
          this.loadError.set(toUserMessage(error));
          this.state.set('error');
        }
      },
    });
  }

  protected goToMyBookings(): void {
    void this.router.navigateByUrl('/my-bookings');
  }

  protected showTicket(step: number): void {
    const guests = this.booking()?.guests.length ?? 0;
    this.ticketIndex.update((index) => Math.min(Math.max(index + step, 0), guests - 1));
  }

  /** Una dirección de pago nueva para la misma reserva, y a MercadoPago. */
  protected pay(): void {
    const booking = this.booking();
    if (!booking) return;
    this.paying.set(true);
    this.actionError.set('');

    this.bookingsApi.pay(booking.id).subscribe({
      next: ({ paymentUrl }) => this.redirect(paymentUrl),
      error: (error: HttpErrorResponse) => {
        this.paying.set(false);
        this.actionError.set(toUserMessage(error));
      },
    });
  }

  protected askCancel(): void {
    this.actionError.set('');
    this.cancelDialog()?.nativeElement.showModal();
  }

  protected closeCancel(): void {
    this.cancelDialog()?.nativeElement.close();
  }

  protected confirmCancel(): void {
    const booking = this.booking();
    if (!booking) return;
    this.canceling.set(true);

    this.bookingsApi.cancel(booking.id).subscribe({
      next: (canceled) => {
        this.booking.set(canceled);
        this.canceling.set(false);
        this.closeCancel();
      },
      error: (error: HttpErrorResponse) => {
        this.canceling.set(false);
        this.closeCancel();
        this.actionError.set(toUserMessage(error));
      },
    });
  }

  /** Sale de la aplicación hacia MercadoPago. Aparte, para poder reemplazarlo en las pruebas. */
  protected redirect(url: string): void {
    window.location.assign(url);
  }
}
