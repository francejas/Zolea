import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField, ReadonlyFieldTree, submit } from '@angular/forms/signals';
import { LucideEye, LucideEyeOff, LucidePlus, LucideSearch } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { ResortSummary } from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { toFieldErrors, toUserMessage } from '../../../core/errors/error-message';
import { PHONE_COUNTRIES, phoneCountry } from '../../../shared/utils/phone';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import { keepDigits } from '../../auth/client-rules';
import {
  AdminAccountModel,
  adminAccountRules,
  emptyAdminAccount,
  requiredText,
  toAdminAccountRequest,
} from './admin-account';

type LoadState = 'loading' | 'ready' | 'error';

/** El formulario de alta: el balneario y, adentro, su administrador. Como el pedido. */
interface ResortDraft {
  name: string;
  location: string;
  admin: AdminAccountModel;
}

const emptyDraft = (): ResortDraft => ({ name: '', location: '', admin: emptyAdminAccount() });

/**
 * Balnearios (#71), de la cuenta de Zolea: todos los balnearios, activos e inactivos, con su
 * administrador. Desde acá se da de alta uno nuevo junto con la cuenta de quien lo va a administrar,
 * y se desactiva o reactiva cualquiera. Lo que pasa con uno inactivo es lo de siempre: deja de
 * aparecer en la Portada y no toma reservas nuevas.
 *
 * Se diseña desde la computadora; debajo de 768 px cada fila pasa a ser una tarjeta.
 */
