import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { Me } from '../../../core/api/auth.models';
import { RentalUnit, RentalUnitRequest } from '../../../core/api/resort.models';
import { SessionService } from '../../../core/session/session.service';
import { Units } from './units';

const API = `${environment.apiUrl}/api/rental-units`;

const admin: Me = {
  idClient: 2,
  firstName: 'Admin',
  lastName: 'Mar del Plata',
  email: 'admin.mdp@zolea.com',
  role: 'ADMIN',
  idManagedResort: 7,
};

function unit(overrides: Partial<RentalUnit> = {}): RentalUnit {
  return {
    idRentalUnit: 1,
    type: 'UMBRELLA',
    identifier: 'A-01',
    dailyPrice: 8500,
    isBlocked: false,
    resortId: 7,
    ...overrides,
  };
}

const sombrilla = unit();
const carpa = unit({ idRentalUnit: 2, type: 'TENT', identifier: 'C-01', dailyPrice: 14500 });
const bloqueada = unit({ idRentalUnit: 3, identifier: 'A-08', isBlocked: true });

describe('Units', () => {
  let fixture: ComponentFixture<Units>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    // jsdom no trae los métodos de <dialog>.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    await TestBed.configureTestingModule({
      imports: [Units],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { user: signal<Me | null>(admin) } },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Units);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  /** Deja correr lo que espera un pedido, sin esperar a que termine el HTTP. */
  const flushMicrotasks = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
  };

  async function respondWith(units: RentalUnit[]): Promise<void> {
    http.expectOne(API).flush(units);
    await fixture.whenStable();
  }

  const rows = () => Array.from(page.querySelectorAll('tbody tr'));
  const cells = (row: Element) =>
    Array.from(row.querySelectorAll('td')).map((cell) =>
      cell.textContent!.replace(/\s+/g, ' ').trim(),
    );
  const fieldErrors = () =>
    Array.from(page.querySelectorAll('.z-field__error')).map((e) => e.textContent!.trim());
  /** El error que muestra el campo con ese id, o `null` si no muestra ninguno. */
  const errorOf = (inputId: string) =>
    page
      .querySelector(`#${inputId}`)!
      .closest('z-field')!
      .querySelector('.z-field__error')
      ?.textContent!.trim() ?? null;

  function button(text: string): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent!.includes(text),
    );
  }

  function rowOf(identifier: string): Element {
    return rows().find((row) => row.textContent!.includes(identifier))!;
  }

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    control.value = value;
    // Un <select> real dispara los dos eventos; Signal Forms escucha `input`.
    control.dispatchEvent(new Event('input'));
    if (control instanceof HTMLSelectElement) control.dispatchEvent(new Event('change'));
  }

  async function openCreate(): Promise<void> {
    button('Nueva unidad')!.click();
    await fixture.whenStable();
  }

  async function fillCreate(identifier: string, price: string, kind = 'TENT'): Promise<void> {
    type('#unit-type', kind);
    type('#unit-identifier', identifier);
    type('#unit-price', price);
    await fixture.whenStable();
  }

  async function submitCreate(): Promise<void> {
    button('Crear unidad')!.click();
    await flushMicrotasks();
  }

  describe('los cuatro estados', () => {
    it('cargando: el esqueleto, sin tabla', () => {
      expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(page.querySelector('table')).toBeNull();
      http.expectOne(API);
    });

    it('con unidades: la tabla con identificador, tipo, precio y estado', async () => {
      await respondWith([carpa, bloqueada, sombrilla]);

      const headers = Array.from(page.querySelectorAll('th')).map((th) => th.textContent!.trim());
      expect(headers).toEqual(['Unidad', 'Tipo', 'Precio por día', 'Estado', 'Acciones']);
      // En orden de identificador, con los números en orden.
      expect(rows().map((row) => cells(row)[0])).toEqual(['A-01', 'A-08', 'C-01']);
      expect(cells(rowOf('C-01')).slice(0, 4)).toEqual([
        'C-01',
        'Carpa',
        expect.stringContaining('14.500,00'),
        'Disponible',
      ]);
      expect(page.querySelector('.units__summary')!.textContent).toContain(
        '3 unidades · 1 bloqueada',
      );
    });

    it('la bloqueada va en neutro y ofrece desbloquear', async () => {
      await respondWith([sombrilla, bloqueada]);

      const status = rowOf('A-08').querySelector('.z-status')!;
      expect(status.classList).toContain('z-status--neutral');
      expect(status.textContent).toContain('Bloqueada');
      expect(rowOf('A-08').textContent).toContain('Desbloquear');
      expect(rowOf('A-01').querySelector('.z-status')!.classList).toContain('z-status--confirmed');
    });

    it('vacío: lo explica y ofrece crear la primera', async () => {
      await respondWith([]);

      expect(page.querySelector('table')).toBeNull();
      expect(page.querySelector('z-empty')!.textContent).toContain('Todavía no cargaste unidades');
    });

    it('con error: lo dice y Reintentar vuelve a pedir', async () => {
      http.expectOne(API).flush({ error: 'x' }, { status: 500, statusText: 'x' });
      await fixture.whenStable();

      expect(page.querySelector('z-problem')!.textContent).toContain(
        'No pudimos traer las unidades',
      );

      button('Reintentar')!.click();
      await respondWith([sombrilla]);
      expect(rows()).toHaveLength(1);
    });
  });

  describe('crear', () => {
    beforeEach(async () => {
      await respondWith([sombrilla]);
      await openCreate();
    });

    it('el formulario tiene tipo, identificador y precio, con su etiqueta visible', () => {
      const labels = Array.from(page.querySelectorAll('.z-field__label')).map((l) =>
        l.textContent!.trim(),
      );
      expect(labels).toEqual(['Tipo', 'Identificador', 'Precio por día']);
    });

    it('arma el pedido con el balneario de la sesión y la unidad nueva entra a la tabla', async () => {
      await fillCreate('C-07', '14500.5');
      await submitCreate();

      const req = http.expectOne(API);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual<RentalUnitRequest>({
        type: 'TENT',
        identifier: 'C-07',
        dailyPrice: 14500.5,
        isBlocked: false,
        resortId: 7,
      });
      req.flush(unit({ idRentalUnit: 9, type: 'TENT', identifier: 'C-07', dailyPrice: 14500.5 }));
      await flushMicrotasks();
      await fixture.whenStable();

      expect(rows().map((row) => cells(row)[0])).toEqual(['A-01', 'C-07']);
      expect(page.querySelector('z-alert')!.textContent).toContain('Creamos la Carpa C-07');
    });

    it('con precio 0 no envía y avisa en el campo', async () => {
      await fillCreate('C-07', '0');
      await submitCreate();
      await fixture.whenStable();

      http.expectNone(API);
      expect(errorOf('unit-price')).toBe('El precio tiene que ser mayor que cero.');
      expect(fieldErrors()).toHaveLength(1);
    });

    it('sin identificador ni precio no envía', async () => {
      await submitCreate();
      await fixture.whenStable();

      http.expectNone(API);
      expect(fieldErrors()).toEqual([
        'Escribí el identificador de la unidad.',
        'Escribí el precio por día.',
      ]);
    });

    it('un identificador repetido en el balneario se marca en su campo', async () => {
      await fillCreate('A-01', '8500', 'UMBRELLA');
      await submitCreate();

      http
        .expectOne(API)
        .flush(
          { error: 'Ya existe una unidad con el identificador A-01' },
          { status: 400, statusText: 'x' },
        );
      await flushMicrotasks();
      await fixture.whenStable();

      // Debajo del campo del identificador, y no en el aviso de arriba del formulario.
      expect(errorOf('unit-identifier')).toBe('Ya existe una unidad con el identificador A-01');
      expect(errorOf('unit-price')).toBeNull();
      expect(page.querySelector('form z-alert')).toBeNull();
      expect(page.querySelector('#unit-identifier')!.getAttribute('aria-invalid')).toBe('true');
      expect(rows()).toHaveLength(1);
    });

    it('un conflicto de la base (409) también cae en el identificador', async () => {
      await fillCreate('A-02', '8500');
      await submitCreate();

      http.expectOne(API).flush({ error: 'x' }, { status: 409, statusText: 'x' });
      await flushMicrotasks();
      await fixture.whenStable();

      expect(errorOf('unit-identifier')).toBe(
        'Ya existe una unidad con ese identificador en tu balneario.',
      );
      expect(page.querySelector('form z-alert')).toBeNull();
    });

    it('los errores por campo del backend van cada uno en su campo', async () => {
      await fillCreate('C-07', '10');
      await submitCreate();

      http.expectOne(API).flush(
        {
          error: 'Hay datos inválidos en el pedido',
          campos: { dailyPrice: 'El precio diario tiene que ser mayor que cero' },
        },
        { status: 400, statusText: 'x' },
      );
      await flushMicrotasks();
      await fixture.whenStable();

      expect(fieldErrors()).toEqual(['El precio diario tiene que ser mayor que cero']);
    });

    it('un error sin campo, como no tener conexión, va en un aviso arriba del formulario', async () => {
      await fillCreate('C-07', '10');
      await submitCreate();

      http.expectOne(API).error(new ProgressEvent('error'));
      await flushMicrotasks();
      await fixture.whenStable();

      expect(page.querySelector('form z-alert')!.textContent).toContain('No hay conexión');
    });
  });

  describe('cambiar el precio', () => {
    beforeEach(async () => {
      await respondWith([sombrilla, carpa]);
    });

    async function openPrice(identifier: string): Promise<void> {
      Array.from(rowOf(identifier).querySelectorAll('button'))
        .find((b) => b.textContent!.includes('Precio'))!
        .click();
      await fixture.whenStable();
    }

    it('se edita en la fila y se manda como newPrice en la dirección', async () => {
      await openPrice('A-01');
      const input = page.querySelector<HTMLInputElement>('#unit-new-price')!;
      expect(input.value).toBe('8500');

      type('#unit-new-price', '9000');
      await fixture.whenStable();
      button('Guardar')!.click();
      await flushMicrotasks();

      const req = http.expectOne((r) => r.url === `${API}/1/price`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.params.get('newPrice')).toBe('9000');
      req.flush({ ...sombrilla, dailyPrice: 9000 });
      await flushMicrotasks();
      await fixture.whenStable();

      expect(page.querySelector('#unit-new-price')).toBeNull();
      expect(cells(rowOf('A-01'))[2]).toContain('9.000,00');
    });

    it('con precio 0 no envía', async () => {
      await openPrice('A-01');
      type('#unit-new-price', '0');
      await fixture.whenStable();
      button('Guardar')!.click();
      await flushMicrotasks();
      await fixture.whenStable();

      http.expectNone((r) => r.url === `${API}/1/price`);
      expect(fieldErrors()).toEqual(['El precio tiene que ser mayor que cero.']);
    });

    it('si el backend lo rechaza, el motivo queda debajo del campo y sigue editando', async () => {
      await openPrice('A-01');
      type('#unit-new-price', '10');
      await fixture.whenStable();
      button('Guardar')!.click();
      await flushMicrotasks();

      http
        .expectOne((r) => r.url === `${API}/1/price`)
        .flush(
          { error: 'El precio tiene que ser mayor que cero' },
          { status: 400, statusText: 'x' },
        );
      await flushMicrotasks();
      await fixture.whenStable();

      expect(fieldErrors()).toEqual(['El precio tiene que ser mayor que cero']);
      expect(page.querySelector('#unit-new-price')).not.toBeNull();
    });

    it('Cancelar deja el precio como estaba', async () => {
      await openPrice('A-01');
      type('#unit-new-price', '9999');
      button('Cancelar')!.click();
      await fixture.whenStable();

      expect(page.querySelector('#unit-new-price')).toBeNull();
      expect(cells(rowOf('A-01'))[2]).toContain('8.500,00');
    });
  });

  describe('bloquear y desbloquear', () => {
    beforeEach(async () => {
      await respondWith([sombrilla, bloqueada]);
    });

    const dialog = () => page.querySelector<HTMLDialogElement>('dialog')!;

    function ask(identifier: string, verb: string): void {
      Array.from(rowOf(identifier).querySelectorAll('button'))
        .find((b) => b.textContent!.includes(verb))!
        .click();
    }

    it('pide confirmación antes de bloquear y, si se vuelve atrás, no manda nada', async () => {
      ask('A-01', 'Bloquear');
      await fixture.whenStable();

      expect(dialog().hasAttribute('open')).toBe(true);
      expect(dialog().textContent).toContain('¿Bloqueás la Sombrilla A-01?');
      http.expectNone((r) => r.url.endsWith('/block'));

      Array.from(dialog().querySelectorAll('button'))
        .find((b) => b.textContent!.includes('Dejarla disponible'))!
        .click();
      await fixture.whenStable();

      expect(dialog().hasAttribute('open')).toBe(false);
      http.expectNone((r) => r.url.endsWith('/block'));
    });

    it('confirmado, bloquea con isBlocked=true y la fila pasa a bloqueada', async () => {
      ask('A-01', 'Bloquear');
      await fixture.whenStable();
      Array.from(dialog().querySelectorAll('button'))
        .find((b) => b.textContent!.includes('Bloquear unidad'))!
        .click();

      const req = http.expectOne((r) => r.url === `${API}/1/block`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.params.get('isBlocked')).toBe('true');
      req.flush({ ...sombrilla, isBlocked: true });
      await fixture.whenStable();

      expect(rowOf('A-01').querySelector('.z-status')!.textContent).toContain('Bloqueada');
      expect(dialog().hasAttribute('open')).toBe(false);
      expect(page.querySelector('.units__summary')!.textContent).toContain('2 bloqueadas');
    });

    it('confirmado, desbloquea con isBlocked=false', async () => {
      ask('A-08', 'Desbloquear');
      await fixture.whenStable();
      expect(dialog().textContent).toContain('¿Desbloqueás la Sombrilla A-08?');
      Array.from(dialog().querySelectorAll('button'))
        .find((b) => b.textContent!.includes('Desbloquear unidad'))!
        .click();

      const req = http.expectOne((r) => r.url === `${API}/3/block`);
      expect(req.request.params.get('isBlocked')).toBe('false');
      req.flush({ ...bloqueada, isBlocked: false });
      await fixture.whenStable();

      expect(rowOf('A-08').querySelector('.z-status')!.textContent).toContain('Disponible');
    });

    it('si falla, cierra la confirmación y avisa sin cambiar la fila', async () => {
      ask('A-01', 'Bloquear');
      await fixture.whenStable();
      Array.from(dialog().querySelectorAll('button'))
        .find((b) => b.textContent!.includes('Bloquear unidad'))!
        .click();

      http
        .expectOne((r) => r.url === `${API}/1/block`)
        .flush({ error: 'La unidad es de otro balneario' }, { status: 403, statusText: 'x' });
      await fixture.whenStable();

      expect(page.querySelector('z-alert')!.textContent).toContain(
        'La unidad es de otro balneario',
      );
      expect(rowOf('A-01').querySelector('.z-status')!.textContent).toContain('Disponible');
    });
  });
});
