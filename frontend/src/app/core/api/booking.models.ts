/** Las reservas, como las devuelve `/api/bookings`. Escritas a mano contra `/v3/api-docs`. */

import { UnitType } from './resort.models';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED';

/** Una persona que entra con la reserva, con su código QR. */
export interface GuestSummary {
  idGuest: number;
  fullName: string;
  dni: string | null;
  isEntryValidated: boolean;
  qrToken: string;
}

export interface Booking {
  id: number;
  /** `YYYY-MM-DD`; las dos fechas cuentan: del 15 al 17 son tres días. */
  startDate: string;
  endDate: string;
  /** Con dos decimales exactos. */
  totalPrice: number;
  status: BookingStatus;
  createdAt: string;
  idClient: number | null;
  rentalUnitId: number;
  /** Cómo ve la unidad la persona: «A-01». */
  rentalUnitIdentifier: string;
  rentalUnitType: UnitType;
  guests: GuestSummary[];
  walkInName: string | null;
  walkInDni: string | null;
  resortId: number;
  resortName: string;
  resortLocation: string;
  resortCoverPhotoUrl: string | null;
}

/** La dirección de MercadoPago para pagar una reserva pendiente. */
export interface PaymentUrlResponse {
  paymentUrl: string;
}
