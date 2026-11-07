import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { applyEach, form, FormField, pattern, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LucideChevronLeft, LucideMapPin, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { firstValueFrom, catchError, map, of, switchMap, tap } from 'rxjs';
import { GuestRequest } from '../../../core/api/booking.models';
import { BookingsApi } from '../../../core/api/bookings.api';
import { RentalUnit, Resort } from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { ResortPlan } from '../../../shared/resort-plan/resort-plan';
import { occupiedDays, todayIso, totalPrice } from '../../../shared/utils/days';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZDateRange } from '../../../shared/z-date-range/z-date-range';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import { money, unitLabel } from '../booking-format';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * La clave de `sessionStorage` donde se guarda el id de la reserva antes de salir a MercadoPago.
 * La Vuelta del pago (11.2) la lee, porque el backend no manda el id en la vuelta.
 */
export const PENDING_BOOKING_KEY = 'zolea.pendingBooking';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Un parámetro de la dirección puede venir repetido (`?unit=1&unit=2`): se toma el primero. */
function firstOf(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? null;
}

/** Una fecha de la dirección solo sirve si tiene la forma `YYYY-MM-DD` y no es de un día pasado. */
function validDate(value: string | null): string | null {
  return value !== null && ISO_DATE.test(value) && value >= todayIso() ? value : null;
}

/**
 * Reservar (`/book/:resortId`, solo cliente): el paso donde se confirma el lugar, las fechas y los
 * acompañantes, y se sale a pagar. Toma `unit`, `from` y `to` de la dirección si vienen de la Ficha.
 *
 * Crea la reserva (queda pendiente), guarda su id en `sessionStorage` y manda a la dirección de
 * pago de MercadoPago. El titular no se carga: el backend lo agrega solo, con su propio QR.
 */
