import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import {
  form,
  FormField,
  ReadonlyFieldTree,
  required,
  SchemaPath,
  submit,
  validate,
  ValidationError,
} from '@angular/forms/signals';
import { LucideDynamicIcon, LucidePlus } from '@lucide/angular';
import { catchError, firstValueFrom, forkJoin, of } from 'rxjs';
import { AmenitiesApi } from '../../../core/api/amenities.api';
import { Amenity, Resort } from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { amenityIcon, amenityKey } from '../../../shared/utils/amenity-icons';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';

type LoadState = 'loading' | 'ready' | 'error';

/** Lo que se escribe en el alta y al renombrar. El campo se llama igual que en el pedido. */
interface NameDraft {
  name: string;
}

/** Cuántos balnearios ofrecen un servicio y si uno de ellos es el del administrador. */
interface Usage {
  count: number;
  mine: boolean;
}

/** El backend pide al menos tres letras, sin contar los espacios de las puntas. */
const MIN_NAME = 3;
const EMPTY_MESSAGE = 'Escribí el nombre del servicio.';
const SHORT_MESSAGE = `El nombre tiene que tener al menos ${MIN_NAME} letras.`;
const GONE_MESSAGE =
  'Este servicio ya no está en el catálogo: puede que lo haya borrado otro administrador.';

/**
 * El catálogo de servicios (12.2): Wi-Fi, duchas, estacionamiento… Es uno solo para los cinco
 * balnearios, así que lo que se crea, renombra o borra acá cambia para todos. Qué servicios ofrece
 * cada balneario se marca en Mi balneario, aparte a propósito.
 *
 * Borrar es el único borrado real de la aplicación: el servicio desaparece y se desvincula de los
 * balnearios que lo ofrecían. Por eso pide confirmación y dice cuántos lo ofrecen hoy, contados
 * sobre `GET /api/resorts`; si ese pedido falla, el catálogo se muestra igual, sin el conteo.
 */
