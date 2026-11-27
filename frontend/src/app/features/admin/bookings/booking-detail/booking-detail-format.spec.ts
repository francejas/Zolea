import {
  bookingDate,
  bookingTableDate,
  entryStatus,
  paymentLabel,
  stayPhase,
} from './booking-detail-format';
import { aGuest } from '../../../bookings/booking.fixtures';

// Las fechas del año en curso se muestran sin el año: el reloj queda fijo para que las pruebas
// no cambien de resultado cuando cambia el año.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 26, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Formato del detalle administrativo', () => {
  it('conserva la fecha y hora de Buenos Aires sin conversión del navegador', () => {
    expect(bookingDate('2026-01-10T00:15:00')).toBe('sáb 10 ene · 00:15');
    expect(bookingDate('2026-01-10')).toBe('sáb 10 ene');
    expect(bookingDate(null)).toBe('Sin fecha informada');
  });

  it('en una tabla, la fecha va sin el día de la semana', () => {
    expect(bookingTableDate('2026-01-10T10:15:00')).toBe('10 ene · 10:15');
    expect(bookingTableDate(null)).toBe('Sin fecha informada');
  });

  it('traduce los estados conocidos y conserva uno nuevo informado por la pasarela', () => {
    expect(paymentLabel('APPROVED')).toBe('Aprobado');
    expect(paymentLabel('in_process')).toBe('En proceso');
    expect(paymentLabel('new_gateway_status')).toBe('new_gateway_status');
  });

  it('el ingreso: hoy con la hora, otro día con su fecha y hora, o todavía no', () => {
    expect(
      entryStatus(aGuest({ isEntryValidated: true, lastEntryAt: '2026-11-13T10:15:00' })),
    ).toEqual({ text: 'Entró hoy a las 10:15', modifier: 'confirmed' });
    expect(
      entryStatus(aGuest({ isEntryValidated: false, lastEntryAt: '2026-11-12T10:15:00' })),
    ).toEqual({ text: 'Entró por última vez el 12 nov a las 10:15', modifier: 'neutral' });
    expect(entryStatus(aGuest({ isEntryValidated: false, lastEntryAt: null }))).toEqual({
      text: 'Todavía no entró',
      modifier: 'pending',
    });
  });

  it('sin hora informada, igual dice que entró hoy', () => {
    expect(entryStatus(aGuest({ isEntryValidated: true, lastEntryAt: null })).text).toBe(
      'Entró hoy',
    );
  });

  it('la estadía está por empezar, en curso o terminada, con los dos extremos adentro', () => {
    const stay = { startDate: '2026-01-15', endDate: '2026-01-17' };
    expect(stayPhase(stay, '2026-01-14')).toBe('upcoming');
    expect(stayPhase(stay, '2026-01-15')).toBe('ongoing');
    expect(stayPhase(stay, '2026-01-17')).toBe('ongoing');
    expect(stayPhase(stay, '2026-01-18')).toBe('finished');
  });
});
