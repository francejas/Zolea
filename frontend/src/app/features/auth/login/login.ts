import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import {
  email,
  form,
  FormField,
  ReadonlyFieldTree,
  required,
  submit,
} from '@angular/forms/signals';
import { Router, RouterLink, UrlTree } from '@angular/router';
import { LucideEye, LucideEyeOff } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { Me, Role } from '../../../core/api/auth.models';
import { toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZField } from '../../../shared/z-field/z-field';

/** El inicio de cada rol: adonde se va después de ingresar si no hay un `volver` válido. */
export function homeFor(role: Role): string {
  return role === 'ADMIN' ? '/admin' : '/';
}

/**
 * El `volver` que mandó el guard (`authGuard`, tarea 8.4), resuelto con el Router, o `null` si no
 * sirve. Solo vale una ruta interna: tiene que empezar con una barra, sin espacios ni barras
 * invertidas, y no puede ser `//sitio.com`, que un navegador toma como otro dominio. Tampoco vale
 * volver al propio login, que dejaría a la persona ingresada mirando el formulario.
 */
export function resolveBackTo(router: Router, volver: unknown): UrlTree | null {
  if (typeof volver !== 'string') return null;
  if (!volver.startsWith('/') || volver.startsWith('//') || /[\\\s]/.test(volver)) return null;

  const path = volver.split(/[?#]/)[0];
  if (path === '/login' || path.startsWith('/login/')) return null;

  return router.parseUrl(volver);
}

/**
 * Ingresar (9.1). Email y contraseña con Signal Forms; el pedido y la sesión son de
 * `SessionService.login()`, que deja el token y el usuario (con su rol, de `/me`) listos.
 *
 * Los dos avisos de arriba comparten lugar y nunca se muestran juntos: el error de ingresar, que
 * es siempre un solo mensaje, tapa al de sesión vencida.
 */
@Component({
  selector: 'app-login',
  imports: [FormField, RouterLink, LucideEye, LucideEyeOff, ZAlert, ZBtn, ZField],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');

  /** `?volver=`, que manda el guard. Llega por `withComponentInputBinding()`. */
  readonly volver = input<string | string[]>();
  /** `?motivo=`, que manda el interceptor cuando la sesión venció. */
  readonly motivo = input<string | string[]>();

  // Los campos se llaman igual que en el pedido al backend (`LoginRequest`).
  protected readonly loginForm = form(signal({ email: '', password: '' }), (path) => {
    required(path.email);
    email(path.email);
    required(path.password);
  });

  /** El error de ingresar, ya redactado para la persona. */
  protected readonly formError = signal('');
  protected readonly showPassword = signal(false);
  protected readonly sessionExpired = computed(() => this.motivo() === 'sesion-vencida');

  /** El campo mostró su error: se marca también para el lector de pantalla. */
  protected hasError(field: ReadonlyFieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.login();
  }

  private async login(): Promise<void> {
    // Mientras el pedido está en curso no se manda otro: el botón también queda deshabilitado.
    if (this.loginForm().submitting()) return;
    this.formError.set('');

    await submit(this.loginForm, async () => {
      const credentials = this.loginForm().value();

      let me: Me;
      try {
        me = await firstValueFrom(this.session.login(credentials.email, credentials.password));
      } catch (error) {
        // Un único mensaje arriba. Si es un 401, el backend dice lo mismo exista o no la cuenta, y
        // acá tampoco se diferencia: no se marca ningún campo.
        this.formError.set(toUserMessage(error as HttpErrorResponse));
        return;
      }

      // El botón sigue en «cargando» hasta llegar: así no se puede volver a tocar mientras navega.
      const backTo = resolveBackTo(this.router, this.volver());
      await this.router.navigateByUrl(backTo ?? homeFor(me.role));
    });

    this.focusFirstInvalid();
  }

  /** Al enviar con errores, el foco va al primer campo con error (sistema de diseño, «Campo»). */
  private focusFirstInvalid(): void {
    if (this.hasError(this.loginForm.email)) {
      this.emailInput()?.nativeElement.focus();
    } else if (this.hasError(this.loginForm.password)) {
      this.passwordInput()?.nativeElement.focus();
    }
  }
}
