import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { form, FormField, ReadonlyFieldTree, submit, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { LucideEye, LucideEyeOff } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { Client, ClientUpdateRequest } from '../../core/api/client.models';
import { ClientsApi } from '../../core/api/clients.api';
import { toFieldErrors, toUserMessage } from '../../core/errors/error-message';
import { SessionService } from '../../core/session/session.service';
import { ZAlert } from '../../shared/z-alert/z-alert';
import { ZBtn } from '../../shared/z-btn/z-btn';
import { ZField } from '../../shared/z-field/z-field';
import { ZProblem } from '../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../shared/z-skeleton/z-skeleton';
import { PHONE_COUNTRIES, joinPhone, phoneCountry, splitPhone } from '../../shared/utils/phone';
import { keepDigits, personalDataRules } from '../auth/client-rules';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * El formulario: los datos se llaman como en el pedido (`ClientRequest`), así `toFieldErrors` pega
 * cada error en su campo. `passwordRepeat` queda en la pantalla: no viaja.
 */
interface ProfileModel {
  firstName: string;
  lastName: string;
  email: string;
  /** Los números del teléfono, sin el código de país, que va en `phoneCountry`. */
  phone: string;
  phoneCountry: string;
  dni: string;
  password: string;
  passwordRepeat: string;
}

const toModel = (client: Client): ProfileModel => ({
  firstName: client.firstName,
  lastName: client.lastName,
  email: client.email,
  phone: splitPhone(client.phone).digits,
  phoneCountry: splitPhone(client.phone).iso,
  dni: client.dni ?? '',
  password: '',
  passwordRepeat: '',
});

/** Todos los datos, siempre; la contraseña, solo si se escribió una (vacía = no cambiarla). */
const toRequest = (value: ProfileModel): ClientUpdateRequest => ({
  firstName: value.firstName.trim(),
  lastName: value.lastName.trim(),
  email: value.email.trim(),
  phone: joinPhone(value.phoneCountry, value.phone),
  dni: value.dni,
  ...(value.password ? { password: value.password } : {}),
});

/** Como se ingresa: sin espacios de más. */
const sameEmail = (a: string, b: string) => a.trim() === b.trim();

/**
 * Mi cuenta (`/profile`, 9.3): el cliente corrige sus datos y cambia la contraseña. Las
 * validaciones y los mensajes son los de Crear cuenta (`client-rules.ts`).
 *
 * El email es con lo que se ingresa: si cambia, la sesión abierta deja de valer. La pantalla lo
 * avisa mientras se escribe, y al guardar cierra la sesión y manda a Ingresar.
 */
@Component({
  selector: 'app-profile',
  imports: [FormField, LucideEye, LucideEyeOff, ZAlert, ZBtn, ZField, ZProblem, ZSkeleton],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private readonly clientsApi = inject(ClientsApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  /** La cuenta como está guardada: contra esto se ve si el email cambió. */
  private readonly client = signal<Client | null>(null);

  private readonly model = signal<ProfileModel>(
    toModel({
      idClient: 0,
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dni: '',
    }),
  );
  protected readonly profileForm = form(this.model, (path) => {
    personalDataRules(path);
    // Vacías las dos, no se cambia. Si se escribió algo, tiene que repetirse igual.
    validate(path.passwordRepeat, ({ value, valueOf }) =>
      value() !== valueOf(path.password)
        ? { kind: 'mismatch', message: 'Las contraseñas no coinciden.' }
        : null,
    );
  });

  /** El error de guardar que no es de un campo. */
  protected readonly formError = signal('');
  /** Se guardó: el aviso queda hasta que se vuelve a tocar algo. */
  protected readonly saved = signal(false);
  protected readonly showPassword = signal(false);

  /** El email escrito no es el de la cuenta: al guardar hay que volver a ingresar. */
  protected readonly emailChanges = computed(() => {
    const client = this.client();
    return client !== null && !sameEmail(this.model().email, client.email);
  });

  /** Hay algo distinto de lo guardado. */
  protected readonly changed = computed(() => {
    const client = this.client();
    if (!client) return false;
    const value = this.model();
    const saved = toModel(client);
    return (Object.keys(saved) as (keyof ProfileModel)[]).some((key) => value[key] !== saved[key]);
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    const clientId = this.session.user()?.idClient;
    // El guard deja entrar solo a un cliente; si igual falta, que no quede cargando.
    if (clientId == null) {
      this.loadError.set('Tu sesión no tiene una cuenta de cliente. Volvé a ingresar.');
      this.state.set('error');
      return;
    }
    this.state.set('loading');
    this.clientsApi.get(clientId).subscribe({
      next: (client) => {
        this.show(client);
        this.state.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toUserMessage(error));
        this.state.set('error');
      },
    });
  }

  /** El campo mostró su error: se marca también para el lector de pantalla. */
  protected hasError(field: ReadonlyFieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  protected readonly countries = PHONE_COUNTRIES;
  /** El país elegido para el teléfono: da el ejemplo y el largo del campo. */
  protected readonly country = computed(() =>
    phoneCountry(this.profileForm.phoneCountry().value()),
  );

  /** Teléfono y DNI son solo números (`keepDigits`). */
  protected onlyDigits(event: Event, field: 'phone' | 'dni'): void {
    this.profileForm[field]().value.set(keepDigits(event));
  }

  protected setCountry(event: Event): void {
    this.profileForm.phoneCountry().value.set((event.target as HTMLSelectElement).value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  private async save(): Promise<void> {
    const client = this.client();
    // Mientras el pedido está en curso no se manda otro: el botón también queda deshabilitado.
    if (!client || this.profileForm().submitting()) return;
    this.saved.set(false);
    this.formError.set('');

    await submit(this.profileForm, async () => {
      const value = this.profileForm().value();
      const newEmail = !sameEmail(value.email, client.email);
      try {
        const updated = await firstValueFrom(
          this.clientsApi.update(client.idClient, toRequest(value)),
        );
        if (newEmail) {
          // El token es del email viejo: deja de valer. Se ingresa de nuevo con el nuevo.
          this.session.clear();
          await this.router.navigate(['/login'], { queryParams: { motivo: 'email-nuevo' } });
          return;
        }
        this.show(updated);
        this.saved.set(true);
        // La barra de arriba muestra el nombre nuevo.
        this.session.reloadUser().subscribe({ error: () => undefined });
        return;
      } catch (error) {
        const err = error as HttpErrorResponse;
        // Un email, teléfono o DNI de otra cuenta (409) y los datos inválidos (400) traen el campo.
        const fieldErrors = toFieldErrors(this.profileForm, err);
        if (fieldErrors.length > 0) return fieldErrors;
        this.formError.set(toUserMessage(err));
        return;
      }
    });

    // Con errores, el foco va al primer campo marcado (sistema de diseño, «Campo»).
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      { injector: this.injector },
    );
  }

  /** La cuenta como quedó guardada, también en el formulario, con la contraseña vacía. */
  private show(client: Client): void {
    this.client.set(client);
    this.profileForm().reset(toModel(client));
  }
}
