import {
  Component,
  computed,
  ElementRef,
  input,
  model,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { LucideMenu, LucideTent, LucideUmbrella } from '@lucide/angular';
import { RentalUnit, UnitType } from '../../core/api/resort.models';
import { ZSkeleton } from '../z-skeleton/z-skeleton';

/** Una fila del plano: las unidades que comparten el prefijo del identificador (A-03 → A). */
interface PlanRow {
  prefix: string;
  name: string;
  /** «$ 8.500 por día», o «desde $ 7.000 por día» si no todas cuestan lo mismo. */
  priceLabel: string;
  units: RentalUnit[];
}

/** Una zona del plano: las sombrillas adelante y las carpas atrás. */
interface PlanZone {
  type: UnitType;
  title: string;
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

/**
 * El balneario visto desde arriba, para elegir un lugar tocándolo. Recibe las unidades tal como
 * las devuelve la API y la elegida; avisa con `unitSelected` cuál se tocó. Además del plano trae
 * la lista en texto de las mismas unidades (pestaña «Lista»), que es lo que usan el teclado y el
 * lector de pantalla. El diseño está en Zolea-docs/diseno/plano-del-balneario.html.
 *
 * El plano no sabe de fechas: marca solo las bloqueadas (`isBlocked`).
 */
@Component({
  selector: 'z-resort-plan',
  imports: [LucideMenu, LucideTent, LucideUmbrella, ZSkeleton],
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

  protected readonly skeletonRows = [1, 2];
  protected readonly skeletonCells = [1, 2, 3, 4, 5, 6];

  /** «Sombrilla A-01, libre, $ 8.500 por día». La elegida se dice con aria-pressed. */
  protected unitLabel(unit: RentalUnit): string {
    const state = unit.isBlocked ? 'no disponible' : 'libre';
    return `${TYPE_NAME[unit.type]} ${unit.identifier}, ${state}, ${pesos.format(unit.dailyPrice)} por día`;
  }

  /** Tocar una libre la elige; tocar la elegida la deselecciona; una bloqueada no hace nada. */
  protected toggle(unit: RentalUnit): void {
    if (unit.isBlocked) return;
    this.setSelected(this.selectedId() === unit.idRentalUnit ? null : unit);
  }

  /** Elegir en la lista: un botón de opción siempre elige, no alterna. */
  protected choose(unit: RentalUnit): void {
    if (unit.isBlocked) return;
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
          units: rowUnits,
        };
      });
  }
}
