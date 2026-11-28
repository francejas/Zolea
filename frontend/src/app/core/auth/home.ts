import { Me, Role } from '../api/auth.models';

/** El inicio de la cuenta de Zolea en el panel: el catálogo de servicios. */
export const ZOLEA_HOME = '/admin/amenities';

/** Las pantallas del panel de la cuenta de Zolea: el catálogo, los balnearios (#71) y los usuarios (#72). */
export const ZOLEA_PATHS = [ZOLEA_HOME, '/admin/resorts', '/admin/users'];

/** Si la dirección es de una pantalla de la cuenta de Zolea (o de algo adentro de una). */
export function isZoleaPath(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return ZOLEA_PATHS.some((zoleaPath) => path === zoleaPath || path.startsWith(`${zoleaPath}/`));
}

/**
 * La cuenta de Zolea (decisión 18): un administrador sin balneario asignado, `zolea@zolea.com` en
 * la demo. Del panel usa el catálogo de servicios, los balnearios y los usuarios.
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
