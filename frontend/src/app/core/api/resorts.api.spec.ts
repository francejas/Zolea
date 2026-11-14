import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ResortsApi } from './resorts.api';

const URL = `${environment.apiUrl}/api/resorts`;

describe('ResortsApi', () => {
  let api: ResortsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ResortsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list sin filtros hace GET /api/resorts sin parámetros', () => {
    api.list().subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('list arma la consulta con todos los filtros', () => {
    api
      .list({
        from: '2027-01-15',
        to: '2027-01-17',
        type: 'TENT',
        maxPrice: 20000,
        amenityIds: [1, 2],
      })
      .subscribe();

    const req = http.expectOne(
      `${URL}?from=2027-01-15&to=2027-01-17&type=TENT&maxPrice=20000&amenityIds=1,2`,
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('list no manda los filtros vacíos ni una sola de las dos fechas', () => {
    api
      .list({ from: '2027-01-15', to: null, type: null, maxPrice: null, amenityIds: [] })
      .subscribe();

    const req = http.expectOne(URL);
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('occupiedUnits hace GET /api/resorts/{id}/occupied-units con las fechas', () => {
    let ids: number[] = [];
    api.occupiedUnits(1, '2027-01-15', '2027-01-17').subscribe((result) => (ids = result));

    const req = http.expectOne(`${URL}/1/occupied-units?from=2027-01-15&to=2027-01-17`);
    expect(req.request.method).toBe('GET');
    req.flush([12, 15]);
    expect(ids).toEqual([12, 15]);
  });

  it('reviews hace GET /api/resorts/{id}/reviews', () => {
    api.reviews(4).subscribe();

    const req = http.expectOne(`${URL}/4/reviews`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('mine hace GET /api/resorts/my', () => {
    api.mine().subscribe();

    const req = http.expectOne(`${URL}/my`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });
});
