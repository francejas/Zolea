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
    retired: false,
    ...overrides,
  };
}

const sombrilla = unit();
const carpa = unit({ idRentalUnit: 2, type: 'TENT', identifier: 'C-01', dailyPrice: 14500 });
const bloqueada = unit({ idRentalUnit: 3, identifier: 'A-08', isBlocked: true });
const dadaDeBaja = unit({ idRentalUnit: 4, identifier: 'A-09', retired: true });

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
    // El tipo son dos botones a la vista: se toca el que corresponde.
    page.querySelector<HTMLInputElement>(`.units__type-field input[value="${kind}"]`)!.click();
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
        expect.stringContaining('14.500'),
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
      expect(cells(rowOf('A-01'))[2]).toContain('9.000');
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
      expect(cells(rowOf('A-01'))[2]).toContain('8.500');
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

  describe('reservas por delante', () => {
    const conReservas = unit({
      idRentalUnit: 5,
      identifier: 'B-02',
      upcomingBookings: 2,
      nextBookingDate: '2026-12-14',
    });
    const conUna = unit({
      idRentalUnit: 6,
      identifier: 'B-03',
      upcomingBookings: 1,
      nextBookingDate: '2026-12-01',
    });
    const sinReservas = unit({ upcomingBookings: 0, nextBookingDate: null });

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 27, 12));
      await respondWith([sinReservas, conReservas, conUna]);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const dialog = () => page.querySelector<HTMLDialogElement>('dialog')!;
    const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();

    async function askBlock(identifier: string): Promise<void> {
      Array.from(rowOf(identifier).querySelectorAll('button'))
        .find((b) => b.textContent!.includes('Bloquear'))!
        .click();
      await fixture.whenStable();
    }

    it('la tabla dice cuántas tiene junto al estado, y nada si no tiene', () => {
      const upcoming = (identifier: string) =>
        rowOf(identifier).querySelector('td[data-label="Estado"] .units__upcoming')?.textContent;

      expect(upcoming('B-02')).toBe('2 reservas por delante');
      expect(upcoming('B-03')).toBe('1 reserva por delante');
      expect(upcoming('A-01')).toBeUndefined();
      expect(cells(rowOf('A-01'))[3]).toBe('Disponible');
    });

    it('bloquear una unidad con reservas avisa cuántas, la próxima y que siguen valiendo', async () => {
      await askBlock('B-02');

      expect(text(dialog())).toContain(
        'Tiene 2 reservas por delante (la próxima, el lun 14 dic). Siguen valiendo: bloquear solo evita reservas nuevas.',
      );
    });

    it('con una sola, lo dice en singular', async () => {
      await askBlock('B-03');

      expect(text(dialog())).toContain(
        'Tiene 1 reserva por delante (el mar 1 dic). Sigue valiendo: bloquear solo evita reservas nuevas.',
      );
    });

    it('bloquear una sin reservas no muestra el aviso', async () => {
      await askBlock('A-01');

      expect(dialog().textContent).toContain('¿Bloqueás la Sombrilla A-01?');
      expect(dialog().textContent).not.toContain('por delante');
      expect(dialog().textContent).not.toContain('reservas que ya tiene');
    });
  });

  describe('filtrar', () => {
    beforeEach(async () => {
      await respondWith([sombrilla, carpa, bloqueada, dadaDeBaja]);
    });

    const identifiers = () => rows().map((row) => cells(row)[0]);
    function choose(id: string, value: string): void {
      const select = page.querySelector<HTMLSelectElement>(`#${id}`)!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    }

    const summary = () => page.querySelector('.units__summary')!;
    const typeInput = (type: 'TENT' | 'UMBRELLA') =>
      page.querySelector<HTMLInputElement>(`.units__type-filter input[value="${type}"]`)!;
    const typesChecked = () => [typeInput('TENT').checked, typeInput('UMBRELLA').checked];

    it('por defecto muestra disponibles y bloqueadas, sin las dadas de baja', () => {
      expect(identifiers()).toEqual(['A-01', 'A-08', 'C-01']);
      expect(typesChecked()).toEqual([false, false]);
      expect(page.querySelector<HTMLSelectElement>('#filter-status')!.value).toBe('ACTIVE');
      expect(summary().getAttribute('role')).toBe('status');
      expect(summary().textContent).toContain('3 de 4 unidades · 1 bloqueada · 1 dada de baja');
    });

    it('con el filtro por defecto, Quitar los filtros está deshabilitado', () => {
      expect(button('Quitar los filtros')!.disabled).toBe(true);
    });

    it('por tipo, y el resumen dice cuántas muestra de cuántas hay', async () => {
      expect(page.querySelector('#filter-type')).toBeNull();

      typeInput('TENT').click();
      await fixture.whenStable();
      expect(identifiers()).toEqual(['C-01']);
      expect(summary().textContent).toContain('1 de 4 unidades');
      expect(button('Quitar los filtros')!.disabled).toBe(false);

      typeInput('TENT').click();
      typeInput('UMBRELLA').click();
      await fixture.whenStable();
      expect(identifiers()).toEqual(['A-01', 'A-08']);
    });

    it('Carpas y Sombrillas se marcan juntas: con las dos se ven todas', async () => {
      typeInput('TENT').click();
      typeInput('UMBRELLA').click();
      await fixture.whenStable();

      expect(typesChecked()).toEqual([true, true]);
      expect(identifiers()).toEqual(['A-01', 'A-08', 'C-01']);
    });

    it('por estado: disponibles, bloqueadas, dadas de baja o todas', async () => {
      choose('filter-status', 'AVAILABLE');
      await fixture.whenStable();
      expect(identifiers()).toEqual(['A-01', 'C-01']);

      choose('filter-status', 'BLOCKED');
      await fixture.whenStable();
      expect(identifiers()).toEqual(['A-08']);

      choose('filter-status', 'RETIRED');
      await fixture.whenStable();
      expect(identifiers()).toEqual(['A-09']);

      choose('filter-status', 'ALL');
      await fixture.whenStable();
      expect(identifiers()).toEqual(['A-01', 'A-08', 'A-09', 'C-01']);
    });

    it('si nada coincide lo dice y Quitar los filtros vuelve al listado', async () => {
      typeInput('TENT').click();
      choose('filter-status', 'BLOCKED');
      await fixture.whenStable();

      expect(page.querySelector('table')).toBeNull();
      expect(page.querySelector('z-empty')!.textContent).toContain(
        'Ninguna unidad coincide con los filtros',
      );

      page.querySelector<HTMLButtonElement>('z-empty button')!.click();
      await fixture.whenStable();
      expect(identifiers()).toEqual(['A-01', 'A-08', 'C-01']);
      expect(typesChecked()).toEqual([false, false]);
      expect(page.querySelector<HTMLSelectElement>('#filter-status')!.value).toBe('ACTIVE');
    });

    it('el botón de los filtros vuelve al filtro por defecto', async () => {
      choose('filter-status', 'RETIRED');
      await fixture.whenStable();
      expect(identifiers()).toEqual(['A-09']);

      button('Quitar los filtros')!.click();
      await fixture.whenStable();
      expect(identifiers()).toEqual(['A-01', 'A-08', 'C-01']);
      expect(button('Quitar los filtros')!.disabled).toBe(true);
    });

    it('la dada de baja va en neutro, sin acciones y con su nombre', async () => {
      choose('filter-status', 'RETIRED');
      await fixture.whenStable();

      const row = rowOf('A-09');
      expect(row.querySelector('.z-status')!.textContent).toContain('Dada de baja');
      expect(row.querySelector('.z-status')!.classList).toContain('z-status--neutral');
      expect(row.querySelectorAll('button')).toHaveLength(0);
    });
  });

  describe('dar de baja', () => {
    beforeEach(async () => {
      await respondWith([sombrilla, carpa]);
    });

    const retireDialog = () =>
      page.querySelector<HTMLDialogElement>('dialog[aria-labelledby="retire-title"]')!;

    async function ask(identifier: string): Promise<void> {
      Array.from(rowOf(identifier).querySelectorAll('button'))
        .find((b) => b.textContent!.includes('Dar de baja'))!
        .click();
      await fixture.whenStable();
    }

    const confirm = () =>
      Array.from(retireDialog().querySelectorAll('button'))
        .filter((b) => b.textContent!.includes('Dar de baja'))
        .at(-1)!;

    it('pide confirmación, avisa que es definitivo y, si se vuelve atrás, no manda nada', async () => {
      await ask('A-01');

      expect(retireDialog().hasAttribute('open')).toBe(true);
      expect(retireDialog().textContent).toContain('¿Das de baja la Sombrilla A-01?');
      expect(retireDialog().textContent).toContain('Es definitivo');

      Array.from(retireDialog().querySelectorAll('button'))
        .find((b) => b.textContent!.includes('Dejarla como está'))!
        .click();
      await fixture.whenStable();

      expect(retireDialog().hasAttribute('open')).toBe(false);
      http.expectNone((r) => r.url.endsWith('/retire'));
    });

    it('confirmado, hace PATCH /retire y la fila pasa a dada de baja', async () => {
      await ask('A-01');
      confirm().click();

      const req = http.expectOne(`${API}/1/retire`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ ...sombrilla, retired: true });
      await fixture.whenStable();

      // Sale de la tabla por defecto, que no muestra las dadas de baja.
      expect(rows().map((row) => cells(row)[0])).toEqual(['C-01']);
      expect(retireDialog().hasAttribute('open')).toBe(false);
      expect(page.querySelector('z-alert')!.textContent).toContain(
        'La Sombrilla A-01 se dio de baja',
      );
      expect(page.querySelector('.units__summary')!.textContent).toContain(
        '1 de 2 unidades · 1 dada de baja',
      );
      // La fila del botón se fue: el foco queda en el resumen, no en el body.
      expect(document.activeElement).toBe(page.querySelector('.units__summary'));
    });

    it('usa la unidad tal como la devuelve el backend', async () => {
      await ask('A-01');
      confirm().click();
      http.expectOne(`${API}/1/retire`).flush({ ...sombrilla, retired: false });
      await fixture.whenStable();

      expect(rows().map((row) => cells(row)[0])).toEqual(['A-01', 'C-01']);
    });

    it('con reservas por delante (400) muestra el motivo en la confirmación y no cambia la fila', async () => {
      await ask('A-01');
      confirm().click();

      http
        .expectOne(`${API}/1/retire`)
        .flush(
          { error: 'Tiene reservas por delante: cancelalas o esperá a que terminen.' },
          { status: 400, statusText: 'x' },
        );
      await fixture.whenStable();

      expect(retireDialog().hasAttribute('open')).toBe(true);
      expect(retireDialog().querySelector('z-alert')!.textContent).toContain(
        'Tiene reservas por delante: cancelalas o esperá a que terminen.',
      );
      expect(rows()).toHaveLength(2);
      expect(rowOf('A-01').querySelector('.z-status')!.textContent).toContain('Disponible');
    });

    it('también se puede dar de baja una bloqueada', async () => {
      http.verify();
      fixture = TestBed.createComponent(Units);
      page = fixture.nativeElement;
      fixture.detectChanges();
      await respondWith([bloqueada]);

      await ask('A-08');
      confirm().click();
      http.expectOne(`${API}/3/retire`).flush({ ...bloqueada, retired: true });
      await fixture.whenStable();

      // Sin unidades en servicio, el vacío lo dice y deja ver las dadas de baja.
      expect(page.querySelector('z-empty')!.textContent).toContain(
        'No te quedan unidades en servicio',
      );
      expect(button('Quitar los filtros')!.disabled).toBe(true);

      button('Ver las dadas de baja')!.click();
      await fixture.whenStable();
      expect(rows().map((row) => cells(row)[0])).toEqual(['A-08']);
    });
  });
});
