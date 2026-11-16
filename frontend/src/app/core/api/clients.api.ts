import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Client, ClientRequest, ClientUpdateRequest } from './client.models';
import { ResortClient } from './resort-client.models';

/** Registro de cuentas, Mi cuenta y clientes del balneario del administrador. */
@Injectable({
  providedIn: 'root',
})
export class ClientsApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/clients`;

  /** El backend limita el resultado al balneario del administrador autenticado. */
  list(): Observable<ResortClient[]> {
    return this.http.get<ResortClient[]>(this.apiUrl);
  }

  /** Crea la cuenta. Es público: no lleva token. */
  register(request: ClientRequest): Observable<Client> {
    return this.http.post<Client>(this.apiUrl, request);
  }

  /** Los datos de la cuenta. Solo la propia: la de otro responde 403. */
  get(id: number): Observable<Client> {
    return this.http.get<Client>(`${this.apiUrl}/${id}`);
  }

  /**
   * Guarda los datos de la cuenta propia. Un email, teléfono o DNI que ya es de otra cuenta
   * responde 409 con el campo en `campos`.
   */
  update(id: number, request: ClientUpdateRequest): Observable<Client> {
    return this.http.put<Client>(`${this.apiUrl}/${id}`, request);
  }
}
