import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoginResponse, Me } from '../api/auth.models';
import { SessionService } from './session.service';

const API = `${environment.apiUrl}/api/auth`;
const TOKEN_KEY = 'zolea.token';

const clientMe: Me = {
  idClient: 1,
  firstName: 'Santi',
  lastName: 'Rodriguez',
  email: 'santi.rodriguez@gmail.com',
  role: 'USER',
  idManagedResort: null,
};

const adminMe: Me = {
  idClient: 2,
  firstName: 'Admin',
  lastName: 'MDP',
  email: 'admin.mdp@zolea.com',
  role: 'ADMIN',
  idManagedResort: 7,
};

describe('SessionService', () => {
  let http: HttpTestingController;

  function setup(): SessionService {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(SessionService);
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  describe('login', () => {
    it('guarda el token y carga el usuario', () => {
      const session = setup();
      const response: LoginResponse = { token: 'abc', clientId: 1, role: 'USER' };

      session.login('santi.rodriguez@gmail.com', 'admin123').subscribe();

      const loginReq = http.expectOne(`${API}/login`);
      expect(loginReq.request.method).toBe('POST');
      expect(loginReq.request.body).toEqual({
        email: 'santi.rodriguez@gmail.com',
        password: 'admin123',
      });
      loginReq.flush(response);

      // El token ya está guardado cuando se pide /me.
      expect(session.token()).toBe('abc');
      expect(localStorage.getItem(TOKEN_KEY)).toBe('abc');

      const meReq = http.expectOne(`${API}/me`);
      expect(meReq.request.method).toBe('GET');
      meReq.flush(clientMe);

      expect(session.user()).toEqual(clientMe);
      expect(session.isLoggedIn()).toBe(true);
      expect(session.isAdmin()).toBe(false);
    });

    it('marca isAdmin y trae el balneario cuando entra un administrador', () => {
      const session = setup();

      session.login('admin.mdp@zolea.com', 'admin123').subscribe();
      http.expectOne(`${API}/login`).flush({ token: 't', clientId: 2, role: 'ADMIN' });
      http.expectOne(`${API}/me`).flush(adminMe);

      expect(session.isAdmin()).toBe(true);
      expect(session.user()?.idManagedResort).toBe(7);
    });

    it('con credenciales malas no guarda nada y propaga el error', () => {
      const session = setup();
      let status: number | undefined;

      session.login('x@x.com', 'mala').subscribe({ error: (e) => (status = e.status) });
      http
        .expectOne(`${API}/login`)
        .flush({ message: 'Credenciales inválidas' }, { status: 401, statusText: 'Unauthorized' });

      expect(status).toBe(401);
      expect(session.token()).toBeNull();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(session.isLoggedIn()).toBe(false);
    });

    it('si /me falla después del login, deja la sesión limpia', () => {
      const session = setup();
      let failed = false;

      session.login('a@a.com', 'x').subscribe({ error: () => (failed = true) });
      http.expectOne(`${API}/login`).flush({ token: 'abc', clientId: 1, role: 'USER' });
      http.expectOne(`${API}/me`).flush(null, { status: 500, statusText: 'Server Error' });

      expect(failed).toBe(true);
      expect(session.token()).toBeNull();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(session.user()).toBeNull();
    });
  });

  describe('restore', () => {
    it('sin token guardado no pide nada', () => {
      const session = setup();

      session.restore().subscribe();

      http.expectNone(`${API}/me`);
      expect(session.isLoggedIn()).toBe(false);
    });

    it('con un token válido carga el usuario', () => {
      localStorage.setItem(TOKEN_KEY, 'abc');
      const session = setup();

      session.restore().subscribe();
      http.expectOne(`${API}/me`).flush(adminMe);

      expect(session.user()).toEqual(adminMe);
      expect(session.isAdmin()).toBe(true);
      expect(session.token()).toBe('abc');
    });

    it('con un token inválido limpia todo sin avisar', () => {
      localStorage.setItem(TOKEN_KEY, 'vencido');
      const session = setup();
      let errored = false;
      let completed = false;

      session
        .restore()
        .subscribe({ error: () => (errored = true), complete: () => (completed = true) });
      http.expectOne(`${API}/me`).flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(errored).toBe(false);
      expect(completed).toBe(true);
      expect(session.token()).toBeNull();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(session.user()).toBeNull();
      expect(session.isLoggedIn()).toBe(false);
    });
  });

  describe('clear y logout', () => {
    function loggedIn(): SessionService {
      localStorage.setItem(TOKEN_KEY, 'abc');
      const session = setup();
      session.restore().subscribe();
      http.expectOne(`${API}/me`).flush(clientMe);
      return session;
    }

    it('clear borra token y usuario sin navegar', () => {
      const session = loggedIn();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

      session.clear();

      expect(session.token()).toBeNull();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(session.user()).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('logout limpia y vuelve a la portada', () => {
      const session = loggedIn();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      session.logout();

      expect(session.token()).toBeNull();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(session.isLoggedIn()).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/');
    });
  });
});