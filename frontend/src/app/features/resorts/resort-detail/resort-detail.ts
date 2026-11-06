import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { LucideChevronLeft, LucideDynamicIcon, LucideMapPin } from '@lucide/angular';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { RentalUnit, Resort, UnitType } from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { SessionService } from '../../../core/session/session.service';
import { ResortPlan } from '../../../shared/resort-plan/resort-plan';
import { occupiedDays, totalPrice } from '../../../shared/utils/days';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZDateRange } from '../../../shared/z-date-range/z-date-range';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import { amenityIcon } from './amenities/amenity-icons';

type Status = 'loading' | 'ready' | 'not-found' | 'error';

const TYPE_NAME: Record<UnitType, string> = { UMBRELLA: 'Sombrilla', TENT: 'Carpa' };

/** «$ 8.500»: para los precios sueltos. */
const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});
/** «$ 25.500,00»: para lo que se cobra, con centavos como en el diseño. */
const pesosCents = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

/**
 * La Ficha de un balneario (`/resorts/:id`): cómo es, qué ofrece y dónde se elige el lugar. Es
 * pública. Al elegir fechas y una unidad muestra el total y lleva a Reservar, que recibe lo elegido
 * en la dirección: `/book/:resortId?unit=…&from=…&to=…`.
 */
@Component({
  selector: 'app-resort-detail',
  imports: [
    LucideChevronLeft,
    LucideDynamicIcon,
    LucideMapPin,
    ResortPlan,
    RouterLink,
    ZAlert,
    ZDateRange,
    ZEmpty,
    ZProblem,
    ZSkeleton,
  ],
  styleUrl: './resort-detail.scss',
  templateUrl: './resort-detail.html',
})
export class ResortDetail {
  private readonly resortsApi = inject(ResortsApi);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);

  /** El `:id` de la ruta, que llega por `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  readonly status = signal<Status>('loading');
  readonly resort = signal<Resort | null>(null);

  /** Las fechas elegidas, `YYYY-MM-DD`. */
  readonly from = signal<string | null>(null);
  readonly to = signal<string | null>(null);
  /** El `idRentalUnit` de la unidad elegida en el plano. */
  readonly selectedId = signal<number | null>(null);

  protected readonly typeName = TYPE_NAME;
  protected readonly amenityIcon = amenityIcon;

  /** Cada vez que sube, se vuelve a pedir el balneario: es lo que hace Reintentar. */
  private readonly attempt = signal(0);

  readonly selectedUnit = computed<RentalUnit | null>(() => {
    const id = this.selectedId();
    return this.resort()?.rentalUnits.find((unit) => unit.idRentalUnit === id) ?? null;
  });

  /** Los días que se cobran, contando la entrada y la salida. 0 si todavía faltan fechas. */
  readonly days = computed(() => {
    const from = this.from();
    const to = this.to();
    return from && to ? occupiedDays(from, to) : 0;
  });

  protected readonly total = computed(() => {
    const unit = this.selectedUnit();
    const from = this.from();
    const to = this.to();
    return unit && from && to && this.days() > 0
      ? pesosCents.format(totalPrice(unit.dailyPrice, from, to))
      : '—';
  });

  /** Se puede reservar con una unidad y unas fechas válidas. */
  readonly canBook = computed(
    () => this.resort()?.active === true && this.selectedUnit() !== null && this.days() > 0,
  );

  protected readonly bookLabel = computed(() => {
    const unit = this.selectedUnit();
    if (unit === null) return 'Elegí un lugar';
    return this.days() > 0 ? `Reservar ${unit.identifier}` : 'Elegí tus fechas';
  });

  /** La barra del celular: el lugar elegido y, abajo, los días y el total. */
  protected readonly barTitle = computed(() => {
    const unit = this.selectedUnit();
    return unit ? `${TYPE_NAME[unit.type]} ${unit.identifier}` : 'Elegí tu lugar';
  });

  protected readonly barSubtitle = computed(() => {
    if (this.days() === 0) return 'Elegí tus fechas';
    const days = this.days() === 1 ? '1 día' : `${this.days()} días`;
    return this.selectedUnit() ? `${days} · ${this.total()}` : days;
  });

  protected readonly skeletonCards = [1, 2, 3];

  constructor() {
    toObservable(computed(() => ({ id: this.id(), attempt: this.attempt() })))
      .pipe(
        tap(() => {
          this.status.set('loading');
          this.resort.set(null);
          this.selectedId.set(null);
        }),
        switchMap(({ id }) =>
          this.resortsApi.get(id).pipe(
            map((resort) => ({ status: 'ready' as Status, resort })),
            catchError((error: HttpErrorResponse) =>
              of({
                status: (error.status === 404 ? 'not-found' : 'error') as Status,
                resort: null,
              }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ status, resort }) => {
        this.resort.set(resort);
        this.status.set(status);
      });
  }

  reload(): void {
    this.attempt.update((attempt) => attempt + 1);
  }

  goHome(): void {
    void this.router.navigate(['/']);
  }

  /** El precio de una unidad suelta, sin centavos: «$ 8.500». */
  protected price(value: number): string {
    return pesos.format(value);
  }

  /** El precio por día con centavos, como se cobra. */
  protected priceWithCents(value: number): string {
    return pesosCents.format(value);
  }

  /** «Fila A · » para las unidades con identificador A-03; nada para las demás. */
  protected rowOf(unit: RentalUnit): string {
    const dash = unit.identifier.indexOf('-');
    return dash > 0 ? `Fila ${unit.identifier.slice(0, dash)} · ` : '';
  }

  /** Lleva a Reservar con la unidad y las fechas elegidas. Sin sesión, el guard manda a ingresar. */
  book(): void {
    const resort = this.resort();
    const unit = this.selectedUnit();
    const from = this.from();
    const to = this.to();
    if (!this.canBook() || !resort || !unit || !from || !to) return;

    void this.router.navigate(['/book', resort.idResort], {
      queryParams: { unit: unit.idRentalUnit, from, to },
    });
  }
}
