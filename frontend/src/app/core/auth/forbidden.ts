import { RedirectCommand, Router } from '@angular/router';

/** La ruta de la página 403. La ve quien entra a una ruta de otro tipo de cuenta. */
export const FORBIDDEN_PATH = 'forbidden';

/**
 * Lo que devuelve un guard cuando la ruta es de otro tipo de cuenta: la página 403 (#65). Antes
 * mandaba al inicio sin decir nada. La barra de direcciones muestra lo que se pidió, no `/forbidden`.
 *
 * @param requested la dirección que se pidió (`state.url` del guard).
 */
export function forbidden(router: Router, requested: string): RedirectCommand {
  return new RedirectCommand(router.parseUrl(`/${FORBIDDEN_PATH}`), { browserUrl: requested });
}
