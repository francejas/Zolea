import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  form,
  FormField,
  min,
  ReadonlyFieldTree,
  required,
  submit,
  ValidationError,
} from '@angular/forms/signals';
import { LucideLock, LucidePlus, LucideTent, LucideUmbrella } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { RentalUnit, RentalUnitRequest, UnitType } from '../../../core/api/resort.models';
import { UnitsApi } from '../../../core/api/units.api';
import { toFieldErrors, toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { money, UNIT_TYPE_LABEL, unitLabel } from '../../../shared/utils/format';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import { filterUnits, UnitStateFilter } from './unit-filters';

type LoadState = 'loading' | 'ready' | 'error';

interface UnitDraft {
  type: UnitType;
  identifier: string;
  dailyPrice: number | null;
}

interface PriceDraft {
  newPrice: number | null;
}

const EMPTY_DRAFT: UnitDraft = {
  type: 'UMBRELLA',
  identifier: '',
  dailyPrice: null,
};

const MIN_PRICE = 0.01;
const PRICE_MESSAGE = 'El precio tiene que ser mayor que cero.';

@Component({
  selector: 'app-units',
  imports: [
    FormField,
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly unitsApi = inject(UnitsApi);
  private readonly session = inject(SessionService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly units = signal<RentalUnit[]>([]);
  protected readonly loadError = signal('');

  protected readonly notice = signal('');
  protected readonly actionError = signal('');

  protected readonly typeOptions: { value: UnitType; label: string }[] = [
    { value: 'UMBRELLA', label: UNIT_TYPE_LABEL.UMBRELLA },
    { value: 'TENT', label: UNIT_TYPE_LABEL.TENT },
  ];

  protected readonly typeFilter = signal<UnitType | ''>('');
  protected readonly stateFilter = signal<UnitStateFilter>('ACTIVE');

  protected readonly filteredUnits = computed(() =>
    filterUnits(this.units(), this.typeFilter(), this.stateFilter()),
  );

  protected readonly summary = computed(() => {
    const all = this.filteredUnits();
    const blocked = all.filter((unit) => !unit.retired && unit.isBlocked).length;
    const total = `${all.length} ${all.length === 1 ? 'unidad' : 'unidades'}`;

    if (blocked === 0) return total;

    return `${total} · ${blocked} ${blocked === 1 ? 'bloqueada' : 'bloqueadas'}`;
  });

  protected readonly creating = signal(false);
  protected readonly formError = signal('');
  private readonly draft = signal<UnitDraft>({ ...EMPTY_DRAFT });

  protected readonly createForm = form(this.draft, (path) => {
    required(path.identifier, {
      message: 'Escribí el identificador de la unidad.',
    });
    required(path.dailyPrice, {
      message: 'Escribí el precio por día.',
    });
    min(path.dailyPrice, MIN_PRICE, {
      message: PRICE_MESSAGE,
    });
  });

  private readonly controls = viewChildren<ElementRef<HTMLElement>>('control');

  protected readonly editingId = signal<number | null>(null);
  private readonly priceDraft = signal<PriceDraft>({ newPrice: null });

  protected readonly priceForm = form(this.priceDraft, (path) => {
    required(path.newPrice, {
      message: 'Escribí el precio por día.',
    });
    min(path.newPrice, MIN_PRICE, {
      message: PRICE_MESSAGE,
    });
  });

  private readonly priceInput = viewChild<ElementRef<HTMLInputElement>>('priceInput');

  protected readonly pendingBlock = signal<{
    unit: RentalUnit;
    block: boolean;
  } | null>(null);

  protected readonly blocking = signal(false);
  private readonly blockDialog = viewChild<ElementRef<HTMLDialogElement>>('blockDialog');

  protected readonly pendingRetire = signal<RentalUnit | null>(null);
  protected readonly retiring = signal(false);
  protected readonly retireError = signal('');
  private readonly retireDialog = viewChild<ElementRef<HTMLDialogElement>>('retireDialog');

  constructor() {
    this.load();

    effect(() => {
      const input = this.priceInput()?.nativeElement;
      if (!input) return;

      input.focus();
      input.select();
    });

    effect(() => {
      if (this.creating()) {
        this.controls()[0]?.nativeElement.focus();
      }
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

  protected price(amount: number): string {
    return money(amount);
  }

  protected hasError(field: ReadonlyFieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  protected setTypeFilter(value: string): void {
    if (value === '' || value === 'TENT' || value === 'UMBRELLA') {
      this.cancelPrice();
      this.typeFilter.set(value);
    }
  }

  protected setStateFilter(value: string): void {
    if (value === 'ACTIVE' || value === 'AVAILABLE' || value === 'BLOCKED' || value === 'RETIRED') {
      this.cancelPrice();
      this.stateFilter.set(value);
    }
  }

  protected resetFilters(): void {
    this.cancelPrice();
    this.typeFilter.set('');
    this.stateFilter.set('ACTIVE');
  }

  protected openCreate(): void {
    this.notice.set('');
    this.formError.set('');
    this.creating.set(true);
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

        this.draft.set({
          ...EMPTY_DRAFT,
          type: created.type,
        });

        this.createForm().reset();
        this.controls()[1]?.nativeElement.focus();
        return;
      } catch (error) {
        const err = error as HttpErrorResponse;
        const fieldErrors = toFieldErrors(this.createForm, err);

        if (fieldErrors.length > 0) return fieldErrors;

        const duplicated = duplicatedIdentifier(err);

        if (duplicated) {
          return [
            {
              fieldTree: this.createForm.identifier,
              kind: 'server',
              message: duplicated,
            },
          ];
        }

        this.formError.set(toUserMessage(err));
        return;
      }
    });

    this.focusFirstInvalid();
  }

  private focusFirstInvalid(): void {
    const fields = this.createForm;
    const ordered = [fields.type, fields.identifier, fields.dailyPrice];
    const index = ordered.findIndex((field) => this.hasError(field));

    if (index >= 0) {
      this.controls()[index]?.nativeElement.focus();
    }
  }

  protected editPrice(unit: RentalUnit): void {
    if (unit.retired) return;

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

  protected askBlock(unit: RentalUnit): void {
    if (unit.retired) return;

    this.notice.set('');
    this.actionError.set('');
    this.pendingBlock.set({
      unit,
      block: !unit.isBlocked,
    });
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

  protected askRetire(unit: RentalUnit): void {
    if (unit.retired || this.retiring() || this.blocking() || this.priceForm().submitting()) {
      return;
    }

    this.cancelPrice();
    this.notice.set('');
    this.retireError.set('');
    this.pendingRetire.set(unit);
    this.retireDialog()?.nativeElement.showModal();
  }

  protected closeRetire(): void {
    if (this.retiring()) return;

    this.retireDialog()?.nativeElement.close();
    this.pendingRetire.set(null);
  }

  protected onRetireCancel(event: Event): void {
    event.preventDefault();
    this.closeRetire();
  }

  protected confirmRetire(): void {
    const unit = this.pendingRetire();

    if (!unit || unit.retired || this.retiring()) return;

    this.retiring.set(true);
    this.retireError.set('');

    this.unitsApi
      .retire(unit.idRentalUnit)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.replace(updated);
          this.retiring.set(false);
          this.closeRetire();

          // Permite ver la fila recién dada de baja.
          this.stateFilter.set('RETIRED');
          this.notice.set(
            `La ${this.label(updated)} fue dada de baja. Su historial se conserva. Mostrando las unidades dadas de baja.`,
          );
        },
        error: (error: HttpErrorResponse) => {
          this.retiring.set(false);

          // El motivo queda dentro del diálogo, incluido el 400 por reservas.
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

function sortUnits(units: RentalUnit[]): RentalUnit[] {
  return [...units].sort((a, b) =>
    a.identifier.localeCompare(b.identifier, 'es', {
      numeric: true,
      sensitivity: 'base',
    }),
  );
}

function duplicatedIdentifier(err: HttpErrorResponse): string | null {
  if (err.status === 409) {
    return 'Ya existe una unidad con ese identificador en tu balneario.';
  }

  const message = (err.error as { error?: string } | null)?.error;

  return err.status === 400 && message?.startsWith('Ya existe una unidad') ? message : null;
}
