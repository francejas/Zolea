import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideMinus, LucidePlus } from '@lucide/angular';
import { RentalUnit, UnitPosition } from '../../../../core/api/resort.models';
import { UnitsApi } from '../../../../core/api/units.api';
import { toUserMessage } from '../../../../core/errors/error-message';
import { UNIT_TYPE_LABEL, unitLabel } from '../../../../shared/utils/format';
import { ZAlert } from '../../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../../shared/z-skeleton/z-skeleton';

type LoadState = 'loading' | 'ready' | 'error';

/** Una casilla de la grilla: columna y fila, desde 0. */
interface Cell {
  x: number;
  y: number;
}

/** Lo que se dibuja en cada casilla, fila por fila. */
interface GridCell extends Cell {
  key: string;
  unit: RentalUnit | null;
}

/** La grilla va hasta 40 × 40, como en el backend. */
const MAX_SIZE = 40;
/** Con lo que arranca un plano vacío; si alguna unidad está más lejos, la grilla llega hasta ella. */
const DEFAULT_COLUMNS = 8;
const DEFAULT_ROWS = 6;

const START_STATUS = 'Elegí una unidad y tocá una casilla para ubicarla.';

const keyOf = (cell: Cell): string => `${cell.x},${cell.y}`;

const byIdentifier = (a: RentalUnit, b: RentalUnit): number =>
  a.identifier.localeCompare(b.identifier, 'es', { numeric: true });

/** «Sombrilla A-01», para empezar una oración. */
const title = (unit: RentalUnit): string => unitLabel(unit.type, unit.identifier);
/** «sombrilla A-01», para el medio de una oración: el identificador queda como está. */
const lowerType = (unit: RentalUnit): string =>
  `${UNIT_TYPE_LABEL[unit.type].toLowerCase()} ${unit.identifier}`;

/**
 * «Diseñar plano» (GH-68): el administrador ubica cada carpa y sombrilla de su balneario en una
 * grilla, con el mar arriba y la entrada abajo, como están en su playa. Se elige una unidad (de la
 * lista del costado o tocándola en la grilla) y se toca una casilla: si está libre, va ahí; si es de
 * otra ubicada, se cambian de lugar. Todo anda también con el teclado: las flechas recorren la
 * grilla, Enter elige o ubica, Escape deja de elegir y Suprimir saca del plano.
 *
 * Nada se guarda hasta «Guardar plano», que manda todo junto. Si hay cambios sin guardar, se
 * pregunta antes de salir (la guarda `unsavedPlanGuard` y el cierre de la pestaña). Las filas y
 * columnas que se agregan son lugar para trabajar: el plano público llega hasta la última casilla
 * ocupada.
 */
