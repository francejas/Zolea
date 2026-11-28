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

/** Cómo se validó un ingreso: leyendo el QR, escribiendo el código o con el DNI. */
export type EntryMethod = 'QR' | 'CODE' | 'DNI';

/**
 * Un ingreso al balneario: una fila por cada validación exitosa. Lo devuelven
 * `/api/bookings/{id}/entries` y `/api/resorts/my/entries`, del más nuevo al más viejo.
 */
export interface GuestEntry {
  id: number;
  idGuest: number;
  fullName: string;
  bookingId: number;
  /** «A-03». */
  rentalUnitIdentifier: string;
  /** En hora de Buenos Aires y sin zona: «2026-01-10T10:12:00». */
  enteredAt: string;
  method: EntryMethod;
}
