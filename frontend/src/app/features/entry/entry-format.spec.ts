import { GuestEntry } from '../../core/api/entry.models';
import { byGuest, entryDay, entryHour, entryMoment } from './entry-format';

function entry(id: number, idGuest: number, enteredAt: string): GuestEntry {
  return {
    id,
    idGuest,
    fullName: `Persona ${idGuest}`,
    bookingId: 62,
    rentalUnitIdentifier: 'A-03',
    enteredAt,
    method: 'QR',
  };
}

describe('entry-format', () => {
  it('muestra la hora tal como llega y el día con el formato corto de las tablas', () => {
    expect(entryHour('2026-11-27T10:12:45.123456')).toBe('10:12');
    expect(entryDay('2026-11-27T10:12:45', '2026-11-28')).toBe('27 nov');
    expect(entryDay('2025-12-30T10:12:45', '2026-01-02')).toBe('30 dic 2025');
  });

  it('dice «Hoy» si es de hoy y la fecha si no', () => {
    expect(entryMoment('2026-11-27T10:12:00', '2026-11-27')).toBe('Hoy a las 10:12');
    expect(entryMoment('2026-11-26T18:05:00', '2026-11-27')).toBe('26 nov a las 18:05');
  });

  it('agrupa por persona y conserva el orden', () => {
    const groups = byGuest([
      entry(3, 2, '2026-11-27T11:00:00'),
      entry(2, 1, '2026-11-27T10:00:00'),
      entry(1, 2, '2026-11-26T09:00:00'),
    ]);

    expect(groups.map((g) => g.idGuest)).toEqual([2, 1]);
    expect(groups[0].entries.map((e) => e.id)).toEqual([3, 1]);
  });
});
