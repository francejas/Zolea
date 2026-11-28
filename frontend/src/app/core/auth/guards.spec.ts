import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateChildFn,
  CanActivateFn,
  provideRouter,
  RedirectCommand,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Me } from '../api/auth.models';
import { SessionService } from '../session/session.service';
import { adminAreaGuard } from './admin-area.guard';
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
/** La cuenta de Zolea: un administrador sin balneario. */
const zolea: Me = { ...admin, idClient: 3, email: 'zolea@zolea.com', idManagedResort: null };

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

  function run(guard: CanActivateFn | CanActivateChildFn, url: string) {
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  }

  const target = (result: unknown) => router.serializeUrl(result as UrlTree);

  /** La página 403, con la barra de direcciones en lo que se pidió. */
  function isForbidden(result: unknown, requested: string): boolean {
    return (
      result instanceof RedirectCommand &&
      router.serializeUrl(result.redirectTo) === '/forbidden' &&
      result.navigationBehaviorOptions?.browserUrl === requested
    );
  }

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

    it('al cliente que pide una ruta de administrador le muestra el 403', () => {
      user.set(client);
      expect(isForbidden(run(roleGuard('ADMIN'), '/admin'), '/admin')).toBe(true);
    });

    it('al administrador que pide una ruta de cliente le muestra el 403', () => {
      user.set(admin);
      expect(isForbidden(run(roleGuard('USER'), '/my-bookings'), '/my-bookings')).toBe(true);
    });

    it('sin sesión manda al login, por si se usa sin authGuard', () => {
      const result = run(roleGuard('ADMIN'), '/admin');

      expect((result as UrlTree).queryParams).toEqual({ volver: '/admin' });
      expect(target(result)).toMatch(/^\/login\?/);
    });

    it('a la cuenta de Zolea que pide una ruta de cliente le muestra el 403', () => {
      user.set(zolea);
      expect(isForbidden(run(roleGuard('USER'), '/my-bookings'), '/my-bookings')).toBe(true);
    });
  });

  describe('adminAreaGuard', () => {
    it('deja a la cuenta de Zolea en el catálogo', () => {
      user.set(zolea);
      expect(run(adminAreaGuard, '/admin/amenities')).toBe(true);
      expect(run(adminAreaGuard, '/admin/amenities?x=1')).toBe(true);
    });

    it('deja a la cuenta de Zolea en Balnearios', () => {
      user.set(zolea);
      expect(run(adminAreaGuard, '/admin/resorts')).toBe(true);
    });

    it('deja a la cuenta de Zolea en Usuarios y en el detalle de una cuenta', () => {
      user.set(zolea);
      expect(run(adminAreaGuard, '/admin/users')).toBe(true);
      expect(run(adminAreaGuard, '/admin/users/16')).toBe(true);
    });

    it('a la cuenta de Zolea, en otra pantalla del panel, le muestra el 403', () => {
      user.set(zolea);
      for (const url of [
        '/admin',
        '/admin/resort',
        '/admin/units',
        '/admin/bookings/4',
        '/admin/validate',
      ]) {
        expect(isForbidden(run(adminAreaGuard, url), url)).toBe(true);
      }
    });

    it('deja al administrador de un balneario en el resto del panel', () => {
      user.set(admin);
      for (const url of ['/admin', '/admin/units', '/admin/bookings/4', '/admin/validate']) {
        expect(run(adminAreaGuard, url)).toBe(true);
      }
    });

    it('al administrador de un balneario que pide el catálogo le muestra el 403', () => {
      user.set(admin);
      expect(isForbidden(run(adminAreaGuard, '/admin/amenities'), '/admin/amenities')).toBe(true);
    });

    it('al administrador de un balneario que pide Balnearios le muestra el 403', () => {
      user.set(admin);
      expect(isForbidden(run(adminAreaGuard, '/admin/resorts'), '/admin/resorts')).toBe(true);
    });

    it('al administrador de un balneario que pide Usuarios le muestra el 403', () => {
      user.set(admin);
      for (const url of ['/admin/users', '/admin/users/16']) {
        expect(isForbidden(run(adminAreaGuard, url), url)).toBe(true);
      }
    });
  });
});
