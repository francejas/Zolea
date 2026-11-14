import { BookingStatus } from './booking.models';

/** Resumen de una reserva dentro del historial del cliente. */
export interface ClientBooking {
  idBooking: number;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: BookingStatus;
  rentalUnitIdentifier: string;
}

/** Respuesta de GET /api/clients para el administrador. */
export interface ResortClient {
  idClient: number | null;
  fullName: string;
  dni: string | null;
  email: string | null;
  phone: string | null;
  walkIn: boolean;
  bookingCount: number;
  totalSpent: number;
  bookings: ClientBooking[];
}
