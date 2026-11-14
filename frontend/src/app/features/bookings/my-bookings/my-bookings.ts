import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideCalendarDays, LucideStar, LucideTent, LucideUmbrella } from '@lucide/angular';
import { Booking } from '../../../core/api/booking.models';
import { BookingsApi } from '../../../core/api/bookings.api';
import { Review } from '../../../core/api/review.models';
import { toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
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
  refundLine,
  shortDate,
  unitLabel,
} from '../booking-format';
import { ReviewDialog } from '../review-dialog/review-dialog';

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

/** Por qué una reserva que se iba a pagar ya no se paga. */
interface PayNotice {
  variant: 'success' | 'warning';
  title: string;
  text: string;
}

const EXPIRED: PayNotice = {
  variant: 'warning',
  title: 'La reserva venció',
  text: 'Pasó la hora para pagarla y se cancela sola. Si todavía te sirve, reservala de nuevo.',
};

const EXPIRED_CANCELED: PayNotice = {
  variant: 'warning',
  title: 'La reserva venció',
  text: 'Pasó la hora para pagarla y se canceló. Si todavía te sirve, reservala de nuevo.',
};

const CANCELED: PayNotice = {
  variant: 'warning',
  title: 'La reserva se canceló',
  text: 'Ya no está pendiente de pago. Si todavía te sirve, reservala de nuevo.',
};

const PAID: PayNotice = {
  variant: 'success',
  title: 'Ya está paga',
  text: 'El pago se acreditó mientras tanto: tus entradas están en la reserva.',
};

/** Lo que muestra cada tarjeta, ya armado. */
interface BookingCard {
  booking: Booking;
  status: { label: string; modifier: string };
  unit: string;
  days: string;
  total: string;
  /** Confirmada y con hoy adentro: se destaca. */
  today: boolean;
  notice: PayNotice | null;
  /** Ya no se puede pagar: en lugar de «Pagar», «Volver a reservar». */
  rebook: boolean;
  /** Pasada, confirmada y sin calificar: lleva «Calificar». */
  canReview: boolean;
  /** «Calificaste con 4 estrellas.», o null si no la calificó. */
  reviewed: string | null;
  /** Si está cancelada, cuánto se reintegró (14.4); si no, null. */
  refund: string | null;
}

/**
 * Mis reservas: las del cliente de la sesión, en tres pestañas. Una confirmada lleva a sus
 * entradas, una pendiente se paga desde acá, una pasada se califica y una cancelada no tiene
 * acción.
 */
