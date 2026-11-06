import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal, viewChildren } from '@angular/core';
import {
  email,
  form,
  FormField,
  ReadonlyFieldTree,
  required,
  submit,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LucideEye, LucideEyeOff } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { ClientRequest } from '../../../core/api/client.models';
import { ClientsApi } from '../../../core/api/clients.api';
import { toFieldErrors, toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZField } from '../../../shared/z-field/z-field';

/**
 * Crear cuenta (9.2). El alta de un cliente: `ClientsApi.register()` y, si se crea, entra
 * directo con `SessionService.login()` y va a `/`.
 *
 * El backend contesta los errores de dos formas. Los datos inválidos (400 con `campos`) se pegan
 * en cada campo con `toFieldErrors`. Un email, teléfono o DNI repetido llega como mensaje general
 * y va en el aviso de arriba, con `toUserMessage`.
 */
@Component({
  selector: 'app-register',
  imports: [FormField, RouterLink, LucideEye, LucideEyeOff, ZAlert, ZBtn, ZField],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly clientsApi = inject(ClientsApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  /** Los controles en el orden en que se ven: el foco va al primero con error. */
  private readonly controls = viewChildren<ElementRef<HTMLInputElement>>('control');

  // Los campos se llaman igual que en el pedido al backend (`ClientRequest`).
  protected readonly registerForm = form(
    signal<ClientRequest>({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dni: '',
      password: '',
    }),
    (path) => {
      required(path.firstName, { message: 'Escribí tu nombre.' });
      required(path.lastName, { message: 'Escribí tu apellido.' });
      required(path.email, { message: 'Escribí tu email.' });
      email(path.email, { message: 'El email no tiene un formato válido.' });
      required(path.phone, { message: 'Escribí tu teléfono.' });
      required(path.dni, { message: 'Escribí tu DNI.' });
      required(path.password, { message: 'Elegí una contraseña.' });
    },
  );

  /** El error general de arriba: un duplicado, sin conexión, etc. */
  protected readonly formError = signal('');
  protected readonly showPassword = signal(false);

  /** El campo mostró su error: se marca también para el lector de pantalla. */
  protected hasError(field: ReadonlyFieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.register();
  }

  private async register(): Promise<void> {
    // Mientras el pedido está en curso no se manda otro: el botón también queda deshabilitado.
    if (this.registerForm().submitting()) return;
    this.formError.set('');

    await submit(this.registerForm, async () => {
      const request = this.registerForm().value();

      try {
        await firstValueFrom(this.clientsApi.register(request));
      } catch (error) {
        const err = error as HttpErrorResponse;
        const fieldErrors = toFieldErrors(this.registerForm, err);
        if (fieldErrors.length > 0) return fieldErrors;

        this.formError.set(toUserMessage(err));
        return;
      }

      try {
        await firstValueFrom(this.session.login(request.email, request.password));
      } catch {
        // La cuenta ya existe: reintentar el alta daría «ya registrado». Se manda a Ingresar.
        this.formError.set('Creamos tu cuenta, pero no pudimos ingresar. Probá desde Ingresar.');
        return;
      }

      // El botón sigue en «cargando» hasta llegar.
      await this.router.navigateByUrl('/');
      return;
    });

    this.focusFirstInvalid();
  }

  /** Al enviar con errores, el foco va al primer campo con error (sistema de diseño, «Campo»). */
  private focusFirstInvalid(): void {
    const fields = this.registerForm;
    const ordered = [
      fields.firstName,
      fields.lastName,
      fields.email,
      fields.phone,
      fields.dni,
      fields.password,
    ];
    const index = ordered.findIndex((field) => this.hasError(field));
    if (index >= 0) this.controls()[index]?.nativeElement.focus();
  }
}
