import { email, pattern, required, SchemaPath, validate } from '@angular/forms/signals';
import { phoneError } from '../../shared/utils/phone';

/** Los campos de los datos personales de una cuenta, en el formulario que sea. */
export interface PersonalDataPaths {
  firstName: SchemaPath<string>;
  lastName: SchemaPath<string>;
  email: SchemaPath<string>;
  /** Los números, sin el código de país. */
  phone: SchemaPath<string>;
  /** El país del teléfono (`AR`, `UY`…): dice cuántos números lleva. */
  phoneCountry: SchemaPath<string>;
  dni: SchemaPath<string>;
}

/** El DNI: 7 u 8 números, sin puntos. Lo mismo que pide Reservar para cada persona. */
export const DNI_PATTERN = /^\d{7,8}$/;

/**
 * Las validaciones y los mensajes de los datos personales. Las comparten Crear cuenta (9.2) y Mi
 * cuenta (9.3), así no pueden decir cosas distintas.
 */
export function personalDataRules(path: PersonalDataPaths): void {
  required(path.firstName, { message: 'Escribí tu nombre.' });
  required(path.lastName, { message: 'Escribí tu apellido.' });
  required(path.email, { message: 'Escribí tu email.' });
  email(path.email, { message: 'El email no tiene un formato válido.' });
  required(path.phone, { message: 'Escribí tu teléfono.' });
  validate(path.phone, ({ value, valueOf }) => {
    const message = phoneError(valueOf(path.phoneCountry), value());
    return message ? { kind: 'phone', message } : null;
  });
  required(path.dni, { message: 'Escribí tu DNI.' });
  pattern(path.dni, DNI_PATTERN, { message: 'El DNI son 7 u 8 números, sin puntos.' });
}

/**
 * Teléfono y DNI son solo números: lo que no es un dígito se descarta al escribir o pegar. Se
 * corrige también el valor que muestra el navegador, porque si el modelo no cambia (una letra en
 * un campo vacío) Angular no lo vuelve a escribir. Devuelve los dígitos, para el modelo.
 */
export function keepDigits(event: Event): string {
  const control = event.target as HTMLInputElement;
  const digits = control.value.replace(/\D/g, '');
  if (digits !== control.value) control.value = digits;
  return digits;
}