@Component({
  selector: 'app-my-bookings',
  imports: [
    RouterLink,
    LucideCalendarDays,
    LucideStar,
    LucideTent,
    LucideUmbrella,
    ReviewDialog,
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
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  protected readonly tabs = TABS;
  protected readonly tabLabel = TAB_LABEL;

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly bookings = signal<Booking[]>([]);
  protected readonly tab = signal<BookingTab>('upcoming');
  /** La reserva que se está por pagar: mientras tanto, las otras no se pueden pagar. */
  protected readonly paying = signal<number | null>(null);
  /** Las que, al pagar, respondieron 400 y se volvieron a traer: ya no se pagan. */
  private readonly rejected = signal<ReadonlySet<number>>(new Set());
  /** Otro error al pagar, por reserva. */
  protected readonly payErrors = signal<Readonly<Record<number, string>>>({});
  /**
   * La pestaña de cada reserva que cambió de estado con la pantalla abierta: se queda donde la
   * persona la estaba mirando, con el aviso, hasta que se vuelve a cargar.
   */
  private readonly placed = signal<Readonly<Record<number, BookingTab>>>({});
  /** La reserva que se está calificando: mientras tanto, el diálogo está abierto. */
  protected readonly reviewing = signal<Booking | null>(null);
  /** Las estrellas que puso en cada reserva que calificó con la pantalla abierta. */
  private readonly ratings = signal<Readonly<Record<number, number>>>({});
  /** La hora contra la que se mira si una pendiente venció: se toma al traer las reservas. */
  private readonly now = signal(Date.now());

  /** Hoy, una sola vez: el reparto no cambia mientras la pantalla está abierta. */
  private readonly today = todayIso();

  protected readonly counts = computed(() => {
    const counts: Record<BookingTab, number> = { upcoming: 0, past: 0, canceled: 0 };
    for (const booking of this.bookings()) counts[this.tabFor(booking)]++;
    return counts;
  });

  protected readonly cards = computed<BookingCard[]>(() => {
    const tab = this.tab();
    return this.bookings()
      .filter((booking) => this.tabFor(booking) === tab)
      .sort(byTab(tab))
      .map((booking) => this.toCard(booking));
  });

  protected readonly emptyText = computed(() => TAB_EMPTY[this.tab()]);

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

    this.bookingsApi.byClient(clientId).subscribe({
      next: (bookings) => {
        this.bookings.set(bookings);
        this.now.set(Date.now());
        this.rejected.set(new Set());
        this.placed.set({});
        this.payErrors.set({});
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
   * Una dirección de pago nueva y a MercadoPago. Si responde 400, la reserva ya no se paga: venció,
   * se pagó desde otra pestaña o se canceló. Se mira el código, no el texto, y se vuelve a traer
   * la reserva, que dice cuál de las tres.
   */
  protected pay(booking: Booking): void {
    this.paying.set(booking.id);
    this.setPayError(booking.id, null);

    this.bookingsApi.pay(booking.id).subscribe({
      next: ({ paymentUrl }) => this.redirect(paymentUrl),
      error: (error: HttpErrorResponse) => {
        if (error.status === 400) {
          this.refresh(booking, error);
        } else {
          this.paying.set(null);
          this.setPayError(booking.id, toUserMessage(error));
        }
      },
    });
  }

  protected review(booking: Booking): void {
    this.reviewing.set(booking);
  }

  /** Calificó: la tarjeta deja el botón y dice con cuántas estrellas. */
  protected onReviewed(booking: Booking, review: Review): void {
    this.ratings.update((ratings) => ({ ...ratings, [booking.id]: review.rating }));
    this.bookings.update((list) =>
      list.map((b) => (b.id === booking.id ? { ...b, reviewed: true } : b)),
    );
    this.reviewing.set(null);
    this.focusReviewed(booking.id);
  }

  /** Se cerró sin calificar: si mientras tanto quedó calificada, el botón ya no está. */
  protected onReviewClosed(booking: Booking): void {
    this.reviewing.set(null);
    this.focusReviewed(booking.id);
  }

  /** El backend no aceptó la reseña: la reserva como está ahora dice si ya se calificó. */
  protected onReviewRejected(booking: Booking): void {
    this.bookingsApi.get(booking.id).subscribe({
      next: (current) => this.replace(booking, current),
      // Sin la reserva, queda el motivo que el diálogo ya muestra.
      error: () => undefined,
    });
  }

  /**
   * Si la tarjeta ya no tiene «Calificar», el foco pasa a lo que dice que se calificó: si no, al
   * desaparecer el botón quedaría en ningún lado. Así también se lee el resultado.
   */
  private focusReviewed(id: number): void {
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLElement>(`#my-bookings-reviewed-${id}`)?.focus(),
      { injector: this.injector },
    );
  }

  /** La reserva como está ahora, en el mismo lugar de la lista. */
  private replace(booking: Booking, current: Booking): void {
    this.placed.update((placed) => ({ ...placed, [booking.id]: this.tabFor(booking) }));
    this.bookings.update((list) => list.map((b) => (b.id === current.id ? current : b)));
  }

  /** Al pagar respondió 400: la reserva como está ahora dice si venció, se pagó o se canceló. */
  private refresh(booking: Booking, rejection: HttpErrorResponse): void {
    this.bookingsApi.get(booking.id).subscribe({
      next: (current) => {
        this.replace(booking, current);
        this.rejected.update((ids) => new Set(ids).add(booking.id));
        this.now.set(Date.now());
        this.paying.set(null);
      },
      // Sin la reserva, queda el motivo que dio el backend: «no está pendiente» o «venció».
      error: () => {
        this.paying.set(null);
        this.setPayError(booking.id, toUserMessage(rejection));
      },
    });
  }

  private setPayError(id: number, message: string | null): void {
    this.payErrors.update((errors) => {
      const rest = { ...errors };
      if (message === null) delete rest[id];
      else rest[id] = message;
      return rest;
    });
  }

  private tabFor(booking: Booking): BookingTab {
    return this.placed()[booking.id] ?? tabOf(booking, this.today);
  }

  /**
   * El aviso de una reserva que ya no se paga. Una pendiente vence al pasar la hora, o cuando el
   * backend lo dice aunque la computadora atrase; las demás, solo si se intentó pagarlas.
   */
  private noticeFor(booking: Booking): PayNotice | null {
    const rejected = this.rejected().has(booking.id);
    if (booking.status === 'PENDING') {
      return rejected || paymentExpired(booking, this.now()) ? EXPIRED : null;
    }
    if (!rejected) return null;
    if (booking.status === 'CONFIRMED') return PAID;
    return booking.canceledBy === 'SYSTEM' ? EXPIRED_CANCELED : CANCELED;
  }

  /** Volver a reservar lo mismo: el mismo balneario, con la unidad y las fechas ya puestas. */
  protected rebookQuery(booking: Booking): Record<string, string | number> {
    return { unit: booking.rentalUnitId, from: booking.startDate, to: booking.endDate };
  }

  /** Sale de la aplicación hacia MercadoPago. Aparte, para poder reemplazarlo en las pruebas. */
  protected redirect(url: string): void {
    window.location.assign(url);
  }

  /** Con las estrellas si calificó recién; si fue antes, la API no las trae. */
  private reviewedText(booking: Booking): string | null {
    if (!booking.reviewed) return null;
    const rating = this.ratings()[booking.id];
    if (rating === undefined) return 'Ya calificaste esta estadía.';
    return `Calificaste con ${rating} ${rating === 1 ? 'estrella' : 'estrellas'}.`;
  }

  private toCard(booking: Booking): BookingCard {
    const count = dayCount(booking.startDate, booking.endDate);
    const range =
      booking.startDate === booking.endDate
        ? shortDate(booking.startDate)
        : `${shortDate(booking.startDate)} → ${shortDate(booking.endDate)}`;
    const notice = this.noticeFor(booking);
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
      notice,
      rebook: notice !== null && notice !== PAID,
      canReview:
        booking.status === 'CONFIRMED' &&
        !booking.reviewed &&
        tabOf(booking, this.today) === 'past',
      reviewed: this.reviewedText(booking),
      refund: refundLine(booking),
    };
  }
}

/** Las próximas, de la más cercana a la más lejana; las demás, de la más nueva a la más vieja. */
function byTab(tab: BookingTab): (a: Booking, b: Booking) => number {
  if (tab === 'upcoming') return (a, b) => a.startDate.localeCompare(b.startDate);
  return (a, b) => b.endDate.localeCompare(a.endDate);
}
