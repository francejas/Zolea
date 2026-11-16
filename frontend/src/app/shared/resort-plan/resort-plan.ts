import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  model,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LucideChevronRight, LucideMenu, LucideTent, LucideUmbrella } from '@lucide/angular';
import { RentalUnit, UnitType } from '../../core/api/resort.models';
import { ZSkeleton } from '../z-skeleton/z-skeleton';

/** Una fila del plano: las unidades que comparten el prefijo del identificador (A-03 → A). */
interface PlanRow {
  prefix: string;
  name: string;
  /** «$ 8.500 por día», o «desde $ 7.000 por día» si no todas cuestan lo mismo. */
  priceLabel: string;
  samePrice: boolean;
  units: RentalUnit[];
  /** Las mismas unidades de a dos, para las columnas de carpas. El último renglón puede ir a medias. */
  pairs: RentalUnit[][];
}

/** Una zona del plano: las sombrillas adelante y las carpas atrás. */
interface PlanZone {
  type: UnitType;
  title: string;
  /**
   * Las sombrillas van en filas paralelas al mar; las carpas, en columnas perpendiculares, de a
   * dos por renglón. Cada fila o columna es un prefijo.
   */
  rows: PlanRow[];
}

type PlanView = 'plan' | 'list';

const TYPE_NAME: Record<UnitType, string> = { UMBRELLA: 'Sombrilla', TENT: 'Carpa' };
const ZONE_TITLE: Record<UnitType, string> = { UMBRELLA: 'Sombrillas', TENT: 'Carpas' };
/** El mar arriba, las sombrillas adelante, el paseo y las carpas atrás. */
const ZONE_ORDER: UnitType[] = ['UMBRELLA', 'TENT'];
/** Las unidades cuyo identificador no tiene guion van a esta fila, siempre la última. */
const OTHER_ROW = 'Otras';

const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

let nextId = 0;

/** [A, B, C] → [[A, B], [C]]. */
function inPairs<T>(items: T[]): T[][] {
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
  return pairs;
}

/**
 * El balneario visto desde arriba, para elegir un lugar tocándolo. Recibe las unidades tal como
 * las devuelve la API y la elegida; avisa con `unitSelected` cuál se tocó. Además del plano trae
 * la lista en texto de las mismas unidades (pestaña «Lista»), que es lo que usan el teclado y el
 * lector de pantalla. El diseño está en Zolea-docs/diseno/plano-del-balneario.html.
 *
 * Las sombrillas van en filas frente al mar, la A más cerca. Las carpas van en columnas, una por
 * prefijo, de a dos por renglón, con un pasillo entre columna y columna y una bajada al mar arriba
 * de cada pasillo. Todo sale del tipo y del prefijo del identificador: el backend no guarda
 * posiciones. Si las columnas no entran, el plano se desplaza de costado dentro de su recuadro.
 *
 * El plano no sabe de fechas: marca las bloqueadas (`isBlocked`) y, si se las pasan en
 * `occupiedIds`, las ocupadas en las fechas elegidas. Las dos se dibujan igual (la sombrilla
 * cerrada) y ninguna se puede elegir; lo que cambia es lo que dicen.
 */
@Component({
  selector: 'z-resort-plan',
  imports: [
    LucideChevronRight,
    LucideMenu,
    LucideTent,
    LucideUmbrella,
    NgTemplateOutlet,
    ZSkeleton,
  ],
  templateUrl: './resort-plan.html',
  styleUrl: './resort-plan.scss',
  // Las clases z-plan, z-unit y z-tab van en los elementos de la plantilla y en la leyenda: con
  // el encapsulado de siempre, nada de eso se vería igual que en el diseño.
  encapsulation: ViewEncapsulation.None,
  host: { class: 'z-resort-plan' },
})
export class ResortPlan {
  /** Las unidades del balneario, en cualquier orden: el plano las ordena y las agrupa. */
  units = input.required<RentalUnit[]>();
  /** Los `idRentalUnit` reservados en las fechas elegidas: se ven ocupados y no se eligen. */
  occupiedIds = input<readonly number[]>([]);
  /** Mientras carga se ve el esqueleto en lugar del plano. */
  loading = input(false);
  /** El `idRentalUnit` de la unidad elegida, o null. Se puede enlazar con `[(selectedId)]`. */
  selectedId = model<number | null>(null);
  /** La unidad que se tocó, o null cuando se vuelve a tocar la elegida y se deselecciona. */
  unitSelected = output<RentalUnit | null>();

  protected readonly view = signal<PlanView>('plan');
  protected readonly id = `z-plan-${nextId++}`;
  protected readonly typeName = TYPE_NAME;

  private readonly planTab = viewChild<ElementRef<HTMLButtonElement>>('planTab');
  private readonly listTab = viewChild<ElementRef<HTMLButtonElement>>('listTab');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  /** Queda plano a la derecha, fuera del recuadro: se ve la señal de que sigue. */
  protected readonly moreToTheRight = signal(false);

