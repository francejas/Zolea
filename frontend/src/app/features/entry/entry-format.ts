import { EntryMethod, GuestEntry } from '../../core/api/entry.models';

/**
 * Cómo se muestran los ingresos (GH-76), en Validar ingreso y en los dos detalles de la reserva.
 * La hora llega en la del balneario y sin zona: se muestra tal cual, sin pasar por `new Date`.
 */

/** «QR», «Código» o «DNI». */
export const ENTRY_METHOD: Record<EntryMethod, string> = {
  QR: 'QR',
  CODE: 'Código',
  DNI: 'DNI',
};

/** «10:12». */
export function entryHour(enteredAt: string): string {
  return enteredAt.split('T')[1]?.slice(0, 5) ?? '';
}

/** «27/11». */
export function entryDay(enteredAt: string): string {
  const [, month, day] = enteredAt.split('T')[0].split('-');
  return `${day}/${month}`;
}

/** «Hoy a las 10:12» o «27/11 a las 10:12». */
export function entryMoment(enteredAt: string, today: string): string {
  const day = enteredAt.split('T')[0] === today ? 'Hoy' : entryDay(enteredAt);
  return `${day} a las ${entryHour(enteredAt)}`;
}

/** Los ingresos de cada persona, en el orden en que llegan (del más nuevo al más viejo). */
export interface GuestEntries {
  idGuest: number;
  fullName: string;
  entries: GuestEntry[];
}

/** Agrupa los ingresos por persona, con la que entró último primero. */
export function byGuest(entries: GuestEntry[]): GuestEntries[] {
  const groups = new Map<number, GuestEntries>();
  for (const entry of entries) {
    let group = groups.get(entry.idGuest);
    if (!group) {
      group = { idGuest: entry.idGuest, fullName: entry.fullName, entries: [] };
      groups.set(entry.idGuest, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}
