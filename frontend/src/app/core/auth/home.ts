import { Me, Role } from '../api/auth.models';

/** La única pantalla del panel que usa la cuenta de Zolea, y la única que no usa un balneario. */
export const ZOLEA_HOME = '/admin/amenities';

/**
 * La cuenta de Zolea (decisión 18): un administrador sin balneario asignado, `zolea@zolea.com` en
 * la demo. Carga el catálogo de servicios y nada más del panel.
 */
export function isZoleaAccount(user: Me | null): boolean {
  return user?.role === 'ADMIN' && user.idManagedResort == null;
}

/**
 * El inicio de cada rol: adonde se va después de ingresar si no hay un `volver` válido. El cliente
 * va a su Inicio (11.5), con lo que tiene hoy y lo que le viene; no a la Portada.
 */
export function homeFor(role: Role): string {
  return role === 'ADMIN' ? '/admin' : '/dashboard';
}

/** El inicio de quien está adentro: como `homeFor`, pero la cuenta de Zolea va a su catálogo. */
export function homeOf(user: Me): string {
  return isZoleaAccount(user) ? ZOLEA_HOME : homeFor(user.role);
}
