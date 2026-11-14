import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { Resort, ResortActionResponse, ResortFilters, ResortRequest } from './resort.models';

@Injectable({
  providedIn: 'root',
})
export class ResortsApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/resorts`;

  /**
   * Los balnearios activos. Sin filtros, todos; con alguno, solo los que tienen al menos una unidad
   * que los cumple (y libre, si vinieron fechas). Los filtros vacíos no viajan.
   */
  list(filters: ResortFilters = {}): Observable<Resort[]> {
    return this.http.get<Resort[]>(this.apiUrl, { params: toParams(filters) });
  }

  get(id: string): Observable<Resort> {
    return this.http.get<Resort>(`${this.apiUrl}/${id}`);
  }

  /**
   * El balneario del administrador de la sesión, con todas sus unidades, también las bloqueadas.
   * Responde 404 si el administrador no tiene balneario asignado.
   */
  mine(): Observable<Resort> {
    return this.http.get<Resort>(`${this.apiUrl}/my`);
  }

  /** Guarda los datos y los servicios del balneario del administrador de la sesión. */
  updateMine(request: ResortRequest): Observable<ResortActionResponse> {
    return this.http.put<ResortActionResponse>(`${this.apiUrl}/my`, request);
  }

  /**
   * La baja del balneario: deja de aparecer en la Portada y no toma reservas nuevas; las que ya
   * tiene siguen valiendo. Solo el administrador de ese balneario.
   */
  deactivate(id: number): Observable<ResortActionResponse> {
    return this.http.put<ResortActionResponse>(`${this.apiUrl}/${id}/inactive`, {});
  }

  /** Lo vuelve a publicar en la Portada. */
  activate(id: number): Observable<ResortActionResponse> {
    return this.http.put<ResortActionResponse>(`${this.apiUrl}/${id}/active`, {});
  }

  /** Los `idRentalUnit` reservados en esas fechas, contando los dos extremos. */
  occupiedUnits(id: number | string, from: string, to: string): Observable<number[]> {
    return this.http.get<number[]>(`${this.apiUrl}/${id}/occupied-units`, {
      params: { from, to },
    });
  }
}

function toParams(filters: ResortFilters): HttpParams {
  let params = new HttpParams();
  if (filters.from && filters.to) {
    params = params.set('from', filters.from).set('to', filters.to);
  }
  if (filters.type) params = params.set('type', filters.type);
  if (filters.maxPrice != null) params = params.set('maxPrice', filters.maxPrice);
  if (filters.amenityIds?.length) params = params.set('amenityIds', filters.amenityIds.join(','));
  return params;
}
