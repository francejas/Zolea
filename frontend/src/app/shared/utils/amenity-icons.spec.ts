import { LucideCheck, LucideSmile, LucideWifi } from '@lucide/angular';
import { amenityIcon, amenityKey } from './amenity-icons';

describe('amenityKey', () => {
  it('saca tildes, mayúsculas y espacios de más', () => {
    expect(amenityKey('  Recreación   INFANTIL ')).toBe('recreacion infantil');
  });

  it('dos formas de escribir el mismo servicio dan la misma clave', () => {
    expect(amenityKey('Música en vivo')).toBe(amenityKey('MUSICA EN VIVO'));
  });
});

describe('amenityIcon', () => {
  it('da el ícono de cada servicio por su nombre', () => {
    expect(amenityIcon('WiFi')).toBe(LucideWifi);
  });

  it('ignora mayúsculas, tildes y espacios sobrantes', () => {
    expect(amenityIcon('  RECREACIÓN infantil ')).toBe(LucideSmile);
  });

  it('da un ícono genérico a un servicio que no está en el mapa', () => {
    expect(amenityIcon('Ping Pong')).toBe(LucideCheck);
  });

  it('cada servicio de la demostración tiene un ícono propio', () => {
    const names = [
      'WiFi',
      'Pileta Climatizada',
      'Estacionamiento',
      'Restaurante',
      'Recreación Infantil',
      'Spa',
      'Barra de Tragos',
      'Duchas y Vestuarios',
      'Deportes Acuáticos',
      'Guardavidas',
      'Snack Bar',
      'Alquiler de Reposeras',
      'Música en Vivo',
    ];
    for (const name of names) {
      expect(amenityIcon(name), name).not.toBe(LucideCheck);
    }
  });
});
