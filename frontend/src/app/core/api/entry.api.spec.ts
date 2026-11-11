import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { EntryApi } from './entry.api';
import { GuestValidation } from './entry.models';

const URL = `${environment.apiUrl}/api/guests/validate`;

const valentina: GuestValidation = {
  idGuest: 4,
  fullName: 'Valentina García',
  rentalUnitIdentifier: 'A-03',
  message: '¡Acceso Permitido! Dirigirse a la unidad: A-03',
};

describe('EntryApi', () => {
  let api: EntryApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(EntryApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('validateQr hace POST /api/guests/validate/{qrToken}, sin cuerpo', () => {
    let result: GuestValidation | undefined;
    api.validateQr('tok-00004-A3-VAL1').subscribe((guest) => (result = guest));

    const req = http.expectOne(`${URL}/tok-00004-A3-VAL1`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(valentina);
    expect(result).toEqual(valentina);
  });

  it('validateDni hace POST /api/guests/validate/dni/{dni}, sin cuerpo', () => {
    let result: GuestValidation | undefined;
    api.validateDni('40123456').subscribe((guest) => (result = guest));

    const req = http.expectOne(`${URL}/dni/40123456`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(valentina);
    expect(result).toEqual(valentina);
  });

  it('un QR que no es de Zolea viaja escapado: no cambia la dirección del pedido', () => {
    api.validateQr('https://otro.sitio/a?b#c').subscribe({ error: () => {} });

    const req = http.expectOne(`${URL}/https%3A%2F%2Fotro.sitio%2Fa%3Fb%23c`);
    req.flush(
      { error: 'El código ingresado no existe o es incorrecto.' },
      {
        status: 404,
        statusText: 'Not Found',
      },
    );
  });
});
