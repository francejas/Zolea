import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { applyEach, form, FormField, pattern, required, submit } from '@angular/forms/signals';
import { LucidePlus, LucidePrinter, LucideTrash2, LucideUserPlus } from '@lucide/angular';
import { catchError, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { Booking, GuestRequest } from '../../../core/api/booking.models';
import { BookingsApi } from '../../../core/api/bookings.api';
import { RentalUnit, Resort } from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { toFieldErrors, toUserMessage } from '../../../core/errors/error-message';
import { GuestQr } from '../../../shared/guest-qr/guest-qr';
import { ResortPlan } from '../../../shared/resort-plan/resort-plan';
import { occupiedDays, todayIso, totalPrice } from '../../../shared/utils/days';
import { bookingNumber, money, unitLabel } from '../../../shared/utils/format';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZDateRange } from '../../../shared/z-date-range/z-date-range';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';

type LoadState = 'loading' | 'ready' | 'no-resort' | 'error';

/** El formulario: se llama como el pedido al backend, así `toFieldErrors` pega cada error en su campo. */
interface WalkInModel {
  walkInName: string;
  walkInDni: string;
  guests: GuestRequest[];
}

const DNI = /^\d{7,8}$/;
const DNI_MESSAGE = 'El DNI son 7 u 8 números, sin puntos.';

const emptyModel = (): WalkInModel => ({ walkInName: '', walkInDni: '', guests: [] });

/**
 * Reserva en mostrador (`/admin/walkin`): el administrador reserva para alguien que llega sin cuenta
 * y le da la entrada en el momento. Se carga el titular (nombre y DNI), las fechas, la unidad en el
 * plano del balneario y los acompañantes, como en Reservar.
 *
 * Se confirma en el acto, sin MercadoPago: se cobra en el mostrador. Al confirmar se ven las
 * entradas de cada persona, con el nombre que se cargó, para mostrarlas o imprimirlas; después,
 * «Nueva reserva» deja la pantalla lista para el siguiente.
 */
