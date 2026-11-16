import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  form,
  FormField,
  min,
  ReadonlyFieldTree,
  required,
  submit,
  ValidationError,
} from '@angular/forms/signals';
import { LucideCheck, LucideLock, LucidePlus, LucideTent, LucideUmbrella } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { RentalUnit, RentalUnitRequest, UnitType } from '../../../core/api/resort.models';
import { UnitsApi } from '../../../core/api/units.api';
import { toFieldErrors, toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { money, UNIT_TYPE_LABEL, unitLabel } from '../../../shared/utils/format';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';

type LoadState = 'loading' | 'ready' | 'error';

/** Lo que se escribe en el formulario de alta. Los campos se llaman igual que en el pedido. */
interface UnitDraft {
  type: UnitType;
  identifier: string;
  dailyPrice: number | null;
}

/** El precio nuevo de la fila que se está editando. */
interface PriceDraft {
  newPrice: number | null;
}

/** Qué estados muestra la tabla. Por defecto, las que están en servicio: disponibles y bloqueadas. */
const STATUS_FILTERS = ['ACTIVE', 'AVAILABLE', 'BLOCKED', 'RETIRED', 'ALL'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type TypeFilter = 'ALL' | UnitType;

const DEFAULT_TYPE_FILTER: TypeFilter = 'ALL';
const DEFAULT_STATUS_FILTER: StatusFilter = 'ACTIVE';

const EMPTY_DRAFT: UnitDraft = { type: 'UMBRELLA', identifier: '', dailyPrice: null };

/** El precio tiene que ser mayor que cero; con centavos, el mínimo es un centavo. */
const MIN_PRICE = 0.01;
const PRICE_MESSAGE = 'El precio tiene que ser mayor que cero.';

/**
 * Las unidades del balneario (12.1): las carpas y las sombrillas del administrador. Se listan, se
 * crean, se les cambia el precio desde la fila y se bloquean o desbloquean (se deshace). Dar de baja
 * es otra cosa: es definitivo, así que pide confirmación y no deja acciones en la fila. Una unidad
 * no se borra. La tabla se filtra por tipo y por estado; por defecto no muestra las dadas de baja.
 *
 * Los errores del backend se pegan en su campo. El precio que no es mayor que cero llega en `campos`
 * y va por `toFieldErrors`. El identificador repetido llega como mensaje general (400, y 409 si dos
 * pedidos se cruzan), así que se lleva al campo del identificador a mano.
 */
@Component({
  selector: 'app-units',
  imports: [
    FormField,
    LucideCheck,
    LucideLock,
    LucidePlus,
    LucideTent,
    LucideUmbrella,
    ZAlert,
    ZBtn,
    ZEmpty,
    ZField,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './units.html',
  styleUrl: './units.scss',
})
export class Units {
  private readonly unitsApi = inject(UnitsApi);
  private readonly session = inject(SessionService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly units = signal<RentalUnit[]>([]);
  protected readonly loadError = signal('');

  /** El resultado de la última acción, para el lector de pantalla y para quien mira la tabla. */
  protected readonly notice = signal('');
  /** El error de bloquear o desbloquear: va arriba de la tabla. */
  protected readonly actionError = signal('');

  protected readonly typeOptions: { value: UnitType; label: string }[] = [
    { value: 'UMBRELLA', label: UNIT_TYPE_LABEL.UMBRELLA },
    { value: 'TENT', label: UNIT_TYPE_LABEL.TENT },
  ];

  protected readonly typeFilter = signal<TypeFilter>(DEFAULT_TYPE_FILTER);
  protected readonly statusFilter = signal<StatusFilter>(DEFAULT_STATUS_FILTER);

  /** Si el filtro se movió del de por defecto: si no, «Quitar los filtros» no tiene nada que hacer. */
  protected readonly hasFilters = computed(
    () =>
      this.typeFilter() !== DEFAULT_TYPE_FILTER || this.statusFilter() !== DEFAULT_STATUS_FILTER,
  );

  /** Las unidades que pasan los dos filtros. */
  protected readonly visibleUnits = computed(() => {
    const type = this.typeFilter();
    const status = this.statusFilter();
    return this.units().filter(
      (unit) => (type === 'ALL' || unit.type === type) && matchesStatus(unit, status),
    );
  });

  /** Si quedan unidades en servicio. Si no, el filtro por defecto no muestra nada y se dice eso. */
  protected readonly hasInService = computed(() => this.units().some((unit) => !isRetired(unit)));

  /**
   * Cuántas muestra el filtro de cuántas hay, como en Reservas, y después cuántas bloqueadas y
   * cuántas dadas de baja, sin importar el filtro.
   */
  protected readonly summary = computed(() => {
    const all = this.units();
    const retired = all.filter(isRetired).length;
    const blocked = all.filter((unit) => !isRetired(unit) && unit.isBlocked).length;
    const parts = [
      `${this.visibleUnits().length} de ${all.length} ${all.length === 1 ? 'unidad' : 'unidades'}`,
    ];
    if (blocked > 0) parts.push(`${blocked} ${blocked === 1 ? 'bloqueada' : 'bloqueadas'}`);
    if (retired > 0) parts.push(`${retired} ${retired === 1 ? 'dada de baja' : 'dadas de baja'}`);
    return parts.join(' · ');
  });

  /** El resumen: al confirmar la baja, la fila sale de la tabla y el foco viene acá. */
  private readonly summaryEl = viewChild<ElementRef<HTMLElement>>('summaryEl');

  // --- Alta -------------------------------------------------------------------------------

  protected readonly creating = signal(false);
  protected readonly formError = signal('');
  private readonly draft = signal<UnitDraft>({ ...EMPTY_DRAFT });

  protected readonly createForm = form(this.draft, (path) => {
    required(path.identifier, { message: 'Escribí el identificador de la unidad.' });
    required(path.dailyPrice, { message: 'Escribí el precio por día.' });
    min(path.dailyPrice, MIN_PRICE, { message: PRICE_MESSAGE });
  });

  /** Los controles en el orden en que se ven: el foco va al primero con error. */
  private readonly controls = viewChildren<ElementRef<HTMLElement>>('control');

  // --- Precio de una fila -----------------------------------------------------------------

  protected readonly editingId = signal<number | null>(null);
  private readonly priceDraft = signal<PriceDraft>({ newPrice: null });

  protected readonly priceForm = form(this.priceDraft, (path) => {
    required(path.newPrice, { message: 'Escribí el precio por día.' });
    min(path.newPrice, MIN_PRICE, { message: PRICE_MESSAGE });
  });

  private readonly priceInput = viewChild<ElementRef<HTMLInputElement>>('priceInput');

  // --- Bloquear y desbloquear -------------------------------------------------------------

  /** La unidad que espera confirmación y lo que se le va a hacer. */
  protected readonly pendingBlock = signal<{ unit: RentalUnit; block: boolean } | null>(null);
  protected readonly blocking = signal(false);
  private readonly blockDialog = viewChild<ElementRef<HTMLDialogElement>>('blockDialog');

  // --- Dar de baja ------------------------------------------------------------------------

  /** La unidad que espera confirmación de la baja. */
  protected readonly pendingRetire = signal<RentalUnit | null>(null);
  protected readonly retiring = signal(false);
  /** Por qué no se pudo dar de baja (por ejemplo, reservas por delante): va dentro de la confirmación. */
  protected readonly retireError = signal('');
  private readonly retireDialog = viewChild<ElementRef<HTMLDialogElement>>('retireDialog');

  constructor() {
    this.load();

    // Al abrir la edición del precio, el foco va al campo con el valor elegido.
    effect(() => {
      const input = this.priceInput()?.nativeElement;
      if (!input) return;
      input.focus();
      input.select();
    });

    // Al abrir el formulario de alta, el foco va al primer control.
    effect(() => {
      if (this.creating()) this.controls()[0]?.nativeElement.focus();
    });
  }

  protected load(): void {
    this.state.set('loading');

    this.unitsApi.list().subscribe({
      next: (units) => {
        this.units.set(sortUnits(units));
        this.state.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toUserMessage(error));
        this.state.set('error');
      },
    });
  }

  protected label(unit: RentalUnit): string {
    return unitLabel(unit.type, unit.identifier);
  }

  protected typeLabel(type: UnitType): string {
    return UNIT_TYPE_LABEL[type];
  }

  protected isRetired(unit: RentalUnit): boolean {
    return isRetired(unit);
  }

  protected setTypeFilter(value: string): void {
    if (value === 'ALL' || value === 'TENT' || value === 'UMBRELLA') this.typeFilter.set(value);
  }

  protected setStatusFilter(value: string): void {
    if ((STATUS_FILTERS as readonly string[]).includes(value)) {
      this.statusFilter.set(value as StatusFilter);
    }
  }

  protected clearFilters(): void {
    this.typeFilter.set(DEFAULT_TYPE_FILTER);
    this.statusFilter.set(DEFAULT_STATUS_FILTER);
  }

  /** Sin unidades en servicio: deja ver las que se dieron de baja. */
  protected showRetired(): void {
    this.typeFilter.set(DEFAULT_TYPE_FILTER);
    this.statusFilter.set('RETIRED');
  }

  protected price(amount: number): string {
    return money(amount);
  }

  /** El campo mostró su error: se marca también para el lector de pantalla. */
  protected hasError(field: ReadonlyFieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  // --- Alta -------------------------------------------------------------------------------

  protected openCreate(): void {
    this.notice.set('');
    this.formError.set('');
    this.creating.set(true);
    // Con el formulario ya abierto, el efecto no vuelve a correr: el foco va a mano.
    this.controls()[0]?.nativeElement.focus();
  }

  protected closeCreate(): void {
    this.creating.set(false);
    this.formError.set('');
    this.draft.set({ ...EMPTY_DRAFT });
    this.createForm().reset();
  }

  protected onCreateSubmit(event: Event): void {
    event.preventDefault();
    void this.create();
  }

  private async create(): Promise<void> {
    // Mientras el pedido está en curso no se manda otro: el botón también queda deshabilitado.
    if (this.createForm().submitting()) return;
    this.formError.set('');
    this.notice.set('');

    await submit(this.createForm, async () => {
      const resortId = this.session.user()?.idManagedResort;
      if (resortId == null) {
        this.formError.set('Tu cuenta no tiene un balneario asignado.');
        return;
      }

      const draft = this.createForm().value();
      const request: RentalUnitRequest = {
        type: draft.type,
        identifier: draft.identifier.trim(),
        dailyPrice: draft.dailyPrice as number,
        isBlocked: false,
        resortId,
      };

      try {
        const created = await firstValueFrom(this.unitsApi.create(request));
        this.units.update((units) => sortUnits([...units, created]));
        this.notice.set(`Creamos la ${this.label(created)}.`);
        // El formulario queda abierto para cargar la siguiente, del mismo tipo.
        this.draft.set({ ...EMPTY_DRAFT, type: created.type });
        this.createForm().reset();
        this.controls()[1]?.nativeElement.focus();
        return;
      } catch (error) {
        const err = error as HttpErrorResponse;
        const fieldErrors = toFieldErrors(this.createForm, err);
        if (fieldErrors.length > 0) return fieldErrors;

        const duplicated = duplicatedIdentifier(err);
        if (duplicated) {
          return [{ fieldTree: this.createForm.identifier, kind: 'server', message: duplicated }];
        }

        this.formError.set(toUserMessage(err));
        return;
      }
    });

    this.focusFirstInvalid();
  }

  /** Al enviar con errores, el foco va al primer campo con error (sistema de diseño, «Campo»). */
  private focusFirstInvalid(): void {
    const fields = this.createForm;
    // El tipo siempre tiene un valor; su primer botón es el primero de los controles.
    const ordered = [fields.type, fields.identifier, fields.dailyPrice];
    const index = ordered.findIndex((field) => this.hasError(field));
    if (index >= 0) this.controls()[index]?.nativeElement.focus();
  }

  // --- Precio de una fila -----------------------------------------------------------------

  protected editPrice(unit: RentalUnit): void {
    this.notice.set('');
    this.actionError.set('');
    this.priceDraft.set({ newPrice: unit.dailyPrice });
    this.priceForm().reset();
    this.editingId.set(unit.idRentalUnit);
  }

  protected cancelPrice(): void {
    this.editingId.set(null);
  }

  protected onPriceKey(event: Event): void {
    event.preventDefault();
    void this.savePrice();
  }

  protected async savePrice(): Promise<void> {
    const id = this.editingId();
    if (id === null || this.priceForm().submitting()) return;

    await submit(this.priceForm, async () => {
      const newPrice = this.priceForm().value().newPrice as number;

      try {
        const updated = await firstValueFrom(this.unitsApi.updatePrice(id, newPrice));
        this.replace(updated);
        this.editingId.set(null);
        this.notice.set(
          `La ${this.label(updated)} ahora sale ${money(updated.dailyPrice)} por día.`,
        );
        return;
      } catch (error) {
        // El precio inválido llega como mensaje general, sin `campos`: va debajo del campo.
        const errors: ValidationError.WithOptionalFieldTree[] = [
          {
            fieldTree: this.priceForm.newPrice,
            kind: 'server',
            message: toUserMessage(error as HttpErrorResponse),
          },
        ];
        return errors;
      }
    });
  }

  // --- Bloquear y desbloquear -------------------------------------------------------------

  /** Pide confirmación: bloquea si está disponible y desbloquea si está bloqueada. */
  protected askBlock(unit: RentalUnit): void {
    this.notice.set('');
    this.actionError.set('');
    this.pendingBlock.set({ unit, block: !unit.isBlocked });
    this.blockDialog()?.nativeElement.showModal();
  }

  protected closeBlock(): void {
    this.blockDialog()?.nativeElement.close();
    this.pendingBlock.set(null);
  }

  protected confirmBlock(): void {
    const pending = this.pendingBlock();
    if (!pending) return;
    this.blocking.set(true);

    this.unitsApi.setBlocked(pending.unit.idRentalUnit, pending.block).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.blocking.set(false);
        this.closeBlock();
        this.notice.set(
          updated.isBlocked
            ? `La ${this.label(updated)} quedó bloqueada: ya no se puede reservar.`
            : `La ${this.label(updated)} quedó desbloqueada: se puede reservar de nuevo.`,
        );
      },
      error: (error: HttpErrorResponse) => {
        this.blocking.set(false);
        this.closeBlock();
        this.actionError.set(toUserMessage(error));
      },
    });
  }

  // --- Dar de baja ------------------------------------------------------------------------

  protected askRetire(unit: RentalUnit): void {
    this.notice.set('');
    this.actionError.set('');
    this.retireError.set('');
    this.pendingRetire.set(unit);
    this.retireDialog()?.nativeElement.showModal();
  }

  protected closeRetire(): void {
    this.retireDialog()?.nativeElement.close();
    this.pendingRetire.set(null);
    this.retireError.set('');
  }

  protected confirmRetire(): void {
    const unit = this.pendingRetire();
    if (!unit || this.retiring()) return;
    this.retiring.set(true);
    this.retireError.set('');

    this.unitsApi.retire(unit.idRentalUnit).subscribe({
      next: (updated) => {
        // Si justo se estaba editando su precio, ya no hay nada que editar.
        if (this.editingId() === updated.idRentalUnit) this.editingId.set(null);
        this.replace(updated);
        this.retiring.set(false);
        this.closeRetire();
        this.notice.set(`La ${this.label(updated)} se dio de baja. Ya no se puede reservar.`);
        // La fila del botón que se apretó sale de la tabla: el foco no puede volver ahí. Va al
        // resumen, que dice cómo quedó la tabla; el aviso de arriba se anuncia solo.
        this.summaryEl()?.nativeElement.focus();
      },
      error: (error: HttpErrorResponse) => {
        // La confirmación sigue abierta: el motivo se lee ahí, junto al botón que se apretó.
        this.retiring.set(false);
        this.retireError.set(toUserMessage(error));
      },
    });
  }

  private replace(updated: RentalUnit): void {
    this.units.update((units) =>
      units.map((unit) => (unit.idRentalUnit === updated.idRentalUnit ? updated : unit)),
    );
  }
}

function isRetired(unit: RentalUnit): boolean {
  return unit.retired;
}

function matchesStatus(unit: RentalUnit, status: StatusFilter): boolean {
  const retired = isRetired(unit);
  switch (status) {
    case 'ACTIVE':
      return !retired;
    case 'AVAILABLE':
      return !retired && !unit.isBlocked;
    case 'BLOCKED':
      return !retired && unit.isBlocked;
    case 'RETIRED':
      return retired;
    case 'ALL':
      return true;
  }
}

/** Por identificador, con los números en orden: C-2 antes que C-10. */
function sortUnits(units: RentalUnit[]): RentalUnit[] {
  return [...units].sort((a, b) =>
    a.identifier.localeCompare(b.identifier, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

/**
 * El mensaje del identificador repetido, o `null` si el error es otro. El backend lo contesta como
 * 400 con «Ya existe una unidad con el identificador …» y, si dos pedidos se cruzan, como 409.
 */
function duplicatedIdentifier(err: HttpErrorResponse): string | null {
  if (err.status === 409) return 'Ya existe una unidad con ese identificador en tu balneario.';
  const message = (err.error as { error?: string } | null)?.error;
  return err.status === 400 && message?.startsWith('Ya existe una unidad') ? message : null;
}