  constructor() {
    // El ancho del recuadro cambia con la pantalla y al pasar de Lista a Plano (oculto mide 0).
    effect((onCleanup) => {
      const el = this.scroller()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.updateScrollHint());
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
      onCleanup(() => observer.disconnect());
    });
  }

  /** Las zonas con unidades, cada una con sus filas. Una zona vacía no se dibuja. */
  protected readonly zones = computed<PlanZone[]>(() => {
    const sorted = [...this.units()].sort((a, b) =>
      a.identifier.localeCompare(b.identifier, 'es', { numeric: true }),
    );

    return ZONE_ORDER.map((type) => ({
      type,
      title: ZONE_TITLE[type],
      rows: this.rowsOf(sorted.filter((unit) => unit.type === type)),
    })).filter((zone) => zone.rows.length > 0);
  });

  /** Las carpas, una columna por prefijo. Vacío si el balneario no tiene carpas. */
  protected readonly tentColumns = computed<PlanRow[]>(
    () => this.zones().find((zone) => zone.type === 'TENT')?.rows ?? [],
  );

  /**
   * Las pistas de la grilla del plano, de izquierda a derecha: el margen, cada columna de carpas
   * con un pasillo entre una y otra, el sobrante y el margen. El mar y las carpas usan las mismas
   * pistas, así cada bajada queda arriba de su pasillo.
   */
  protected readonly planTracks = computed(() => {
    const columns = this.tentColumns()
      .map(() => 'max-content')
      .join(' var(--plan-aisle) ');
    return ['var(--plan-lead)', columns, 'minmax(0, 1fr)', 'var(--plan-pad)']
      .filter(Boolean)
      .join(' ');
  });

  /** Un pasillo por cada par de columnas vecinas: el índice de la columna que queda a su izquierda. */
  protected readonly aisles = computed(() =>
    this.tentColumns()
      .slice(1)
      .map((_, i) => i),
  );

  private readonly occupied = computed(() => new Set(this.occupiedIds()));

  /** Hay alguna ocupada en las fechas: recién ahí la leyenda suma ese estado. */
  protected readonly hasOccupied = computed(() =>
    this.units().some((unit) => !unit.isBlocked && this.occupied().has(unit.idRentalUnit)),
  );

  protected readonly skeletonRows = [1, 2];
  protected readonly skeletonCells = [1, 2, 3, 4, 5, 6];

  /** Bloqueada u ocupada en las fechas: en los dos casos no se puede elegir. */
  protected isUnavailable(unit: RentalUnit): boolean {
    return unit.isBlocked || this.occupied().has(unit.idRentalUnit);
  }

  /** «Libre», «No disponible» (bloqueada) u «Ocupada en tus fechas». */
  protected stateOf(unit: RentalUnit): string {
    if (unit.isBlocked) return 'No disponible';
    return this.occupied().has(unit.idRentalUnit) ? 'Ocupada en tus fechas' : 'Libre';
  }

  /** «Sombrilla A-01, libre, $ 8.500 por día». La elegida se dice con aria-pressed. */
  protected unitLabel(unit: RentalUnit): string {
    const state = this.stateOf(unit).toLowerCase();
    return `${TYPE_NAME[unit.type]} ${unit.identifier}, ${state}, ${pesos.format(unit.dailyPrice)} por día`;
  }

  /** El precio de una unidad, para la lista: «$ 15.000». */
  protected price(unit: RentalUnit): string {
    return pesos.format(unit.dailyPrice);
  }

  /** Tocar una libre la elige; tocar la elegida la deselecciona; una no disponible no hace nada. */
  protected toggle(unit: RentalUnit): void {
    if (this.isUnavailable(unit)) return;
    this.setSelected(this.selectedId() === unit.idRentalUnit ? null : unit);
  }

  /** Elegir en la lista: un botón de opción siempre elige, no alterna. */
  protected choose(unit: RentalUnit): void {
    if (this.isUnavailable(unit)) return;
    this.setSelected(unit);
  }

  /** Flechas, Inicio y Fin cambian de pestaña y llevan el foco a la que quedó activa. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const next: PlanView | null =
      event.key === 'ArrowRight' || event.key === 'ArrowLeft'
        ? this.view() === 'plan'
          ? 'list'
          : 'plan'
        : event.key === 'Home'
          ? 'plan'
          : event.key === 'End'
            ? 'list'
            : null;
    if (next === null) return;

    event.preventDefault();
    this.view.set(next);
    (next === 'plan' ? this.planTab() : this.listTab())?.nativeElement.focus();
  }

  /** La pista de la grilla de la columna de carpas `index` (la primera pista es el margen). */
  protected columnTrack(index: number): number {
    return 2 + index * 2;
  }

  /** La pista del pasillo que sigue a la columna `index`. */
  protected aisleTrack(index: number): number {
    return 3 + index * 2;
  }

  protected updateScrollHint(): void {
    const el = this.scroller()?.nativeElement;
    this.moreToTheRight.set(!!el && el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
  }

  private setSelected(unit: RentalUnit | null): void {
    this.selectedId.set(unit?.idRentalUnit ?? null);
    this.unitSelected.emit(unit);
  }

  /** Agrupa por el prefijo del identificador; «Otras» va al final. */
  private rowsOf(units: RentalUnit[]): PlanRow[] {
    const byPrefix = new Map<string, RentalUnit[]>();
    for (const unit of units) {
      const dash = unit.identifier.indexOf('-');
      const prefix = dash > 0 ? unit.identifier.slice(0, dash) : OTHER_ROW;
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), unit]);
    }

    return [...byPrefix.entries()]
      .sort(([a], [b]) => (a === OTHER_ROW ? 1 : b === OTHER_ROW ? -1 : 0))
      .map(([prefix, rowUnits]) => {
        const prices = rowUnits.map((unit) => unit.dailyPrice);
        const min = Math.min(...prices);
        const same = prices.every((price) => price === min);
        return {
          prefix,
          name: prefix === OTHER_ROW ? OTHER_ROW : `Fila ${prefix}`,
          priceLabel: `${same ? '' : 'desde '}${pesos.format(min)} por día`,
          samePrice: same,
          units: rowUnits,
          pairs: inPairs(rowUnits),
        };
      });
  }
}