@Component({
  selector: 'app-zolea-resorts',
  imports: [
    FormField,
    LucideEye,
    LucideEyeOff,
    LucidePlus,
    LucideSearch,
    ZAlert,
    ZBtn,
    ZEmpty,
    ZField,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './zolea-resorts.html',
  styleUrl: './zolea-resorts.scss',
})
export class ZoleaResorts {
  private readonly resortsApi = inject(ResortsApi);
  private readonly injector = inject(Injector);

  protected readonly state = signal<LoadState>('loading');
  protected readonly resorts = signal<ResortSummary[]>([]);
  protected readonly loadError = signal('');

  /** El resultado de la última acción, para el lector de pantalla y para quien mira la tabla. */
  protected readonly notice = signal('');
  /** El error de desactivar o reactivar: va arriba de la tabla. */
  protected readonly actionError = signal('');

  // --- Buscar -----------------------------------------------------------------------------

  protected readonly query = signal('');

  protected readonly visible = computed(() => {
    const words = normalize(this.query()).split(/\s+/).filter(Boolean);
    if (words.length === 0) return this.resorts();
    return this.resorts().filter((resort) => {
      const haystack = normalize(searchText(resort));
      return words.every((word) => haystack.includes(word));
    });
  });

  protected readonly summary = computed(() => {
    const total = this.resorts().length;
    const noun = total === 1 ? 'balneario' : 'balnearios';
    return this.query().trim()
      ? `${this.visible().length} de ${total} ${noun}`
      : `${total} ${noun}`;
  });

  // --- Alta -------------------------------------------------------------------------------

  protected readonly creating = signal(false);
  protected readonly formError = signal('');
  protected readonly showPassword = signal(false);
  protected readonly countries = PHONE_COUNTRIES;
  private readonly draft = signal<ResortDraft>(emptyDraft());

  protected readonly createForm = form(this.draft, (path) => {
    requiredText(path.name, 'Escribí el nombre del balneario.');
    requiredText(path.location, 'Escribí la dirección.');
    adminAccountRules(path.admin);
  });

  /** El país elegido para el teléfono: da el ejemplo del campo. */
  protected readonly country = computed(() =>
    phoneCountry(this.createForm.admin.phoneCountry().value()),
  );

  private readonly createSection = viewChild<ElementRef<HTMLFormElement>>('createSection');
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly noticeBox = viewChild<ElementRef<HTMLElement>>('noticeBox');

  // --- Desactivar -------------------------------------------------------------------------

  protected readonly pendingDeactivate = signal<ResortSummary | null>(null);
  /** El balneario que se está activando o desactivando: su botón queda ocupado. */
  protected readonly toggling = signal<number | null>(null);
  private readonly deactivateDialog = viewChild<ElementRef<HTMLDialogElement>>('deactivateDialog');

  constructor() {
    this.load();

    // Al abrir el formulario de alta, el foco va al nombre.
    effect(() => {
      if (this.creating()) this.nameInput()?.nativeElement.focus();
    });
  }

  protected load(): void {
    this.state.set('loading');
    this.resortsApi.all().subscribe({
      next: (resorts) => {
        this.resorts.set(resorts);
        this.state.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toUserMessage(error));
        this.state.set('error');
      },
    });
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.query.set('');
  }

  protected adminName(resort: ResortSummary): string {
    return resort.admin ? `${resort.admin.firstName} ${resort.admin.lastName}` : '';
  }

  /** El campo mostró su error: se marca también para el lector de pantalla. */
  protected hasError(field: ReadonlyFieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  // --- Alta -------------------------------------------------------------------------------

  protected openCreate(): void {
    this.notice.set('');
    this.actionError.set('');
    this.formError.set('');
    this.creating.set(true);
    // Con el formulario ya abierto, el efecto no vuelve a correr: el foco va a mano.
    this.nameInput()?.nativeElement.focus();
  }

  protected closeCreate(): void {
    this.creating.set(false);
    this.formError.set('');
    this.showPassword.set(false);
    this.createForm().reset(emptyDraft());
  }

  protected setCountry(event: Event): void {
    this.createForm.admin.phoneCountry().value.set((event.target as HTMLSelectElement).value);
  }

  /** Teléfono y DNI son solo números (`keepDigits`). */
  protected onlyDigits(event: Event, field: 'phone' | 'dni'): void {
    this.createForm.admin[field]().value.set(keepDigits(event));
  }

  protected onCreateSubmit(event: Event): void {
    event.preventDefault();
    void this.create();
  }

  private async create(): Promise<void> {
    // Mientras el pedido está en curso no se manda otro: el botón también queda deshabilitado.
    if (this.createForm().submitting()) return;
    this.formError.set('');

    await submit(this.createForm, async () => {
      const value = this.createForm().value();
      const admin = toAdminAccountRequest(value.admin);

      try {
        const { resort } = await firstValueFrom(
          this.resortsApi.register({
            name: value.name.trim(),
            location: value.location.trim(),
            admin,
          }),
        );
        const row: ResortSummary = {
          idResort: resort.idResort,
          name: resort.name,
          location: resort.location,
          active: resort.active,
          unitCount: 0,
          // Es la cuenta recién creada, con los datos que se cargaron.
          admin: { firstName: admin.firstName, lastName: admin.lastName, email: admin.email },
        };
        this.resorts.update((resorts) => sortByName([...resorts, row]));
        this.closeCreate();
        this.query.set('');
        this.showNotice(
          `Dimos de alta «${resort.name}». Su administrador ya puede ingresar con ${admin.email} y la contraseña provisoria.`,
        );
        return;
      } catch (error) {
        const err = error as HttpErrorResponse;
        const fieldErrors = toFieldErrors(this.createForm, err);
        if (fieldErrors.length > 0) return fieldErrors;

        this.formError.set(toUserMessage(err));
        return;
      }
    });

    this.focusFirstInvalid();
  }

  /** Al enviar con errores, el foco va al primer campo marcado. */
  private focusFirstInvalid(): void {
    afterNextRender(
      () => {
        this.createSection()
          ?.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
      },
      { injector: this.injector },
    );
  }

  /** El aviso de arriba recibe el foco: el botón que se tocó ya no está. */
  private showNotice(message: string): void {
    this.notice.set(message);
    afterNextRender(() => this.noticeBox()?.nativeElement.focus(), { injector: this.injector });
  }

  // --- Desactivar y reactivar -------------------------------------------------------------

  /** Pide confirmación: lo saca de la Portada. */
  protected askDeactivate(resort: ResortSummary): void {
    this.notice.set('');
    this.actionError.set('');
    this.pendingDeactivate.set(resort);
    this.deactivateDialog()?.nativeElement.showModal();
  }

  /** Esc o «Volver». Puede correr dos veces (el botón y el evento close): la segunda no hace nada. */
  protected closeDeactivate(): void {
    const dialog = this.deactivateDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
    this.pendingDeactivate.set(null);
  }

  /** Mientras se desactiva, Esc no cierra el diálogo. */
  protected onDialogCancel(event: Event): void {
    if (this.toggling() !== null) event.preventDefault();
  }

  protected confirmDeactivate(): void {
    const resort = this.pendingDeactivate();
    if (!resort || this.toggling() !== null) return;
    this.toggle(resort, false);
  }

  protected reactivate(resort: ResortSummary): void {
    if (this.toggling() !== null) return;
    this.notice.set('');
    this.actionError.set('');
    this.toggle(resort, true);
  }

  private toggle(resort: ResortSummary, active: boolean): void {
    this.toggling.set(resort.idResort);
    const request = active
      ? this.resortsApi.activate(resort.idResort)
      : this.resortsApi.deactivate(resort.idResort);

    request.subscribe({
      next: ({ resort: saved }) => {
        this.toggling.set(null);
        this.resorts.update((resorts) =>
          resorts.map((r) => (r.idResort === saved.idResort ? { ...r, active: saved.active } : r)),
        );
        this.closeDeactivate();
        this.showNotice(
          active
            ? `Reactivamos «${resort.name}». Vuelve a aparecer en la Portada.`
            : `Desactivamos «${resort.name}». Ya no aparece en la Portada y no toma reservas nuevas.`,
        );
      },
      error: (error: HttpErrorResponse) => {
        this.toggling.set(null);
        this.closeDeactivate();
        this.actionError.set(toUserMessage(error));
      },
    });
  }
}

/** Lo que se busca de un balneario: su nombre, su dirección y su administrador. */
function searchText(resort: ResortSummary): string {
  const admin = resort.admin;
  return [resort.name, resort.location, admin?.firstName, admin?.lastName, admin?.email]
    .filter(Boolean)
    .join(' ');
}

/** Sin tildes ni mayúsculas: «Mar del Plata» se encuentra escribiendo «mar del plata». */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function sortByName(resorts: ResortSummary[]): ResortSummary[] {
  return [...resorts].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}
