import { occupiedDays, parseIsoDate, toIsoDate, totalPrice } from './days';

describe('occupiedDays', () => {
  it('cuenta los dos extremos: del 15 al 17 son tres días', () => {
    expect(occupiedDays('2027-01-15', '2027-01-17')).toBe(3);
  });

  it('un solo día, entrando y saliendo el mismo, es un día', () => {
    expect(occupiedDays('2027-01-15', '2027-01-15')).toBe(1);
  });

  it('del 10 al 11 son dos días, los mismos dos que quedan bloqueados', () => {
    expect(occupiedDays('2027-01-10', '2027-01-11')).toBe(2);
  });

  it('cuenta bien al cruzar de mes y de año', () => {
    expect(occupiedDays('2027-01-30', '2027-02-02')).toBe(4);
    expect(occupiedDays('2026-12-30', '2027-01-02')).toBe(4);
  });

  it('cuenta bien el 29 de febrero de un año bisiesto', () => {
    expect(occupiedDays('2028-02-28', '2028-03-01')).toBe(3);
    expect(occupiedDays('2027-02-28', '2027-03-01')).toBe(2);
  });

  it('una salida anterior a la entrada no ocupa ningún día', () => {
    expect(occupiedDays('2027-01-17', '2027-01-15')).toBe(0);
  });
});

describe('totalPrice', () => {
  it('es el precio diario por los días, contando los dos extremos', () => {
    expect(totalPrice(8500, '2027-01-15', '2027-01-17')).toBe(25500);
  });

  it('con un solo día es el precio diario, no cero', () => {
    expect(totalPrice(8500, '2027-01-15', '2027-01-15')).toBe(8500);
  });

  it('con las fechas al revés es cero', () => {
    expect(totalPrice(8500, '2027-01-17', '2027-01-15')).toBe(0);
  });
});

describe('toIsoDate y parseIsoDate', () => {
  it('se convierten una en la otra, con el día de acá', () => {
    const date = new Date(2027, 0, 5);
    expect(toIsoDate(date)).toBe('2027-01-05');
    expect(parseIsoDate('2027-01-05').getTime()).toBe(date.getTime());
  });
});
