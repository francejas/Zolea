import { Booking, GuestSummary } from '../../../../core/api/booking.models';
import { todayIso } from '../../../../shared/utils/days';
import { shortDate, tableDate } from '../../../../shared/utils/format';

/**
 * «mié 7 ene», o «mié 7 ene · 10:30» si trae la hora. El servidor ya informa la hora de Buenos
 * Aires: no la convertimos.
 */
export function bookingDate(value: string | null): string {
  return withTime(value, shortDate);
}

/** Lo mismo para una tabla, sin el día de la semana: «7 ene · 10:30». */
export function bookingTableDate(value: string | null): string {
  return withTime(value, tableDate);
}

function withTime(value: string | null, format: (iso: string) => string): string {
  if (!value) return 'Sin fecha informada';

  const [date, time] = value.split('T');

  return format(date) + (time ? ` · ${time.slice(0, 5)}` : '');
}

/** Cómo se ve el ingreso de una persona: el texto y el color de la etiqueta. */
export interface EntryStatus {
  text: string;
  modifier: 'confirmed' | 'neutral' | 'pending';
}

/**
 * El ingreso de una persona. Desde la 15.6 el QR sirve toda la estadía, así que `isEntryValidated`
 * quiere decir «entró hoy»; la hora del último ingreso viene aparte, en `lastEntryAt`.
 * La hora llega en hora de Buenos Aires y sin zona: se muestra tal cual, sin convertirla.
 */
export function entryStatus(guest: GuestSummary): EntryStatus {
  const [date, time] = guest.lastEntryAt?.split('T') ?? [];
  const hour = time?.slice(0, 5);

  if (guest.isEntryValidated) {
    return { text: hour ? `Entró hoy a las ${hour}` : 'Entró hoy', modifier: 'confirmed' };
  }

  if (date) {
    return {
      text: `Entró por última vez el ${tableDate(date)}` + (hour ? ` a las ${hour}` : ''),
      modifier: 'neutral',
    };
  }

  return { text: 'Todavía no entró', modifier: 'pending' };
}

/** Dónde está la estadía respecto de hoy: el contador de ingresos solo vale mientras está en curso. */
export type StayPhase = 'upcoming' | 'ongoing' | 'finished';

export function stayPhase(
  booking: Pick<Booking, 'startDate' | 'endDate'>,
  today: string = todayIso(),
): StayPhase {
  if (today < booking.startDate) return 'upcoming';
  if (today > booking.endDate) return 'finished';
  return 'ongoing';
}

export function paymentLabel(status: string): string {
  const labels: Record<string, string> = {
    approved: 'Aprobado',
    pending: 'Pendiente',
    in_process: 'En proceso',
    authorized: 'Autorizado',
    rejected: 'Rechazado',
    cancelled: 'Cancelado',
    refunded: 'Reintegrado',
    charged_back: 'Contracargo',
    in_mediation: 'En mediación',
  };

  return labels[status.toLowerCase()] ?? status;
}

export function paymentModifier(status: string): string {
  switch (status.toLowerCase()) {
    case 'approved':
      return 'confirmed';

    case 'pending':
    case 'in_process':
    case 'authorized':
    case 'in_mediation':
      return 'pending';

    default:
      return 'canceled';
  }
}

/** Prioriza el reintegro registrado; si no existe, suma los pagos aprobados. */
export function manualRefund(booking: Booking): number {
  if (booking.status !== 'CANCELED') return 0;

  if (booking.refundAmount !== null) {
    return booking.refundAmount;
  }

  return (
    booking.payments
      .filter((payment) => payment.status.toLowerCase() === 'approved')
      .reduce((cents, payment) => cents + Math.round(payment.amount * 100), 0) / 100
  );
}

export const CANCELED_BY = {
  ADMIN: 'el administrador',
  CLIENT: 'el cliente',
  SYSTEM: 'el sistema',
} as const;
