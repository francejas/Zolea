import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { Me } from './core/api/auth.models';
import { SessionService } from './core/session/session.service';
import { routes } from './app.routes';
import { Login } from './features/auth/login/login';
import { SiteLayout } from './layout/site-layout/site-layout';

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

describe('routes', () => {
  const user = signal<Me | null>(null);
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    user.set(null);
    // jsdom no trae matchMedia ni los métodos de <dialog>, que usa AdminLayout.
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        // AdminLayout pide /api/resorts/my: el pedido queda sin responder, no importa acá.
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            user,
            isLoggedIn: computed(() => user() !== null),
            isAdmin: computed(() => user()?.role === 'ADMIN'),
            logout: vi.fn(),
            // El login real se prueba en login.spec.ts: acá solo deja la sesión del cliente puesta.
            login: vi.fn(() => {
              user.set(client);
              return of(client);
            }),
          },
        },
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  afterEach(() => vi.unstubAllGlobals());

  const heading = () => {
    harness.detectChanges();
    return (harness.routeNativeElement as HTMLElement).querySelector('h1')?.textContent;
  };

  it('el sitio lleva la barra superior y el panel la barra lateral', async () => {
    const page = () => harness.routeNativeElement as HTMLElement;

    await harness.navigateByUrl('/');
    expect(page().querySelector('.z-topbar')).not.toBeNull();
    expect(page().querySelector('.z-sidebar')).toBeNull();

    user.set(admin);
    await harness.navigateByUrl('/admin/units');
    expect(page().querySelector('.z-sidebar')).not.toBeNull();
    expect(page().querySelector('.z-topbar')).toBeNull();
  });

  it('sin sesión, /my-bookings lleva al login con volver', async () => {
    await harness.navigateByUrl('/my-bookings');

    expect(router.url.startsWith('/login')).toBe(true);
    expect(router.parseUrl(router.url).queryParams).toEqual({ volver: '/my-bookings' });
    expect(heading()).toBe('Ingresar');
  });

  it('sin sesión, /my-bookings lleva al login y, después de ingresar, vuelve a Mis reservas', async () => {
    const login = await harness.navigateByUrl('/my-bookings', SiteLayout);
    const page = harness.routeNativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = page.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };

    expect(router.url).toContain('/login');
    type('#login-email', 'santi.rodriguez@gmail.com');
    type('#login-password', 'admin123');
    await harness.fixture.whenStable();
    page.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await harness.fixture.whenStable();

    expect(router.url).toBe('/my-bookings');
    expect(heading()).toBe('Mis reservas');
  });

  it('sin sesión, /admin lleva al login', async () => {
    await harness.navigateByUrl('/admin');

    expect(router.parseUrl(router.url).queryParams).toEqual({ volver: '/admin' });
  });

  it('las rutas públicas se abren sin sesión', async () => {
    for (const [url, title] of [
      ['/', '¿Qué es Zolea?'],
      ['/resorts/3', 'Ficha de balneario'],
      ['/login', 'Ingresar'],
      ['/register', 'Crear cuenta'],
    ]) {
      await harness.navigateByUrl(url);
      expect(router.url).toBe(url);
      expect(heading()).toBe(title);
    }
  });

  it('el cliente entra a todas las rutas de cliente', async () => {
    user.set(client);
    for (const url of [
      '/dashboard',
      '/book/2',
      '/my-bookings',
      '/bookings/9',
      '/profile',
      '/payment/success',
      '/payment/pending',
      '/payment/failure',
    ]) {
      await harness.navigateByUrl(url);
      expect(router.url).toBe(url);
    }
  });

  it('el cliente que escribe /admin a mano rebota a /', async () => {
    user.set(client);
    await harness.navigateByUrl('/admin');

    expect(router.url).toBe('/');
    expect(heading()).toBe('¿Qué es Zolea?');
  });

  it('el cliente tampoco entra a las subrutas del panel', async () => {
    user.set(client);
    await harness.navigateByUrl('/admin/validate');

    expect(router.url).toBe('/');
  });

  it('el administrador entra a todas las rutas del panel', async () => {
    user.set(admin);
    for (const url of [
      '/admin',
      '/admin/resort',
      '/admin/units',
      '/admin/amenities',
      '/admin/bookings',
      '/admin/bookings/4',
      '/admin/clients',
      '/admin/walkin',
      '/admin/validate',
    ]) {
      await harness.navigateByUrl(url);
      expect(router.url).toBe(url);
    }
  });

  it('el administrador que pide una ruta de cliente va a /admin', async () => {
    user.set(admin);
    await harness.navigateByUrl('/my-bookings');

    expect(router.url).toBe('/admin');
    expect(heading()).toBe('Panel');
  });

  it('una dirección que no existe muestra «No encontramos esta página»', async () => {
    await harness.navigateByUrl('/no-existe');
    expect(heading()).toBe('No encontramos esta página');

    user.set(admin);
    await harness.navigateByUrl('/admin/no-existe');
    expect(heading()).toBe('No encontramos esta página');
  });
});
