import { directionsLabel, mapsUrl } from './maps';

describe('maps', () => {
  it('arma el enlace de búsqueda de Google Maps', () => {
    expect(mapsUrl('Mar del Plata')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Mar%20del%20Plata',
    );
  });

  it('codifica comas, tildes y espacios', () => {
    expect(mapsUrl('Av. Patricio Peralta Ramos 4800, Mar del Plata, Buenos Aires')).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        'Av.%20Patricio%20Peralta%20Ramos%204800%2C%20Mar%20del%20Plata%2C%20Buenos%20Aires',
    );
    expect(mapsUrl('Avenida Rivadavia 1, Ñandú, Río Negro')).toContain(
      'Avenida%20Rivadavia%201%2C%20%C3%91and%C3%BA%2C%20R%C3%ADo%20Negro',
    );
  });

  it('un & o un # en la dirección no cortan la búsqueda', () => {
    const url = mapsUrl('Calle 5 & 6 #10');
    expect(url.split('query=')[1]).toBe('Calle%205%20%26%206%20%2310');
  });

  it('sin espacios de más en los bordes', () => {
    expect(mapsUrl('  Pinamar ')).toBe('https://www.google.com/maps/search/?api=1&query=Pinamar');
  });

  it('el texto para el lector de pantalla avisa que se abre en otra pestaña', () => {
    expect(directionsLabel('Zolea Club de Playa')).toBe(
      'Cómo llegar a Zolea Club de Playa, en Google Maps (se abre en otra pestaña)',
    );
  });
});
