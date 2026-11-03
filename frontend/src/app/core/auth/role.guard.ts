import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../api/auth.models';
import { SessionService } from '../session/session.service';

/**
 * Deja pasar solo al rol pedido. Con el rol equivocado, manda a su propio inicio:
 * el administrador a `/admin` y el cliente a `/`.
 */
export const roleGuard =
  (role: Role): CanActivateFn =>
  (_route, state) => {
    const router = inject(Router);
    const user = inject(SessionService).user();

    if (user === null) {
      // Se usa después de `authGuard`, pero no se asume: sin sesión, al login.
      return router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
    }
    if (user.role === role) {
      return true;
    }
    return router.createUrlTree([user.role === 'ADMIN' ? '/admin' : '/']);
  };
