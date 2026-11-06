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

function toUtc(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}
