import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Client, ClientRequest } from './client.models';

/** Los clientes. Hoy, solo el alta; Mi cuenta suma lo suyo. */
@Injectable({
  providedIn: 'root',
})
export class ClientsApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/clients`;

  /** Crea la cuenta. Es público: no lleva token. */
  register(request: ClientRequest): Observable<Client> {
    return this.http.post<Client>(this.apiUrl, request);
  }
}
