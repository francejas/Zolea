import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ZAlert } from '../../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../../shared/z-skeleton/z-skeleton';
import { BookingsApi } from '../../../../core/api/bookings.api';
import { Booking, BookingStatus, CancellationResponse } from '../../../../core/api/booking.models';
import { bookingHolder, filterBookings } from '../booking-filters';
import { BOOKING_STATUS, bookingNumber, money, unitLabel } from '../../../bookings/booking-format';
import { toUserMessage } from '../../../../core/errors/error-message';

@Component({
  selector: 'app-admin-bookings',
  imports: [RouterLink, ZAlert, ZBtn, ZEmpty, ZProblem, ZSkeleton],
  templateUrl: './bookings.html',
  styleUrl: './bookings.scss',
})
export class Bookings {
  private readonly api = inject(BookingsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cancelDialog = viewChild<ElementRef<HTMLDialogElement>>('cancelDialog');

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly bookings = signal<Booking[]>([]);
  protected readonly loadError = signal('');

  protected readonly status = signal<BookingStatus | ''>('');
  protected readonly from = signal('');
  protected readonly to = signal('');

  protected readonly invalidRange = computed(
    () => !!this.from() && !!this.to() && this.from() > this.to(),
  );

  protected readonly filtered = computed(() =>
    filterBookings(this.bookings(), {
      status: this.status(),
      from: this.from(),
      to: this.to(),
    }),
  );

  protected readonly hasFilters = computed(() => !!(this.status() || this.from() || this.to()));

  protected readonly pending = signal<Booking | null>(null);
  protected readonly terms = signal<CancellationResponse | null>(null);
  protected readonly checking = signal(false);
  protected readonly canceling = signal(false);
  protected readonly actionError = signal('');
  protected readonly notice = signal('');

  protected readonly statuses = BOOKING_STATUS;
  protected readonly holder = bookingHolder;
  protected readonly number = bookingNumber;
  protected readonly money = money;
  protected readonly unitLabel = unitLabel;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');

    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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

  protected setStatus(value: string): void {
    if (value === '' || value === 'PENDING' || value === 'CONFIRMED' || value === 'CANCELED') {
      this.status.set(value);
    }
  }

  protected resetFilters(): void {
    this.status.set('');
    this.from.set('');
    this.to.set('');
  }

  protected askCancel(booking: Booking): void {
    if (this.checking() || this.canceling()) return;

    this.pending.set(booking);
    this.terms.set(null);
    this.actionError.set('');
    this.notice.set('');
    this.checking.set(true);
    this.cancelDialog()?.nativeElement.showModal();

    this.api
      .cancellation(booking.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (terms) => {
          this.terms.set(terms);
          this.checking.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.checking.set(false);
          this.actionError.set(toUserMessage(error));
        },
      });
  }

  protected closeCancel(): void {
    if (this.checking() || this.canceling()) return;

    this.cancelDialog()?.nativeElement.close();
    this.pending.set(null);
  }

  protected onDialogCancel(event: Event): void {
    event.preventDefault();
    this.closeCancel();
  }

  protected confirmCancel(): void {
    const booking = this.pending();

    if (!booking || !this.terms()?.canCancel || this.checking() || this.canceling()) {
      return;
    }

    this.canceling.set(true);
    this.actionError.set('');

    this.api
      .cancel(booking.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (canceled) => {
          this.bookings.update((items) =>
            items.map((item) => (item.id === canceled.id ? canceled : item)),
          );

          this.canceling.set(false);
          this.closeCancel();
          this.notice.set(`Cancelamos la reserva ${bookingNumber(canceled.id)}.`);
        },
        error: (error: HttpErrorResponse) => {
          this.canceling.set(false);
          this.actionError.set(toUserMessage(error));
        },
      });
  }
}
