import { RentalUnit } from '../../../core/api/resort.models';
import { filterUnits } from './unit-filters';

const units: RentalUnit[] = [
  {
    idRentalUnit: 1,
    type: 'TENT',
    identifier: 'C1',
    dailyPrice: 100,
    isBlocked: false,
    retired: false,
    resortId: 7,
  },
  {
    idRentalUnit: 2,
    type: 'UMBRELLA',
    identifier: 'S1',
    dailyPrice: 100,
    isBlocked: true,
    retired: false,
    resortId: 7,
  },
  {
    idRentalUnit: 3,
    type: 'TENT',
    identifier: 'C2',
    dailyPrice: 100,
    isBlocked: false,
    retired: true,
    resortId: 7,
  },
  {
    idRentalUnit: 4,
    type: 'UMBRELLA',
    identifier: 'S2',
    dailyPrice: 100,
    isBlocked: true,
    retired: true,
    resortId: 7,
  },
];

const ids = (result: RentalUnit[]) => result.map((unit) => unit.idRentalUnit);

describe('filterUnits', () => {
  it('el estado inicial incluye disponibles y bloqueadas, sin bajas', () => {
    expect(ids(filterUnits(units, '', 'ACTIVE'))).toEqual([1, 2]);
  });

  it('filtra carpas y sombrillas', () => {
    expect(ids(filterUnits(units, 'TENT', 'ACTIVE'))).toEqual([1]);
    expect(ids(filterUnits(units, 'UMBRELLA', 'ACTIVE'))).toEqual([2]);
  });

  it('disponibles excluye bloqueadas y bajas', () => {
    expect(ids(filterUnits(units, '', 'AVAILABLE'))).toEqual([1]);
  });

  it('bloqueadas excluye bajas aunque tengan isBlocked', () => {
    expect(ids(filterUnits(units, '', 'BLOCKED'))).toEqual([2]);
  });

  it('bajas incluye todas las retiradas independientemente del bloqueo', () => {
    expect(ids(filterUnits(units, '', 'RETIRED'))).toEqual([3, 4]);
  });

  it('combina tipo y estado', () => {
    expect(ids(filterUnits(units, 'TENT', 'RETIRED'))).toEqual([3]);
    expect(ids(filterUnits(units, 'UMBRELLA', 'RETIRED'))).toEqual([4]);
    expect(filterUnits(units, 'TENT', 'BLOCKED')).toEqual([]);
  });

  it('acepta una lista vacía y no modifica la original', () => {
    const original = structuredClone(units);

    expect(filterUnits([], '', 'ACTIVE')).toEqual([]);

    filterUnits(units, '', 'RETIRED');

    expect(units).toEqual(original);
  });
});
