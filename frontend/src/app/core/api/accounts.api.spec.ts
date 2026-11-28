import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AccountsApi } from './accounts.api';

const URL = `${environment.apiUrl}/api/accounts`;

describe('AccountsApi', () => {
  let api: AccountsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AccountsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('search sin filtros hace GET /api/accounts sin parámetros', () => {
    api.search().subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  });

  it('search manda la búsqueda sin espacios de más, el tipo y la página', () => {
    api.search({ q: '  romero ', type: 'RESORT_ADMIN', page: 2, size: 20 }).subscribe();

    const req = http.expectOne(`${URL}?q=romero&type=RESORT_ADMIN&page=2&size=20`);
    expect(req.request.method).toBe('GET');
    req.flush({ content: [], page: 2, size: 20, totalElements: 0, totalPages: 0 });
  });

  it('search no manda una búsqueda vacía ni un tipo nulo', () => {
    api.search({ q: '   ', type: null }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  });

  it('get hace GET /api/accounts/{id}', () => {
    api.get(16).subscribe();

    const req = http.expectOne(`${URL}/16`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('deactivate y activate hacen PATCH a /inactive y /active', () => {
    api.deactivate(16).subscribe();
    const off = http.expectOne(`${URL}/16/inactive`);
    expect(off.request.method).toBe('PATCH');
    off.flush({});

    api.activate(16).subscribe();
    const on = http.expectOne(`${URL}/16/active`);
    expect(on.request.method).toBe('PATCH');
    on.flush({});
  });

  it('setPassword hace PUT /api/accounts/{id}/password con la contraseña', () => {
    api.setPassword(16, 'provisoria1').subscribe();

    const req = http.expectOne(`${URL}/16/password`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ password: 'provisoria1' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('assignResort hace PUT y removeResort DELETE en /managed-resort', () => {
    api.assignResort(16, 3).subscribe();
    const put = http.expectOne(`${URL}/16/managed-resort`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ idResort: 3 });
    put.flush({});

    api.removeResort(16).subscribe();
    const del = http.expectOne(`${URL}/16/managed-resort`);
    expect(del.request.method).toBe('DELETE');
    del.flush({});
  });
});
