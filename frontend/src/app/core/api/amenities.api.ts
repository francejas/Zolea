import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Amenity, AmenityRequest } from './resort.models';

/**
 * El catálogo de servicios (Wi-Fi, duchas, estacionamiento…). Es uno solo para todos los
 * balnearios: listarlo es público, y crear, renombrar y borrar es del administrador. Borrar es el
 * único borrado real de la API: el servicio desaparece y se desvincula de los balnearios que lo
 * ofrecían.
 */
@Injectable({
  providedIn: 'root',
})
export class AmenitiesApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/amenities`;

  list(): Observable<Amenity[]> {
    return this.http.get<Amenity[]>(this.apiUrl);
  }

  create(name: string): Observable<Amenity> {
    const request: AmenityRequest = { name };
    return this.http.post<Amenity>(this.apiUrl, request);
  }

  /** Devuelve el servicio con el nombre nuevo. */
  rename(id: number, name: string): Observable<Amenity> {
    const request: AmenityRequest = { name };
    return this.http.put<Amenity>(`${this.apiUrl}/${id}`, request);
  }

  /** Responde 204 sin cuerpo. */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
