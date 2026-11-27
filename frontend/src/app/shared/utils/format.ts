import { UnitType } from '../../core/api/resort.models';
import { parseIsoDate, todayIso } from './days';

/** Cómo se dice cada tipo de unidad. */
export const UNIT_TYPE_LABEL: Record<UnitType, string> = { TENT: 'Carpa', UMBRELLA: 'Sombrilla' };

// Se crean una sola vez: un formateador nuevo por cada fila o dibujo es caro.
const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});
const pesosCents = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

/**
 * «$ 36.000»: el único formato de la plata en todo el sitio. Los centavos van solo si existen
 * («$ 8.500,50»). En una tabla, la cifra va en una celda `is-num` o con `z-money`.
 */
export function money(amount: number): string {
  return Number.isInteger(amount) ? pesos.format(amount) : pesosCents.format(amount);
}

/** «Sombrilla A-03». */
export function unitLabel(type: UnitType, identifier: string): string {
  return `${UNIT_TYPE_LABEL[type]} ${identifier}`;
}

const weekdayDayMonth = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** El día de la semana, el día y el mes de `Intl`, sin la coma ni los puntos que agrega. */
function dateParts(iso: string) {
  const parts = weekdayDayMonth.formatToParts(parseIsoDate(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((p) => p.type === type)?.value ?? '').replace('.', '');
  return { weekday: part('weekday'), day: part('day'), month: part('month') };
}

/** « 2027» si la fecha no es del año en curso; si lo es, nada. */
function yearSuffix(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? '' : ` ${iso.slice(0, 4)}`;
}

/** «7 ene», o «7 ene 2027» si no es de este año. */
function dayMonth(iso: string, today: string): string {
  const { day, month } = dateParts(iso);
  return `${day} ${month}${yearSuffix(iso, today)}`;
}

/** La fecha corta, `YYYY-MM-DD` → «mié 7 ene», con el año solo si no es el actual («mié 7 ene 2027»). */
export function shortDate(iso: string, today: string = todayIso()): string {
  return `${dateParts(iso).weekday} ${dayMonth(iso, today)}`;
}

/** La fecha corta de las tablas, sin el día de la semana: «7 ene», o «7 ene 2027». */
export function tableDate(iso: string, today: string = todayIso()): string {
  return dayMonth(iso, today);
}

/**
 * Un rango de fechas: «20 → 25 dic» dentro del mismo mes y «28 dic → 3 ene 2027» si cruza de mes
 * o de año. El año va solo donde no es el actual. Un solo día es una sola fecha: «20 dic».
 */
export function dayRange(start: string, end: string, today: string = todayIso()): string {
  if (start === end) return dayMonth(start, today);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const from = sameMonth ? dateParts(start).day : dayMonth(start, today);
  return `${from} → ${dayMonth(end, today)}`;
}

/** «#0047». */
export function bookingNumber(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

/** «38.456.912», como figura en el documento. */
export function formatDni(dni: string): string {
  return dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
