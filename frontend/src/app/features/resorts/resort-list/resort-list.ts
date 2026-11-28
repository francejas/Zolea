import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { form, FormField, min, submit, validate } from '@angular/forms/signals';
import { Params, Router } from '@angular/router';
import {
  LucideCheck,
  LucideChevronDown,
  LucideDynamicIcon,
  LucideSearch,
  LucideSlidersHorizontal,
  LucideTent,
  LucideUmbrella,
  LucideX,
} from '@lucide/angular';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AmenitiesApi } from '../../../core/api/amenities.api';
import {
  Amenity,
  Resort,
  ResortFilters,
  ResortSort,
  UnitType,
} from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { amenityIcon } from '../../../shared/utils/amenity-icons';
import { validRange } from '../../../shared/utils/days';
import { dayRange, money, UNIT_TYPE_LABEL } from '../../../shared/utils/format';
import { ZResortCard } from '../../../shared/resort-card/z-resort-card';
import { ZDateRange } from '../../../shared/z-date-range/z-date-range';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';

const UNIT_TYPES: readonly UnitType[] = ['TENT', 'UMBRELLA'];

/** Los dos botones de «Tipo de lugar», en el orden en que se ven. */
const TYPE_OPTIONS: readonly { value: UnitType; label: string }[] = [
  { value: 'TENT', label: 'Carpa' },
  { value: 'UMBRELLA', label: 'Sombrilla' },
];

