import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import {
  bookingDate,
  CANCELED_BY,
  manualRefund,
  paymentLabel,
  paymentModifier,
} from './booking-detail-format';
import { ZAlert } from '../../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../../shared/z-skeleton/z-skeleton';
import { BookingsApi } from '../../../../core/api/bookings.api';
import { Booking, CancellationResponse } from '../../../../core/api/booking.models';
import {
  BOOKING_STATUS,
  bookingNumber,
  dayCount,
  money,
  unitLabel,
} from '../../../bookings/booking-format';
import { bookingHolder } from '../booking-filters';
import { toUserMessage } from '../../../../core/errors/error-message';

@Component({
  selector: 'app-admin-booking-detail',
  imports: [RouterLink, ZAlert, ZBtn, ZEmpty, ZProblem, ZSkeleton],
  templateUrl: './booking-detail.html',
  styleUrl: './booking-detail.scss',
})
export class AdminBookingDetail {
  private readonly api = inject(BookingsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly cancelDialog = viewChild<ElementRef<HTMLDialogElement>>('cancelDialog');

  private readonly reload = signal(0);
  private readonly changed = new Subject<void>();

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'forbidden' | 'not-found' | 'error'>(
    'loading',
  );

  protected readonly booking = signal<Booking | null>(null);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly notice = signal('');

  protected readonly checking = signal(false);
  protected readonly canceling = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly terms = signal<CancellationResponse | null>(null);

  protected readonly refund = computed(() => (this.booking() ? manualRefund(this.booking()!) : 0));

  protected readonly entered = computed(
    () => this.booking()?.guests.filter((guest) => guest.isEntryValidated).length ?? 0,
  );

  protected readonly statuses = BOOKING_STATUS;
  protected readonly number = bookingNumber;
  protected readonly money = money;
  protected readonly date = bookingDate;
  protected readonly days = dayCount;
  protected readonly unitLabel = unitLabel;
  protected readonly holder = bookingHolder;
  protected readonly paymentLabel = paymentLabel;
  protected readonly paymentModifier = paymentModifier;
  protected readonly canceledBy = CANCELED_BY;

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      this.reload();

      untracked(() => {
        // Al cambiar de reserva, se descartan las operaciones anteriores.
        this.changed.next();
        this.cancelDialog()?.nativeElement.close();

        this.dialogOpen.set(false);
        this.checking.set(false);
        this.canceling.set(false);
        this.terms.set(null);
        this.booking.set(null);
        this.notice.set('');
        this.actionError.set('');
        this.state.set('loading');

        const request = this.api.get(id).subscribe({
          next: (booking) => {
            this.booking.set(booking);
            this.state.set('ready');
          },
          error: (error: HttpErrorResponse) => {
            this.loadError.set(toUserMessage(error));

            this.state.set(
              error.status === 403 ? 'forbidden' : error.status === 404 ? 'not-found' : 'error',
            );
          },
        });

        onCleanup(() => request.unsubscribe());
      });
    });
  }

  protected load(): void {
    if (!this.dialogOpen()) {
      this.reload.update((value) => value + 1);
    }
  }

  protected back(): void {
    void this.router.navigateByUrl('/admin/bookings');
  }

  protected askCancel(): void {
    const booking = this.booking();

    if (!booking || booking.status === 'CANCELED' || this.dialogOpen()) {
      return;
    }

    this.terms.set(null);
    this.notice.set('');
    this.actionError.set('');
    this.dialogOpen.set(true);
    this.checking.set(true);

    this.cancelDialog()?.nativeElement.showModal();

    this.api
      .cancellation(booking.id)
      .pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroyRef))
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
    if (this.canceling()) return;

    this.changed.next();
    this.checking.set(false);
    this.cancelDialog()?.nativeElement.close();
    this.dialogOpen.set(false);
  }

  protected onDialogCancel(event: Event): void {
    event.preventDefault();
    this.closeCancel();
  }

  protected confirmCancel(): void {
    const booking = this.booking();

    if (
      !booking ||
      !this.dialogOpen() ||
      !this.terms()?.canCancel ||
      this.checking() ||
      this.canceling()
    ) {
      return;
    }

    this.canceling.set(true);
    this.actionError.set('');

    this.api
      .cancel(booking.id)
      .pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (canceled) => {
          this.booking.set(canceled);
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