@Component({
  selector: 'app-amenities',
  imports: [
    FormField,
    LucideDynamicIcon,
    LucidePlus,
    ZAlert,
    ZBtn,
    ZEmpty,
    ZField,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './amenities.html',
  styleUrl: './amenities.scss',
})
export class Amenities {
  private readonly amenitiesApi = inject(AmenitiesApi);
  private readonly resortsApi = inject(ResortsApi);
  private readonly session = inject(SessionService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly amenities = signal<Amenity[]>([]);
  protected readonly loadError = signal('');
  /** Los balnearios activos, para contar quién ofrece cada servicio. `null` si no llegaron. */
  private readonly resorts = signal<Resort[] | null>(null);

  /** El resultado de la última acción, para el lector de pantalla y para quien mira la tabla. */
  protected readonly notice = signal('');
  /** El error de borrar: va arriba de la tabla. */
  protected readonly actionError = signal('');

  protected readonly amenityIcon = amenityIcon;

  /** Por servicio, cuántos balnearios lo ofrecen. `null` si no se pudo contar. */
  protected readonly usage = computed<Map<number, Usage> | null>(() => {
    const resorts = this.resorts();
    if (!resorts) return null;

    const myResort = this.session.user()?.idManagedResort;
    const usage = new Map<number, Usage>();
    for (const resort of resorts) {
      for (const amenity of resort.amenities) {
        const current = usage.get(amenity.idAmenity) ?? { count: 0, mine: false };
        usage.set(amenity.idAmenity, {
          count: current.count + 1,
          mine: current.mine || resort.idResort === myResort,
        });
      }
    }
    return usage;
  });

  protected readonly summary = computed(() => {
    const count = this.amenities().length;
    return `${count} ${count === 1 ? 'servicio' : 'servicios'} en el catálogo`;
  });

  // --- Alta -------------------------------------------------------------------------------

  protected readonly creating = signal(false);
  protected readonly formError = signal('');
  private readonly draft = signal<NameDraft>({ name: '' });

  protected readonly createForm = form(this.draft, (path) => {
    nameRules(path.name, (name) => this.taken(name, null));
  });

  private readonly createInput = viewChild<ElementRef<HTMLInputElement>>('createInput');

  // --- Renombrar una fila -----------------------------------------------------------------

  protected readonly editingId = signal<number | null>(null);
  private readonly renameDraft = signal<NameDraft>({ name: '' });

  protected readonly renameForm = form(this.renameDraft, (path) => {
    nameRules(path.name, (name) => this.taken(name, this.editingId()));
  });

  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  // --- Borrar -----------------------------------------------------------------------------

  /** El servicio que espera confirmación para borrarse. */
  protected readonly pendingDelete = signal<Amenity | null>(null);
  protected readonly deleting = signal(false);
  private readonly deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');

  /** Lo que dice la confirmación: a cuántos afecta hoy y que no se deshace. */
  protected readonly deleteConsequence = computed(() => {
    const amenity = this.pendingDelete();
    if (!amenity) return '';

    const scope =
      'Se borra del catálogo de todos los balnearios, no solo del tuyo, y no se puede deshacer.';
    const usage = this.usage();
    if (!usage) return scope;

    const { count, mine } = usage.get(amenity.idAmenity) ?? { count: 0, mine: false };
    return `${todayUsage(count, mine)} ${scope}`;
  });

  constructor() {
    this.load();

    // Al abrir el renombre, el foco va al campo con el nombre elegido.
    effect(() => {
      const input = this.renameInput()?.nativeElement;
      if (!input) return;
      input.focus();
      input.select();
    });

    // Al abrir el formulario de alta, el foco va al nombre.
    effect(() => {
      if (this.creating()) this.createInput()?.nativeElement.focus();
    });
  }

  protected load(): void {
    this.state.set('loading');

    forkJoin({
      amenities: this.amenitiesApi.list(),
      // El conteo es un dato de más: si los balnearios no llegan, el catálogo se muestra igual.
      resorts: this.resortsApi.list().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ amenities, resorts }) => {
        this.amenities.set(sortAmenities(amenities));
        this.resorts.set(resorts);
        this.state.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toUserMessage(error));
        this.state.set('error');
      },
    });
  }

  /** «3 balnearios», «Solo el tuyo» o «Ninguno», para la columna de la tabla. */
  protected usageLabel(amenity: Amenity): string {
    const { count, mine } = this.usage()?.get(amenity.idAmenity) ?? { count: 0, mine: false };
    if (count === 0) return 'Ninguno';
    if (count === 1 && mine) return 'Solo el tuyo';
    return `${count} ${count === 1 ? 'balneario' : 'balnearios'}`;
  }

  /** Si se muestra «incluido el tuyo» al lado del número. */
  protected includesMine(amenity: Amenity): boolean {
    const usage = this.usage()?.get(amenity.idAmenity);
    return !!usage && usage.mine && usage.count > 1;
  }

  /** El campo mostró su error: se marca también para el lector de pantalla. */
  protected hasError(field: ReadonlyFieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  /** El servicio que ya se llama así, sin contar tildes ni mayúsculas, salvo el que se edita. */
  private taken(name: string, exceptId: number | null): Amenity | undefined {
    const key = amenityKey(name);
    return this.amenities().find(
      (amenity) => amenity.idAmenity !== exceptId && amenityKey(amenity.name) === key,
    );
  }

  // --- Alta -------------------------------------------------------------------------------

  protected openCreate(): void {
    this.notice.set('');
    this.formError.set('');
    this.creating.set(true);
    // Con el formulario ya abierto, el efecto no vuelve a correr: el foco va a mano.
    this.createInput()?.nativeElement.focus();
  }

  protected closeCreate(): void {
    this.creating.set(false);
    this.formError.set('');
    this.draft.set({ name: '' });
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
      const name = this.createForm().value().name.trim();

      try {
        const created = await firstValueFrom(this.amenitiesApi.create(name));
        this.amenities.update((amenities) => sortAmenities([...amenities, created]));
        this.notice.set(
          `Sumamos «${created.name}» al catálogo. Ya lo puede elegir cualquier balneario.`,
        );
        // El formulario queda abierto para cargar el siguiente.
        this.draft.set({ name: '' });
        this.createForm().reset();
        this.createInput()?.nativeElement.focus();
        return;
      } catch (error) {
        const err = error as HttpErrorResponse;
        // El nombre inválido llega como mensaje general (400): es el único campo, va debajo de él.
        if (err.status === 400) return nameError(this.createForm.name, toUserMessage(err));

        this.formError.set(toUserMessage(err));
        return;
      }
    });

    if (this.hasError(this.createForm.name)) this.createInput()?.nativeElement.focus();
  }

  // --- Renombrar una fila -----------------------------------------------------------------

  protected startRename(amenity: Amenity): void {
    this.notice.set('');
    this.actionError.set('');
    this.renameDraft.set({ name: amenity.name });
    this.renameForm().reset();
    this.editingId.set(amenity.idAmenity);
  }

  protected cancelRename(): void {
    this.editingId.set(null);
  }

  protected onRenameKey(event: Event): void {
    event.preventDefault();
    void this.saveRename();
  }

  protected async saveRename(): Promise<void> {
    const id = this.editingId();
    if (id === null || this.renameForm().submitting()) return;
    const current = this.amenities().find((amenity) => amenity.idAmenity === id);
    if (!current) return;

    await submit(this.renameForm, async () => {
      const name = this.renameForm().value().name.trim();
      // Sin cambios, no hay nada que mandar.
      if (name === current.name) {
        this.editingId.set(null);
        return;
      }

      try {
        const renamed = await firstValueFrom(this.amenitiesApi.rename(id, name));
        this.amenities.update((amenities) =>
          sortAmenities(amenities.map((a) => (a.idAmenity === renamed.idAmenity ? renamed : a))),
        );
        this.editingId.set(null);
        this.notice.set(
          `«${current.name}» ahora se llama «${renamed.name}» en todos los balnearios.`,
        );
        return;
      } catch (error) {
        const err = error as HttpErrorResponse;
        const message = err.status === 404 ? GONE_MESSAGE : toUserMessage(err);
        return nameError(this.renameForm.name, message);
      }
    });
  }

  // --- Borrar -----------------------------------------------------------------------------

  /** Pide confirmación: borrar no se deshace y afecta a todos los balnearios. */
  protected askDelete(amenity: Amenity): void {
    this.notice.set('');
    this.actionError.set('');
    this.pendingDelete.set(amenity);
    this.deleteDialog()?.nativeElement.showModal();
  }

  protected closeDelete(): void {
    this.deleteDialog()?.nativeElement.close();
    this.pendingDelete.set(null);
  }

  protected confirmDelete(): void {
    const amenity = this.pendingDelete();
    if (!amenity || this.deleting()) return;
    this.deleting.set(true);

    this.amenitiesApi.delete(amenity.idAmenity).subscribe({
      next: () => {
        this.remove(amenity);
        this.notice.set(
          `Borramos «${amenity.name}» del catálogo. Ya no figura en ningún balneario.`,
        );
      },
      error: (error: HttpErrorResponse) => {
        // Si ya no existía, el resultado es el mismo que se pedía: se saca de la lista.
        if (error.status === 404) {
          this.remove(amenity);
          this.notice.set(`«${amenity.name}» ya no estaba en el catálogo: lo sacamos de la lista.`);
          return;
        }
        this.deleting.set(false);
        this.closeDelete();
        this.actionError.set(toUserMessage(error));
      },
    });
  }

  private remove(amenity: Amenity): void {
    this.amenities.update((amenities) =>
      amenities.filter((a) => a.idAmenity !== amenity.idAmenity),
    );
    if (this.editingId() === amenity.idAmenity) this.editingId.set(null);
    this.deleting.set(false);
    this.closeDelete();
  }
}

