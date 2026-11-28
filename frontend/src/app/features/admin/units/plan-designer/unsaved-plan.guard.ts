import { CanDeactivateFn } from '@angular/router';

/**
 * Antes de salir de «Diseñar plano»: con cambios sin guardar, la pantalla pregunta. Va aparte del
 * componente para que la ruta no lo cargue antes de entrar.
 */
export const unsavedPlanGuard: CanDeactivateFn<{ canLeave(): boolean }> = (component) =>
  component.canLeave();
