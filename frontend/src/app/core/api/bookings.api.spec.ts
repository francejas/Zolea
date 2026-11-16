import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { BookingsApi } from './bookings.api';

const URL = `${environment.apiUrl}/api/bookings`;

describe('BookingsApi', () => {
  let api: BookingsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(BookingsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('walkIn hace POST /api/bookings/walkin con el titular de mostrador y sin clientId', () => {
    const request = {
      startDate: '2027-01-10',
      endDate: '2027-01-10',
      rentalUnitId: 3,
      walkInName: 'Juan Pérez',
      walkInDni: '30111222',
      guests: [{ fullName: 'Ana Pérez', dni: '40111222' }],
    };
    api.walkIn(request).subscribe();

    const req = http.expectOne(`${URL}/walkin`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    expect(req.request.body).not.toHaveProperty('clientId');
    req.flush({ message: 'ok', booking: {} });
  });
});
