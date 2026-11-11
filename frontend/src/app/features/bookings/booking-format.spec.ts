import { bookingNumber, dayCount, dayRange, formatDni, money, unitLabel } from './booking-format';

describe('booking-format', () => {
  it('nombra la unidad como la ve la persona', () => {
    expect(unitLabel('UMBRELLA', 'A-03')).toBe('Sombrilla A-03');
    expect(unitLabel('TENT', 'C-01')).toBe('Carpa C-01');
  });

  it('arma el rango de días, con el mes una vez si no cambia', () => {
    expect(dayRange('2026-01-15', '2026-01-17')).toBe('15 → 17 ene');
    expect(dayRange('2026-01-30', '2026-02-02')).toBe('30 ene → 2 feb');
  });

  it('cuenta los dos extremos: del 15 al 17 son tres días', () => {
    expect(dayCount('2026-01-15', '2026-01-17')).toBe(3);
    expect(dayCount('2026-01-15', '2026-01-15')).toBe(1);
  });

  it('muestra la plata en pesos, con centavos', () => {
    expect(money(36000).replace(/\s/g, ' ')).toBe('$ 36.000,00');
  });

  it('numera la reserva con cuatro cifras', () => {
    expect(bookingNumber(47)).toBe('#0047');
  });

  it('escribe el DNI con puntos', () => {
    expect(formatDni('38456912')).toBe('38.456.912');
    expect(formatDni('4567890')).toBe('4.567.890');
  });
});
