import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../../environments/environment';
import { LoginResponse, Me } from '../../../core/api/auth.models';
import { SessionService } from '../../../core/session/session.service';
import { homeFor, Login, resolveBackTo } from './login';

const API = `${environment.apiUrl}/api/auth`;

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

/** Un destino cualquiera: lo que importa de estas pantallas es la URL a la que se llega. */
@Component({ template: '' })
class Destination {}

describe('Login', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let router: Router;
  let session: SessionService;
  let page: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        // El guard no está acá: se prueba aparte. Estas rutas son solo los destinos posibles.
        provideRouter(
          [
            { path: 'login', component: Login },
            { path: '', pathMatch: 'full', component: Destination },
            { path: 'admin', component: Destination },
            { path: 'my-bookings', component: Destination },
            { path: 'bookings/:id', component: Destination },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  async function open(url = '/login'): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, Login);
    await harness.fixture.whenStable();
    page = harness.routeNativeElement as HTMLElement;
  }

  /** Deja correr lo que espera un pedido o una navegación, sin esperar a que termine el HTTP. */
  const flushMicrotasks = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
  };

  const emailInput = () => page.querySelector<HTMLInputElement>('#login-email')!;
  const passwordInput = () => page.querySelector<HTMLInputElement>('#login-password')!;
  const submitButton = () => page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const toggleButton = () => page.querySelector<HTMLButtonElement>('.z-icon-btn')!;
  const alerts = () => Array.from(page.querySelectorAll('z-alert'));
  const fieldErrors = () =>
    Array.from(page.querySelectorAll('.z-field__error')).map((e) => e.textContent!.trim());

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function fillAndSubmit(email: string, password: string): Promise<void> {
    type(emailInput(), email);
    type(passwordInput(), password);
    await harness.fixture.whenStable();
    submitButton().click();
    await flushMicrotasks();
  }

  /**
   * Responde el login y el `/me` que le sigue, y espera a que termine de navegar. Devuelve el
   * cuerpo que viajó en el login.
   */
  async function succeedAs(me: Me): Promise<unknown> {
    const login = http.expectOne(`${API}/login`);
    login.flush({ token: 'jwt-de-prueba', clientId: me.idClient, role: me.role } as LoginResponse);
    await flushMicrotasks();
    http.expectOne(`${API}/me`).flush(me);
    await flushMicrotasks();
    await harness.fixture.whenStable();
    return login.request.body;
  }

  describe('la pantalla', () => {
    it('tiene el título, los dos campos con su etiqueta visible y el enlace a crear cuenta', async () => {
      await open();

      expect(page.querySelector('h1')!.textContent).toBe('Ingresar');
      const labels = Array.from(page.querySelectorAll('.z-field__label')).map((l) =>
        l.textContent!.trim(),
      );
      expect(labels).toEqual(['Email', 'Contraseña']);
      expect(page.querySelector('label[for="login-email"]')).not.toBeNull();
      expect(page.querySelector('label[for="login-password"]')).not.toBeNull();

      const link = page.querySelector<HTMLAnchorElement>('.login__alt a')!;
      expect(link.textContent!.trim()).toBe('Crear cuenta');
      expect(link.getAttribute('href')).toBe('/register');
    });

    it('el modelo tiene exactamente email y contraseña, y el botón no está cargando', async () => {
      await open();

      expect(emailInput().type).toBe('email');
      expect(passwordInput().type).toBe('password');
      expect(passwordInput().autocomplete).toBe('current-password');
      expect(submitButton().getAttribute('aria-busy')).toBeNull();
      expect(alerts()).toHaveLength(0);
    });

    it('con motivo=sesion-vencida avisa arriba del formulario', async () => {
      await open('/login?motivo=sesion-vencida');

      expect(alerts()).toHaveLength(1);
      expect(alerts()[0].textContent).toContain('Tu sesión venció. Volvé a ingresar.');
      expect(alerts()[0].compareDocumentPosition(page.querySelector('form')!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('sin ese motivo no hay aviso, ni con otro valor', async () => {
      await open('/login?motivo=otra-cosa');

      expect(alerts()).toHaveLength(0);
    });
  });

  describe('la contraseña', () => {
    it('se muestra y se oculta sin perder lo escrito', async () => {
      await open();
      type(passwordInput(), 'admin123');
      await harness.fixture.whenStable();

      expect(toggleButton().getAttribute('aria-label')).toBe('Mostrar contraseña');
      expect(toggleButton().getAttribute('aria-pressed')).toBe('false');

      toggleButton().click();
      await harness.fixture.whenStable();
      expect(passwordInput().type).toBe('text');
      expect(passwordInput().value).toBe('admin123');
      expect(toggleButton().getAttribute('aria-label')).toBe('Ocultar contraseña');
      expect(toggleButton().getAttribute('aria-pressed')).toBe('true');

      toggleButton().click();
      await harness.fixture.whenStable();
      expect(passwordInput().type).toBe('password');
      expect(passwordInput().value).toBe('admin123');
    });

    it('el botón no envía el formulario', async () => {
      await open();

      expect(toggleButton().type).toBe('button');
      toggleButton().click();
      await flushMicrotasks();
      // `http.verify()` de afterEach falla si salió algún pedido.
    });
  });

  describe('las validaciones', () => {
    it('vacío, no envía nada y marca los dos campos debajo de cada uno', async () => {
      await open();

      submitButton().click();
      await flushMicrotasks();
      await harness.fixture.whenStable();

      expect(fieldErrors()).toEqual(['Este campo es obligatorio.', 'Este campo es obligatorio.']);
      expect(emailInput().getAttribute('aria-invalid')).toBe('true');
      expect(passwordInput().getAttribute('aria-invalid')).toBe('true');
      expect(alerts()).toHaveLength(0);
      // El foco va al primer campo con error.
      expect(document.activeElement).toBe(emailInput());
    });

    it('un email con formato inválido no se envía', async () => {
      await open();

      await fillAndSubmit('santi.rodriguez', 'admin123');
      await harness.fixture.whenStable();

      expect(fieldErrors()).toEqual(['El formato no es válido.']);
      expect(document.activeElement).toBe(emailInput());
    });

    it('con el email bien y sin contraseña, el error es solo el de la contraseña', async () => {
      await open();

      await fillAndSubmit('santi.rodriguez@gmail.com', '');
      await harness.fixture.whenStable();

      expect(fieldErrors()).toEqual(['Este campo es obligatorio.']);
      expect(document.activeElement).toBe(passwordInput());
    });

    it('un campo no muestra su error hasta que se lo toca', async () => {
      await open();

      expect(fieldErrors()).toEqual([]);
      emailInput().dispatchEvent(new Event('blur'));
      await harness.fixture.whenStable();
      expect(fieldErrors()).toEqual(['Este campo es obligatorio.']);
    });
  });

  describe('ingresar', () => {
    it('el cliente, sin volver, va a /', async () => {
      await open();
      await fillAndSubmit('santi.rodriguez@gmail.com', 'admin123');
      const body = await succeedAs(clientMe);

      expect(body).toEqual({ email: 'santi.rodriguez@gmail.com', password: 'admin123' });
      expect(router.url).toBe('/');
      expect(session.isLoggedIn()).toBe(true);
      expect(session.token()).toBe('jwt-de-prueba');
    });

    it('el administrador, sin volver, va a /admin', async () => {
      await open();
      await fillAndSubmit('admin.mdp@zolea.com', 'admin123');
      await succeedAs(adminMe);

      expect(router.url).toBe('/admin');
      expect(session.isAdmin()).toBe(true);
    });

    it('con volver, va a esa ruta, con sus parámetros', async () => {
      await open('/login?volver=%2Fmy-bookings');
      await fillAndSubmit('santi.rodriguez@gmail.com', 'admin123');
      await succeedAs(clientMe);

      expect(router.url).toBe('/my-bookings');
    });

    it('con volver a una ruta con parámetros, los conserva', async () => {
      await open('/login?volver=%2Fbookings%2F47%3Fpago%3Dok');
      await fillAndSubmit('santi.rodriguez@gmail.com', 'admin123');
      await succeedAs(clientMe);

      expect(router.url).toBe('/bookings/47?pago=ok');
    });

    it('con volver, el administrador también va a esa ruta: los guards lo reubican si hace falta', async () => {
      await open('/login?volver=%2Fadmin');
      await fillAndSubmit('admin.mdp@zolea.com', 'admin123');
      await succeedAs(adminMe);

      expect(router.url).toBe('/admin');
    });

    for (const volver of ['https://sitio.com', '//sitio.com', '/\\sitio.com', 'my-bookings']) {
      it(`un volver que no es una ruta interna («${volver}») se ignora: va al inicio del rol`, async () => {
        await open(`/login?volver=${encodeURIComponent(volver)}`);
        await fillAndSubmit('santi.rodriguez@gmail.com', 'admin123');
        await succeedAs(clientMe);

        expect(router.url).toBe('/');
      });
    }

    it('un volver al propio login se ignora', async () => {
      await open('/login?volver=%2Flogin%3Fmotivo%3Dsesion-vencida');
      await fillAndSubmit('admin.mdp@zolea.com', 'admin123');
      await succeedAs(adminMe);

      expect(router.url).toBe('/admin');
    });
  });

  describe('mientras el pedido está pendiente', () => {
    it('el botón queda cargando y no se envía dos veces', async () => {
      await open();
      await fillAndSubmit('santi.rodriguez@gmail.com', 'admin123');
      // Con el pedido en el aire no se espera a que la aplicación quede estable: se dibuja y se mira.
      harness.detectChanges();

      expect(submitButton().getAttribute('aria-busy')).toBe('true');
      expect(submitButton().disabled).toBe(true);
      expect(submitButton().querySelector('.z-spinner')).not.toBeNull();

      // Ni el botón, ni Enter en un campo (el submit del formulario) mandan otro pedido.
      submitButton().click();
      page.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();

      http.expectOne(`${API}/login`).flush(null, { status: 500, statusText: 'x' });
      await flushMicrotasks();
    });

    it('al terminar con error, el botón vuelve a estar disponible', async () => {
      await open();
      await fillAndSubmit('santi.rodriguez@gmail.com', 'mala');

      http
        .expectOne(`${API}/login`)
        .flush({ error: 'Email o contraseña incorrectos.' }, { status: 401, statusText: 'x' });
      await flushMicrotasks();
      await harness.fixture.whenStable();

      expect(submitButton().getAttribute('aria-busy')).toBeNull();
      expect(submitButton().disabled).toBe(false);
    });
  });

  describe('cuando falla', () => {
    async function failWith(status: number, body: string | number | boolean | object | null): Promise<void> {
      http.expectOne(`${API}/login`).flush(body, { status, statusText: 'x' });
      await flushMicrotasks();
      await harness.fixture.whenStable();
    }

    it('credenciales incorrectas: un solo aviso arriba, sin marcar ningún campo', async () => {
      await open();
      await fillAndSubmit('santi.rodriguez@gmail.com', 'mala');
      await failWith(401, { error: 'Email o contraseña incorrectos.' });

      expect(alerts()).toHaveLength(1);
      expect(alerts()[0].textContent).toContain('Email o contraseña incorrectos.');
      expect(alerts()[0].querySelector('.z-alert--danger')).not.toBeNull();
      expect(fieldErrors()).toEqual([]);
      expect(emailInput().getAttribute('aria-invalid')).toBeNull();
      expect(session.isLoggedIn()).toBe(false);
      expect(session.token()).toBeNull();
      expect(router.url).toBe('/login');
    });

    it('el mensaje es el mismo exista o no el email', async () => {
      await open();
      const messages: string[] = [];
      for (const email of ['santi.rodriguez@gmail.com', 'no.existe@gmail.com']) {
        type(emailInput(), email);
        type(passwordInput(), 'mala');
        await harness.fixture.whenStable();
        submitButton().click();
        await flushMicrotasks();
        await failWith(401, { error: 'Email o contraseña incorrectos.' });
        messages.push(alerts()[0].textContent!.trim());
      }

      expect(messages[0]).toBe(messages[1]);
      expect(messages[0]).toContain('Email o contraseña incorrectos.');
    });

    it('conserva lo escrito para reintentar', async () => {
      await open();
      await fillAndSubmit('santi.rodriguez@gmail.com', 'mala');
      await failWith(401, { error: 'Email o contraseña incorrectos.' });

      expect(emailInput().value).toBe('santi.rodriguez@gmail.com');
      expect(passwordInput().value).toBe('mala');
    });

    it('sin conexión, usa el mensaje de toUserMessage', async () => {
      await open();
      await fillAndSubmit('santi.rodriguez@gmail.com', 'admin123');
      http.expectOne(`${API}/login`).error(new ProgressEvent('error'), { status: 0 });
      await flushMicrotasks();
      await harness.fixture.whenStable();

      expect(alerts()).toHaveLength(1);
      expect(alerts()[0].textContent).toContain('No hay conexión con el servidor.');
    });

    it('un error del servidor no muestra detalles de la cuenta', async () => {
      await open();
      await fillAndSubmit('santi.rodriguez@gmail.com', 'admin123');
      await failWith(500, null);

      expect(alerts()[0].textContent).toContain('Algo salió mal. Probá de nuevo.');
    });

    it('el error de ingresar tapa al de sesión vencida: nunca hay dos avisos', async () => {
      await open('/login?motivo=sesion-vencida');
      expect(alerts()[0].textContent).toContain('Tu sesión venció');

      await fillAndSubmit('santi.rodriguez@gmail.com', 'mala');
      await failWith(401, { error: 'Email o contraseña incorrectos.' });

      expect(alerts()).toHaveLength(1);
      expect(alerts()[0].textContent).toContain('Email o contraseña incorrectos.');
    });

    it('al reintentar, el aviso anterior se borra', async () => {
      await open();
      await fillAndSubmit('santi.rodriguez@gmail.com', 'mala');
      await failWith(401, { error: 'Email o contraseña incorrectos.' });
      expect(alerts()).toHaveLength(1);

      type(passwordInput(), 'admin123');
      await harness.fixture.whenStable();
      submitButton().click();
      await flushMicrotasks();
      harness.detectChanges();
      expect(alerts()).toHaveLength(0);

      await succeedAs(clientMe);
      expect(router.url).toBe('/');
    });

    it('si falla `/me` después de guardar el token, la sesión queda limpia', async () => {
      await open();
      await fillAndSubmit('santi.rodriguez@gmail.com', 'admin123');
      http
        .expectOne(`${API}/login`)
        .flush({ token: 'jwt-de-prueba', clientId: 1, role: 'USER' } as LoginResponse);
      await flushMicrotasks();
      http.expectOne(`${API}/me`).flush(null, { status: 500, statusText: 'x' });
      await flushMicrotasks();
      await harness.fixture.whenStable();

      expect(session.token()).toBeNull();
      expect(localStorage.getItem('zolea.token')).toBeNull();
      expect(alerts()).toHaveLength(1);
    });
  });

  describe('la sesión', () => {
    it('al recargar después de ingresar, `restore()` la recupera con el token guardado', async () => {
      await open();
      await fillAndSubmit('admin.mdp@zolea.com', 'admin123');
      await succeedAs(adminMe);
      expect(localStorage.getItem('zolea.token')).toBe('jwt-de-prueba');

      // Una recarga: un SessionService nuevo, que lee el token del navegador.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      });
      const reloaded = TestBed.inject(SessionService);
      const reloadedHttp = TestBed.inject(HttpTestingController);

      reloaded.restore().subscribe();
      reloadedHttp.expectOne(`${API}/me`).flush(adminMe);

      expect(reloaded.isAdmin()).toBe(true);
      reloadedHttp.verify();
    });
  });
});

describe('homeFor', () => {
  it('el administrador va a /admin y el cliente a /', () => {
    expect(homeFor('ADMIN')).toBe('/admin');
    expect(homeFor('USER')).toBe('/');
  });
});

describe('resolveBackTo', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    router = TestBed.inject(Router);
  });

  const url = (volver: unknown) => {
    const tree = resolveBackTo(router, volver);
    return tree && router.serializeUrl(tree);
  };

  it('acepta una ruta interna, con sus parámetros', () => {
    expect(url('/my-bookings')).toBe('/my-bookings');
    expect(url('/bookings/47?pago=ok')).toBe('/bookings/47?pago=ok');
    expect(url('/admin/units')).toBe('/admin/units');
  });

  it('rechaza lo que no es una ruta interna', () => {
    for (const volver of [
      undefined,
      '',
      'my-bookings',
      'https://sitio.com',
      'javascript:alert(1)',
      '//sitio.com',
      '/\\sitio.com',
      '/ sitio',
      ['/my-bookings', '/admin'],
    ]) {
      expect(url(volver)).toBeNull();
    }
  });

  it('rechaza volver al login', () => {
    expect(url('/login')).toBeNull();
    expect(url('/login?motivo=sesion-vencida')).toBeNull();
    expect(url('/login/otra')).toBeNull();
  });
});
