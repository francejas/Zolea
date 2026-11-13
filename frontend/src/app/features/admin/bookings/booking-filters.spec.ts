import { Booking } from '../../../core/api/booking.models';
import { aBooking } from '../../bookings/booking.fixtures';
import { filterBookings } from './booking-filters';

describe('filterBookings', () => {
  const bookings: Booking[] = [
    aBooking({
      id: 1,
      status: 'PENDING',
      startDate: '2026-01-10',
      endDate: '2026-01-15',
    }),
    aBooking({
      id: 2,
      status: 'CONFIRMED',
      startDate: '2026-01-15',
      endDate: '2026-01-20',
    }),
    aBooking({
      id: 3,
      status: 'CANCELED',
      startDate: '2026-02-01',
      endDate: '2026-02-05',
    }),
    aBooking({
      id: 4,
      status: 'CONFIRMED',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    }),
  ];

  it('devuelve todas las reservas cuando no hay filtros', () => {
    const result = filterBookings(bookings, {
      status: '',
      from: '',
      to: '',
    });

    expect(result.map((booking) => booking.id)).toEqual([1, 2, 3, 4]);
  });

  it('deja solamente las reservas del estado seleccionado', () => {
    const result = filterBookings(bookings, {
      status: 'CONFIRMED',
      from: '',
      to: '',
    });

    expect(result.map((booking) => booking.id)).toEqual([2, 4]);
    expect(result.every((booking) => booking.status === 'CONFIRMED')).toBe(true);
  });

  it('también permite filtrar pendientes y canceladas', () => {
    const pending = filterBookings(bookings, {
      status: 'PENDING',
      from: '',
      to: '',
    });

    const canceled = filterBookings(bookings, {
      status: 'CANCELED',
      from: '',
      to: '',
    });

    expect(pending.map((booking) => booking.id)).toEqual([1]);
    expect(canceled.map((booking) => booking.id)).toEqual([3]);
  });

  it('incluye las estadías que se cruzan con el rango, contando ambos extremos', () => {
    const result = filterBookings(bookings, {
      status: '',
      from: '2026-01-15',
      to: '2026-01-15',
    });

    // La 1 termina ese día, la 2 empieza ese día
    // y la 4 abarca todo el período.
    expect(result.map((booking) => booking.id)).toEqual([1, 2, 4]);
  });

  it('incluye una estadía que abarca todo el rango seleccionado', () => {
    const result = filterBookings(bookings, {
      status: '',
      from: '2026-01-21',
      to: '2026-01-25',
    });

    expect(result.map((booking) => booking.id)).toEqual([4]);
  });

  it('excluye las estadías que quedan fuera del rango', () => {
    const result = filterBookings(bookings, {
      status: '',
      from: '2026-03-01',
      to: '2026-03-10',
    });

    expect(result).toEqual([]);
  });

  it('combina el filtro de estado con el rango de fechas', () => {
    const result = filterBookings(bookings, {
      status: 'CONFIRMED',
      from: '2026-01-15',
      to: '2026-01-15',
    });

    expect(result.map((booking) => booking.id)).toEqual([2, 4]);
  });

  it('permite filtrar solamente con desde', () => {
    const result = filterBookings(bookings, {
      status: '',
      from: '2026-01-20',
      to: '',
    });

    expect(result.map((booking) => booking.id)).toEqual([2, 3, 4]);
  });

  it('permite filtrar solamente con hasta', () => {
    const result = filterBookings(bookings, {
      status: '',
      from: '',
      to: '2026-01-10',
    });

    expect(result.map((booking) => booking.id)).toEqual([1, 4]);
  });

  it('no devuelve reservas cuando desde es mayor que hasta', () => {
    const result = filterBookings(bookings, {
      status: '',
      from: '2026-01-20',
      to: '2026-01-10',
    });

    expect(result).toEqual([]);
  });
});
