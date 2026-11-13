import { Booking } from '../../../../core/api/booking.models';

/** El servidor ya informa la hora de Buenos Aires: no la convertimos. */
export function bookingDate(value: string | null): string {
  if (!value) return 'Sin fecha informada';

  const [date, time] = value.split('T');

  return date.split('-').reverse().join('/') + (time ? ` · ${time.slice(0, 5)}` : '');
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
