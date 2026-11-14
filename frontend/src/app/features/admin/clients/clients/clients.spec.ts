import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Clients } from './clients';
import { environment } from '../../../../../environments/environment';
import { ResortClient } from '../../../../core/api/resort-client.models';
import { filterClients } from '../client-filters';
import { money } from '../../../../shared/utils/format';

const API = `${environment.apiUrl}/api/clients`;

const registered: ResortClient = {
  idClient: 7,
  fullName: 'Ángela Pérez',
  dni: '30111222',
  email: 'angela@example.com',
  phone: '2235551234',
  walkIn: false,
  bookingCount: 3,
  totalSpent: 12345.67,
  bookings: [
    {
      idBooking: 81,
      startDate: '2026-11-15',
      endDate: '2026-11-17',
      rentalUnitIdentifier: 'C-01',
      status: 'CONFIRMED',
      totalPrice: 100,
    },
  ],
};

const walkIn: ResortClient = {
  idClient: null,
  fullName: 'José Gómez',
  dni: '40999888',
  email: null,
  phone: null,
  walkIn: true,
  bookingCount: 1,
  totalSpent: 700,
  bookings: [],
};

const clients = [walkIn, registered];

describe('filterClients', () => {
  it('busca sin tildes ni mayúsculas y recorta espacios', () => {
    expect(filterClients(clients, '  ANGELA perez ')).toEqual([registered]);
    expect(filterClients(clients, 'jose')).toEqual([walkIn]);
    expect(filterClients(clients, 'GÓMEZ')).toEqual([walkIn]);
  });

  it('busca por DNI completo, parcial o con puntos', () => {
    expect(filterClients(clients, '30111222')).toEqual([registered]);
    expect(filterClients(clients, '999')).toEqual([walkIn]);
    expect(filterClients(clients, '30.111.222')).toEqual([registered]);
  });

  it('ordena por nombre sin modificar la lista original', () => {
    expect(filterClients(clients, '')).toEqual([registered, walkIn]);
    expect(clients).toEqual([walkIn, registered]);
  });

  it('admite DNI nulo y búsquedas sin resultados', () => {
    expect(filterClients([{ ...walkIn, dni: null }], '999')).toEqual([]);
    expect(filterClients(clients, 'inexistente')).toEqual([]);
    expect(filterClients([], '')).toEqual([]);
  });
});

describe('Clients', () => {
  let fixture: ComponentFixture<Clients>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal ??= function () {
      this.setAttribute('open', '');
    };

    HTMLDialogElement.prototype.close ??= function () {
      this.removeAttribute('open');
    };

    await TestBed.configureTestingModule({
      imports: [Clients],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Clients);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  async function respond(data = clients): Promise<void> {
    const req = http.expectOne(API);

    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);

    req.flush(data);
    await fixture.whenStable();
  }

  function search(value: string): void {
    const input = page.querySelector<HTMLInputElement>('#client-search')!;

    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  const rows = () => Array.from(page.querySelectorAll('.clients__row'));

  it('muestra carga mientras espera la API', async () => {
    expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(rows()).toHaveLength(0);

    await respond([]);
  });

  it('muestra el vacío del balneario', async () => {
    await respond([]);

    expect(page.textContent).toContain('Todavía nadie reservó en tu balneario');
    expect(page.querySelector('#client-search')).toBeNull();
  });

  it('muestra el error y permite reintentar', async () => {
    http.expectOne(API).flush(
      {
        error: 'No se pudo consultar',
      },
      {
        status: 500,
        statusText: 'Error',
      },
    );

    await fixture.whenStable();

    expect(page.querySelector('z-problem')!.textContent).toContain('No se pudo consultar');

    page.querySelector<HTMLButtonElement>('z-problem button')!.click();

    await respond();

    expect(rows()).toHaveLength(2);
  });

  it('ordena por nombre y usa cantidad y total del backend, sin recalcularlos', async () => {
    await respond();

    expect(rows()[0].textContent).toContain('Ángela Pérez');

    expect(rows()[0].querySelector('[data-label="Reservas"]')!.textContent!.trim()).toBe('3');

    expect(rows()[0].querySelector('[data-label="Total gastado"]')!.textContent).toContain(
      money(12345.67),
    );

    expect(rows()[0].textContent).toContain('angela@example.com');
    expect(rows()[0].textContent).toContain('2235551234');
    expect(rows()[0].textContent).not.toContain('Sin cuenta');
  });

  it('marca al titular de mostrador Sin cuenta y no muestra email ni teléfono', async () => {
    await respond([
      {
        ...walkIn,
        email: 'no-mostrar@example.com',
        phone: '123456',
      },
    ]);

    expect(rows()[0].textContent).toContain('Sin cuenta');
    expect(rows()[0].textContent).not.toContain('no-mostrar@example.com');
    expect(rows()[0].textContent).not.toContain('123456');
  });

  it('filtra localmente por nombre y DNI, y permite limpiar una búsqueda vacía', async () => {
    await respond();

    search('ANGELA');
    await fixture.whenStable();

    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Ángela Pérez');

    search('40999888');
    await fixture.whenStable();

    expect(rows()[0].textContent).toContain('José Gómez');

    search('nadie');
    await fixture.whenStable();

    expect(rows()).toHaveLength(0);

    page.querySelector<HTMLButtonElement>('z-empty button')!.click();
    await fixture.whenStable();

    expect(rows()).toHaveLength(2);

    http.expectNone(API);
  });

  it('abre el historial de la respuesta y enlaza al detalle con idBooking', async () => {
    await respond();

    rows()[0].querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();

    const dialog = page.querySelector<HTMLDialogElement>('dialog')!;

    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Historial de Ángela Pérez');
    expect(dialog.textContent).toContain('15/11/2026');
    expect(dialog.textContent).toContain('17/11/2026');
    expect(dialog.textContent).toContain('C-01');
    expect(dialog.textContent).toContain('Confirmada');
    expect(dialog.textContent).toContain(money(100));

    expect(dialog.querySelector('a')!.getAttribute('href')).toBe('/admin/bookings/81');

    http.expectNone(API);

    dialog.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();

    expect(dialog.open).toBe(false);
  });

  it('distingue personas de mostrador aunque ambas tengan idClient nulo', async () => {
    await respond([
      walkIn,
      {
        ...walkIn,
        fullName: 'Ana López',
        dni: '10101010',
      },
    ]);

    expect(rows()).toHaveLength(2);

    rows()[1].querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();

    expect(page.querySelector('dialog')!.textContent).toContain('Historial de José Gómez');

    expect(page.querySelector('dialog')!.textContent).toContain('No hay reservas para mostrar.');
  });
});
