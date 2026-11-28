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

  it('list manda el puntaje y el orden (#73)', () => {
    api.list({ minRating: 4.5, sort: 'rating' }).subscribe();
    http.expectOne(`${URL}?minRating=4.5&sort=rating`).flush([]);

    api.list({ stars: 4 }).subscribe();
    http.expectOne(`${URL}?stars=4`).flush([]);
  });

  it('list no manda los filtros vacíos ni una sola de las dos fechas', () => {
    api
      .list({
        from: '2027-01-15',
        to: null,
        type: null,
        maxPrice: null,
        amenityIds: [],
        minRating: null,
        stars: null,
        sort: null,
      })
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

  it('mine hace GET /api/resorts/my', () => {
    api.mine().subscribe();

    const req = http.expectOne(`${URL}/my`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('updateMine hace PUT /api/resorts/my con todos los datos y los servicios', () => {
    const request = {
      name: 'Zolea Club de Playa',
      location: 'Mar del Plata',
      description: 'Carpas frente al mar.',
      coverPhotoUrl: 'https://ejemplo.com/portada.jpg',
      amenityIds: [1, 4],
    };
    api.updateMine(request).subscribe();

    const req = http.expectOne(`${URL}/my`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush({ message: 'ok', resort: {} });
  });

  it('all hace GET /api/resorts/all', () => {
    api.all().subscribe();
    const req = http.expectOne(`${URL}/all`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('register hace POST /api/resorts con el balneario y su administrador', () => {
    const request = {
      name: 'Balneario Pinamar Norte',
      location: 'Av. Bunge 1200, Pinamar, Buenos Aires',
      admin: {
        firstName: 'Laura',
        lastName: 'Gómez',
        email: 'laura.gomez@pinamar.com',
        phone: '+54 2254123456',
        dni: '30111222',
        password: 'provisoria1',
      },
    };
    api.register(request).subscribe();
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ message: 'ok', resort: {} });
  });

  it('deactivate y activate hacen PUT con el id del balneario', () => {
    api.deactivate(3).subscribe();
    const off = http.expectOne(`${URL}/3/inactive`);
    expect(off.request.method).toBe('PUT');
    off.flush({ message: 'ok', resort: {} });

    api.activate(3).subscribe();
    const on = http.expectOne(`${URL}/3/active`);
    expect(on.request.method).toBe('PUT');
    on.flush({ message: 'ok', resort: {} });
  });
});
