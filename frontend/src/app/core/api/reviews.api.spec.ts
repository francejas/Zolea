import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ReviewsApi } from './reviews.api';

describe('ReviewsApi', () => {
  let api: ReviewsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ReviewsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('create hace POST /api/bookings/{id}/review con las estrellas y el comentario', () => {
    api.create(47, { rating: 4, comment: null }).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/api/bookings/47/review`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ rating: 4, comment: null });
    req.flush({});
  });

  it('listByResort hace GET /api/resorts/{id}/reviews', () => {
    api.listByResort(4).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/api/resorts/4/reviews`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
