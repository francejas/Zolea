import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  LucideCalendarDays,
  LucideChevronLeft,
  LucideChevronRight,
  LucideMapPin,
  LucideTent,
  LucideUmbrella,
} from '@lucide/angular';
import { Booking, CancellationResponse } from '../../../core/api/booking.models';
import { BookingsApi } from '../../../core/api/bookings.api';
import { toUserMessage } from '../../../core/errors/error-message';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import { ZDirections } from '../../../shared/z-directions/z-directions';
import {
  BOOKING_STATUS,
  bookingNumber,
  cancellationSummary,
  dayCount,
  dayRange,
  money,
  refundOffer,
  unitLabel,
} from '../booking-format';
import { GuestQr } from '../../../shared/guest-qr/guest-qr';
import { ErrorPage } from '../../error-page/error-page';

type LoadState = 'loading' | 'ready' | 'forbidden' | 'not-found' | 'error';

/** El cartel en verde después de cancelar. */
interface CancelNotice {
  title: string;
  text: string;
}

/**
 * Una reserva del cliente: el balneario, la unidad, los días y el total, y una entrada con QR por
 * cada persona cuando está confirmada. Si está pendiente, se paga desde acá; pendiente o
 * confirmada, se cancela, con lo que se reintegra dicho antes de confirmar (14.4).
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
    ErrorPage,
    GuestQr,
    ZAlert,
    ZBtn,
    ZDirections,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './booking-detail.html',
  styleUrl: './booking-detail.scss',
})
export class BookingDetail {
  private bookingsApi = inject(BookingsApi);
  private injector = inject(Injector);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
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
  /**
   * Si se puede cancelar hoy y cuánto se devolvería. Null mientras llega, si está cancelada o si
   * no se pudo traer: entonces una confirmada no ofrece cancelar.
   */
  protected terms = signal<CancellationResponse | null>(null);
  /**
   * Las condiciones al abrir la confirmación: se vuelven a pedir, porque la pantalla pudo quedar
   * abierta de un día para otro y el porcentaje haber cambiado. Null mientras llegan.
   */
  protected quote = signal<CancellationResponse | null>(null);
  protected checking = signal(false);
  protected quoteError = signal('');
  protected cancelNotice = signal<CancelNotice | null>(null);
  /** El pedido de las condiciones al abrir: si se cierra antes de que lleguen, se corta. */
  private quoteRequest: Subscription | null = null;

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
  /** Cuánto se devuelve, con las condiciones de recién. */
  protected refundText = computed(() => {
    const quote = this.quote();
    return quote ? refundOffer(quote) : '';
  });
  protected canceledText = computed(() => {
    const booking = this.booking();
    return booking?.status === 'CANCELED' ? cancellationSummary(booking) : '';
  });

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
    this.terms.set(null);
    this.cancelNotice.set(null);

    this.bookingsApi.get(id).subscribe({
      next: (booking) => {
        this.booking.set(booking);
        this.state.set('ready');
        if (booking.status !== 'CANCELED') this.loadTerms(booking.id);
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

  /** Si hoy se puede cancelar y con cuánto reintegro. Si falla, simplemente no se ofrece. */
  private loadTerms(id: number): void {
    this.bookingsApi.cancellation(id).subscribe({
      next: (terms) => this.terms.set(terms),
      error: () => this.terms.set(null),
    });
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
    const booking = this.booking();
    if (!booking) return;
    this.actionError.set('');
    this.quote.set(null);
    this.quoteError.set('');
    this.checking.set(true);
    this.cancelDialog()?.nativeElement.showModal();

    this.quoteRequest = this.bookingsApi.cancellation(booking.id).subscribe({
      next: (quote) => {
        this.quote.set(quote);
        this.checking.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.quoteError.set(toUserMessage(error));
        this.checking.set(false);
      },
    });
  }

  /**
   * Cierra la confirmación: con «Volver», después de cancelar o con Esc, que el navegador cierra
   * solo y llega como `close`. Por eso puede correr dos veces, y la segunda ya no hace nada.
   */
  protected closeCancel(): void {
    const dialog = this.cancelDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
    // Cerrado antes de que lleguen las condiciones: ya no hay a quién mostrárselas.
    this.quoteRequest?.unsubscribe();
    this.quoteRequest = null;
    this.checking.set(false);
    const quote = this.quote();
    const booking = this.booking();
    if (!quote || !booking) return;
    this.quote.set(null);
    // Si al abrir cambió algo, la pantalla se queda con eso: otro porcentaje, o ya no se puede.
    // Si ya no se puede, la reserva pudo cambiar (la cancelaron en otro lado): se vuelve a traer.
    if (quote.canCancel) this.terms.set(quote);
    else this.refresh(booking.id, quote.reason || 'Esta reserva ya no se puede cancelar.');
  }

  protected confirmCancel(): void {
    const booking = this.booking();
    if (!booking || this.checking() || !this.quote()?.canCancel) return;
    this.canceling.set(true);

    this.bookingsApi.cancel(booking.id).subscribe({
      next: (canceled) => {
        this.closeCancel();
        this.booking.set(canceled);
        this.terms.set(null);
        this.canceling.set(false);
        this.cancelNotice.set(
          canceled.refundAmount
            ? {
                title: `Tu dinero fue reintegrado: ${money(canceled.refundAmount)}.`,
                text: 'La reserva quedó cancelada y la unidad, libre para esos días.',
              }
            : {
                title: 'Cancelamos tu reserva',
                text: 'No había nada que reintegrar: todavía no estaba paga.',
              },
        );
        // El botón de cancelar ya no está: el foco pasa al cartel, que así también se lee.
        this.focusAfterRender('#booking-cancel-notice');
      },
      error: (error: HttpErrorResponse) => {
        this.canceling.set(false);
        this.closeCancel();
        const message = toUserMessage(error);
        // Un 400: la reserva cambió (ya estaba cancelada, ya empezó). Se mira el código, no el texto.
        if (error.status === 400) this.refresh(booking.id, message);
        else this.actionError.set(message);
      },
    });
  }

  /**
   * La reserva como está ahora, sin pasar por el esqueleto, y el motivo arriba de las acciones.
   * `load()` no sirve: borra el mensaje. El botón que se tocó puede no estar más: el foco pasa al
   * motivo, como al cartel verde después de cancelar.
   */
  private refresh(id: number, message: string): void {
    this.bookingsApi.get(id).subscribe({
      next: (current) => {
        this.booking.set(current);
        this.ticketIndex.set(0);
        this.terms.set(null);
        if (current.status !== 'CANCELED') this.loadTerms(current.id);
        this.showActionError(message);
      },
      error: () => this.showActionError(message),
    });
  }

  private showActionError(message: string): void {
    this.actionError.set(message);
    this.focusAfterRender('#booking-action-error');
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

  /** Sale de la aplicación hacia MercadoPago. Aparte, para poder reemplazarlo en las pruebas. */
  protected redirect(url: string): void {
    window.location.assign(url);
  }
}
