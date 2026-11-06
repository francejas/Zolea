import { LucideCheck, LucideSmile, LucideWifi } from '@lucide/angular';
import { amenityIcon } from './amenity-icons';

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
