import { money, UNIT_TYPE_LABEL, unitLabel } from './format';

describe('format', () => {
  it('unitLabel dice el tipo y el identificador', () => {
    expect(unitLabel('UMBRELLA', 'A-03')).toBe('Sombrilla A-03');
    expect(unitLabel('TENT', 'C-01')).toBe('Carpa C-01');
  });

  it('UNIT_TYPE_LABEL tiene el nombre de cada tipo', () => {
    expect(UNIT_TYPE_LABEL).toEqual({ TENT: 'Carpa', UMBRELLA: 'Sombrilla' });
  });

  it('money da pesos con centavos', () => {
    expect(money(36000).replace(/\s/g, ' ')).toBe('$ 36.000,00');
    expect(money(8500.5).replace(/\s/g, ' ')).toBe('$ 8.500,50');
  });
});
