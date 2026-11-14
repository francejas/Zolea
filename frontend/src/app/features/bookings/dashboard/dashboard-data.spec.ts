import { aBooking } from '../booking.fixtures';
import { bookingFigures, todayBooking, upcomingBookings } from './dashboard-data';

// Hoy es el sábado 10 de enero de 2026.
const TODAY = '2026-01-10';

describe('la reserva de hoy', () => {
  it('es la confirmada que tiene hoy adentro, contando los dos extremos', () => {
    const starts = aBooking({ id: 1, startDate: '2026-01-10', endDate: '2026-01-12' });
    const ends = aBooking({ id: 2, startDate: '2026-01-08', endDate: '2026-01-10' });

    expect(todayBooking([starts], TODAY)?.id).toBe(1);
    expect(todayBooking([ends], TODAY)?.id).toBe(2);
  });

  it('una pendiente o cancelada no es la de hoy, ni una que todavía no empezó', () => {
    expect(
      todayBooking(
        [
          aBooking({ status: 'PENDING', startDate: '2026-01-09', endDate: '2026-01-11' }),
          aBooking({ status: 'CANCELED', startDate: '2026-01-09', endDate: '2026-01-11' }),
          aBooking({ startDate: '2026-01-11', endDate: '2026-01-12' }),
        ],
        TODAY,
      ),
    ).toBeNull();
  });

  it('si hay dos, la que empezó primero', () => {
    const later = aBooking({ id: 1, startDate: '2026-01-10', endDate: '2026-01-11' });
    const earlier = aBooking({ id: 2, startDate: '2026-01-05', endDate: '2026-01-12' });

    expect(todayBooking([later, earlier], TODAY)?.id).toBe(2);
  });
});

describe('las próximas', () => {
  it('son las que empiezan después de hoy y no están canceladas, de la más cercana a la más lejana', () => {
    const upcoming = upcomingBookings(
      [
        aBooking({ id: 1, startDate: '2026-02-01', endDate: '2026-02-03' }),
        aBooking({ id: 2, startDate: '2026-01-15', endDate: '2026-01-16', status: 'PENDING' }),
        aBooking({ id: 3, startDate: '2026-01-20', endDate: '2026-01-21', status: 'CANCELED' }),
        // La de hoy no es próxima: va arriba.
        aBooking({ id: 4, startDate: '2026-01-10', endDate: '2026-01-12' }),
        aBooking({ id: 5, startDate: '2025-12-01', endDate: '2025-12-02' }),
      ],
      TODAY,
    );

    expect(upcoming.map((b) => b.id)).toEqual([2, 1]);
  });

  it('muestra hasta tres', () => {
    const bookings = [11, 12, 13, 14].map((day) =>
      aBooking({ id: day, startDate: `2026-01-${day}`, endDate: `2026-01-${day}` }),
    );

    expect(upcomingBookings(bookings, TODAY).map((b) => b.id)).toEqual([11, 12, 13]);
  });
});

describe('las cifras', () => {
  it('cuenta todas, las confirmadas y las pendientes de pago', () => {
    expect(
      bookingFigures([
        aBooking({ status: 'CONFIRMED' }),
        aBooking({ status: 'CONFIRMED' }),
        aBooking({ status: 'PENDING' }),
        aBooking({ status: 'CANCELED' }),
      ]),
    ).toEqual({ total: 4, confirmed: 2, pending: 1 });
  });
});
