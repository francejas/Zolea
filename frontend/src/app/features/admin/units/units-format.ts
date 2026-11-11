import { UnitType } from '../../../core/api/resort.models';

/** Cómo se dice cada tipo de unidad. */
export const UNIT_TYPE_LABEL: Record<UnitType, string> = { TENT: 'Carpa', UMBRELLA: 'Sombrilla' };

/** Se crea una sola vez: un formateador nuevo por cada fila es caro. */
const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

/** «$ 8.500,00»: en tablas, la plata va con centavos. */
export function money(amount: number): string {
  return pesos.format(amount);
}

/** «Sombrilla A-03». */
export function unitLabel(type: UnitType, identifier: string): string {
  return `${UNIT_TYPE_LABEL[type]} ${identifier}`;
}
