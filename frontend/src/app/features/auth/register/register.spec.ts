import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../../environments/environment';
import { LoginResponse, Me } from '../../../core/api/auth.models';
import { ClientRequest } from '../../../core/api/client.models';
import { SessionService } from '../../../core/session/session.service';
import { Register } from './register';

const CLIENTS = `${environment.apiUrl}/api/clients`;
const AUTH = `${environment.apiUrl}/api/auth`;

const newClient: ClientRequest = {
  firstName: 'Lucía',
  lastName: 'Pérez',
  email: 'lucia.perez@gmail.com',
  phone: '2235123456',
  dni: '40123456',
  password: 'clave1234',
};
const newMe: Me = {
  idClient: 9,
  firstName: 'Lucía',
  lastName: 'Pérez',
  email: 'lucia.perez@gmail.com',
  role: 'USER',
  idManagedResort: null,
};

@Component({ template: '' })
class Destination {}

describe('Register', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let router: Router;
  let session: SessionService;
  let page: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'register', component: Register },
            { path: 'login', component: Destination },
            { path: '', pathMatch: 'full', component: Destination },
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

    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/register', Register);
    await harness.fixture.whenStable();
    page = harness.routeNativeElement as HTMLElement;
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  /** Deja correr lo que espera un pedido o una navegación, sin esperar a que termine el HTTP. */
  const flushMicrotasks = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
  };

  const input = (id: string) => page.querySelector<HTMLInputElement>(`#register-${id}`)!;
  const submitButton = () => page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const alerts = () => Array.from(page.querySelectorAll('z-alert'));
  const fieldErrors = () =>
    Array.from(page.querySelectorAll('.z-field__error')).map((e) => e.textContent!.trim());

  function type(id: string, value: string): void {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
  }

  async function fill(data: Partial<Record<string, string>> = {}): Promise<void> {
    const values = {
      'first-name': newClient.firstName,
      'last-name': newClient.lastName,
      email: newClient.email,
      phone: newClient.phone,
      dni: newClient.dni,
      password: newClient.password,
      ...data,
    };
    for (const [id, value] of Object.entries(values)) type(id, value!);
    await harness.fixture.whenStable();
  }

  async function submit(): Promise<void> {
    submitButton().click();
    await flushMicrotasks();
  }

  async function failWith(
    status: number,
    body: string | number | boolean | object | null,
  ): Promise<void> {
    http.expectOne(CLIENTS).flush(body, { status, statusText: 'x' });
    await flushMicrotasks();
    await harness.fixture.whenStable();
  }

  describe('la pantalla', () => {
    it('tiene el título, los seis campos con su etiqueta visible y el enlace a Ingresar', () => {
      expect(page.querySelector('h1')!.textContent).toBe('Crear cuenta');
      const labels = Array.from(page.querySelectorAll('.z-field__label')).map((l) =>
        l.textContent!.trim(),
      );
      expect(labels).toEqual(['Nombre', 'Apellido', 'Email', 'Teléfono', 'DNI', 'Contraseña']);

      const link = page.querySelector<HTMLAnchorElement>('.register__alt a')!;
      expect(link.textContent!.trim()).toBe('Ingresar');
      expect(link.getAttribute('href')).toBe('/login');
    });

    it('al abrir no hay avisos ni errores', () => {
      expect(alerts()).toHaveLength(0);
      expect(fieldErrors()).toEqual([]);
      expect(input('password').type).toBe('password');
      expect(input('password').autocomplete).toBe('new-password');
    });

    it('la contraseña se muestra y se oculta sin perder lo escrito', async () => {
      type('password', 'clave1234');
      const toggle = page.querySelector<HTMLButtonElement>('.z-icon-btn')!;
      expect(toggle.getAttribute('aria-label')).toBe('Mostrar contraseña');

      toggle.click();
      await harness.fixture.whenStable();
      expect(input('password').type).toBe('text');
      expect(input('password').value).toBe('clave1234');
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(toggle.getAttribute('aria-label')).toBe('Ocultar contraseña');

      toggle.click();
      await harness.fixture.whenStable();
      expect(input('password').type).toBe('password');
      expect(input('password').value).toBe('clave1234');
    });
  });

  describe('las validaciones', () => {
    it('vacío, no envía nada y marca los seis campos, con el foco en el primero', async () => {
      await submit();
      await harness.fixture.whenStable();

      expect(fieldErrors()).toEqual([
        'Escribí tu nombre.',
        'Escribí tu apellido.',
        'Escribí tu email.',
        'Escribí tu teléfono.',
        'Escribí tu DNI.',
        'Elegí una contraseña.',
      ]);
      expect(alerts()).toHaveLength(0);
      expect(document.activeElement).toBe(input('first-name'));
      // `http.verify()` de afterEach falla si salió algún pedido.
    });

    it('con datos incompletos no envía: el DNI también es obligatorio', async () => {
      await fill({ dni: '' });
      await submit();
      await harness.fixture.whenStable();

      expect(fieldErrors()).toEqual(['Escribí tu DNI.']);
      expect(document.activeElement).toBe(input('dni'));
    });

    it('un email mal escrito marca el error debajo del campo antes de enviar', async () => {
      type('email', 'lucia.perez');
      input('email').dispatchEvent(new Event('blur'));
      await harness.fixture.whenStable();

      expect(fieldErrors()).toEqual(['El email no tiene un formato válido.']);
      expect(input('email').getAttribute('aria-invalid')).toBe('true');
      const error = input('email').closest('z-field')!.querySelector('.z-field__error');
      expect(error).not.toBeNull();
    });

    it('con un email mal escrito no envía', async () => {
      await fill({ email: 'lucia.perez' });
      await submit();
      await harness.fixture.whenStable();

      expect(fieldErrors()).toEqual(['El email no tiene un formato válido.']);
      expect(document.activeElement).toBe(input('email'));
    });
  });

  describe('crear la cuenta', () => {
    it('crea la cuenta, entra directo y va a /', async () => {
      await fill();
      await submit();

      const create = http.expectOne(CLIENTS);
      expect(create.request.method).toBe('POST');
      expect(create.request.body).toEqual(newClient);
      create.flush({ idClient: 9, ...newClient, password: undefined });
      await flushMicrotasks();

      const login = http.expectOne(`${AUTH}/login`);
      expect(login.request.body).toEqual({ email: newClient.email, password: newClient.password });
      login.flush({ token: 'jwt-de-prueba', clientId: 9, role: 'USER' } as LoginResponse);
      await flushMicrotasks();
      http.expectOne(`${AUTH}/me`).flush(newMe);
      await flushMicrotasks();
      await harness.fixture.whenStable();

      expect(router.url).toBe('/');
      expect(session.isLoggedIn()).toBe(true);
      expect(session.user()!.firstName).toBe('Lucía');
    });

    it('mientras el pedido está pendiente, el botón queda cargando y no se envía dos veces', async () => {
      await fill();
      await submit();
      harness.detectChanges();

      expect(submitButton().getAttribute('aria-busy')).toBe('true');
      expect(submitButton().disabled).toBe(true);

      submitButton().click();
      page.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();

      http.expectOne(CLIENTS).flush(null, { status: 500, statusText: 'x' });
      await flushMicrotasks();
    });

    it('si la cuenta se crea pero no se puede ingresar, avisa y no navega', async () => {
      await fill();
      await submit();
      http.expectOne(CLIENTS).flush({ idClient: 9, ...newClient });
      await flushMicrotasks();
      http.expectOne(`${AUTH}/login`).flush(null, { status: 500, statusText: 'x' });
      await flushMicrotasks();
      await harness.fixture.whenStable();

      expect(alerts()).toHaveLength(1);
      expect(alerts()[0].textContent).toContain('Creamos tu cuenta, pero no pudimos ingresar');
      expect(session.isLoggedIn()).toBe(false);
      expect(router.url).toBe('/register');
    });
  });

  describe('los errores del backend', () => {
    it('con santi.rodriguez@gmail.com: «El email ya está registrado» en el aviso de arriba', async () => {
      await fill({ email: 'santi.rodriguez@gmail.com' });
      await submit();
      await failWith(409, { error: 'El email ya está registrado' });

      expect(alerts()).toHaveLength(1);
      expect(alerts()[0].textContent).toContain('El email ya está registrado');
      expect(alerts()[0].querySelector('.z-alert--danger')).not.toBeNull();
      expect(fieldErrors()).toEqual([]);
      expect(router.url).toBe('/register');
      expect(session.isLoggedIn()).toBe(false);
    });

    it('un teléfono o un DNI repetido también van en el aviso de arriba', async () => {
      await fill();
      await submit();
      await failWith(409, { error: 'El DNI ya está registrado' });

      expect(alerts()[0].textContent).toContain('El DNI ya está registrado');
      expect(fieldErrors()).toEqual([]);
    });

    it('un 400 con campos marca cada campo debajo, sin aviso de arriba', async () => {
      await fill();
      await submit();
      await failWith(400, {
        error: 'Datos inválidos',
        campos: {
          email: 'El email no tiene un formato válido',
          phone: 'El teléfono es obligatorio',
        },
      });

      expect(fieldErrors()).toEqual([
        'El email no tiene un formato válido',
        'El teléfono es obligatorio',
      ]);
      expect(alerts()).toHaveLength(0);
      expect(input('email').closest('z-field')!.textContent).toContain(
        'El email no tiene un formato válido',
      );
      expect(input('phone').closest('z-field')!.textContent).toContain(
        'El teléfono es obligatorio',
      );
      expect(document.activeElement).toBe(input('email'));
    });

    it('sin conexión, usa el mensaje de toUserMessage', async () => {
      await fill();
      await submit();
      http.expectOne(CLIENTS).error(new ProgressEvent('error'), { status: 0 });
      await flushMicrotasks();
      await harness.fixture.whenStable();

      expect(alerts()[0].textContent).toContain('No hay conexión con el servidor.');
    });

    it('al reintentar, el aviso anterior se borra y lo escrito se conserva', async () => {
      await fill({ email: 'santi.rodriguez@gmail.com' });
      await submit();
      await failWith(409, { error: 'El email ya está registrado' });
      expect(alerts()).toHaveLength(1);
      expect(input('email').value).toBe('santi.rodriguez@gmail.com');
      expect(input('password').value).toBe(newClient.password);

      type('email', newClient.email);
      await harness.fixture.whenStable();
      await submit();
      harness.detectChanges();
      expect(alerts()).toHaveLength(0);

      http.expectOne(CLIENTS).flush(null, { status: 500, statusText: 'x' });
      await flushMicrotasks();
    });
  });
});
