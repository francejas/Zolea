import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RentalUnit, RentalUnitRequest } from './resort.models';

/**
 * Las carpas y sombrillas del balneario. Las usa el panel del administrador: al admin, el listado
 * le devuelve solo las unidades de su balneario, con las dadas de baja incluidas (`retired`). No hay
 * borrado: una unidad se bloquea, que se deshace, o se da de baja, que no.
 */
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

  /** Devuelve la unidad con el precio nuevo. El precio viaja en la dirección, no en el cuerpo. */
  updatePrice(id: number, newPrice: number): Observable<RentalUnit> {
    const params = new HttpParams().set('newPrice', newPrice);
    return this.http.patch<RentalUnit>(`${this.apiUrl}/${id}/price`, null, { params });
  }

  /** Bloquea (`true`) o desbloquea (`false`). Una unidad bloqueada no se puede reservar. */
  setBlocked(id: number, isBlocked: boolean): Observable<RentalUnit> {
    const params = new HttpParams().set('isBlocked', isBlocked);
    return this.http.patch<RentalUnit>(`${this.apiUrl}/${id}/block`, null, { params });
  }

  /**
   * Da de baja la unidad: definitivo. Devuelve la unidad con `retired` en `true`. El backend contesta
   * 400 si todavía tiene reservas pendientes o confirmadas por delante; el motivo viene en `error`.
   */
  retire(id: number): Observable<RentalUnit> {
    return this.http.patch<RentalUnit>(`${this.apiUrl}/${id}/retire`, null);
  }
}
