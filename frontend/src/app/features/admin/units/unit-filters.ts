import { RentalUnit, UnitType } from '../../../core/api/resort.models';

export type UnitStateFilter = 'ACTIVE' | 'AVAILABLE' | 'BLOCKED' | 'RETIRED';

/** Las bajas solo aparecen cuando se elige expresamente ese estado. */
export function filterUnits(
  units: RentalUnit[],
  type: UnitType | '',
  state: UnitStateFilter,
): RentalUnit[] {
  return units.filter((unit) => {
    if (type && unit.type !== type) return false;

    switch (state) {
      case 'ACTIVE':
        return !unit.retired;

      case 'AVAILABLE':
        return !unit.retired && !unit.isBlocked;

      case 'BLOCKED':
        return !unit.retired && unit.isBlocked;

      case 'RETIRED':
        return unit.retired;
    }
  });
}
