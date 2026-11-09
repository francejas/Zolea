import { PENDING_BOOKING_KEY } from '../bookings/book/book';

/**
 * El id de la reserva que Reservar (11.1) guardó antes de salir a MercadoPago, o `null` si no está.
 * Pendiente y Rechazado llegan sin id en la dirección: es la única forma de saber cuál era.
 */
export function readPendingBooking(): string | null {
  try {
    const id = sessionStorage.getItem(PENDING_BOOKING_KEY);
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Ya no hace falta: la reserva quedó confirmada. */
export function clearPendingBooking(): void {
  try {
    sessionStorage.removeItem(PENDING_BOOKING_KEY);
  } catch {
    // Sin sessionStorage no hay nada que borrar.
  }
}
