import {
  LucideArmchair,
  LucideCheck,
  LucideCircleParking,
  LucideCoffee,
  LucideIcon,
  LucideLifeBuoy,
  LucideMartini,
  LucideMusic,
  LucideSailboat,
  LucideShowerHead,
  LucideSmile,
  LucideSparkles,
  LucideUtensils,
  LucideWaves,
  LucideWifi,
} from '@lucide/angular';

/**
 * El ícono de cada servicio. El backend manda solo el nombre, así que el frontend sabe qué ícono le
 * toca a cada uno. Las claves van sin tildes ni mayúsculas: ver `amenityIcon`. Es compartido porque
 * lo usan la Ficha del balneario y el Catálogo de servicios del administrador.
 */
const AMENITY_ICONS: Record<string, LucideIcon> = {
  wifi: LucideWifi,
  'pileta climatizada': LucideWaves,
  estacionamiento: LucideCircleParking,
  restaurante: LucideUtensils,
  'recreacion infantil': LucideSmile,
  spa: LucideSparkles,
  'barra de tragos': LucideMartini,
  'duchas y vestuarios': LucideShowerHead,
  'deportes acuaticos': LucideSailboat,
  guardavidas: LucideLifeBuoy,
  'snack bar': LucideCoffee,
  'alquiler de reposeras': LucideArmchair,
  'musica en vivo': LucideMusic,
};

/** El que se usa con un servicio que todavía no tiene el suyo. */
const GENERIC_ICON: LucideIcon = LucideCheck;

/**
 * El nombre sin tildes, mayúsculas ni espacios de más: «  Recreación  INFANTIL » es
 * «recreacion infantil». Con esto se busca el ícono y se reconoce un servicio repetido.
 */
export function amenityKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** El ícono del servicio, sin importar mayúsculas ni tildes; uno genérico si no está en el mapa. */
export function amenityIcon(name: string): LucideIcon {
  return AMENITY_ICONS[amenityKey(name)] ?? GENERIC_ICON;
}
