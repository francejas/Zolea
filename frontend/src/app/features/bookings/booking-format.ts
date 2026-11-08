import { BookingStatus } from '../../core/api/booking.models';
import { money, unitLabel } from '../../shared/utils/format';

/** Cómo se dice cada estado, y su variante de `z-status`: verde, amarilla o sin bandera. */
export const BOOKING_STATUS: Record<BookingStatus, { label: string; modifier: string }> = {
  PENDING: { label: 'Pendiente de pago', modifier: 'pending' },
  CONFIRMED: { label: 'Confirmada', modifier: 'confirmed' },
  CANCELED: { label: 'Cancelada', modifier: 'canceled' },
};

/** Se crean una sola vez: un formateador nuevo por cada dibujo es caro. */
const dayMonth = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });

/** `YYYY-MM-DD` como fecha local: `new Date(texto)` la toma en UTC y en Argentina cae el día antes. */
function parseDate(text: string): Date {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** «15 → 17 ene», o «30 ene → 2 feb» cuando cambia el mes. */
export function dayRange(start: string, end: string): string {
  const from = parseDate(start);
  const to = parseDate(end);
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  return `${sameMonth ? from.getDate() : dayMonth.format(from)} → ${dayMonth.format(to)}`;
}

/** Las dos fechas cuentan: del 15 al 17 son tres días. */
export function dayCount(start: string, end: string): number {
  const days = (parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000;
  return Math.round(days) + 1;
}

/** «#0047». */
export function bookingNumber(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

/** «38.456.912», como figura en el documento. */
export function formatDni(dni: string): string {
  return dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * `money` y `unitLabel` viven en shared/utils/format.ts, porque los usa también el panel. Se
 * reexportan para que Reservar, el Detalle y la entrada sigan importándolos de acá.
 */
export { money, unitLabel };
