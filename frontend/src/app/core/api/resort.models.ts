/** Los balnearios, como los devuelve `/api/resorts`. Escritos a mano contra `/v3/api-docs`. */

export type UnitType = 'TENT' | 'UMBRELLA';

export interface Amenity {
  idAmenity: number;
  name: string;
}

/** El pedido de `POST /api/amenities` y de `PUT /api/amenities/{id}`: solo el nombre. */
export interface AmenityRequest {
  name: string;
}

export interface RentalUnit {
  idRentalUnit: number;
  type: UnitType;
  identifier: string;
  dailyPrice: number;
  isBlocked: boolean;
  resortId: number;
  /** Dada de baja: definitivo. Sigue en la lista del administrador para conservar el historial. */
  retired: boolean;
}

/** El pedido de `POST /api/rental-units`. `resortId` es el `idManagedResort` de la sesión. */
export interface RentalUnitRequest {
  type: UnitType;
  identifier: string;
  dailyPrice: number;
  isBlocked: boolean;
  resortId: number;
}

/** Una foto subida desde Mi balneario: `url` es pública y se pone tal cual en un `<img>`. */
export interface ResortPhoto {
  idPhoto: number;
  url: string;
}

export interface Resort {
  idResort: number;
  name: string;
  location: string;
  /** La portada: la primera de `photos` o, sin fotos subidas, la dirección que tenía cargada. */
  coverPhotoUrl: string | null;
  /** Las fotos subidas, en el orden elegido. Vacía si no tiene. */
  photos: ResortPhoto[];
  description: string | null;
  active: boolean;
  amenities: Amenity[];
  rentalUnits: RentalUnit[];
  /** Cuántas unidades cumplen la búsqueda: solo viene cuando se buscó con fechas; si no, null. */
  availableUnits?: number | null;
  /** El promedio de las reseñas, con un decimal; null si todavía no tiene ninguna. */
  averageRating?: number | null;
  /** Cuántas reseñas tiene. */
  reviewCount?: number;
}

/**
 * El pedido de `PUT /api/resorts/my`. Va siempre completo: una descripción vacía es la que el
 * administrador borró. La foto no viaja: las fotos se suben aparte, y sin el campo el backend deja
 * la dirección que tenía (GH-67). El email del administrador tampoco: no se cambia por esta vía.
 */
export interface ResortRequest {
  name: string;
  location: string;
  description: string;
  /** Los servicios que ofrece. Una lista vacía los saca todos. */
  amenityIds: number[];
}

/** Lo que responden editar, activar y desactivar: un mensaje y el balneario como quedó. */
export interface ResortActionResponse {
  message: string;
  resort: Resort;
}

/**
 * Los filtros opcionales de `GET /api/resorts`. Las fechas van las dos o ninguna, `YYYY-MM-DD`;
 * `maxPrice` incluye ese valor y `amenityIds` pide que estén todos.
 */
export interface ResortFilters {
  from?: string | null;
  to?: string | null;
  type?: UnitType | null;
  maxPrice?: number | null;
  amenityIds?: number[];
}
