import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ClientRequest } from './client.models';
import { ClientsApi } from './clients.api';

describe('ClientsApi', () => {
  it('register hace POST /api/clients con el pedido', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const request: ClientRequest = {
      firstName: 'Lucía',
      lastName: 'Pérez',
      email: 'lucia.perez@gmail.com',
      phone: '2235123456',
      dni: '40123456',
      password: 'clave1234',
    };
    let created: unknown;

    TestBed.inject(ClientsApi)
      .register(request)
      .subscribe((client) => (created = client));

    const req = http.expectOne(`${environment.apiUrl}/api/clients`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ idClient: 9, ...request });
    expect(created).toMatchObject({ idClient: 9, email: 'lucia.perez@gmail.com' });
    http.verify();
  });
});
