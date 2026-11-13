import { bookingDate, paymentLabel } from './booking-detail-format';

describe('Formato del detalle administrativo', () => {
  it('conserva la fecha y hora de Buenos Aires sin conversión del navegador', () => {
    expect(bookingDate('2026-01-10T00:15:00')).toBe('10/01/2026 · 00:15');
    expect(bookingDate('2026-01-10')).toBe('10/01/2026');
    expect(bookingDate(null)).toBe('Sin fecha informada');
  });

  it('traduce los estados conocidos y conserva uno nuevo informado por la pasarela', () => {
    expect(paymentLabel('APPROVED')).toBe('Aprobado');
    expect(paymentLabel('in_process')).toBe('En proceso');
    expect(paymentLabel('new_gateway_status')).toBe('new_gateway_status');
  });
});
