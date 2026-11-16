/** Las estadísticas del Panel, como las devuelve `/api/resorts/my/stats`. Escritas a mano contra `/v3/api-docs`. */

import { UnitType } from './resort.models';

/** El resumen de hoy: no depende del rango que se pida. */
export interface TodayStats {
  /** Reservas confirmadas que incluyen hoy. */
  activeBookings: number;
  /** Todas las personas de esas reservas, titular incluido. */
  expectedGuests: number;
  /** Cuántas de esas personas ya entraron hoy. */
  checkedIn: number;
  /** Reservas del balneario que siguen pendientes de pago. */
  pendingBookings: number;
  /** Unidades que no están bloqueadas y no tienen una reserva confirmada que incluya hoy. */
  freeUnits: number;
}

export interface OccupancyDayStats {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Unidades distintas con una reserva confirmada ese día. */
  occupiedUnits: number;
  /** Unidades del balneario que hoy no están bloqueadas. */
  totalUnits: number;
}

export interface IncomeMonthStats {
  /** `YYYY-MM`. */
  month: string;
  /** Lo que suman las reservas confirmadas que empiezan ese mes, con dos decimales. */
  income: number;
}

export interface TopUnitStats {
  idRentalUnit: number;
  identifier: string;
  type: UnitType;
  /** Días reservados dentro del rango. */
  days: number;
}

export interface ResortStats {
  /** El rango, `YYYY-MM-DD`, con los dos extremos. */
  from: string;
  to: string;
  today: TodayStats;
  /** Un elemento por día del rango, con los días en 0. */
  occupancyByDay: OccupancyDayStats[];
  /** Un elemento por mes que toca el rango, en orden y con los meses en 0. */
  incomeByMonth: IncomeMonthStats[];
  /** Las cinco unidades con más días reservados en el rango; las de 0 días no vienen. */
  topUnits: TopUnitStats[];
}
