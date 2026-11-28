import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Account, AccountFilters, AccountPage } from './account.models';

/** Las cuentas de la plataforma (#72). Todo es solo para la cuenta de Zolea. */
@Injectable({
  providedIn: 'root',
})
export class AccountsApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/accounts`;

  /** Una página de cuentas, por apellido y nombre. Lo vacío no viaja. */
  search(filters: AccountFilters = {}): Observable<AccountPage> {
    return this.http.get<AccountPage>(this.apiUrl, { params: toParams(filters) });
  }

  get(id: number): Observable<Account> {
    return this.http.get<Account>(`${this.apiUrl}/${id}`);
  }

  /** No ingresa más y su sesión deja de valer. La propia cuenta de Zolea responde 400. */
  deactivate(id: number): Observable<Account> {
    return this.http.patch<Account>(`${this.apiUrl}/${id}/inactive`, null);
  }

  activate(id: number): Observable<Account> {
    return this.http.patch<Account>(`${this.apiUrl}/${id}/active`, null);
  }

  /** Reemplaza su contraseña por una provisoria. Responde 204, sin cuerpo. */
  setPassword(id: number, password: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${id}/password`, { password });
  }

  /** La hace administradora de ese balneario; si administraba otro, pasa a este. */
  assignResort(id: number, idResort: number): Observable<Account> {
    return this.http.put<Account>(`${this.apiUrl}/${id}/managed-resort`, { idResort });
  }

  /** Le quita el balneario: vuelve a ser cliente. */
  removeResort(id: number): Observable<Account> {
    return this.http.delete<Account>(`${this.apiUrl}/${id}/managed-resort`);
  }
}

function toParams(filters: AccountFilters): HttpParams {
  let params = new HttpParams();
  const q = filters.q?.trim();
  if (q) params = params.set('q', q);
  if (filters.type) params = params.set('type', filters.type);
  if (filters.page != null) params = params.set('page', filters.page);
  if (filters.size != null) params = params.set('size', filters.size);
  return params;
}
