import { HttpErrorResponse } from '@angular/common/http';
import { FormGroup } from '@angular/forms';
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

export function applyFieldErrors(form: FormGroup, err: HttpErrorResponse): void {
  const apiError = err.error as ApiError | null;

  if (!apiError || !apiError.campos) {
    return;
  }

  Object.entries(apiError.campos).forEach(([field, message]) => {
    const control = form.get(field);

    if (control) {
      // Se suma a los errores que el control ya tenía, para no borrar los de sus validadores.
      control.setErrors({ ...control.errors, server: message });
      control.markAsTouched();
    }
  });
}
