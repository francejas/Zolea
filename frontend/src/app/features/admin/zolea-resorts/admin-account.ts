import { email, pattern, required, SchemaPath, validate } from '@angular/forms/signals';
import { AdminAccountRequest } from '../../../core/api/resort.models';
import { DEFAULT_PHONE_COUNTRY, joinPhone, phoneError } from '../../../shared/utils/phone';
import { DNI_PATTERN } from '../../auth/client-rules';

/**
 * Los datos de la cuenta de un administrador de balneario, como los carga la cuenta de Zolea (#71).
 * Se llaman como en el pedido (`AdminAccountRequest`), así `toFieldErrors` pega cada error en su
 * campo; `phoneCountry` es el país del teléfono, que viaja pegado al número.
 */
export interface AdminAccountModel {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  dni: string;
  password: string;
}

export const emptyAdminAccount = (): AdminAccountModel => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  phoneCountry: DEFAULT_PHONE_COUNTRY,
  dni: '',
  password: '',
});

/** Obligatorio, y un texto de solo espacios cuenta como vacío (`required` lo deja pasar). */
export function requiredText(path: SchemaPath<string>, message: string): void {
  required(path, { message });
  validate(path, ({ value }) =>
    value() !== '' && value().trim() === '' ? { kind: 'required', message } : null,
  );
}

type AdminAccountPaths = { [K in keyof AdminAccountModel]: SchemaPath<AdminAccountModel[K]> };

/**
 * Las validaciones de la cuenta del administrador. Hablan de la persona en tercera, porque la carga
 * la cuenta de Zolea y no el administrador: «Escribí el nombre», no «tu nombre».
 */
export function adminAccountRules(path: AdminAccountPaths): void {
  requiredText(path.firstName, 'Escribí el nombre.');
  requiredText(path.lastName, 'Escribí el apellido.');
  requiredText(path.email, 'Escribí el email.');
  email(path.email, { message: 'El email no tiene un formato válido.' });
  required(path.phone, { message: 'Escribí el teléfono.' });
  validate(path.phone, ({ value, valueOf }) => {
    const message = phoneError(valueOf(path.phoneCountry), value());
    return message ? { kind: 'phone', message } : null;
  });
  required(path.dni, { message: 'Escribí el DNI.' });
  pattern(path.dni, DNI_PATTERN, { message: 'El DNI son 7 u 8 números, sin puntos.' });
  requiredText(path.password, 'Escribí una contraseña provisoria.');
}

/** El pedido, con el teléfono armado con su código de país y los textos sin espacios de más. */
export function toAdminAccountRequest(model: AdminAccountModel): AdminAccountRequest {
  return {
    firstName: model.firstName.trim(),
    lastName: model.lastName.trim(),
    email: model.email.trim(),
    phone: joinPhone(model.phoneCountry, model.phone),
    dni: model.dni,
    password: model.password,
  };
}
