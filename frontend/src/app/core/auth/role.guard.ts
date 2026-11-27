import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../api/auth.models';
import { SessionService } from '../session/session.service';
import { forbidden } from './forbidden';

/**
 * Deja pasar solo al rol pedido. Con el rol equivocado muestra la página 403 (#65): un cliente en
 * el panel, o un administrador en una ruta de cliente.
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
    return forbidden(router, state.url);
  };
