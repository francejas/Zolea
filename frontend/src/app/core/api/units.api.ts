import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RentalUnit, RentalUnitRequest } from './resort.models';

@Injectable({
  providedIn: 'root',
})
export class UnitsApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/rental-units`;

  list(): Observable<RentalUnit[]> {
    return this.http.get<RentalUnit[]>(this.apiUrl);
  }

  create(request: RentalUnitRequest): Observable<RentalUnit> {
    return this.http.post<RentalUnit>(this.apiUrl, request);
  }

  updatePrice(id: number, newPrice: number): Observable<RentalUnit> {
    const params = new HttpParams().set('newPrice', newPrice);

    return this.http.patch<RentalUnit>(`${this.apiUrl}/${id}/price`, null, {
      params,
    });
  }

  /** Baja definitiva. El servidor rechaza unidades con reservas vigentes o futuras. */
  retire(id: number): Observable<RentalUnit> {
    return this.http.patch<RentalUnit>(`${this.apiUrl}/${id}/retire`, null);
  }

  /** El bloqueo es temporal y se puede deshacer. */
  setBlocked(id: number, isBlocked: boolean): Observable<RentalUnit> {
    const params = new HttpParams().set('isBlocked', isBlocked);

    return this.http.patch<RentalUnit>(`${this.apiUrl}/${id}/block`, null, {
      params,
    });
  }
}
