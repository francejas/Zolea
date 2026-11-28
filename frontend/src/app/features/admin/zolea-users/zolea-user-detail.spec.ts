import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Account } from '../../../core/api/account.models';
import { Me } from '../../../core/api/auth.models';
import { ResortSummary } from '../../../core/api/resort.models';
import { SessionService } from '../../../core/session/session.service';
import { ZoleaUserDetail } from './zolea-user-detail';

const ACCOUNTS = `${environment.apiUrl}/api/accounts`;
const ALL_RESORTS = `${environment.apiUrl}/api/resorts/all`;

const account = (overrides: Partial<Account> = {}): Account => ({
  idClient: 16,
  firstName: 'Natalia',
  lastName: 'Romero',
  email: 'nati.romero@gmail.com',
  phone: '+54 223 4010010',
  dni: '40000016',
  type: 'CLIENT',
  active: true,
  managedResort: null,
  bookingCount: 3,
  ...overrides,
});

const zoleaMe: Me = {
  idClient: 1,
  firstName: 'Zolea',
  lastName: 'Plataforma',
  email: 'zolea@zolea.com',
  role: 'ADMIN',
  idManagedResort: null,
};

const resortSummary = (idResort: number, name: string): ResortSummary => ({
  idResort,
  name,
  location: 'Mar del Plata',
  active: true,
  unitCount: 10,
  admin: null,
});

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

