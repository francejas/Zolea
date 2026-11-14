import { Booking } from '../../../core/api/booking.models';

/** Las próximas que muestra el Inicio; las demás están en Mis reservas. */
const UPCOMING_LIMIT = 3;

/**
 * La confirmada que tiene hoy adentro (`YYYY-MM-DD`, con los dos extremos), o null. Si hubiera
 * dos, la que empezó primero: es la que la persona está usando.
 */
export function todayBooking(bookings: Booking[], today: string): Booking | null {
  return (
    bookings
      .filter(
        (booking) =>
          booking.status === 'CONFIRMED' && booking.startDate <= today && booking.endDate >= today,
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}

/**
 * Las que no están canceladas y terminan hoy o después, como las próximas de Mis reservas, menos
 * la que va arriba (`top`), de la más cercana a la más lejana. Así entra una pendiente que empieza
 * hoy, que si no quedaría sin «Pagar» en ningún lado.
 */
export function upcomingBookings(
  bookings: Booking[],
  today: string,
  top: Booking | null,
): Booking[] {
  return bookings
    .filter(
      (booking) =>
        booking.status !== 'CANCELED' && booking.endDate >= today && booking.id !== top?.id,
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, UPCOMING_LIMIT);
}

export interface BookingFigures {
  total: number;
  confirmed: number;
  pending: number;
}

/** Todas las reservas, las confirmadas y las pendientes de pago. */
export function bookingFigures(bookings: Booking[]): BookingFigures {
  return {
    total: bookings.length,
    confirmed: bookings.filter((booking) => booking.status === 'CONFIRMED').length,
    pending: bookings.filter((booking) => booking.status === 'PENDING').length,
  };
}
