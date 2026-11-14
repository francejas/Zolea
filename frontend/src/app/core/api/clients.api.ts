import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Client, ClientRequest } from './client.models';
import { ResortClient } from './resort-client.models';

/** Registro de cuentas y clientes del balneario del administrador. */
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
}
