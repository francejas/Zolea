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
  /**
   * Reservas pendientes o confirmadas que todavía no terminaron. Solo las trae el listado del
   * administrador (y lo que devuelven precio, bloqueo y baja); para un cliente vienen en `null`.
   */
  upcomingBookings?: number | null;
  /** `YYYY-MM-DD`: el primer día desde hoy en que está reservada. `null` si no tiene reservas por delante. */
  nextBookingDate?: string | null;
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
 * El pedido de `PUT /api/resorts/my`. Va siempre completo: el backend conserva lo que llegue vacío
 * (una descripción o una foto en blanco no borran la que había), y el email del administrador no
 * se cambia por esta vía, así que no viaja.
 */
export interface ResortRequest {
  name: string;
  location: string;
  description: string;
  coverPhotoUrl: string;
  /** Los servicios que ofrece. Una lista vacía los saca todos. */
  amenityIds: number[];
}

/** El administrador de un balneario en la lista de la cuenta de Zolea. */
export interface ResortSummaryAdmin {
  firstName: string;
  lastName: string;
  email: string;
}

/** Una fila de `GET /api/resorts/all` (#71): activos e inactivos, para la cuenta de Zolea. */
export interface ResortSummary {
  idResort: number;
  name: string;
  location: string;
  active: boolean;
  /** Las unidades, sin las dadas de baja. */
  unitCount: number;
  /** `null` si todavía no tiene administrador. */
  admin: ResortSummaryAdmin | null;
}

/** La cuenta del administrador que se crea con el balneario. La contraseña es provisoria. */
export interface AdminAccountRequest {
  firstName: string;
  lastName: string;
  email: string;
  /** Con el código de país, como lo arma `joinPhone`. */
  phone: string;
  dni: string;
  password: string;
}

/**
 * El pedido de `POST /api/resorts` (#71): el balneario y su administrador. Los errores de un campo
 * del administrador llegan en `campos` como `admin.email`.
 */
export interface ResortRegistrationRequest {
  name: string;
  location: string;
  admin: AdminAccountRequest;
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
  /** El promedio mínimo de las reseñas, de 1 a 5 (#73). */
  minRating?: number | null;
  /** Las estrellas exactas, de 1 a 5: un promedio de 4,0 a 4,9 cuenta como 4 (#73). */
  stars?: number | null;
  /** `rating`: por promedio, de mayor a menor. Sin mandar, el orden de siempre (#73). */
  sort?: ResortSort | null;
}

/** El orden de la Portada: el único que se pide es por puntaje. */
export type ResortSort = 'rating';