/** Las reglas del nombre, iguales en el alta y al renombrar. */
function nameRules(path: SchemaPath<string>, taken: (name: string) => Amenity | undefined): void {
  required(path, { message: EMPTY_MESSAGE });
  validate(path, ({ value }) => {
    const name = value().trim();
    // El campo vacío ya lo marca `required`; uno con solo espacios también está vacío.
    if (name === '') return value() === '' ? null : { kind: 'required', message: EMPTY_MESSAGE };
    if (name.length < MIN_NAME) return { kind: 'minLength', message: SHORT_MESSAGE };

    const existing = taken(name);
    if (existing)
      return { kind: 'duplicate', message: `Ya está en el catálogo como «${existing.name}».` };
    return null;
  });
}

/** El error del backend, pegado debajo del nombre. */
function nameError(
  fieldTree: ReadonlyFieldTree<string>,
  message: string,
): ValidationError.WithOptionalFieldTree[] {
  return [{ fieldTree, kind: 'server', message }];
}

/** «Hoy lo ofrecen 3 balnearios, entre ellos el tuyo.» */
function todayUsage(count: number, mine: boolean): string {
  if (count === 0) return 'Hoy no lo ofrece ningún balneario.';
  if (count === 1) return mine ? 'Hoy lo ofrece solo el tuyo.' : 'Hoy lo ofrece 1 balneario.';
  return `Hoy lo ofrecen ${count} balnearios${mine ? ', entre ellos el tuyo' : ''}.`;
}

/** Por nombre, en orden alfabético y sin importar tildes ni mayúsculas. */
function sortAmenities(amenities: Amenity[]): Amenity[] {
  return [...amenities].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}
