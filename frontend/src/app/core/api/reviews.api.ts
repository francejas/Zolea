import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Review, ReviewRequest } from './review.models';

/** Las reseñas: calificar una estadía y leer las de un balneario. */
@Injectable({
  providedIn: 'root',
})
export class ReviewsApi {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /**
   * Califica una reserva confirmada cuya estadía ya terminó. Solo su dueño, y una vez: la segunda
   * responde 400 «Ya calificaste esta reserva.».
   */
  create(bookingId: number, request: ReviewRequest): Observable<Review> {
    return this.http.post<Review>(`${this.apiUrl}/api/bookings/${bookingId}/review`, request);
  }

  /** Las reseñas de un balneario, de la más nueva a la más vieja. Es público. */
  listByResort(resortId: number | string): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.apiUrl}/api/resorts/${resortId}/reviews`);
  }
}
