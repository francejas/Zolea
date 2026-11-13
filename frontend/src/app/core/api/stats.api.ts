import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResortStats } from './stats.models';

/** Los números del Panel. Solo para un administrador con balneario: sin balneario, 403. */
@Injectable({
  providedIn: 'root',
})
export class StatsApi {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/resorts/my/stats`;

  /**
   * Las estadísticas del balneario del administrador entre esas dos fechas, `YYYY-MM-DD`, con los
   * dos extremos. Van las dos o ninguna, hasta 366 días: si no, 400.
   */
  get(from: string, to: string): Observable<ResortStats> {
    return this.http.get<ResortStats>(this.apiUrl, { params: { from, to } });
  }
}