@Component({
  selector: 'app-plan-designer',
  imports: [
    LucideArrowLeft,
    LucideMinus,
    LucidePlus,
    RouterLink,
    ZAlert,
    ZBtn,
    ZEmpty,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './plan-designer.html',
  styleUrl: './plan-designer.scss',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class PlanDesigner {
  private readonly unitsApi = inject(UnitsApi);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');

  /** Las unidades en servicio. Las dadas de baja no van en el plano. */
  protected readonly units = signal<RentalUnit[]>([]);
  /** La casilla de cada unidad, por su id, como se ve ahora; null si no está ubicada. */
  private readonly positions = signal<ReadonlyMap<number, Cell | null>>(new Map());
  /** La misma, como quedó guardada: contra esta se miden los cambios. */
  private readonly saved = signal<ReadonlyMap<number, Cell | null>>(new Map());

  protected readonly columns = signal(DEFAULT_COLUMNS);
  protected readonly rows = signal(DEFAULT_ROWS);
  protected readonly maxSize = MAX_SIZE;

  protected readonly selectedId = signal<number | null>(null);
  /** La casilla que entra en el Tab (una sola, como en una grilla). */
  protected readonly active = signal<Cell>({ x: 0, y: 0 });
  /** Lo último que pasó, a la vista y para el lector de pantalla. */
  protected readonly status = signal(START_STATUS);

  protected readonly saving = signal(false);
  protected readonly notice = signal('');
  protected readonly saveError = signal('');
  private readonly noticeEl = viewChild<ElementRef<HTMLElement>>('noticeEl');

  /** La unidad de cada casilla ocupada, por «x,y». */
  private readonly byCell = computed(() => {
    const map = new Map<string, RentalUnit>();
    for (const unit of this.units()) {
      const cell = this.positions().get(unit.idRentalUnit);
      if (cell) map.set(keyOf(cell), unit);
    }
    return map;
  });

  protected readonly grid = computed<GridCell[][]>(() =>
    Array.from({ length: this.rows() }, (_, y) =>
      Array.from({ length: this.columns() }, (_, x) => ({
        x,
        y,
        key: `${x},${y}`,
        unit: this.byCell().get(`${x},${y}`) ?? null,
      })),
    ),
  );

  protected readonly columnNumbers = computed(() =>
    Array.from({ length: this.columns() }, (_, i) => i + 1),
  );
  protected readonly rowNumbers = computed(() =>
    Array.from({ length: this.rows() }, (_, i) => i + 1),
  );

  /** Las que no tienen casilla, por tipo y por identificador. */
  protected readonly unplaced = computed(() =>
    this.units()
      .filter((unit) => !this.positions().get(unit.idRentalUnit))
      .sort((a, b) => a.type.localeCompare(b.type) * -1 || byIdentifier(a, b)),
  );

  protected readonly selected = computed(
    () => this.units().find((unit) => unit.idRentalUnit === this.selectedId()) ?? null,
  );

  /** La casilla de la elegida, o null si está fuera del plano. */
  protected readonly selectedCell = computed(() => {
    const id = this.selectedId();
    return id == null ? null : (this.positions().get(id) ?? null);
  });

  /** Si algo cambió desde lo guardado. */
  protected readonly dirty = computed(() =>
    this.units().some(
      (unit) =>
        keyOrNull(this.positions().get(unit.idRentalUnit)) !==
        keyOrNull(this.saved().get(unit.idRentalUnit)),
    ),
  );

  protected readonly placedCount = computed(() => this.units().length - this.unplaced().length);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.unitsApi.list().subscribe({
      next: (units) => {
        this.show(units);
        this.state.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toUserMessage(error));
        this.state.set('error');
      },
    });
  }

  /** Para la guarda de la ruta: con cambios sin guardar, se pregunta. */
  canLeave(): boolean {
    return !this.dirty() || window.confirm('Tenés cambios sin guardar en el plano. ¿Salir igual?');
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty()) event.preventDefault();
  }

  protected goToUnits(): void {
    void this.router.navigate(['/admin/units']);
  }

  // --- Textos ------------------------------------------------------------------------------

  protected cellLabel(cell: GridCell): string {
    const where = `Columna ${cell.x + 1}, fila ${cell.y + 1}`;
    if (!cell.unit) return `${where}, libre`;
    const chosen = cell.unit.idRentalUnit === this.selectedId() ? ', elegida' : '';
    return `${where}: ${title(cell.unit)}${chosen}`;
  }

  protected typeName(unit: RentalUnit): string {
    return UNIT_TYPE_LABEL[unit.type];
  }

  protected whereIs(cell: Cell): string {
    return `columna ${cell.x + 1}, fila ${cell.y + 1}`;
  }

  // --- Elegir y ubicar ---------------------------------------------------------------------

  /** Elegir en la lista del costado; tocar la elegida deja de elegirla. */
  protected pick(unit: RentalUnit): void {
    if (this.selectedId() === unit.idRentalUnit) {
      this.deselect();
      return;
    }
    this.selectedId.set(unit.idRentalUnit);
    const verb = this.positions().get(unit.idRentalUnit) ? 'moverla' : 'ubicarla';
    this.status.set(`Elegiste la ${lowerType(unit)}: tocá una casilla para ${verb}.`);
  }

  protected deselect(): void {
    const unit = this.selected();
    if (!unit) return;
    this.selectedId.set(null);
    this.status.set(`Dejaste de elegir la ${lowerType(unit)}.`);
  }

  /** Tocar una casilla: elige lo que hay, o ubica ahí la elegida. */
  protected activate(cell: GridCell): void {
    this.active.set({ x: cell.x, y: cell.y });
    const chosen = this.selected();

    if (!chosen) {
      if (cell.unit) this.pick(cell.unit);
      else this.status.set('Elegí primero una unidad, de la lista o del plano.');
      return;
    }
    if (cell.unit?.idRentalUnit === chosen.idRentalUnit) {
      this.deselect();
      return;
    }

    const from = this.positions().get(chosen.idRentalUnit) ?? null;
    if (cell.unit) {
      if (!from) {
        this.status.set(
          `Esa casilla es de la ${lowerType(cell.unit)}: elegí una libre, o mové esa primero.`,
        );
        return;
      }
      const other = cell.unit;
      this.move(
        new Map([
          [chosen.idRentalUnit, { x: cell.x, y: cell.y }],
          [other.idRentalUnit, from],
        ]),
      );
      this.selectedId.set(null);
      this.status.set(`${title(chosen)} y ${lowerType(other)} cambiaron de lugar.`);
      return;
    }

    this.move(new Map([[chosen.idRentalUnit, { x: cell.x, y: cell.y }]]));
    this.selectedId.set(null);
    this.status.set(`${title(chosen)} en la ${this.whereIs(cell)}.`);
  }

  /** Saca la elegida del plano. Sigue elegida, ahora en la lista del costado, y el foco va con ella. */
  protected removeSelected(): void {
    const unit = this.selected();
    if (!unit || !this.positions().get(unit.idRentalUnit)) return;
    this.takeOut(unit);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-chip="${unit.idRentalUnit}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  private takeOut(unit: RentalUnit): void {
    this.move(new Map([[unit.idRentalUnit, null]]));
    this.status.set(`${title(unit)} salió del plano.`);
  }

  private move(changes: ReadonlyMap<number, Cell | null>): void {
    this.notice.set('');
    this.saveError.set('');
    this.positions.update((current) => new Map([...current, ...changes]));
  }

  // --- Teclado ------------------------------------------------------------------------------

  /** Flechas, Inicio y Fin recorren la grilla; Escape deja de elegir; Suprimir saca del plano. */
  protected onGridKeydown(event: KeyboardEvent): void {
    const { x, y } = this.active();
    const moves: Record<string, Cell> = {
      ArrowRight: { x: Math.min(x + 1, this.columns() - 1), y },
      ArrowLeft: { x: Math.max(x - 1, 0), y },
      ArrowDown: { x, y: Math.min(y + 1, this.rows() - 1) },
      ArrowUp: { x, y: Math.max(y - 1, 0) },
      Home: { x: 0, y },
      End: { x: this.columns() - 1, y },
    };
    const target = moves[event.key];
    if (target) {
      event.preventDefault();
      this.focusCell(target);
      return;
    }
    if (event.key === 'Escape' && this.selected()) {
      event.preventDefault();
      this.deselect();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const unit = this.byCell().get(keyOf(this.active()));
      if (!unit) return;
      event.preventDefault();
      this.takeOut(unit);
    }
  }

  protected onCellFocus(cell: GridCell): void {
    this.active.set({ x: cell.x, y: cell.y });
  }

  protected isActive(cell: GridCell): boolean {
    const active = this.active();
    return active.x === cell.x && active.y === cell.y;
  }

  private focusCell(cell: Cell): void {
    this.active.set(cell);
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLElement>(`[data-cell="${keyOf(cell)}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  // --- Filas y columnas ---------------------------------------------------------------------

  protected addColumn(): void {
    if (this.columns() >= MAX_SIZE) return;
    this.columns.update((n) => n + 1);
    this.status.set(`El plano tiene ${this.columns()} columnas.`);
  }

  protected addRow(): void {
    if (this.rows() >= MAX_SIZE) return;
    this.rows.update((n) => n + 1);
    this.status.set(`El plano tiene ${this.rows()} filas.`);
  }

  protected removeColumn(): void {
    const last = this.columns() - 1;
    if (last < 1) return;
    if (this.grid().some((row) => row[last].unit)) {
      this.status.set('La última columna tiene unidades: movelas antes de quitarla.');
      return;
    }
    this.columns.set(last);
    this.active.update((cell) => ({ x: Math.min(cell.x, last - 1), y: cell.y }));
    this.status.set(`El plano tiene ${last} ${last === 1 ? 'columna' : 'columnas'}.`);
  }

  protected removeRow(): void {
    const last = this.rows() - 1;
    if (last < 1) return;
    if (this.grid()[last].some((cell) => cell.unit)) {
      this.status.set('La última fila tiene unidades: movelas antes de quitarla.');
      return;
    }
    this.rows.set(last);
    this.active.update((cell) => ({ x: cell.x, y: Math.min(cell.y, last - 1) }));
    this.status.set(`El plano tiene ${last} ${last === 1 ? 'fila' : 'filas'}.`);
  }

  // --- Guardar ------------------------------------------------------------------------------

  protected save(): void {
    if (this.saving() || !this.dirty()) return;
    this.saving.set(true);
    this.notice.set('');
    this.saveError.set('');

    const plan: UnitPosition[] = this.units().map((unit) => {
      const cell = this.positions().get(unit.idRentalUnit) ?? null;
      return { idRentalUnit: unit.idRentalUnit, posX: cell?.x ?? null, posY: cell?.y ?? null };
    });

    this.unitsApi.savePlan(plan).subscribe({
      next: (units) => {
        this.saving.set(false);
        this.show(units, { keepSize: true });
        this.notice.set(
          'Guardamos el plano. Ya se ve así en la Ficha, en Reservar y en Mostrador.',
        );
        this.focusNotice();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        const reason = toUserMessage(error);
        // Un 400 quiere decir que las unidades cambiaron en otro lado (por ejemplo, una se dio de
        // baja): se vuelven a traer y se dice por qué no se guardó.
        if (error.status === 400) {
          this.unitsApi.list().subscribe({
            next: (units) => {
              this.show(units);
              this.saveError.set(reason);
              this.focusNotice();
            },
            error: () => {
              this.saveError.set(reason);
              this.focusNotice();
            },
          });
          return;
        }
        this.saveError.set(reason);
        this.focusNotice();
      },
    });
  }

  protected discard(): void {
    this.positions.set(this.saved());
    this.selectedId.set(null);
    this.notice.set('');
    this.saveError.set('');
    this.status.set('Volviste al plano guardado.');
  }

  /** Muestra las unidades como vienen: en servicio, con su casilla. */
  private show(all: RentalUnit[], options: { keepSize?: boolean } = {}): void {
    const units = all.filter((unit) => !unit.retired);
    const positions = new Map<number, Cell | null>(
      units.map((unit) => [
        unit.idRentalUnit,
        unit.posX != null && unit.posY != null ? { x: unit.posX, y: unit.posY } : null,
      ]),
    );
    const cells = [...positions.values()].filter((cell): cell is Cell => cell !== null);
    const neededColumns = Math.max(0, ...cells.map((cell) => cell.x + 1));
    const neededRows = Math.max(0, ...cells.map((cell) => cell.y + 1));

    this.units.set(units);
    this.positions.set(positions);
    this.saved.set(positions);
    this.selectedId.set(null);
    this.status.set(START_STATUS);
    this.columns.set(
      Math.min(
        MAX_SIZE,
        Math.max(neededColumns, options.keepSize ? this.columns() : DEFAULT_COLUMNS),
      ),
    );
    this.rows.set(
      Math.min(MAX_SIZE, Math.max(neededRows, options.keepSize ? this.rows() : DEFAULT_ROWS)),
    );
  }

  private focusNotice(): void {
    afterNextRender(() => this.noticeEl()?.nativeElement.focus(), { injector: this.injector });
  }
}

const keyOrNull = (cell: Cell | null | undefined): string | null => (cell ? keyOf(cell) : null);