@Component({
  selector: 'app-book',
  imports: [
    FormField,
    RouterLink,
    LucideChevronLeft,
    LucideMapPin,
    LucidePlus,
    LucideTrash2,
    ResortPlan,
    ZAlert,
    ZBtn,
    ZDateRange,
    ZEmpty,
    ZField,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './book.html',
  styleUrl: './book.scss',
})
export class Book {
  private readonly resortsApi = inject(ResortsApi);
  private readonly bookingsApi = inject(BookingsApi);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);

  /** El `:id` del balneario, de la ruta. */
  readonly resortId = input.required<string>();
  /** `?unit=`, `?from=` y `?to=`: lo que se eligió en la Ficha. Todos llegan opcionales. */
  readonly unit = input<string | string[]>();
  readonly from = input<string | string[]>();
  readonly to = input<string | string[]>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly resort = signal<Resort | null>(null);

  /** Las fechas elegidas, `YYYY-MM-DD`, y el `idRentalUnit` de la unidad elegida. */
  protected readonly startDate = signal<string | null>(null);
  protected readonly endDate = signal<string | null>(null);
  protected readonly selectedId = signal<number | null>(null);

  // Los acompañantes. Cada uno se llama como en el pedido al backend (`GuestRequest`).
  private readonly guestsModel = signal({ guests: [] as GuestRequest[] });
  protected readonly guestsForm = form(this.guestsModel, (path) => {
    applyEach(path.guests, (guest) => {
      required(guest.fullName, { message: 'Escribí el nombre completo.' });
      required(guest.dni, { message: 'Escribí el DNI.' });
      pattern(guest.dni, /^\d{7,8}$/, { message: 'El DNI son 7 u 8 números, sin puntos.' });
    });
  });

  /** El error de reservar, ya redactado para la persona: unidad ocupada, fechas, MercadoPago… */
  protected readonly formError = signal('');
  /** Se intentó reservar sin lugar o sin fechas: se marcan en el resumen. */
  protected readonly missingChoice = signal(false);

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
    return unit ? unitLabel(unit.type, unit.identifier) : '';
  });

  protected readonly canBook = computed(
    () => this.resort()?.active === true && this.selectedUnit() !== null && this.days() > 0,
  );

  /** El titular, que no se carga: es quien tiene la sesión. */
  protected readonly holderName = computed(() => {
    const user = this.session.user();
    return user ? `${user.firstName} ${user.lastName}` : '';
  });

  /** El titular y sus acompañantes. */
  protected readonly people = computed(() => this.guestsModel().guests.length + 1);

  protected readonly skeletonLines = [1, 2, 3];

  constructor() {
    toObservable(computed(() => ({ id: this.resortId(), attempt: this.attempt() })))
      .pipe(
        tap(() => {
          this.state.set('loading');
          this.resort.set(null);
        }),
        switchMap(({ id }) =>
          this.resortsApi.get(id).pipe(
            map((resort) => ({ state: 'ready' as LoadState, resort })),
            catchError((error: HttpErrorResponse) =>
              of({
                state: (error.status === 404 ? 'not-found' : 'error') as LoadState,
                resort: null,
              }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ state, resort }) => {
        this.resort.set(resort);
        if (resort) this.applyChoiceFromUrl(resort);
        this.state.set(state);
      });
  }

  reload(): void {
    this.attempt.update((attempt) => attempt + 1);
  }

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  protected addGuest(): void {
    this.guestsModel.update((value) => ({
      guests: [...value.guests, { fullName: '', dni: '' }],
    }));
  }

  protected removeGuest(index: number): void {
    this.guestsModel.update((value) => ({
      guests: value.guests.filter((_, position) => position !== index),
    }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.book();
  }

  private async book(): Promise<void> {
    // Mientras el pedido está en curso no se manda otro: el botón también queda deshabilitado.
    if (this.guestsForm().submitting()) return;
    this.formError.set('');

    const unit = this.selectedUnit();
    const startDate = this.startDate();
    const endDate = this.endDate();
    const user = this.session.user();
    if (!this.canBook() || !unit || !startDate || !endDate) {
      this.missingChoice.set(true);
      return;
    }
    this.missingChoice.set(false);
    if (!user) {
      this.formError.set('Tu sesión venció. Volvé a ingresar.');
      return;
    }

    await submit(this.guestsForm, async () => {
      const guests = this.guestsForm().value().guests.map(cleanGuest);

      try {
        const { booking, paymentUrl } = await firstValueFrom(
          this.bookingsApi.create({
            startDate,
            endDate,
            clientId: user.idClient,
            rentalUnitId: unit.idRentalUnit,
            guests,
          }),
        );
        // La Vuelta del pago necesita el id y el backend no lo manda: se guarda antes de salir.
        savePendingBooking(booking.id);
        // El botón sigue en «cargando» hasta salir: así no se puede reservar dos veces.
        this.redirect(paymentUrl);
      } catch (error) {
        this.formError.set(toUserMessage(error as HttpErrorResponse));
      }
    });
  }

  /** La unidad y las fechas de la dirección, si sirven: una unidad que no existe o está bloqueada se descarta. */
  private applyChoiceFromUrl(resort: Resort): void {
    const wanted = Number(firstOf(this.unit()));
    const unit = resort.rentalUnits.find((candidate) => candidate.idRentalUnit === wanted);
    this.selectedId.set(unit && !unit.isBlocked ? unit.idRentalUnit : null);

    const from = validDate(firstOf(this.from()));
    const to = validDate(firstOf(this.to()));
    // Si las fechas no cierran, se descartan las dos y se eligen acá.
    const consistent = from !== null && to !== null && to >= from;
    this.startDate.set(consistent ? from : null);
    this.endDate.set(consistent ? to : null);
  }

  /** Sale de la aplicación hacia MercadoPago. Aparte, para poder reemplazarlo en las pruebas. */
  protected redirect(url: string): void {
    window.location.href = url;
  }
}

/** Sin espacios de más: el backend toma el nombre y el DNI tal cual. */
function cleanGuest(guest: GuestRequest): GuestRequest {
  return { fullName: guest.fullName.trim(), dni: guest.dni.trim() };
}

function savePendingBooking(id: number): void {
  try {
    sessionStorage.setItem(PENDING_BOOKING_KEY, String(id));
  } catch {
    // Sin sessionStorage la reserva igual quedó creada: se encuentra en Mis reservas.
  }
}
