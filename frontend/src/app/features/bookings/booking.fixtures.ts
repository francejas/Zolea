import { Booking, GuestSummary } from '../../core/api/booking.models';

/** Datos de prueba para las pantallas de reservas. Solo los importan las pruebas. */

export function aGuest(overrides: Partial<GuestSummary> = {}): GuestSummary {
  return {
    idGuest: 1,
    fullName: 'Santiago Rodríguez',
    dni: '38456912',
    isEntryValidated: false,
    lastEntryAt: null,
    qrToken: 'f3a1c2d4-0000-4000-8000-000000000001',
    ...overrides,
  };
}

export function aBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 47,
    startDate: '2026-01-15',
    endDate: '2026-01-17',
    totalPrice: 36000,
    status: 'CONFIRMED',
    createdAt: '2026-01-02T10:00:00',
    idClient: 7,
    rentalUnitId: 3,
    rentalUnitIdentifier: 'A-03',
    rentalUnitType: 'UMBRELLA',
    guests: [aGuest()],
    walkInName: null,
    walkInDni: null,
    resortId: 1,
    resortName: 'Zolea Club de Playa',
    resortLocation: 'Mar del Plata, Buenos Aires',
    resortCoverPhotoUrl: null,
    ...overrides,
  };
}
