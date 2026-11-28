import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { SessionService } from '../session/session.service';
import { forbidden } from './forbidden';
import { isZoleaAccount, isZoleaPath } from './home';

/**
 * Reparte el panel entre los dos administradores (12.9). La cuenta de Zolea usa el catálogo de
 * servicios y los balnearios (#71), y el administrador de un balneario todo lo demás: sus servicios
 * los elige en Mi balneario. Cada uno, en una pantalla del otro, ve la página 403 (#65).
 *
 * Va como `canActivateChild` de `admin`, después de `authGuard` y `roleGuard('ADMIN')`.
 */
export const adminAreaGuard: CanActivateChildFn = (_route, state) => {
  const router = inject(Router);
  const user = inject(SessionService).user();
  return isZoleaPath(state.url) === isZoleaAccount(user) ? true : forbidden(router, state.url);
};
