import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField, ReadonlyFieldTree, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideEye, LucideEyeOff } from '@lucide/angular';
import { firstValueFrom, Observable } from 'rxjs';
import { Account } from '../../../core/api/account.models';
import { AccountsApi } from '../../../core/api/accounts.api';
import { ResortSummary } from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { toFieldErrors, toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { formatDni } from '../../../shared/utils/format';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import { ErrorPage } from '../../error-page/error-page';
import { requiredText } from '../zolea-resorts/admin-account';
import { accountName, accountTypeLabel } from './account-format';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';
type Action = 'deactivate' | 'activate' | 'password' | 'assign' | 'remove';
type ResortsState = 'loading' | 'ready' | 'error';

/**
 * Una cuenta, desde Usuarios de la cuenta de Zolea (#72): sus datos, el balneario que administra,
 * cuántas reservas hizo y si está activa. Desde acá se desactiva o reactiva, se le pone una
 * contraseña provisoria y se le asigna o quita el balneario, cada cosa con su confirmación.
 *
 * La propia cuenta de Zolea no se desactiva ni cambia de rol: en la suya no están esas acciones.
 */
@Component({
  selector: 'app-zolea-user-detail',
  imports: [
    ErrorPage,
    FormField,
    LucideArrowLeft,
    LucideEye,
    LucideEyeOff,
    RouterLink,
    ZAlert,
    ZBtn,
    ZField,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './zolea-user-detail.html',
  styleUrl: './zolea-user-detail.scss',
})
export class ZoleaUserDetail {
  private readonly accountsApi = inject(AccountsApi);
  private readonly resortsApi = inject(ResortsApi);
  private readonly session = inject(SessionService);
  private readonly injector = inject(Injector);

  /** El id de la ruta `/admin/users/:id`. */
  readonly id = input.required<string>();

  protected readonly typeLabel = accountTypeLabel;
  protected readonly dni = (value: string | null) => (value ? formatDni(value) : '—');

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly account = signal<Account | null>(null);
  protected readonly name = computed(() => {
    const account = this.account();
    return account ? accountName(account) : '';
  });

  /** Es la cuenta de quien está mirando: no se desactiva ni cambia de rol. */
  protected readonly isSelf = computed(
    () => this.account()?.idClient === this.session.user()?.idClient,
  );

  /** El resultado de la última acción, arriba. */
  protected readonly notice = signal('');
  /** Por qué no se pudo hacer la última acción. */
  protected readonly actionError = signal('');

  // --- El diálogo de cada acción ------------------------------------------------------------

  protected readonly pending = signal<Action | null>(null);
  protected readonly busy = signal(false);
  protected readonly showPassword = signal(false);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('actionDialog');
  private readonly noticeBox = viewChild<ElementRef<HTMLElement>>('noticeBox');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly resortSelect = viewChild<ElementRef<HTMLSelectElement>>('resortSelect');

  private readonly passwordModel = signal({ password: '' });
  protected readonly passwordForm = form(this.passwordModel, (path) => {
    requiredText(path.password, 'Escribí una contraseña provisoria.');
  });

  private readonly resortModel = signal({ idResort: '' });
  protected readonly resortForm = form(this.resortModel, (path) => {
    requiredText(path.idResort, 'Elegí un balneario.');
  });
  protected readonly resortsState = signal<ResortsState>('loading');
  protected readonly resorts = signal<ResortSummary[]>([]);
  /** Los balnearios que se le pueden asignar: todos menos el que ya administra. */
  protected readonly resortOptions = computed(() =>
    this.resorts().filter((r) => r.idResort !== this.account()?.managedResort?.idResort),
  );

  protected readonly dialogTitle = computed(() => {
    const name = this.name();
    switch (this.pending()) {
      case 'deactivate':
        return `¿Desactivar la cuenta de ${name}?`;
      case 'activate':
        return `¿Reactivar la cuenta de ${name}?`;
      case 'password':
        return `Contraseña provisoria para ${name}`;
      case 'assign':
        return `Balneario para ${name}`;
      case 'remove':
        return `¿Quitarle el balneario a ${name}?`;
      default:
        return '';
    }
  });

  protected readonly dialogBody = computed(() => {
    const current = this.account()?.managedResort?.name;
    switch (this.pending()) {
      case 'deactivate':
        return 'No va a poder ingresar, y si tiene la sesión abierta se le cierra. Sus reservas siguen como están, y la podés reactivar cuando quieras.';
      case 'activate':
        return 'Vuelve a poder ingresar con su contraseña.';
      case 'password':
        return 'Reemplaza la que tiene. Pasásela por un medio seguro: la cambia en Mi cuenta.';
      case 'assign':
        return current
          ? `Pasa a administrar el balneario que elijas y deja de administrar «${current}».`
          : 'Pasa a administrar el balneario que elijas y lo ve en Mi balneario.';
      case 'remove':
        return `Deja de administrar «${current ?? ''}» y pasa a ser una cuenta de cliente.`;
      default:
        return '';
    }
  });

  constructor() {
    effect(() => {
      this.id();
      this.state.set('loading');
      this.load();
    });
  }

  protected load(): void {
    this.accountsApi.get(Number(this.id())).subscribe({
      next: (account) => {
        this.account.set(account);
        this.state.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 404) {
          this.state.set('not-found');
          return;
        }
        this.loadError.set(toUserMessage(error));
        this.state.set('error');
      },
    });
  }

  protected retry(): void {
    this.state.set('loading');
    this.load();
  }

  /** El campo mostró su error: se marca también para el lector de pantalla. */
  protected hasError(field: ReadonlyFieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  // --- Abrir y cerrar ---------------------------------------------------------------------

  protected ask(action: Action): void {
    this.notice.set('');
    this.actionError.set('');
    this.pending.set(action);

    if (action === 'password') {
      this.showPassword.set(false);
      this.passwordForm().reset({ password: '' });
    }
    if (action === 'assign') {
      this.resortForm().reset({ idResort: '' });
      this.loadResorts();
    }

    this.dialog()?.nativeElement.showModal();
    afterNextRender(
      () => {
        if (action === 'password') this.passwordInput()?.nativeElement.focus();
        if (action === 'assign') this.resortSelect()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  /** Esc o «Volver». Puede correr dos veces (el botón y el evento close): la segunda no hace nada. */
  protected closeDialog(): void {
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) dialog.close();
    this.pending.set(null);
  }

  /** Mientras se hace la acción, Esc no cierra el diálogo. */
  protected onDialogCancel(event: Event): void {
    if (this.busy()) event.preventDefault();
  }

  private loadResorts(): void {
    this.resortsState.set('loading');
    this.resortsApi.all().subscribe({
      next: (resorts) => {
        this.resorts.set(resorts);
        this.resortsState.set('ready');
      },
      error: () => this.resortsState.set('error'),
    });
  }

  protected setResort(event: Event): void {
    this.resortForm.idResort().value.set((event.target as HTMLSelectElement).value);
  }

  // --- Hacer ------------------------------------------------------------------------------

  /** Desactivar, reactivar o quitar el balneario: lo confirmado en el diálogo. */
  protected confirm(): void {
    const account = this.account();
    const action = this.pending();
    if (!account || !action || this.busy()) return;

    const name = this.name();
    if (action === 'deactivate') {
      this.run(
        this.accountsApi.deactivate(account.idClient),
        `Desactivamos la cuenta de ${name}. Ya no puede ingresar.`,
      );
    } else if (action === 'activate') {
      this.run(
        this.accountsApi.activate(account.idClient),
        `Reactivamos la cuenta de ${name}. Ya puede volver a ingresar.`,
      );
    } else if (action === 'remove') {
      this.run(
        this.accountsApi.removeResort(account.idClient),
        `Le quitamos el balneario a ${name}. Ahora es una cuenta de cliente.`,
      );
    }
  }

  private run(request: Observable<Account>, message: string): void {
    this.busy.set(true);
    request.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.account.set(saved);
        this.closeDialog();
        this.showNotice(message);
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.closeDialog();
        this.fail(error);
      },
    });
  }

  /** Un 400 quiere decir que la cuenta cambió en otro lado: se vuelve a traer, con el motivo arriba. */
  private fail(error: HttpErrorResponse): void {
    this.actionError.set(toUserMessage(error));
    if (error.status === 400 || error.status === 404) this.load();
  }

  protected onPasswordSubmit(event: Event): void {
    event.preventDefault();
    void this.savePassword();
  }

  private async savePassword(): Promise<void> {
    const account = this.account();
    if (!account || this.passwordForm().submitting()) return;

    await submit(this.passwordForm, async () => {
      try {
        await firstValueFrom(
          this.accountsApi.setPassword(account.idClient, this.passwordForm().value().password),
        );
      } catch (error) {
        const err = error as HttpErrorResponse;
        const fieldErrors = toFieldErrors(this.passwordForm, err);
        if (fieldErrors.length > 0) return fieldErrors;
        this.closeDialog();
        this.fail(err);
        return;
      }
      this.closeDialog();
      this.showNotice(
        `Le pusimos la contraseña provisoria a ${this.name()}. Pasásela por un medio seguro.`,
      );
      return;
    });

    this.focusInvalid();
  }

  protected onResortSubmit(event: Event): void {
    event.preventDefault();
    void this.assignResort();
  }

  private async assignResort(): Promise<void> {
    const account = this.account();
    if (!account || this.resortForm().submitting()) return;

    await submit(this.resortForm, async () => {
      let saved: Account;
      try {
        saved = await firstValueFrom(
          this.accountsApi.assignResort(
            account.idClient,
            Number(this.resortForm().value().idResort),
          ),
        );
      } catch (error) {
        const err = error as HttpErrorResponse;
        const fieldErrors = toFieldErrors(this.resortForm, err);
        if (fieldErrors.length > 0) return fieldErrors;
        this.closeDialog();
        this.fail(err);
        return;
      }
      this.account.set(saved);
      this.closeDialog();
      this.showNotice(`${accountName(saved)} ahora administra «${saved.managedResort?.name}».`);
      return;
    });

    this.focusInvalid();
  }

  /** Al enviar con errores, el foco va al campo marcado. */
  private focusInvalid(): void {
    afterNextRender(
      () => {
        this.dialog()?.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      },
      { injector: this.injector },
    );
  }

  /** El aviso recibe el foco: el botón que se tocó puede no estar más. */
  private showNotice(message: string): void {
    this.notice.set(message);
    afterNextRender(() => this.noticeBox()?.nativeElement.focus(), { injector: this.injector });
  }
}
