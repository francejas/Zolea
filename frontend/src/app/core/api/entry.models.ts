/** El ingreso al balneario, como lo devuelve `/api/guests/validate`. Escrito a mano contra `/v3/api-docs`. */

/** Lo que responde validar un ingreso: quién entra y a qué unidad va. */
export interface GuestValidation {
  idGuest: number;
  fullName: string;
  /** Cómo ve la unidad la persona: «A-03». */
  rentalUnitIdentifier: string;
  /** «¡Acceso Permitido! Dirigirse a la unidad: A-03». */
  message: string;
}
