import { UnitType } from '../../core/api/resort.models';

/** Cómo se dice cada tipo de unidad. */
export const UNIT_TYPE_LABEL: Record<UnitType, string> = { TENT: 'Carpa', UMBRELLA: 'Sombrilla' };

/** Se crea una sola vez: un formateador nuevo por cada fila o dibujo es caro. */
const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

/** «$ 36.000,00»: la plata llega con dos decimales exactos y se muestra igual. */
export function money(amount: number): string {
  return pesos.format(amount);
}

/** «Sombrilla A-03». */
export function unitLabel(type: UnitType, identifier: string): string {
  return `${UNIT_TYPE_LABEL[type]} ${identifier}`;
}

/** Se crea una sola vez: un formateador nuevo por cada dibujo es caro. */
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

/** «#0047». */
export function bookingNumber(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

/** «38.456.912», como figura en el documento. */
export function formatDni(dni: string): string {
  return dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
