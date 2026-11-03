import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session/session.service';

/** Sin sesión, manda a `/login?volver=<ruta pedida>` para volver ahí después de ingresar. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(SessionService).isLoggedIn()) {
    return true;
  }
  return inject(Router).createUrlTree(['/login'], { queryParams: { volver: state.url } });
};
