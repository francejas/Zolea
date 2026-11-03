import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionService } from '../session/session.service';

const LOGIN_URL = `${environment.apiUrl}/api/auth/login`;
const ME_URL = `${environment.apiUrl}/api/auth/me`;

/**
 * Se mete en cada pedido HTTP: agrega el token y reacciona cuando la sesión venció.
 * Siempre vuelve a lanzar el error, para que la pantalla también se entere.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const router = inject(Router);

  const goesToBackend = req.url.startsWith(environment.apiUrl);
  const token = session.token();

  const request =
    goesToBackend && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && goesToBackend) {
        // Login: es una contraseña equivocada y la muestra la pantalla.
        // Me: lo maneja `restore()`.
        const isHandledElsewhere = req.url.startsWith(LOGIN_URL) || req.url.startsWith(ME_URL);
        if (!isHandledElsewhere) {
          session.clear();
          void router.navigateByUrl('/login?motivo=sesion-vencida');
        }
      }
      // El 403 no tiene tratamiento especial: la persona sigue adentro y la pantalla muestra el aviso.

      return throwError(() => error);
    }),
  );
};
