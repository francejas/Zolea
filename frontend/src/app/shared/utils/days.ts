/**
 * La cuenta de días de una reserva, igual que en el backend (decisiones.md, punto 6): el fin es
 * inclusivo, así que se cobran los dos extremos. Del 15 al 17 son tres días; del 15 al 15, uno.
 *
 * Las fechas son `YYYY-MM-DD`, tal como viajan en la dirección de Reservar y en la API. La cuenta
 * se hace en UTC para que un cambio de hora no la corra un día.
 */

const DAY_MS = 86_400_000;

/** Los días que ocupa una reserva, contando la entrada y la salida. 0 si la salida es anterior. */
export function occupiedDays(from: string, to: string): number {
  const days = Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1;
  return days > 0 ? days : 0;
}

/** El total de una reserva: el precio diario por los días que ocupa. */
export function totalPrice(dailyPrice: number, from: string, to: string): number {
  return dailyPrice * occupiedDays(from, to);
}

/** Una fecha de la computadora como `YYYY-MM-DD`, con el día de acá y no el de UTC. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Un `YYYY-MM-DD` como fecha local, a las 00:00 de ese día. */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Las fechas que llegan en la dirección (`?from=…&to=…`), si sirven para buscar: las dos, con la
 * forma `YYYY-MM-DD`, desde hoy y la salida no antes de la entrada. Si no, null: es lo mismo que el
 * backend rechazaría con un 400.
 */
export function validRange(
  from: unknown,
  to: unknown,
  today: string = todayIso(),
): { from: string; to: string } | null {
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return null;
  if (toIsoDate(parseIsoDate(from)) !== from || toIsoDate(parseIsoDate(to)) !== to) return null;
  if (from < today || to < from) return null;
  return { from, to };
}

function toUtc(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}
