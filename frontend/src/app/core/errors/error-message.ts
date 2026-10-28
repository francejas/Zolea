import { HttpErrorResponse } from '@angular/common/http';
import { FieldTree, ValidationError } from '@angular/forms/signals';
import { ApiError } from '../api/api-error';

export function toUserMessage(err: HttpErrorResponse): string {
  const apiError = err.error as ApiError | null;

  if (apiError && apiError.error) {
    return apiError.error;
  }

  switch (err.status) {
    case 0:
      return 'No hay conexión con el servidor.';
    case 401:
      return 'Tu sesión venció. Volvé a ingresar.';
    case 403:
      return 'No tenés permiso para ver esto.';
    case 404:
      return 'No encontramos lo que buscabas.';
    case 502:
      return 'MercadoPago no respondió. Probá de nuevo en unos minutos.';
    default:
      return 'Algo salió mal. Probá de nuevo.';
  }
}

/**
 * Los errores por campo del backend, listos para devolver desde la acción de `submit()`: Angular
 * pega cada uno en su campo. Los campos del modelo se llaman igual que los del pedido, y una clave
 * que el formulario no tiene se descarta.
 */
export function toFieldErrors<T>(
  form: FieldTree<T>,
  err: HttpErrorResponse,
): ValidationError.WithOptionalFieldTree[] {
  const apiError = err.error as ApiError | null;
  const fields = form as unknown as Record<string, FieldTree<unknown> | undefined>;

  return Object.entries(apiError?.campos ?? {}).flatMap(([key, message]) => {
    const fieldTree = fields[key];
    return fieldTree ? [{ fieldTree, kind: 'server', message }] : [];
  });
}
