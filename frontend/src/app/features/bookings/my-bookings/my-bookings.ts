import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, ElementRef, inject, signal, viewChildren } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideCalendarDays, LucideTent, LucideUmbrella } from '@lucide/angular';
import { Booking } from '../../../core/api/booking.models';
import { BookingsApi } from '../../../core/api/bookings.api';
import { toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { todayIso } from '../../../shared/utils/days';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import { BOOKING_STATUS, dayCount, money, shortDate, unitLabel } from '../booking-format';

type LoadState = 'loading' | 'ready' | 'error';

export type BookingTab = 'upcoming' | 'past' | 'canceled';

const TABS: readonly BookingTab[] = ['upcoming', 'past', 'canceled'];

const TAB_LABEL: Record<BookingTab, string> = {
  upcoming: 'Próximas',
  past: 'Pasadas',
  canceled: 'Canceladas',
};

const TAB_EMPTY: Record<BookingTab, string> = {
  upcoming: 'No tenés reservas por delante.',
  past: 'Todavía no terminó ninguna de tus reservas.',
  canceled: 'No tenés reservas canceladas.',
};

/**
 * En qué pestaña va una reserva, con hoy como `YYYY-MM-DD`: las canceladas aparte, y las demás
 * según si terminan hoy o después (próximas) o ya terminaron (pasadas).
 */
export function tabOf(booking: Booking, today: string): BookingTab {
  if (booking.status === 'CANCELED') return 'canceled';
  return booking.endDate >= today ? 'upcoming' : 'past';
}

/** Lo que muestra cada tarjeta, ya armado. */
interface BookingCard {
  booking: Booking;
  status: { label: string; modifier: string };
  unit: string;
  days: string;
  total: string;
  /** Confirmada y con hoy adentro: se destaca. */
  today: boolean;
}

/**
 * Mis reservas: las del cliente de la sesión, en tres pestañas. Una confirmada lleva a sus
 * entradas, una pendiente se paga desde acá y una cancelada no tiene acción.
 */
@Component({
  selector: 'app-my-bookings',
  imports: [
    RouterLink,
    LucideCalendarDays,
    LucideTent,
    LucideUmbrella,
    ZAlert,
    ZBtn,
    ZEmpty,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './my-bookings.html',
  styleUrl: './my-bookings.scss',
})
export class MyBookings {
  private readonly bookingsApi = inject(BookingsApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  protected readonly tabs = TABS;
  protected readonly tabLabel = TAB_LABEL;

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly bookings = signal<Booking[]>([]);
  protected readonly tab = signal<BookingTab>('upcoming');
  /** La reserva que se está por pagar: mientras tanto, las otras no se pueden pagar. */
  protected readonly paying = signal<number | null>(null);
  /** Las pendientes que, al pagar, respondieron 400: ya pasó la hora. */
  protected readonly expired = signal<ReadonlySet<number>>(new Set());
  /** Otro error al pagar, por reserva. */
  protected readonly payErrors = signal<Readonly<Record<number, string>>>({});

  /** Hoy, una sola vez: el reparto no cambia mientras la pantalla está abierta. */
  private readonly today = todayIso();

  protected readonly counts = computed(() => {
    const counts: Record<BookingTab, number> = { upcoming: 0, past: 0, canceled: 0 };
    for (const booking of this.bookings()) counts[tabOf(booking, this.today)]++;
    return counts;
  });

  protected readonly cards = computed<BookingCard[]>(() => {
    const tab = this.tab();
    return this.bookings()
      .filter((booking) => tabOf(booking, this.today) === tab)
      .sort(byTab(tab))
      .map((booking) => this.toCard(booking));
  });

  protected readonly emptyText = computed(() => TAB_EMPTY[this.tab()]);

  constructor() {
    this.load();
  }

  protected load(): void {
    const clientId = this.session.user()?.idClient;
    if (clientId === undefined) return;
    this.state.set('loading');

    this.bookingsApi.byClient(clientId).subscribe({
      next: (bookings) => {
        this.bookings.set(bookings);
        this.state.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toUserMessage(error));
        this.state.set('error');
      },
    });
  }

  protected selectTab(tab: BookingTab): void {
    this.tab.set(tab);
  }

  /** Flechas, Inicio y Fin cambian de pestaña y llevan el foco a la que quedó activa. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const index = TABS.indexOf(this.tab());
    const next =
      event.key === 'ArrowRight'
        ? TABS[(index + 1) % TABS.length]
        : event.key === 'ArrowLeft'
          ? TABS[(index + TABS.length - 1) % TABS.length]
          : event.key === 'Home'
            ? TABS[0]
            : event.key === 'End'
              ? TABS[TABS.length - 1]
              : null;
    if (next === null) return;

    event.preventDefault();
    this.selectTab(next);
    this.tabButtons()[TABS.indexOf(next)]?.nativeElement.focus();
  }

  protected goToResorts(): void {
    void this.router.navigateByUrl('/');
  }

  /**
   * Una dirección de pago nueva y a MercadoPago. Si responde 400, la reserva ya no está pendiente:
   * pasó la hora. Se mira el código, no el texto, igual que en la vuelta del pago.
   */
  protected pay(booking: Booking): void {
    this.paying.set(booking.id);
    this.payErrors.update((errors) => {
      const rest = { ...errors };
      delete rest[booking.id];
      return rest;
    });

    this.bookingsApi.pay(booking.id).subscribe({
      next: ({ paymentUrl }) => this.redirect(paymentUrl),
      error: (error: HttpErrorResponse) => {
        this.paying.set(null);
        if (error.status === 400) {
          this.expired.update((ids) => new Set(ids).add(booking.id));
        } else {
          this.payErrors.update((errors) => ({ ...errors, [booking.id]: toUserMessage(error) }));
        }
      },
    });
  }

  protected isExpired(booking: Booking): boolean {
    return this.expired().has(booking.id);
  }

  /** Volver a reservar lo mismo: el mismo balneario, con la unidad y las fechas ya puestas. */
  protected rebookQuery(booking: Booking): Record<string, string | number> {
    return { unit: booking.rentalUnitId, from: booking.startDate, to: booking.endDate };
  }

  /** Sale de la aplicación hacia MercadoPago. Aparte, para poder reemplazarlo en las pruebas. */
  protected redirect(url: string): void {
    window.location.assign(url);
  }

  private toCard(booking: Booking): BookingCard {
    const count = dayCount(booking.startDate, booking.endDate);
    const range =
      booking.startDate === booking.endDate
        ? shortDate(booking.startDate)
        : `${shortDate(booking.startDate)} → ${shortDate(booking.endDate)}`;
    return {
      booking,
      status: BOOKING_STATUS[booking.status],
      unit: unitLabel(booking.rentalUnitType, booking.rentalUnitIdentifier),
      days: `${range} · ${count} ${count === 1 ? 'día' : 'días'}`,
      total: money(booking.totalPrice),
      today:
        booking.status === 'CONFIRMED' &&
        booking.startDate <= this.today &&
        booking.endDate >= this.today,
    };
  }
}

/** Las próximas, de la más cercana a la más lejana; las demás, de la más nueva a la más vieja. */
function byTab(tab: BookingTab): (a: Booking, b: Booking) => number {
  if (tab === 'upcoming') return (a, b) => a.startDate.localeCompare(b.startDate);
  return (a, b) => b.endDate.localeCompare(a.endDate);
}
