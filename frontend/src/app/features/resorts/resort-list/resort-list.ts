import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { form, FormField, min, submit, validate } from '@angular/forms/signals';
import { Params, Router, RouterLink } from '@angular/router';
import {
  LucideCheck,
  LucideDynamicIcon,
  LucideMapPin,
  LucideSearch,
  LucideSlidersHorizontal,
} from '@lucide/angular';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AmenitiesApi } from '../../../core/api/amenities.api';
import { Amenity, Resort, UnitType } from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { amenityIcon } from '../../../shared/utils/amenity-icons';
import { validRange } from '../../../shared/utils/days';
import { ZDateRange } from '../../../shared/z-date-range/z-date-range';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZRating } from '../../../shared/z-rating/z-rating';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';

/** Cuántos servicios se ven en la tarjeta; el resto se resume en «+N». */
const VISIBLE_AMENITIES = 3;

/** Se crea una sola vez: un Intl.NumberFormat nuevo por cada tarjeta y cada dibujo es caro. */
const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const UNIT_TYPES: readonly UnitType[] = ['TENT', 'UMBRELLA'];

/** Lo que se completa en el formulario de filtros. `type` vacío es «cualquiera». */
interface FilterDraft {
  from: string | null;
  to: string | null;
  type: UnitType | '';
  maxPrice: number | null;
  amenityIds: number[];
}

/** Los filtros que vinieron en la dirección, ya revisados: lo que no sirve se descarta. */
interface UrlFilters {
  from: string | null;
  to: string | null;
  type: UnitType | null;
  maxPrice: number | null;
  amenityIds: number[];
}

const EMPTY_DRAFT: FilterDraft = { from: null, to: null, type: '', maxPrice: null, amenityIds: [] };

const sameFilters = (a: UrlFilters, b: UrlFilters) =>
  a.from === b.from &&
  a.to === b.to &&
  a.type === b.type &&
  a.maxPrice === b.maxPrice &&
  a.amenityIds.join(',') === b.amenityIds.join(',');

/**
 * La Portada: qué es Zolea y el listado de balnearios. Arriba, un buscador por nombre o ubicación
 * que filtra al instante lo que ya llegó, y los filtros que piden de nuevo al backend: fechas, tipo,
 * precio máximo por día y servicios. Los filtros viven en la dirección
 * (`/?from=…&to=…&type=…&maxPrice=…&amenityIds=1,2`): «Buscar» navega y la lista se pide con lo
 * que quedó ahí, así se puede volver atrás o compartir la búsqueda.
 */
@Component({
  imports: [
    FormField,
    RouterLink,
    LucideCheck,
    LucideDynamicIcon,
    LucideMapPin,
    LucideSearch,
    LucideSlidersHorizontal,
    ZDateRange,
    ZEmpty,
    ZField,
    ZProblem,
    ZRating,
    ZSkeleton,
  ],
  selector: 'app-resort-list',
  styleUrl: './resort-list.scss',
  templateUrl: './resort-list.html',
})
export class ResortList {
  private resortsApi = inject(ResortsApi);
  private amenitiesApi = inject(AmenitiesApi);
  private router = inject(Router);
  private searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly visibleAmenities = VISIBLE_AMENITIES;
  protected readonly amenityIcon = amenityIcon;

  // Los filtros de la dirección, que llegan por `withComponentInputBinding()`.
  readonly from = input<string>();
  readonly to = input<string>();
  readonly type = input<string>();
  readonly maxPrice = input<string>();
  readonly amenityIds = input<string | string[]>();

  resorts = signal<Resort[]>([]);
  isLoading = signal<boolean>(true);
  hasError = signal<boolean>(false);
  searchTerm = signal<string>('');

  /** El catálogo de servicios para el filtro. Si no llega, ese filtro no se muestra. */
  readonly amenities = signal<Amenity[]>([]);
  /** El panel de filtros del celular; en la computadora se ve siempre. */
  readonly filtersOpen = signal(false);

  /** Cada vez que sube, se vuelve a pedir la lista: es lo que hace Reintentar. */
  private readonly attempt = signal(0);

