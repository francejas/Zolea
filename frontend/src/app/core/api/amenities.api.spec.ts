import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AmenitiesApi } from './amenities.api';
import { Amenity } from './resort.models';

const URL = `${environment.apiUrl}/api/amenities`;

const spa: Amenity = { idAmenity: 6, name: 'Spa' };

describe('AmenitiesApi', () => {
  let api: AmenitiesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AmenitiesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list hace GET /api/amenities', () => {
    let amenities: Amenity[] = [];
    api.list().subscribe((result) => (amenities = result));

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush([spa]);
    expect(amenities).toEqual([spa]);
  });

  it('create hace POST /api/amenities con { name }', () => {
    let created: Amenity | undefined;
    api.create('Spa').subscribe((result) => (created = result));

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Spa' });
    req.flush(spa);
    expect(created).toEqual(spa);
  });

  it('rename hace PUT /api/amenities/{id} con { name }', () => {
    let renamed: Amenity | undefined;
    api.rename(6, 'Spa y masajes').subscribe((result) => (renamed = result));

    const req = http.expectOne(`${URL}/6`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Spa y masajes' });
    req.flush({ ...spa, name: 'Spa y masajes' });
    expect(renamed?.name).toBe('Spa y masajes');
  });

  it('delete hace DELETE /api/amenities/{id}, sin cuerpo', () => {
    let done = false;
    api.delete(6).subscribe({ complete: () => (done = true) });

    const req = http.expectOne(`${URL}/6`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });
});
