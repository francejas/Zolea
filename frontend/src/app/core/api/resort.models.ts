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
}

/** El pedido de `POST /api/rental-units`. `resortId` es el `idManagedResort` de la sesión. */
export interface RentalUnitRequest {
  type: UnitType;
  identifier: string;
  dailyPrice: number;
  isBlocked: boolean;
  resortId: number;
}

export interface Resort {
  idResort: number;
  name: string;
  location: string;
  coverPhotoUrl: string | null;
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