  readonly urlFilters = computed<UrlFilters>(
    () => {
      const range = validRange(this.from(), this.to());
      const type = this.type();
      const maxPrice = Number(this.maxPrice());
      const ids = [this.amenityIds() ?? []]
        .flat()
        .flatMap((value) => value.split(','))
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);

      return {
        from: range?.from ?? null,
        to: range?.to ?? null,
        type: UNIT_TYPES.includes(type as UnitType) ? (type as UnitType) : null,
        maxPrice: this.maxPrice() && maxPrice > 0 ? maxPrice : null,
        amenityIds: [...new Set(ids)].sort((a, b) => a - b),
      };
    },
    { equal: sameFilters },
  );

  /** Cuántos filtros están puestos: lo dice el botón del celular. */
  readonly activeFilters = computed(() => {
    const filters = this.urlFilters();
    return (
      (filters.from ? 1 : 0) +
      (filters.type ? 1 : 0) +
      (filters.maxPrice ? 1 : 0) +
      (filters.amenityIds.length > 0 ? 1 : 0)
    );
  });

  /** Se buscó con fechas: cada tarjeta dice cuántos lugares libres tiene y lleva esas fechas. */
  readonly hasDates = computed(() => this.urlFilters().from !== null);

  /** Lo que se completa: arranca con lo de la dirección y vuelve a eso cuando la dirección cambia. */
  private readonly draft = linkedSignal<FilterDraft>(() => {
    const filters = this.urlFilters();
    return {
      from: filters.from,
      to: filters.to,
      type: filters.type ?? '',
      maxPrice: filters.maxPrice,
      amenityIds: filters.amenityIds,
    };
  });

  protected readonly filterForm = form(this.draft, (path) => {
    min(path.maxPrice, 1, { message: 'El precio tiene que ser mayor que cero.' });
    validate(path.to, ({ value, valueOf }) =>
      valueOf(path.from) !== null && value() === null
        ? { kind: 'required', message: 'Elegí también la salida.' }
        : null,
    );
  });

  // Las fechas van en <z-date-range>, que se enlaza con [(from)] y [(to)] y no con [formField].
  protected readonly draftFrom = this.filterForm.from().value;
  protected readonly draftTo = this.filterForm.to().value;

  /** El error de las fechas, que se ve recién después de tocar «Buscar». */
  protected readonly datesError = computed(() => {
    const state = this.filterForm.to();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  });

  filteredResorts = computed(() => {
    const term = this.normalizeText(this.searchTerm());
    if (!term) return this.resorts();

    return this.resorts().filter(
      (resort) =>
        this.normalizeText(resort.name).includes(term) ||
        this.normalizeText(resort.location).includes(term),
    );
  });

  /** El texto corto que anuncia el lector de pantalla cuando cambia el resultado. */
  resultsSummary = computed(() => {
    const count = this.filteredResorts().length;
    return count === 1 ? '1 balneario' : `${count} balnearios`;
  });

  constructor() {
    toObservable(computed(() => ({ filters: this.urlFilters(), attempt: this.attempt() })))
      .pipe(
        tap(() => {
          this.isLoading.set(true);
          this.hasError.set(false);
        }),
        switchMap(({ filters }) =>
          this.resortsApi.list(filters).pipe(
            map((resorts) => ({ resorts, failed: false })),
            catchError(() => of({ resorts: [] as Resort[], failed: true })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ resorts, failed }) => {
        this.resorts.set(resorts);
        this.hasError.set(failed);
        this.isLoading.set(false);
      });

    this.amenitiesApi
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (amenities) => this.amenities.set(amenities),
        error: () => this.amenities.set([]),
      });
  }

  loadResorts(): void {
    this.attempt.update((attempt) => attempt + 1);
  }

  onSearch(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.searchTerm.set(inputElement.value);
  }

  /** Borra la búsqueda y devuelve el foco al buscador: el botón que se tocó desaparece. */
  clearSearch(): void {
    this.searchTerm.set('');
    this.searchInput().nativeElement.focus();
  }

  protected isAmenityChecked(id: number): boolean {
    return this.filterForm.amenityIds().value().includes(id);
  }

  protected toggleAmenity(id: number): void {
    this.filterForm
      .amenityIds()
      .value.update((ids) =>
        ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id].sort((a, b) => a - b),
      );
  }

  /** «Buscar»: lleva los filtros a la dirección, que es la que vuelve a pedir la lista. */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.filterForm, async () => {
      this.filtersOpen.set(false);
      await this.router.navigate(['/'], { queryParams: toQueryParams(this.draft()) });
    });
  }

  /** Saca todos los filtros y el texto del buscador: vuelve la Portada de siempre. */
  clearFilters(): void {
    this.searchTerm.set('');
    this.draft.set({ ...EMPTY_DRAFT });
    this.filterForm().reset();
    void this.router.navigate(['/']);
  }

  /** «8 lugares libres», o null si no se buscó con fechas. */
  protected freeUnitsLabel(resort: Resort): string | null {
    if (!this.hasDates() || resort.availableUnits == null) return null;
    return resort.availableUnits === 1
      ? '1 lugar libre'
      : `${resort.availableUnits} lugares libres`;
  }

  /** Con fechas, la Ficha se abre con esas fechas ya puestas. */
  protected cardParams(): Params | null {
    const { from, to } = this.urlFilters();
    return from && to ? { from, to } : null;
  }

  /** Sin mayúsculas, sin tildes y sin espacios sobrantes en los bordes. */
  private normalizeText(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  formatPrice(price: number): string {
    return pesos.format(price);
  }

  /** El precio por día más bajo entre las unidades disponibles, o null si no hay ninguna. */
  getMinPrice(resort: Resort): number | null {
    const prices = (resort.rentalUnits ?? [])
      .filter((unit) => !unit.isBlocked)
      .map((unit) => unit.dailyPrice);
    return prices.length > 0 ? Math.min(...prices) : null;
  }

  getTopAmenities(resort: Resort): Amenity[] {
    return (resort.amenities ?? []).slice(0, VISIBLE_AMENITIES);
  }
}

/** Solo los filtros puestos van a la dirección; `amenityIds` va separado por comas. */
function toQueryParams(draft: FilterDraft): Params {
  const params: Params = {};
  if (draft.from && draft.to) {
    params['from'] = draft.from;
    params['to'] = draft.to;
  }
  if (draft.type) params['type'] = draft.type;
  if (draft.maxPrice != null && draft.maxPrice > 0) params['maxPrice'] = draft.maxPrice;
  if (draft.amenityIds.length > 0) params['amenityIds'] = draft.amenityIds.join(',');
  return params;
}
