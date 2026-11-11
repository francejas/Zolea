import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { RentalUnit, RentalUnitRequest } from './resort.models';
import { UnitsApi } from './units.api';

const URL = `${environment.apiUrl}/api/rental-units`;

const unit: RentalUnit = {
  idRentalUnit: 7,
  type: 'TENT',
  identifier: 'C-07',
  dailyPrice: 14500,
  isBlocked: false,
  resortId: 1,
};

describe('UnitsApi', () => {
  let api: UnitsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(UnitsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list hace GET /api/rental-units', () => {
    let units: RentalUnit[] = [];
    api.list().subscribe((result) => (units = result));

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush([unit]);
    expect(units).toEqual([unit]);
  });

  it('create hace POST con tipo, identificador, precio, bloqueo y balneario', () => {
    const request: RentalUnitRequest = {
      type: 'TENT',
      identifier: 'C-07',
      dailyPrice: 14500,
      isBlocked: false,
      resortId: 1,
    };
    let created: RentalUnit | undefined;
    api.create(request).subscribe((result) => (created = result));

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(unit);
    expect(created).toEqual(unit);
  });

  it('updatePrice hace PATCH /{id}/price con newPrice en la dirección y sin cuerpo', () => {
    api.updatePrice(7, 15250.5).subscribe();

    const req = http.expectOne((r) => r.url === `${URL}/7/price`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.params.get('newPrice')).toBe('15250.5');
    expect(req.request.body).toBeNull();
    req.flush({ ...unit, dailyPrice: 15250.5 });
  });

  it('setBlocked(true) y setBlocked(false) hacen PATCH /{id}/block con isBlocked', () => {
    api.setBlocked(7, true).subscribe();
    const block = http.expectOne((r) => r.url === `${URL}/7/block`);
    expect(block.request.method).toBe('PATCH');
    expect(block.request.params.get('isBlocked')).toBe('true');
    expect(block.request.body).toBeNull();
    block.flush({ ...unit, isBlocked: true });

    api.setBlocked(7, false).subscribe();
    const unblock = http.expectOne((r) => r.url === `${URL}/7/block`);
    expect(unblock.request.params.get('isBlocked')).toBe('false');
    unblock.flush(unit);
  });
});
