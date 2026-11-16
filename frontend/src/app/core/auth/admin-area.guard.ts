import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { SessionService } from '../session/session.service';
import { isZoleaAccount, ZOLEA_HOME } from './home';

/**
 * Reparte el panel entre los dos administradores (12.9). La cuenta de Zolea solo usa el catálogo
 * de servicios: cualquier otra pantalla de `/admin` la devuelve ahí. El administrador de un
 * balneario ya no usa el catálogo, porque sus servicios los elige en Mi balneario: si lo pide,
 * vuelve a su Panel.
 *
 * Va como `canActivateChild` de `admin`, después de `authGuard` y `roleGuard('ADMIN')`.
 */
export const adminAreaGuard: CanActivateChildFn = (_route, state) => {
  const router = inject(Router);
  const user = inject(SessionService).user();
  const path = state.url.split(/[?#]/)[0];
  const inCatalog = path === ZOLEA_HOME || path.startsWith(`${ZOLEA_HOME}/`);

  if (isZoleaAccount(user)) {
    return inCatalog ? true : router.createUrlTree([ZOLEA_HOME]);
  }
  return inCatalog ? router.createUrlTree(['/admin']) : true;
};
