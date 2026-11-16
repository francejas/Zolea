import { joinPhone, phoneCountry, phoneError, splitPhone } from './phone';

describe('phone', () => {
  it('junta el código del país y el número', () => {
    expect(joinPhone('AR', '2235123456')).toBe('+54 2235123456');
    expect(joinPhone('PE', '912345678')).toBe('+51 912345678');
  });

  it('separa lo guardado en país y número, con el código más largo que coincida', () => {
    expect(splitPhone('+54 2235123456')).toEqual({ iso: 'AR', digits: '2235123456' });
    expect(splitPhone('+598 94123456')).toEqual({ iso: 'UY', digits: '94123456' });
    expect(splitPhone('+1 2025550123')).toEqual({ iso: 'US', digits: '2025550123' });
  });

  it('un teléfono de antes, sin código, es de Argentina', () => {
    expect(splitPhone('2235123456')).toEqual({ iso: 'AR', digits: '2235123456' });
    expect(splitPhone(null)).toEqual({ iso: 'AR', digits: '' });
  });

  it('pide la cantidad de números de cada país', () => {
    expect(phoneError('AR', '2235123456')).toBeNull();
    expect(phoneError('AR', '223512345')).toBe(
      'El teléfono de Argentina lleva 10 números: el código de área sin el 0 y el número sin el 15.',
    );
    expect(phoneError('UY', '94123456')).toBeNull();
    expect(phoneError('BR', '1191234567')).toBeNull();
    expect(phoneError('BR', '11912345678')).toBeNull();
    // Vacío lo marca la regla de obligatorio, no esta.
    expect(phoneError('AR', '')).toBeNull();
  });

  it('un país desconocido cae en Argentina', () => {
    expect(phoneCountry('XX').iso).toBe('AR');
  });
});
