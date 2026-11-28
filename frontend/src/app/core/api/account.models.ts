/**
 * Las cuentas de la plataforma, como las ve la cuenta de Zolea (#72). El tipo sale del rol y del
 * balneario asignado: un cliente, el administrador de un balneario o la cuenta de Zolea.
 */
export type AccountType = 'CLIENT' | 'RESORT_ADMIN' | 'ZOLEA';

/** El balneario que administra una cuenta. */
export interface ManagedResort {
  idResort: number;
  name: string;
  active: boolean;
}

/** Una fila de `GET /api/accounts`. */
export interface AccountSummary {
  idClient: number;
  firstName: string;
  lastName: string;
  email: string;
  dni: string | null;
  type: AccountType;
  /** Si puede ingresar. */
  active: boolean;
  /** `null` si no administra ningún balneario. */
  managedResort: ManagedResort | null;
}

/** `GET /api/accounts/{id}` y lo que responden las acciones: la cuenta como quedó. */
export interface Account extends AccountSummary {
  phone: string | null;
  /** Las reservas que hizo, de cualquier estado. */
  bookingCount: number;
}

/** Una página de cuentas. `page` empieza en 0. */
export interface AccountPage {
  content: AccountSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** La búsqueda de la lista: lo vacío no viaja. */
export interface AccountFilters {
  q?: string;
  type?: AccountType | null;
  page?: number;
  size?: number;
}
