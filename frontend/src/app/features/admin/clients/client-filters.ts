import { ResortClient } from '../../../core/api/resort-client.models';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

export function filterClients(clients: ResortClient[], query: string): ResortClient[] {
  const search = normalize(query);
  const dniSearch = search.replace(/[.\s-]/g, '');

  return clients
    .filter((client) => {
      if (!search) return true;

      const nameMatches = normalize(client.fullName).includes(search);

      const dniMatches =
        /^\d+$/.test(dniSearch) && (client.dni ?? '').replace(/[.\s-]/g, '').includes(dniSearch);

      return nameMatches || dniMatches;
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' }));
}