describe('ZoleaUserDetail', () => {
  let fixture: ComponentFixture<ZoleaUserDetail>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };

    await TestBed.configureTestingModule({
      imports: [ZoleaUserDetail],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { user: signal(zoleaMe) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function open(id = '16'): Promise<void> {
    fixture = TestBed.createComponent(ZoleaUserDetail);
    fixture.componentRef.setInput('id', id);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function respondWith(value: Account, id = 16): Promise<void> {
    http.expectOne(`${ACCOUNTS}/${id}`).flush(value);
    await fixture.whenStable();
  }

  /** Deja correr lo que queda pendiente después de un pedido: las promesas de `submit()`. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  function button(label: string, within: ParentNode = page): HTMLButtonElement | undefined {
    return Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      text(b).includes(label),
    );
  }

  async function click(label: string, within?: ParentNode): Promise<void> {
    const target = button(label, within);
    if (!target) throw new Error(`No está el botón «${label}»`);
    target.click();
    await fixture.whenStable();
  }

  const dialog = () => page.querySelector<HTMLDialogElement>('dialog')!;
  const notice = () => text(page.querySelector('.user__notice'));

  describe('los estados', () => {
    it('cargando: el esqueleto', async () => {
      await open();
      expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
      await respondWith(account());
    });

    it('con la cuenta: sus datos, su tipo, sus reservas y si está activa', async () => {
      await open();
      await respondWith(account());

      expect(text(page.querySelector('h1'))).toBe('Natalia Romero');
      expect(text(page)).toContain('Activa');
      expect(text(page)).toContain('nati.romero@gmail.com');
      expect(text(page)).toContain('+54 223 4010010');
      expect(text(page)).toContain('40.000.016');
      expect(text(page)).toContain('Cliente');
      expect(text(page.querySelector('.user__bookings'))).toBe('3');
    });

    it('un administrador muestra el balneario que administra', async () => {
      await open();
      await respondWith(
        account({
          type: 'RESORT_ADMIN',
          managedResort: { idResort: 1, name: 'Zolea Club de Playa', active: true },
        }),
      );

      expect(text(page)).toContain('Administrador');
      expect(text(page.querySelector('.user__resort'))).toContain('Zolea Club de Playa');
    });

    it('una cuenta que no existe: la página 404', async () => {
      await open('999');
      http.expectOne(`${ACCOUNTS}/999`).flush({ error: 'x' }, { status: 404, statusText: 'x' });
      await fixture.whenStable();

      expect(page.querySelector('app-error-page')).not.toBeNull();
    });

    it('error: el problema con «Reintentar»', async () => {
      await open();
      http.expectOne(`${ACCOUNTS}/16`).flush(null, { status: 500, statusText: 'x' });
      await fixture.whenStable();

      expect(text(page)).toContain('No pudimos traer la cuenta');
      await click('Reintentar');
      await respondWith(account());
      expect(text(page.querySelector('h1'))).toBe('Natalia Romero');
    });
  });

  describe('desactivar y reactivar', () => {
    it('desactivar pide confirmación y, confirmado, la cuenta queda desactivada', async () => {
      await open();
      await respondWith(account());

      await click('Desactivar la cuenta');
      expect(dialog().open).toBe(true);
      expect(text(dialog())).toContain('¿Desactivar la cuenta de Natalia Romero?');

      await click('Desactivar la cuenta', dialog());
      const req = http.expectOne(`${ACCOUNTS}/16/inactive`);
      expect(req.request.method).toBe('PATCH');
      req.flush(account({ active: false }));
      await settle();

      expect(dialog().open).toBe(false);
      expect(text(page)).toContain('Desactivada');
      expect(notice()).toContain('Desactivamos la cuenta');
      expect(button('Reactivar la cuenta')).toBeDefined();
    });

    it('«Volver» cierra sin hacer nada', async () => {
      await open();
      await respondWith(account());

      await click('Desactivar la cuenta');
      await click('Volver', dialog());

      expect(dialog().open).toBe(false);
      http.expectNone(`${ACCOUNTS}/16/inactive`);
    });

    it('reactivar también se confirma', async () => {
      await open();
      await respondWith(account({ active: false }));

      await click('Reactivar la cuenta');
      expect(text(dialog())).toContain('¿Reactivar la cuenta de Natalia Romero?');
      await click('Reactivar la cuenta', dialog());
      http.expectOne(`${ACCOUNTS}/16/active`).flush(account({ active: true }));
      await settle();

      expect(text(page)).toContain('Activa');
      expect(notice()).toContain('Reactivamos la cuenta');
    });

    it('si el backend la rechaza con 400, vuelve a traer la cuenta y muestra el motivo', async () => {
      await open();
      await respondWith(account());

      await click('Desactivar la cuenta');
      await click('Desactivar la cuenta', dialog());
      http
        .expectOne(`${ACCOUNTS}/16/inactive`)
        .flush(
          { error: 'No podés desactivar tu propia cuenta.' },
          { status: 400, statusText: 'x' },
        );
      await settle();

      await respondWith(account());
      expect(text(page.querySelector('.user__error'))).toContain(
        'No podés desactivar tu propia cuenta.',
      );
    });
  });

  describe('la contraseña provisoria', () => {
    it('vacía, marca el campo y no manda nada', async () => {
      await open();
      await respondWith(account());

      await click('Poner una contraseña provisoria');
      await click('Poner la contraseña', dialog());
      await settle();

      expect(text(dialog().querySelector('.z-field__error'))).toContain(
        'Escribí una contraseña provisoria.',
      );
      http.expectNone(`${ACCOUNTS}/16/password`);
    });

    it('la manda y avisa que quedó puesta', async () => {
      await open();
      await respondWith(account());

      await click('Poner una contraseña provisoria');
      const input = dialog().querySelector<HTMLInputElement>('#user-password')!;
      input.value = 'provisoria1';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      await click('Poner la contraseña', dialog());

      const req = http.expectOne(`${ACCOUNTS}/16/password`);
      expect(req.request.body).toEqual({ password: 'provisoria1' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(dialog().open).toBe(false);
      expect(notice()).toContain('contraseña provisoria');
    });
  });

  describe('el balneario', () => {
    it('hacerla administradora: elige el balneario, confirma y queda como administradora', async () => {
      await open();
      await respondWith(account());

      await click('Hacerla administradora de un balneario');
      http
        .expectOne(ALL_RESORTS)
        .flush([resortSummary(1, 'Zolea Club de Playa'), resortSummary(2, 'Ocean View Resort')]);
      await fixture.whenStable();

      const select = dialog().querySelector<HTMLSelectElement>('#user-resort')!;
      select.value = '2';
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      await click('Asignar el balneario', dialog());

      const req = http.expectOne(`${ACCOUNTS}/16/managed-resort`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ idResort: 2 });
      req.flush(
        account({
          type: 'RESORT_ADMIN',
          managedResort: { idResort: 2, name: 'Ocean View Resort', active: true },
        }),
      );
      await settle();

      expect(text(page.querySelector('.user__resort'))).toContain('Ocean View Resort');
      expect(notice()).toContain('Ocean View Resort');
    });

    it('sin elegir un balneario, no manda nada', async () => {
      await open();
      await respondWith(account());

      await click('Hacerla administradora de un balneario');
      http.expectOne(ALL_RESORTS).flush([resortSummary(1, 'Zolea Club de Playa')]);
      await fixture.whenStable();
      await click('Asignar el balneario', dialog());
      await settle();

      expect(text(dialog())).toContain('Elegí un balneario.');
      http.expectNone(`${ACCOUNTS}/16/managed-resort`);
    });

    it('quitarle el balneario pide confirmación y la vuelve cliente', async () => {
      await open();
      await respondWith(
        account({
          type: 'RESORT_ADMIN',
          managedResort: { idResort: 1, name: 'Zolea Club de Playa', active: true },
        }),
      );

      await click('Quitarle el balneario');
      expect(text(dialog())).toContain('Zolea Club de Playa');
      await click('Quitarle el balneario', dialog());
      const req = http.expectOne(`${ACCOUNTS}/16/managed-resort`);
      expect(req.request.method).toBe('DELETE');
      req.flush(account());
      await settle();

      expect(text(page)).toContain('Cliente');
      expect(page.querySelector('.user__resort')).toBeNull();
    });
  });

  it('la propia cuenta de Zolea no se desactiva ni cambia de rol: lo dice', async () => {
    await open('1');
    await respondWith(
      account({ idClient: 1, firstName: 'Zolea', lastName: 'Plataforma', type: 'ZOLEA' }),
      1,
    );

    expect(button('Desactivar la cuenta')).toBeUndefined();
    expect(button('Hacerla administradora de un balneario')).toBeUndefined();
    expect(text(page)).toContain('Es tu cuenta');
  });
});
