import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { SessionService } from '../session/session.service';
import { authInterceptor } from './auth.interceptor';

const API = environment.apiUrl;
const TOKEN_KEY = 'zolea.token';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let session: SessionService;
  let navigate: ReturnType<typeof vi.spyOn>;

  function setup(token: string | null = 'abc'): void {
    localStorage.clear();
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  }

  afterEach(() => {
    controller.verify();
    localStorage.clear();
  });

  describe('header Authorization', () => {
    it('se agrega a los pedidos al backend cuando hay token', () => {
      setup('abc');
      http.get(`${API}/api/resorts`).subscribe();
      const req = controller.expectOne(`${API}/api/resorts`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
      req.flush([]);
    });

    it('no se agrega si no hay token', () => {
      setup(null);
      http.get(`${API}/api/resorts`).subscribe();
      const req = controller.expectOne(`${API}/api/resorts`);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush([]);
    });

    it('no se manda a otros sitios', () => {
      setup('abc');
      http.get('https://otro-sitio.com/datos').subscribe();
      const req = controller.expectOne('https://otro-sitio.com/datos');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });
  });

  describe('401', () => {
    it('limpia la sesión y navega al login con el motivo', () => {
      setup('vencido');
      const clear = vi.spyOn(session, 'clear');
      http.get(`${API}/api/bookings`).subscribe({ error: () => undefined });
      controller
        .expectOne(`${API}/api/bookings`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(clear).toHaveBeenCalledTimes(1);
      expect(session.token()).toBeNull();
      expect(navigate).toHaveBeenCalledWith('/login?motivo=sesion-vencida');
    });

    it('en el login no redirige ni limpia, y el error le llega a la pantalla', () => {
      setup(null);
      const clear = vi.spyOn(session, 'clear');
      let status: number | undefined;
      http.post(`${API}/api/auth/login`, {}).subscribe({ error: (e) => (status = e.status) });
      controller
        .expectOne(`${API}/api/auth/login`)
        .flush(
          { message: 'Email o contraseña incorrectos.' },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(status).toBe(401);
      expect(clear).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('en /me no redirige: lo maneja restore()', () => {
      setup('vencido');
      http.get(`${API}/api/auth/me`).subscribe({ error: () => undefined });
      controller
        .expectOne(`${API}/api/auth/me`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(navigate).not.toHaveBeenCalled();
    });

    it('un 401 de otro sitio no toca la sesión', () => {
      setup('abc');
      http.get('https://otro-sitio.com/datos').subscribe({ error: () => undefined });
      controller
        .expectOne('https://otro-sitio.com/datos')
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(session.token()).toBe('abc');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('403 y otros errores', () => {
    it('un 403 no hace nada especial y vuelve a lanzar el error', () => {
      setup('abc');
      const clear = vi.spyOn(session, 'clear');
      let status: number | undefined;
      http.get(`${API}/api/bookings/9`).subscribe({ error: (e) => (status = e.status) });
      controller
        .expectOne(`${API}/api/bookings/9`)
        .flush(null, { status: 403, statusText: 'Forbidden' });

      expect(status).toBe(403);
      expect(clear).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(session.token()).toBe('abc');
    });

    it('un 401 también vuelve a lanzar el error', () => {
      setup('abc');
      let status: number | undefined;
      http.get(`${API}/api/bookings`).subscribe({ error: (e) => (status = e.status) });
      controller
        .expectOne(`${API}/api/bookings`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(status).toBe(401);
    });
  });
});