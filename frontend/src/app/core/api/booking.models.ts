/** Las reservas, como las devuelve `/api/bookings`. Escritas a mano contra `/v3/api-docs`. */

import { UnitType } from './resort.models';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED';

/** Una persona que entra con la reserva, con su código QR. */
export interface GuestSummary {
  idGuest: number;
  fullName: string;
  dni: string | null;
  /** Si entró hoy. El código sirve para entrar todas las veces que haga falta durante la estadía. */
  isEntryValidated: boolean;
  /** Cuándo entró por última vez (`YYYY-MM-DDTHH:mm:ss`, hora de Buenos Aires); `null` si nunca entró. */
  lastEntryAt: string | null;
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
  canceledAt: string | null;
  canceledBy: 'CLIENT' | 'ADMIN' | 'SYSTEM' | null;
  refundAmount: number | null;
  reviewed: boolean;
  payments: PaymentSummary[];
}

/** La dirección de MercadoPago para pagar una reserva pendiente. */
export interface PaymentUrlResponse {
  paymentUrl: string;
}

/** Una persona que acompaña al titular, como se manda al reservar. El titular no va: el backend lo agrega solo. */
export interface GuestRequest {
  fullName: string;
  dni: string;
}

/** El pedido de `POST /api/bookings`. Las fechas son `YYYY-MM-DD` y las dos cuentan. */
export interface BookingRequest {
  startDate: string;
  endDate: string;
  /** El `idClient` de la sesión: si es otro, el backend responde 403. */
  clientId: number;
  rentalUnitId: number;
  guests: GuestRequest[];
}

/** Lo que devuelve crear una reserva: la reserva pendiente y adónde mandar a pagar. */
export interface BookingCheckout {
  booking: Booking;
  paymentUrl: string;
}

/** Condiciones calculadas por el servidor antes de confirmar la cancelación. */
export interface CancellationResponse {
  canCancel: boolean;
  refundAmount: number | null;
  refundPercent: number | null;
  reason: string | null;
}

/** Un cobro registrado de la reserva. */
export interface PaymentSummary {
  gatewayPaymentId: string;
  amount: number;
  status: string;
  /** Hora de Buenos Aires informada por el servidor. */
  paidAt: string | null;
}
