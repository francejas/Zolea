export type UnitType = 'TENT' | 'UMBRELLA';

export interface Amenity {
  idAmenity: number;
  name: string;
}

export interface AmenityRequest {
  name: string;
}

export interface RentalUnit {
  idRentalUnit: number;
  type: UnitType;
  identifier: string;
  dailyPrice: number;
  isBlocked: boolean;
  retired: boolean;
  resortId: number;
}

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
  availableUnits?: number | null;
}

export interface ResortFilters {
  from?: string | null;
  to?: string | null;
  type?: UnitType | null;
  maxPrice?: number | null;
  amenityIds?: number[];
}
