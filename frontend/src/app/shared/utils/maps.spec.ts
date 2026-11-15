import { directionsLabel, mapsUrl } from './maps';

describe('maps', () => {
  it('busca el nombre del balneario junto con su dirección', () => {
    expect(mapsUrl('Zolea Club de Playa', 'Mar del Plata')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Zolea%20Club%20de%20Playa%2C%20Mar%20del%20Plata',
    );
  });

  it('codifica comas, tildes y espacios', () => {
    expect(
      mapsUrl(
        'Zolea Club de Playa',
        'Av. Patricio Peralta Ramos 4800, Mar del Plata, Buenos Aires',
      ),
    ).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        'Zolea%20Club%20de%20Playa%2C%20Av.%20Patricio%20Peralta%20Ramos%204800%2C%20Mar%20del%20Plata%2C%20Buenos%20Aires',
    );
    expect(mapsUrl('Ñandú Playa', 'Avenida Rivadavia 1, Río Negro')).toContain(
      '%C3%91and%C3%BA%20Playa%2C%20Avenida%20Rivadavia%201%2C%20R%C3%ADo%20Negro',
    );
  });

  it('un & o un # no cortan la búsqueda', () => {
    const url = mapsUrl('Sol & Mar', 'Calle 5 #10');
    expect(url.split('query=')[1]).toBe('Sol%20%26%20Mar%2C%20Calle%205%20%2310');
  });

  it('sin espacios de más en los bordes', () => {
    expect(mapsUrl(' Arena Dorada ', '  Villa Gesell ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Arena%20Dorada%2C%20Villa%20Gesell',
    );
  });

  it('el texto para el lector de pantalla avisa que se abre en otra pestaña', () => {
    expect(directionsLabel('Zolea Club de Playa')).toBe(
      'Cómo llegar a Zolea Club de Playa, en Google Maps (se abre en otra pestaña)',
    );
  });
});
