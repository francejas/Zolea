import { Booking, BookingStatus } from '../../../core/api/booking.models';

export interface BookingFilters {
  status: BookingStatus | '';
  from: string;
  to: string;
}

/** Incluye las estadías que coinciden con el período, contando ambos extremos. */
export function filterBookings(bookings: Booking[], filters: BookingFilters): Booking[] {
  const { status, from, to } = filters;

  if (from && to && from > to) return [];

  return bookings.filter(
    (booking) =>
      (!status || booking.status === status) &&
      (!from || booking.endDate >= from) &&
      (!to || booking.startDate <= to),
  );
}

export function bookingHolder(booking: Booking): string {
  return booking.walkInName?.trim() || booking.guests[0]?.fullName || 'Sin titular';
}