@Component({
  selector: 'app-walkin',
  imports: [
    FormField,
    GuestQr,
    LucidePlus,
    LucidePrinter,
    LucideTrash2,
    LucideUserPlus,
    ResortPlan,
    ZAlert,
    ZBtn,
    ZDateRange,
    ZEmpty,
    ZField,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './walkin.html',
  styleUrl: './walkin.scss',
})
export class WalkIn {
  private readonly resortsApi = inject(ResortsApi);
  private readonly bookingsApi = inject(BookingsApi);

  protected readonly state = signal<LoadState>('loading');
  protected readonly resort = signal<Resort | null>(null);

  /** Las fechas arrancan en hoy: quien está en el mostrador casi siempre entra ya. */
  protected readonly startDate = signal<string | null>(todayIso());
  protected readonly endDate = signal<string | null>(todayIso());
  protected readonly selectedId = signal<number | null>(null);

  private readonly model = signal<WalkInModel>(emptyModel());
  protected readonly walkInForm = form(this.model, (path) => {
    required(path.walkInName, { message: 'Escribí el nombre del titular.' });
    required(path.walkInDni, { message: 'Escribí el DNI del titular.' });
    pattern(path.walkInDni, DNI, { message: DNI_MESSAGE });
    applyEach(path.guests, (guest) => {
      required(guest.fullName, { message: 'Escribí el nombre completo.' });
      required(guest.dni, { message: 'Escribí el DNI.' });
      pattern(guest.dni, DNI, { message: DNI_MESSAGE });
    });
  });

  /** El error de reservar que no es de un campo: la unidad ocupada en esas fechas, bloqueada… */
  protected readonly formError = signal('');
  /** Se intentó reservar sin unidad o sin fechas: se marca en el resumen. */
  protected readonly missingChoice = signal(false);
  /** La reserva recién confirmada: mientras hay una, se ven sus entradas en lugar del formulario. */
  protected readonly confirmed = signal<Booking | null>(null);

  /** Cada vez que sube, se vuelve a pedir el balneario: es lo que hace Reintentar. */
  private readonly attempt = signal(0);

  protected readonly selectedUnit = computed<RentalUnit | null>(() => {
    const id = this.selectedId();
    return this.resort()?.rentalUnits.find((unit) => unit.idRentalUnit === id) ?? null;
  });

  /** Los días que se cobran, contando la entrada y la salida. 0 si todavía faltan fechas. */
  protected readonly days = computed(() => {
    const from = this.startDate();
    const to = this.endDate();
    return from && to ? occupiedDays(from, to) : 0;
  });

  protected readonly daysLabel = computed(() =>
    this.days() === 1 ? '1 día' : `${this.days()} días`,
  );

  protected readonly total = computed(() => {
    const unit = this.selectedUnit();
    const from = this.startDate();
    const to = this.endDate();
    return unit && from && to && this.days() > 0
      ? money(totalPrice(unit.dailyPrice, from, to))
      : '—';
  });

  protected readonly dailyPrice = computed(() => {
    const unit = this.selectedUnit();
    return unit ? money(unit.dailyPrice) : '—';
  });

  protected readonly unitName = computed(() => {
    const unit = this.selectedUnit();
    return unit ? unitLabel(unit.type, unit.identifier) : '—';
  });

  protected readonly canBook = computed(() => this.selectedUnit() !== null && this.days() > 0);

  /** El titular y sus acompañantes. */
  protected readonly people = computed(() => this.model().guests.length + 1);

  protected readonly confirmedNumber = computed(() => {
    const booking = this.confirmed();
    return booking ? bookingNumber(booking.id) : '';
  });

  protected readonly confirmedTotal = computed(() => {
    const booking = this.confirmed();
    return booking ? money(booking.totalPrice) : '';
  });

  protected readonly skeletonLines = [1, 2, 3];

  constructor() {
    // El error de reservar habla de la unidad y las fechas que se mandaron: si se cambia alguna, ya
    // no corresponde.
    effect(() => {
      this.selectedId();
      this.startDate();
      this.endDate();
      untracked(() => this.formError.set(''));
    });

    toObservable(this.attempt)
      .pipe(
        tap(() => this.state.set('loading')),
        switchMap(() =>
          this.resortsApi.mine().pipe(
            map((resort) => ({ state: 'ready' as LoadState, resort })),
            catchError((error: HttpErrorResponse) =>
              of({
                state: (error.status === 404 ? 'no-resort' : 'error') as LoadState,
                resort: null,
              }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ state, resort }) => {
        this.resort.set(resort);
        this.state.set(state);
      });
  }

  reload(): void {
    this.attempt.update((attempt) => attempt + 1);
  }

  protected addGuest(): void {
    this.model.update((value) => ({
      ...value,
      guests: [...value.guests, { fullName: '', dni: '' }],
    }));
  }

  protected removeGuest(index: number): void {
    this.model.update((value) => ({
      ...value,
      guests: value.guests.filter((_, position) => position !== index),
    }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.book();
  }

  /** La impresión del navegador: los estilos de impresión dejan solo las entradas. */
  protected print(): void {
    window.print();
  }

  /** Deja la pantalla como recién abierta, para el siguiente que llega al mostrador. */
  protected newBooking(): void {
    this.confirmed.set(null);
    this.formError.set('');
    this.missingChoice.set(false);
    this.selectedId.set(null);
    this.startDate.set(todayIso());
    this.endDate.set(todayIso());
    this.walkInForm().reset(emptyModel());
  }

  private async book(): Promise<void> {
    // Mientras el pedido está en curso no se manda otro: el botón también queda deshabilitado.
    if (this.walkInForm().submitting()) return;
    this.formError.set('');

    const unit = this.selectedUnit();
    const startDate = this.startDate();
    const endDate = this.endDate();
    // Sin unidad o sin fechas no sale, pero el formulario igual se valida: así se marcan juntos el
    // resumen y los campos que falten.
    this.missingChoice.set(!this.canBook());

    await submit(this.walkInForm, async () => {
      if (!this.canBook() || !unit || !startDate || !endDate) return;
      const value = this.walkInForm().value();

      try {
        const { booking } = await firstValueFrom(
          this.bookingsApi.walkIn({
            startDate,
            endDate,
            rentalUnitId: unit.idRentalUnit,
            walkInName: value.walkInName.trim(),
            walkInDni: value.walkInDni.trim(),
            guests: value.guests.map(cleanGuest),
          }),
        );
        this.confirmed.set(booking);
        return;
      } catch (error) {
        const err = error as HttpErrorResponse;
        const fieldErrors = toFieldErrors(this.walkInForm, err);
        if (fieldErrors.length > 0) return fieldErrors;
        // La unidad ocupada en esas fechas o bloqueada llega como mensaje general, como en Reservar.
        this.formError.set(toUserMessage(err));
        return;
      }
    });
  }
}

/** Sin espacios de más: el backend toma el nombre y el DNI tal cual. */
function cleanGuest(guest: GuestRequest): GuestRequest {
  return { fullName: guest.fullName.trim(), dni: guest.dni.trim() };
}