/** Lo que recibe el foco por sí mismo: si un clic afuera cae en uno de estos, el foco se queda ahí. */
const FOCUSABLE_CONTROL =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Los promedios mínimos y las estrellas exactas que ofrece «Puntaje» (#73). */
const MIN_RATINGS: readonly number[] = [4.5, 4, 3];
const STARS: readonly number[] = [5, 4, 3, 2, 1];

/** «4,5 o más», con la coma de acá. */
const minRatingLabel = (value: number) => `${String(value).replace('.', ',')} o más`;
const starsLabel = (value: number) => (value === 1 ? '1 estrella' : `${value} estrellas`);

/**
 * Lo que se completa en el formulario de filtros. `types` son los tipos marcados: ninguno o los dos
 * es «cualquiera»; al backend solo viaja el tipo cuando hay uno solo. `rating` es la opción de
 * «Puntaje» (`min:4.5` o `stars:4`, vacío si es cualquiera) y `sort`, la de «Ordenar por».
 */
interface FilterDraft {
  from: string | null;
  to: string | null;
  types: UnitType[];
  maxPrice: number | null;
  amenityIds: number[];
  rating: string;
  sort: string;
}

/** Los filtros que vinieron en la dirección, ya revisados: lo que no sirve se descarta. */
interface UrlFilters {
  from: string | null;
  to: string | null;
  types: UnitType[];
  maxPrice: number | null;
  amenityIds: number[];
  minRating: number | null;
  stars: number | null;
  sort: ResortSort | null;
}

/** Un filtro puesto, como chip: lo que dice y cómo quedan los filtros sin él. */
interface FilterChip {
  key: string;
  label: string;
  without: (filters: UrlFilters) => UrlFilters;
}

const EMPTY_DRAFT: FilterDraft = {
  from: null,
  to: null,
  types: [],
  maxPrice: null,
  amenityIds: [],
  rating: '',
  sort: '',
};

const sameFilters = (a: UrlFilters, b: UrlFilters) =>
  a.from === b.from &&
  a.to === b.to &&
  a.types.join(',') === b.types.join(',') &&
  a.maxPrice === b.maxPrice &&
  a.amenityIds.join(',') === b.amenityIds.join(',') &&
  a.minRating === b.minRating &&
  a.stars === b.stars &&
  a.sort === b.sort;

/**
 * La Portada: el listado de balnearios, con la búsqueda adelante. Arriba, en el hero, lo que se
 * busca primero: el balneario o la ciudad, que filtra al instante lo que ya llegó, y las fechas.
 * Debajo, los filtros: tipo de lugar (carpa, sombrilla o los dos), precio máximo por día,
 * servicios, puntaje y orden (#73). Las fechas y los filtros piden de nuevo al backend y viven en
 * la dirección (`/?from=…&to=…&type=…&maxPrice=…&amenityIds=1,2&minRating=4&sort=rating`): «Buscar»
 * navega y la lista se pide con lo que quedó ahí, así se puede volver atrás o compartir la búsqueda.
 *
 * Desde 1024 px los filtros son una barra, con los servicios en un panel que abre su botón, y los
 * puestos se ven abajo como chips. Más chico, van en «Más filtros», como siempre.
 */
@Component({
  imports: [
    FormField,
    LucideCheck,
    LucideChevronDown,
    LucideDynamicIcon,
    LucideSearch,
    LucideSlidersHorizontal,
    LucideTent,
    LucideUmbrella,
    LucideX,
    ZDateRange,
    ZEmpty,
    ZField,
    ZProblem,
    ZResortCard,
    ZSkeleton,
  ],
  selector: 'app-resort-list',
  // Un clic afuera cierra el panel de servicios.
  host: { '(document:click)': 'onDocumentClick($event)' },
  styleUrl: './resort-list.scss',
  templateUrl: './resort-list.html',
})
export class ResortList {
  private resortsApi = inject(ResortsApi);
  private amenitiesApi = inject(AmenitiesApi);
  private router = inject(Router);
  private searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');
  private results = viewChild.required<ElementRef<HTMLElement>>('results');
  private servicesBox = viewChild<ElementRef<HTMLElement>>('servicesBox');
  private servicesToggle = viewChild<ElementRef<HTMLButtonElement>>('servicesToggle');
  private chipList = viewChild<ElementRef<HTMLElement>>('chipList');
  private resultsCount = viewChild<ElementRef<HTMLElement>>('resultsCount');
  private injector = inject(Injector);

  protected readonly amenityIcon = amenityIcon;
  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly minRatings = MIN_RATINGS.map((value) => ({
    value: `min:${value}`,
    label: minRatingLabel(value),
  }));
  protected readonly starOptions = STARS.map((value) => ({
    value: `stars:${value}`,
    label: starsLabel(value),
  }));

  // Los filtros de la dirección, que llegan por `withComponentInputBinding()`.
  readonly from = input<string>();
  readonly to = input<string>();
  readonly type = input<string>();
  readonly maxPrice = input<string>();
  readonly amenityIds = input<string | string[]>();
  readonly minRating = input<string>();
  readonly stars = input<string>();
  readonly sort = input<string>();

  resorts = signal<Resort[]>([]);
  isLoading = signal<boolean>(true);
  hasError = signal<boolean>(false);
  searchTerm = signal<string>('');

  /** El catálogo de servicios para el filtro. Si no llega, ese filtro no se muestra. */
  readonly amenities = signal<Amenity[]>([]);
  /** El panel de filtros del celular; en la computadora se ve siempre. */
  readonly filtersOpen = signal(false);
  /** El panel de servicios de la barra de la computadora. En el celular se ven siempre. */
  readonly servicesOpen = signal(false);

  /** Cada vez que sube, se vuelve a pedir la lista: es lo que hace Reintentar. */
  private readonly attempt = signal(0);

  readonly urlFilters = computed<UrlFilters>(
    () => {
      const range = validRange(this.from(), this.to());
      // `type=TENT`, o los dos separados por coma si se marcaron los dos.
      const types = new Set(
        [this.type() ?? '']
          .flatMap((value) => value.split(','))
          .filter((value): value is UnitType => UNIT_TYPES.includes(value as UnitType)),
      );
      const maxPrice = Number(this.maxPrice());
      const ids = [this.amenityIds() ?? []]
        .flat()
        .flatMap((value) => value.split(','))
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);

      // Solo los puntajes que ofrece el filtro; con los dos, mandan las estrellas.
      const stars = Number(this.stars());
      const validStars = this.stars() && STARS.includes(stars) ? stars : null;
      const minRating = Number(this.minRating());
      const validMin =
        validStars === null && this.minRating() && MIN_RATINGS.includes(minRating)
          ? minRating
          : null;

      return {
        from: range?.from ?? null,
        to: range?.to ?? null,
        types: UNIT_TYPES.filter((type) => types.has(type)),
        maxPrice: this.maxPrice() && maxPrice > 0 ? maxPrice : null,
        amenityIds: [...new Set(ids)].sort((a, b) => a - b),
        minRating: validMin,
        stars: validStars,
        sort: this.sort() === 'rating' ? 'rating' : null,
      };
    },
    { equal: sameFilters },
  );

  /** Cuántos filtros están puestos, contando las fechas: si hay alguno, se ofrece limpiarlos. */
  readonly activeFilters = computed(() => (this.urlFilters().from ? 1 : 0) + this.extraFilters());

  /**
   * Los de «Más filtros», sin las fechas, que están en el buscador: lo dice el botón del celular. El
   * orden no cuenta: no saca ningún balneario.
   */
  readonly extraFilters = computed(() => {
    const filters = this.urlFilters();
    return (
      (filters.types.length > 0 ? 1 : 0) +
      (filters.maxPrice ? 1 : 0) +
      (filters.amenityIds.length > 0 ? 1 : 0) +
      (filters.minRating !== null || filters.stars !== null ? 1 : 0)
    );
  });

  /** Los filtros puestos, uno por chip, en el orden de la barra. El orden no es un filtro. */
  readonly chips = computed<FilterChip[]>(() => {
    const filters = this.urlFilters();
    const chips: FilterChip[] = [];
    if (filters.from && filters.to) {
      chips.push({
        key: 'dates',
        label: dayRange(filters.from, filters.to),
        without: (f) => ({ ...f, from: null, to: null }),
      });
    }
    for (const type of filters.types) {
      chips.push({
        key: `type-${type}`,
        label: UNIT_TYPE_LABEL[type],
        without: (f) => ({ ...f, types: f.types.filter((other) => other !== type) }),
      });
    }
    if (filters.maxPrice) {
      chips.push({
        key: 'price',
        label: `Hasta ${money(filters.maxPrice)}`,
        without: (f) => ({ ...f, maxPrice: null }),
      });
    }
    const names = new Map(this.amenities().map((a) => [a.idAmenity, a.name]));
    for (const id of filters.amenityIds) {
      chips.push({
        key: `amenity-${id}`,
        label: names.get(id) ?? 'Servicio',
        without: (f) => ({ ...f, amenityIds: f.amenityIds.filter((other) => other !== id) }),
      });
    }
    if (filters.minRating !== null) {
      chips.push({
        key: 'rating',
        label: minRatingLabel(filters.minRating),
        without: (f) => ({ ...f, minRating: null }),
      });
    }
    if (filters.stars !== null) {
      chips.push({
        key: 'rating',
        label: starsLabel(filters.stars),
        without: (f) => ({ ...f, stars: null }),
      });
    }
    return chips;
  });

  /** Se buscó con fechas: cada tarjeta dice cuántos lugares libres tiene y lleva esas fechas. */
  readonly hasDates = computed(() => this.urlFilters().from !== null);

  /** Lo que se completa: arranca con lo de la dirección y vuelve a eso cuando la dirección cambia. */
  private readonly draft = linkedSignal<FilterDraft>(() => {
    const filters = this.urlFilters();
    return {
      from: filters.from,
      to: filters.to,
      types: filters.types,
      maxPrice: filters.maxPrice,
      amenityIds: filters.amenityIds,
      rating:
        filters.stars !== null
          ? `stars:${filters.stars}`
          : filters.minRating !== null
            ? `min:${filters.minRating}`
            : '',
      sort: filters.sort ?? '',
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

  /** Cuántos servicios están marcados: lo dice el botón «Servicios». */
  protected readonly servicesCount = computed(() => this.filterForm.amenityIds().value().length);

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

  /** Datos de las tarjetas: la disponibilidad solo corresponde a una búsqueda con fechas. */
  readonly cardData = computed(() => {
    const includeAvailability = this.hasDates();
    return new Map(
      this.filteredResorts().map((resort) => [
        resort.idResort,
        includeAvailability ? resort : { ...resort, availableUnits: undefined },
      ]),
    );
  });

  /** Enlaces estables para que cada ciclo no cree un objeto nuevo por tarjeta. */
  readonly cardLinks = computed(
    () =>
      new Map(
        this.filteredResorts().map((resort) => [
          resort.idResort,
          { commands: ['/resorts', resort.idResort], queryParams: this.cardParams() },
        ]),
      ),
  );

  constructor() {
    toObservable(computed(() => ({ filters: this.urlFilters(), attempt: this.attempt() })))
      .pipe(
        tap(() => {
          this.isLoading.set(true);
          this.hasError.set(false);
        }),
        switchMap(({ filters }) =>
          this.resortsApi.list(toApiFilters(filters)).pipe(
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

  protected isTypeChecked(type: UnitType): boolean {
    return this.filterForm.types().value().includes(type);
  }

  protected toggleType(type: UnitType): void {
    this.filterForm
      .types()
      .value.update((types) =>
        types.includes(type)
          ? types.filter((other) => other !== type)
          : UNIT_TYPES.filter((other) => other === type || types.includes(other)),
      );
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

  protected setRating(event: Event): void {
    this.filterForm.rating().value.set((event.target as HTMLSelectElement).value);
  }

  protected setSort(event: Event): void {
    this.filterForm.sort().value.set((event.target as HTMLSelectElement).value);
  }

  // --- El panel de servicios de la barra ------------------------------------------------------

  protected toggleServices(): void {
    this.servicesOpen.update((open) => !open);
  }

  /** Esc: se cierra y el foco vuelve al botón. */
  protected closeServices(): void {
    if (!this.servicesOpen()) return;
    this.servicesOpen.set(false);
    this.servicesToggle()?.nativeElement.focus();
  }

  /**
   * Un clic afuera lo cierra. Si el foco había quedado adentro, vuelve al botón; si el clic fue en
   * otro control, el foco se queda ahí.
   */
  protected onDocumentClick(event: MouseEvent): void {
    const box = this.servicesBox()?.nativeElement;
    if (!this.servicesOpen() || !box || box.contains(event.target as Node)) return;
    this.servicesOpen.set(false);
    // Un clic en algo que no es un control deja el foco en el body o en el <main> (el destino de
    // «Saltar al contenido», con tabindex="-1"): ahí vuelve al botón.
    const active = document.activeElement;
    if (!active || box.contains(active) || !active.matches(FOCUSABLE_CONTROL)) {
      this.servicesToggle()?.nativeElement.focus();
    }
  }

  // --- Los chips ------------------------------------------------------------------------------

  /**
   * La × de un chip saca ese filtro de la dirección. El chip desaparece: el foco pasa al que quedó
   * en su lugar, o a la cantidad de balnearios si no queda ninguno.
   */
  protected async removeChip(chip: FilterChip, index: number): Promise<void> {
    await this.router.navigate(['/'], {
      queryParams: toQueryParams(chip.without(this.urlFilters())),
    });
    afterNextRender(
      () => {
        const chips =
          this.chipList()?.nativeElement.querySelectorAll<HTMLElement>('.filters__chip');
        const next = chips?.[Math.min(index, chips.length - 1)];
        (next ?? this.resultsCount()?.nativeElement)?.focus();
      },
      { injector: this.injector },
    );
  }

  /** «Buscar»: lleva los filtros a la dirección, que es la que vuelve a pedir la lista. */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.filterForm, async () => {
      this.filtersOpen.set(false);
      this.servicesOpen.set(false);
      await this.router.navigate(['/'], { queryParams: toQueryParams(fromDraft(this.draft())) });
      this.showResults();
    });
  }

  /**
   * Después de «Buscar», la pantalla baja hasta los balnearios: es lo que la persona quiere ver.
   * Sin animación si pidió menos movimiento.
   */
  private showResults(): void {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.results().nativeElement.scrollIntoView?.({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  /** Saca todos los filtros y el texto del buscador: vuelve la Portada de siempre. */
  clearFilters(): void {
    this.searchTerm.set('');
    this.draft.set({ ...EMPTY_DRAFT });
    this.filterForm().reset();
    void this.router.navigate(['/']);
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
}

/** Lo completado, como los filtros de la dirección: el puntaje se separa en mínimo o estrellas. */
function fromDraft(draft: FilterDraft): UrlFilters {
  const [kind, value] = draft.rating.split(':');
  return {
    from: draft.from,
    to: draft.to,
    types: draft.types,
    maxPrice: draft.maxPrice,
    amenityIds: draft.amenityIds,
    minRating: kind === 'min' ? Number(value) : null,
    stars: kind === 'stars' ? Number(value) : null,
    sort: draft.sort === 'rating' ? 'rating' : null,
  };
}

/** Solo los filtros puestos van a la dirección; `amenityIds` va separado por comas. */
function toQueryParams(filters: UrlFilters): Params {
  const params: Params = {};
  if (filters.from && filters.to) {
    params['from'] = filters.from;
    params['to'] = filters.to;
  }
  if (filters.types.length > 0) params['type'] = filters.types.join(',');
  if (filters.maxPrice != null && filters.maxPrice > 0) params['maxPrice'] = filters.maxPrice;
  if (filters.amenityIds.length > 0) params['amenityIds'] = filters.amenityIds.join(',');
  if (filters.minRating !== null) params['minRating'] = filters.minRating;
  if (filters.stars !== null) params['stars'] = filters.stars;
  if (filters.sort) params['sort'] = filters.sort;
  return params;
}

/** Al backend: el tipo viaja solo si se marcó uno; con los dos marcados, es cualquiera. */
function toApiFilters(filters: UrlFilters): ResortFilters {
  return {
    from: filters.from,
    to: filters.to,
    type: filters.types.length === 1 ? filters.types[0] : null,
    maxPrice: filters.maxPrice,
    amenityIds: filters.amenityIds,
    minRating: filters.minRating,
    stars: filters.stars,
    sort: filters.sort,
  };
}
