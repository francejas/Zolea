import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Me } from '../api/auth.models';
import { SessionService } from '../session/session.service';
import { authGuard } from './auth.guard';
import { roleGuard } from './role.guard';

const client: Me = {
  idClient: 1,
  firstName: 'Santi',
  lastName: 'Rodriguez',
  email: 'santi.rodriguez@gmail.com',
  role: 'USER',
  idManagedResort: null,
};
const admin: Me = {
  ...client,
  idClient: 2,
  email: 'admin.mdp@zolea.com',
  role: 'ADMIN',
  idManagedResort: 7,
};

describe('guards', () => {
  const user = signal<Me | null>(null);
  let router: Router;

  beforeEach(() => {
    user.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionService,
          useValue: { user, isLoggedIn: () => user() !== null },
        },
      ],
    });
    router = TestBed.inject(Router);
  });

  function run(guard: CanActivateFn, url: string) {
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  }

  const target = (result: unknown) => router.serializeUrl(result as UrlTree);

  describe('authGuard', () => {
    it('sin sesión manda a /login con la ruta pedida en volver', () => {
      const result = run(authGuard, '/my-bookings');

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).queryParams).toEqual({ volver: '/my-bookings' });
      expect(target(result)).toMatch(/^\/login\?volver=/);
    });

    it('conserva los parámetros de la ruta pedida', () => {
      const result = run(authGuard, '/bookings/5?x=1');

      expect((result as UrlTree).queryParams).toEqual({ volver: '/bookings/5?x=1' });
    });

    it('con sesión deja pasar', () => {
      user.set(client);
      expect(run(authGuard, '/my-bookings')).toBe(true);
    });
  });

  describe('roleGuard', () => {
    it('deja pasar al cliente en una ruta de cliente', () => {
      user.set(client);
      expect(run(roleGuard('USER'), '/my-bookings')).toBe(true);
    });

    it('deja pasar al administrador en una ruta de administrador', () => {
      user.set(admin);
      expect(run(roleGuard('ADMIN'), '/admin')).toBe(true);
    });

    it('manda al cliente que pide una ruta de administrador a /', () => {
      user.set(client);
      expect(target(run(roleGuard('ADMIN'), '/admin'))).toBe('/');
    });

    it('manda al administrador que pide una ruta de cliente a /admin', () => {
      user.set(admin);
      expect(target(run(roleGuard('USER'), '/my-bookings'))).toBe('/admin');
    });

    it('sin sesión manda al login, por si se usa sin authGuard', () => {
      const result = run(roleGuard('ADMIN'), '/admin');

      expect((result as UrlTree).queryParams).toEqual({ volver: '/admin' });
      expect(target(result)).toMatch(/^\/login\?/);
    });
  });
});
