/** Los clientes, como los devuelve y los pide `/api/clients`. Escritas a mano contra `/v3/api-docs`. */

/** El alta de una cuenta. Los campos se llaman igual que en el formulario de Crear cuenta. */
export interface ClientRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dni: string;
  password: string;
}

/**
 * El pedido de `PUT /api/clients/{id}` (Mi cuenta): todos los datos, siempre. La contraseña va solo
 * si se cambia: sin ella, el backend deja la que había.
 */
export type ClientUpdateRequest = Omit<ClientRequest, 'password'> & { password?: string };

export interface Client {
  idClient: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dni: string | null;
}
