import { dayRange, money, shortDate, tableDate, UNIT_TYPE_LABEL, unitLabel } from './format';

/** Las fechas dependen del año en curso: las pruebas lo fijan. */
const TODAY = '2026-11-26';

describe('format', () => {
  it('unitLabel dice el tipo y el identificador', () => {
    expect(unitLabel('UMBRELLA', 'A-03')).toBe('Sombrilla A-03');
    expect(unitLabel('TENT', 'C-01')).toBe('Carpa C-01');
  });

  it('UNIT_TYPE_LABEL tiene el nombre de cada tipo', () => {
    expect(UNIT_TYPE_LABEL).toEqual({ TENT: 'Carpa', UMBRELLA: 'Sombrilla' });
  });

  describe('money', () => {
    const plain = (amount: number) => money(amount).replace(/\s/g, ' ');

    it('da pesos sin decimales cuando no hay centavos', () => {
      expect(plain(36000)).toBe('$ 36.000');
      expect(plain(8500)).toBe('$ 8.500');
      expect(plain(0)).toBe('$ 0');
    });

    it('muestra los dos decimales solo si hay centavos', () => {
      expect(plain(8500.5)).toBe('$ 8.500,50');
      expect(plain(8500.05)).toBe('$ 8.500,05');
    });
  });

  describe('shortDate', () => {
    it('es «mié 7 ene», sin año si es el actual', () => {
      expect(shortDate('2026-01-07', TODAY)).toBe('mié 7 ene');
      expect(shortDate('2026-12-20', TODAY)).toBe('dom 20 dic');
    });

    it('lleva el año cuando no es el actual', () => {
      expect(shortDate('2027-01-06', TODAY)).toBe('mié 6 ene 2027');
      expect(shortDate('2025-12-20', TODAY)).toBe('sáb 20 dic 2025');
    });
  });

  describe('tableDate', () => {
    it('es la fecha corta sin el día de la semana', () => {
      expect(tableDate('2026-01-07', TODAY)).toBe('7 ene');
      expect(tableDate('2027-01-06', TODAY)).toBe('6 ene 2027');
    });
  });

  describe('dayRange', () => {
    it('dentro del mismo mes, el mes va una vez', () => {
      expect(dayRange('2026-12-20', '2026-12-25', TODAY)).toBe('20 → 25 dic');
    });

    it('si cruza de mes, cada punta lleva el suyo', () => {
      expect(dayRange('2026-01-30', '2026-02-02', TODAY)).toBe('30 ene → 2 feb');
    });

    it('si cruza de año, el año va donde no es el actual', () => {
      expect(dayRange('2026-12-28', '2027-01-03', TODAY)).toBe('28 dic → 3 ene 2027');
      expect(dayRange('2025-12-28', '2026-01-03', TODAY)).toBe('28 dic 2025 → 3 ene');
    });

    it('en otro año, el mismo mes lleva el año al final', () => {
      expect(dayRange('2027-01-15', '2027-01-17', TODAY)).toBe('15 → 17 ene 2027');
    });

    it('un solo día es una sola fecha', () => {
      expect(dayRange('2026-12-20', '2026-12-20', TODAY)).toBe('20 dic');
    });
  });
});
