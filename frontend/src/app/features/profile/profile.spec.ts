import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Me } from '../../core/api/auth.models';
import { Client } from '../../core/api/client.models';
import { SessionService } from '../../core/session/session.service';
import { Profile } from './profile';

@Component({ template: '' })
class Destination {}

const API = `${environment.apiUrl}/api/clients`;

const nati: Client = {
  idClient: 16,
  firstName: 'Natalia',
  lastName: 'Romero',
  email: 'nati.romero@gmail.com',
  phone: '2235551234',
  dni: '38111222',
};

const me: Me = {
  idClient: 16,
  firstName: 'Natalia',
  lastName: 'Romero',
  email: 'nati.romero@gmail.com',
  role: 'USER',
  idManagedResort: null,
};

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Profile', () => {
  let fixture: ComponentFixture<Profile>;
  let http: HttpTestingController;
  let page: HTMLElement;
  let router: Router;
  let session: {
    user: () => Me | null;
    reloadUser: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    session = {
      user: () => me,
      reloadUser: vi.fn(() => of(me)),
      clear: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [Profile],
      providers: [
        provideRouter([{ path: 'login', component: Destination }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: session },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  /** Deja correr lo que queda pendiente después de un pedido: las promesas de `submit()`. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  async function open(client: Client = nati): Promise<void> {
    fixture = TestBed.createComponent(Profile);
    page = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne(`${API}/16`).flush(client);
    await settle();
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  const submitButton = () => page.querySelector<HTMLButtonElement>('form button[type="submit"]')!;

  async function save(): Promise<void> {
    submitButton().click();
    await settle();
  }

  const fieldText = (selector: string) => text(page.querySelector(selector)!.closest('z-field'));

  it('carga los datos de la cuenta en el formulario, y la contraseña vacía', async () => {
    await open();

    expect(page.querySelector<HTMLInputElement>('#profile-first-name')!.value).toBe('Natalia');
    expect(page.querySelector<HTMLInputElement>('#profile-last-name')!.value).toBe('Romero');
    expect(page.querySelector<HTMLInputElement>('#profile-email')!.value).toBe(
      'nati.romero@gmail.com',
    );
    expect(page.querySelector<HTMLInputElement>('#profile-phone')!.value).toBe('2235551234');
    expect(page.querySelector<HTMLInputElement>('#profile-dni')!.value).toBe('38111222');
    expect(page.querySelector<HTMLInputElement>('#profile-password')!.value).toBe('');
  });

  it('guarda todos los datos sin la contraseña si está vacía, avisa y actualiza la barra', async () => {
    await open();

    await type('#profile-phone', '2235559999');
    await save();

    const put = http.expectOne(`${API}/16`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      firstName: 'Natalia',
      lastName: 'Romero',
      email: 'nati.romero@gmail.com',
      phone: '2235559999',
      dni: '38111222',
    });
    put.flush({ ...nati, phone: '2235559999' });
    await settle();

    expect(text(page.querySelector('.z-alert--success'))).toContain('Guardamos tus datos');
    expect(session.reloadUser).toHaveBeenCalled();
    expect(session.clear).not.toHaveBeenCalled();
  });

  it('una contraseña nueva tiene que repetirse igual, y entonces viaja', async () => {
    await open();

    await type('#profile-password', 'nueva1234');
    await type('#profile-password-repeat', 'otra1234');
    await save();

    http.expectNone(`${API}/16`);
    expect(fieldText('#profile-password-repeat')).toContain('Las contraseñas no coinciden.');

    await type('#profile-password-repeat', 'nueva1234');
    await save();

    const put = http.expectOne(`${API}/16`);
    expect(put.request.body.password).toBe('nueva1234');
    expect(put.request.body).not.toHaveProperty('passwordRepeat');
    put.flush(nati);
    await settle();

    // Después de guardar, los dos campos quedan vacíos otra vez.
    expect(page.querySelector<HTMLInputElement>('#profile-password')!.value).toBe('');
    expect(page.querySelector<HTMLInputElement>('#profile-password-repeat')!.value).toBe('');
  });

  it('con las validaciones de Crear cuenta: un nombre vacío no manda nada', async () => {
    await open();

    await type('#profile-first-name', '');
    await type('#profile-email', 'nati.romero');
    await save();

    http.expectNone(`${API}/16`);
    expect(fieldText('#profile-first-name')).toContain('Escribí tu nombre.');
    expect(fieldText('#profile-email')).toContain('El email no tiene un formato válido.');
  });

  it('un email, teléfono o DNI de otra cuenta (409) queda debajo de su campo', async () => {
    await open();

    await type('#profile-dni', '40111222');
    await save();
    http.expectOne(`${API}/16`).flush(
      {
        error: 'Ya hay otra cuenta con ese DNI.',
        campos: { dni: 'Ya hay otra cuenta con ese DNI.' },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(fieldText('#profile-dni')).toContain('Ya hay otra cuenta con ese DNI.');
    expect(page.querySelector('.z-alert--success')).toBeNull();
    expect(page.querySelector('.z-alert--danger')).toBeNull();
  });

  it('un email nuevo avisa antes, cierra la sesión al guardar y manda a Ingresar', async () => {
    await open();
    const navigate = vi.spyOn(router, 'navigate');

    expect(text(submitButton())).toBe('Guardar cambios');
    await type('#profile-email', 'natalia.romero@gmail.com');

    expect(fieldText('#profile-email')).toContain('vas a tener que ingresar de nuevo');
    expect(text(submitButton())).toBe('Guardar y volver a ingresar');

    await save();
    http.expectOne(`${API}/16`).flush({ ...nati, email: 'natalia.romero@gmail.com' });
    await settle();

    expect(session.clear).toHaveBeenCalled();
    expect(session.reloadUser).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { motivo: 'email-nuevo' } });
  });

  it('el mismo email con otras mayúsculas no cuenta como nuevo', async () => {
    await open();

    await type('#profile-email', '  Nati.Romero@gmail.com ');

    expect(text(submitButton())).toBe('Guardar cambios');
  });

  it('si falla la carga, deja reintentar', async () => {
    fixture = TestBed.createComponent(Profile);
    page = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne(`${API}/16`).flush({ error: 'x' }, { status: 500, statusText: 'Error' });
    await settle();

    expect(page.textContent).toContain('No pudimos traer tus datos');
    expect(page.querySelector('form')).toBeNull();

    Array.from(page.querySelectorAll('button'))
      .find((b) => text(b) === 'Reintentar')!
      .click();
    await fixture.whenStable();
    http.expectOne(`${API}/16`).flush(nati);
    await settle();

    expect(page.querySelector('form')).not.toBeNull();
  });

  it('sin cuenta de cliente en la sesión, lo dice en lugar de quedar cargando', async () => {
    session.user = () => null;
    fixture = TestBed.createComponent(Profile);
    page = fixture.nativeElement;
    fixture.detectChanges();
    await settle();

    http.expectNone(`${API}/16`);
    expect(page.textContent).toContain('Volvé a ingresar');
  });
});
