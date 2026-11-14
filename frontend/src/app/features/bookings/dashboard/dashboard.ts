import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideCalendarDays,
  LucideChevronLeft,
  LucideChevronRight,
  LucideSearch,
  LucideTent,
  LucideUmbrella,
} from '@lucide/angular';
import { Booking } from '../../../core/api/booking.models';
import { BookingsApi } from '../../../core/api/bookings.api';
import { toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { GuestQr } from '../../../shared/guest-qr/guest-qr';
import { todayIso } from '../../../shared/utils/days';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import {
  BOOKING_STATUS,
  dayCount,
  money,
  paymentExpired,
  shortDate,
  unitLabel,
} from '../booking-format';
import { bookingFigures, todayBooking, upcomingBookings } from './dashboard-data';

type LoadState = 'loading' | 'ready' | 'error';

/** «Hoy · sábado 14 de noviembre». */
const longToday = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Por qué una reserva que se iba a pagar ya no se paga, como en Mis reservas. */
interface PayNotice {
  variant: 'success' | 'warning';
  title: string;
  text: string;
  /** Si está, el aviso ofrece volver a reservar lo mismo. */
  rebook: Booking | null;
}

/** Lo que muestra cada tarjeta de las próximas, ya armado: la misma de Mis reservas. */
interface UpcomingCard {
  booking: Booking;
  status: { label: string; modifier: string };
  unit: string;
  days: string;
  total: string;
  /** Pendiente y pasada la hora (o el backend dijo que ya no se paga): «Volver a reservar». */
  expired: boolean;
}

/**
 * El Inicio del cliente (`/dashboard`), adonde llega al ingresar: qué tiene hoy y qué le viene.
 * Arriba de todo, la reserva de hoy con sus entradas, porque es lo que se necesita parado en la
 * puerta; después las próximas, las cifras y la búsqueda.
 */
@Component({
  selector: 'app-client-dashboard',
  imports: [
    RouterLink,
    LucideCalendarDays,
    LucideChevronLeft,
    LucideChevronRight,
    LucideSearch,
    LucideTent,
    LucideUmbrella,
    GuestQr,
    ZAlert,
    ZBtn,
    ZEmpty,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class ClientDashboard {
  private readonly bookingsApi = inject(BookingsApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly bookings = signal<Booking[]>([]);
  protected readonly ticketIndex = signal(0);
  /** La reserva que se está por pagar: mientras tanto, las otras no se pueden pagar. */
  protected readonly paying = signal<number | null>(null);
  protected readonly payError = signal('');
  /** El motivo de una reserva que, al pagar, ya no estaba pendiente: puede que ya no esté en la lista. */
  protected readonly payNotice = signal<PayNotice | null>(null);
  /** Las pendientes que, al pagar, respondieron 400: ya no se pagan. */
  private readonly rejected = signal<ReadonlySet<number>>(new Set());
  /** La hora contra la que se mira si una pendiente venció: se toma al traer las reservas. */
  private readonly now = signal(Date.now());

  /** Hoy, una sola vez: el reparto no cambia mientras la pantalla está abierta. */
  private readonly today = todayIso();
  protected readonly todayText = longToday.format(new Date());
  protected readonly firstName = computed(() => this.session.user()?.firstName ?? '');

  protected readonly current = computed(() => todayBooking(this.bookings(), this.today));
  protected readonly currentGuest = computed(
    () => this.current()?.guests[this.ticketIndex()] ?? null,
  );
  protected readonly upcoming = computed(() =>
    upcomingBookings(this.bookings(), this.today, this.current()).map((booking) =>
      this.toCard(booking),
    ),
  );
  protected readonly figures = computed(() => bookingFigures(this.bookings()));

  constructor() {
    this.load();
  }

  protected load(): void {
    const clientId = this.session.user()?.idClient;
    // El guard deja entrar solo a un cliente; si igual falta, que no quede cargando.
    if (clientId == null) {
      this.loadError.set('Tu sesión no tiene una cuenta de cliente. Volvé a ingresar.');
      this.state.set('error');
      return;
    }
    this.state.set('loading');
    this.payError.set('');

    this.bookingsApi.byClient(clientId).subscribe({
      next: (bookings) => {
        this.show(bookings);
        this.state.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toUserMessage(error));
        this.state.set('error');
      },
    });
  }

  protected goToResorts(): void {
    void this.router.navigateByUrl('/');
  }

  protected showTicket(step: number): void {
    const guests = this.current()?.guests.length ?? 0;
    this.ticketIndex.update((index) => Math.min(Math.max(index + step, 0), guests - 1));
  }

  protected stay(booking: Booking): string {
    return `${unitLabel(booking.rentalUnitType, booking.rentalUnitIdentifier)} · ${this.days(booking)}`;
  }

  /**
   * Una dirección de pago nueva y a MercadoPago, como en Mis reservas. Si responde 400, la reserva
   * ya no se paga (venció, se pagó o se canceló): se vuelven a traer las reservas, que dicen cuál.
   */
  protected pay(booking: Booking): void {
    this.paying.set(booking.id);
    this.payError.set('');
    this.payNotice.set(null);

    this.bookingsApi.pay(booking.id).subscribe({
      next: ({ paymentUrl }) => this.redirect(paymentUrl),
      error: (error: HttpErrorResponse) => {
        if (error.status === 400) {
          // Sigue «pagando» hasta que vuelve la lista: no se puede tocar de nuevo mientras tanto, y
          // no dice «venció» antes de saber cómo está.
          this.refresh(booking, toUserMessage(error));
        } else {
          this.paying.set(null);
          this.payError.set(toUserMessage(error));
        }
      },
    });
  }

  protected rebook(booking: Booking): void {
    void this.router.navigate(['/book', booking.resortId], {
      queryParams: this.rebookQuery(booking),
    });
  }

  /** Volver a reservar lo mismo: el mismo balneario, con la unidad y las fechas ya puestas. */
  protected rebookQuery(booking: Booking): Record<string, string | number> {
    return { unit: booking.rentalUnitId, from: booking.startDate, to: booking.endDate };
  }

  /** Sale de la aplicación hacia MercadoPago. Aparte, para poder reemplazarlo en las pruebas. */
  protected redirect(url: string): void {
    window.location.assign(url);
  }

  /**
   * Al pagar respondió 400: las reservas como están ahora, sin pasar por el esqueleto, y por qué
   * esa ya no se paga. Una cancelada sale de la lista: sin el aviso, desaparecería sin explicación.
   * Si la lista no llega, queda el motivo que dio el backend.
   */
  private refresh(booking: Booking, rejection: string): void {
    const clientId = this.session.user()?.idClient;
    if (clientId == null) {
      this.paying.set(null);
      this.payError.set(rejection);
      return;
    }
    this.bookingsApi.byClient(clientId).subscribe({
      next: (bookings) => {
        const current = bookings.find((b) => b.id === booking.id);
        // Sigue pendiente: para el backend ya venció, aunque la computadora atrase.
        if (current?.status === 'PENDING') {
          this.rejected.update((ids) => new Set(ids).add(booking.id));
        }
        this.show(bookings);
        this.paying.set(null);
        if (current) this.payNotice.set(noticeFor(current));
      },
      error: () => {
        this.paying.set(null);
        this.payError.set(rejection);
      },
    });
  }

  private show(bookings: Booking[]): void {
    this.bookings.set(bookings);
    this.now.set(Date.now());
    this.ticketIndex.set(0);
  }

  private days(booking: Booking): string {
    const count = dayCount(booking.startDate, booking.endDate);
    const range =
      booking.startDate === booking.endDate
        ? shortDate(booking.startDate)
        : `${shortDate(booking.startDate)} → ${shortDate(booking.endDate)}`;
    return `${range} · ${count} ${count === 1 ? 'día' : 'días'}`;
  }

  private toCard(booking: Booking): UpcomingCard {
    return {
      booking,
      status: BOOKING_STATUS[booking.status],
      unit: unitLabel(booking.rentalUnitType, booking.rentalUnitIdentifier),
      days: this.days(booking),
      total: money(booking.totalPrice),
      expired:
        booking.status === 'PENDING' &&
        (this.rejected().has(booking.id) || paymentExpired(booking, this.now())),
    };
  }
}

/**
 * El aviso de una reserva que ya no se paga, según cómo está ahora. Una que sigue pendiente ya lo
 * dice en su tarjeta («La reserva venció»): no lleva aviso aparte.
 */
function noticeFor(booking: Booking): PayNotice | null {
  if (booking.status === 'CONFIRMED') {
    return {
      variant: 'success',
      title: 'Ya está paga',
      text: `El pago de ${booking.resortName} se acreditó mientras tanto: tus entradas están en la reserva.`,
      rebook: null,
    };
  }
  if (booking.status === 'CANCELED') {
    return booking.canceledBy === 'SYSTEM'
      ? {
          variant: 'warning',
          title: 'La reserva venció',
          text: `La de ${booking.resortName} pasó la hora para pagarla y se canceló. Si todavía te sirve, reservala de nuevo.`,
          rebook: booking,
        }
      : {
          variant: 'warning',
          title: 'La reserva se canceló',
          text: `La de ${booking.resortName} ya no está pendiente de pago. Si todavía te sirve, reservala de nuevo.`,
          rebook: booking,
        };
  }
  return null;
}
