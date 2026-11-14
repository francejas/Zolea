import { Booking, BookingStatus, CancellationResponse } from '../../core/api/booking.models';
import { parseResortDateTime } from '../../shared/utils/days';
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

const weekdayDayMonth = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** «vie 15 ene»: sin la coma ni los puntos que agrega `Intl`. */
export function shortDate(iso: string): string {
  const parts = weekdayDayMonth.formatToParts(parseDate(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((p) => p.type === type)?.value ?? '').replace('.', '');
  return `${part('weekday')} ${part('day')} ${part('month')}`;
}

/** Las dos fechas cuentan: del 15 al 17 son tres días. */
export function dayCount(start: string, end: string): number {
  const days = (parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000;
  return Math.round(days) + 1;
}

/** Una pendiente se paga hasta una hora después de hecha, como `Booking.PAYMENT_WINDOW` en el backend. */
const PAYMENT_WINDOW_MS = 3_600_000;

/** Hasta cuándo se puede pagar una reserva, en milisegundos, desde su `createdAt`. */
export function paymentDeadline(createdAt: string): number {
  return parseResortDateTime(createdAt) + PAYMENT_WINDOW_MS;
}

/**
 * Pendiente y pasada la hora: ya no se paga, aunque siga pendiente hasta que la limpieza la cancele
 * (entre los 75 y los 80 minutos). A la hora justa ya venció, igual que en el backend.
 */
export function paymentExpired(
  booking: Pick<Booking, 'status' | 'createdAt'>,
  now: number,
): boolean {
  return booking.status === 'PENDING' && now >= paymentDeadline(booking.createdAt);
}

/**
 * Lo que dice la confirmación de cancelar: cuánto se devuelve. Una pendiente no tiene reintegro,
 * y el 50 % es cuando falta un día para la entrada (14.3).
 */
export function refundOffer(
  terms: Pick<CancellationResponse, 'refundAmount' | 'refundPercent'>,
): string {
  const { refundAmount: amount, refundPercent: percent } = terms;
  if (!amount || !percent) return 'No pagaste nada todavía: no hay reintegro.';
  if (percent === 100) return `Te devolvemos ${money(amount)}, el 100 % de lo que pagaste.`;
  return `Te devolvemos ${money(amount)}, el ${percent} % de lo que pagaste, porque falta un día para la entrada.`;
}

/**
 * Una cancelada, en una frase: quién, cuándo y cuánto se reintegró. `canceledAt` llega en hora del
 * balneario: se lee tal cual, sin pasarlo por la zona de la computadora.
 */
export function cancellationSummary(
  booking: Pick<Booking, 'canceledAt' | 'canceledBy' | 'refundAmount'>,
): string {
  const at = booking.canceledAt;
  const when = at ? ` el ${shortDate(at.slice(0, 10))} a las ${at.slice(11, 16)}` : '';
  const refund = booking.refundAmount ? ` Se reintegraron ${money(booking.refundAmount)}.` : '';
  switch (booking.canceledBy) {
    case 'CLIENT':
      return `La cancelaste${when}.${refund}`;
    case 'ADMIN':
      return `La canceló el balneario${when}.${refund}`;
    case 'SYSTEM':
      return `Se canceló sola${when}, porque no se pagó a tiempo.${refund}`;
    default:
      return `Se canceló${when}.${refund}`;
  }
}

/** El reintegro de una cancelada, para su tarjeta; null si no está cancelada. */
export function refundLine(booking: Pick<Booking, 'status' | 'refundAmount'>): string | null {
  if (booking.status !== 'CANCELED') return null;
  return booking.refundAmount
    ? `Se reintegraron ${money(booking.refundAmount)}.`
    : 'Sin reintegro: no estaba paga.';
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
