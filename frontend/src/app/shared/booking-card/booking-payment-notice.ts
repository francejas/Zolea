import { Booking } from '../../core/api/booking.models';
import { paymentExpired } from '../../features/bookings/booking-format';

export interface BookingPaymentNotice {
  variant: 'success' | 'warning';
  title: string;
  text: string;
}

/** El mismo aviso para las dos pantallas cuando el pago ya no se puede hacer. */
export function bookingPaymentNotice(
  booking: Booking,
  rejected: boolean,
  now: number,
): BookingPaymentNotice | null {
  if (booking.status === 'PENDING') {
    return rejected || paymentExpired(booking, now)
      ? {
          variant: 'warning',
          title: 'La reserva venció',
          text: 'Pasó la hora para pagarla y se cancela sola. Si todavía te sirve, reservala de nuevo.',
        }
      : null;
  }
  if (!rejected) return null;
  if (booking.status === 'CONFIRMED') {
    return {
      variant: 'success',
      title: 'Ya está paga',
      text: `El pago de ${booking.resortName} se acreditó mientras tanto: tus entradas están en la reserva.`,
    };
  }
  return booking.canceledBy === 'SYSTEM'
    ? {
        variant: 'warning',
        title: 'La reserva venció',
        text: `La de ${booking.resortName} pasó la hora para pagarla y se canceló. Si todavía te sirve, reservala de nuevo.`,
      }
    : {
        variant: 'warning',
        title: 'La reserva se canceló',
        text: `La de ${booking.resortName} ya no está pendiente de pago. Si todavía te sirve, reservala de nuevo.`,
      };
}
