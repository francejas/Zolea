import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { WalkInBookingResponse } from '../../../core/api/booking.models';
import { RentalUnit, Resort } from '../../../core/api/resort.models';
import { aBooking, aGuest } from '../../bookings/booking.fixtures';
import { WalkIn } from './walkin';

const MY_RESORT = `${environment.apiUrl}/api/resorts/my`;
const WALKIN = `${environment.apiUrl}/api/bookings/walkin`;

const unit = (
  id: number,
  identifier: string,
  type: RentalUnit['type'],
  price: number,
  blocked = false,
): RentalUnit => ({
  idRentalUnit: id,
  type,
  identifier,
  dailyPrice: price,
  isBlocked: blocked,
  resortId: 1,
});

const myResort: Resort = {
  idResort: 1,
  name: 'Zolea Club de Playa',
  location: 'Mar del Plata, Buenos Aires',
  coverPhotoUrl: null,
  description: null,
  active: true,
  amenities: [],
  rentalUnits: [
    unit(1, 'A-01', 'UMBRELLA', 8500),
    unit(2, 'A-02', 'UMBRELLA', 8500, true),
    unit(3, 'C-01', 'TENT', 14500),
  ],
};

/** Los espacios de «$ 8.500,00» son no separables: se comparan como espacios comunes. */
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

describe('WalkIn', () => {
  let fixture: ComponentFixture<WalkIn>;
  let http: HttpTestingController;
  let page: HTMLElement;

  // Hoy es el 10 de enero de 2027: las fechas arrancan ahí.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2027, 0, 10, 12));

    TestBed.configureTestingModule({
      imports: [WalkIn],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** Deja correr lo que queda pendiente después de un pedido: las promesas de `submit()`. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(WalkIn);
    page = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(MY_RESORT).flush(myResort);
    await settle();
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  const button = (label: string) =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent!.includes(label),
    )!;
  const summary = () => text(page.querySelector('.walkin__summary'));

  /** Elige la unidad en la lista del plano: es la que usan el teclado y el lector de pantalla. */
  async function chooseUnit(identifier: string): Promise<void> {
    const cell = Array.from(page.querySelectorAll<HTMLButtonElement>('.z-unit')).find((b) =>
      b.getAttribute('aria-label')?.includes(identifier),
    )!;
    cell.click();
    await fixture.whenStable();
  }

  async function addGuest(name: string, dni: string): Promise<void> {
    const index = page.querySelectorAll('.walkin__guest').length;
    button('Agregar acompañante').click();
    await fixture.whenStable();
    await type(`#guest-name-${index}`, name);
    await type(`#guest-dni-${index}`, dni);
  }

  async function submit(): Promise<void> {
    page.querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();
    await settle();
  }

  const confirmed = (): WalkInBookingResponse => ({
    message: 'Reserva presencial confirmada. Código/s QR generados.',
    booking: aBooking({
      id: 61,
      idClient: null,
      walkInName: 'Juan Pérez',
      walkInDni: '30111222',
      startDate: '2027-01-10',
      endDate: '2027-01-10',
      totalPrice: 8500,
      rentalUnitIdentifier: 'A-01',
      guests: [
        aGuest({ idGuest: 1, fullName: 'Juan Pérez', dni: '30111222', qrToken: 'qr-1' }),
        aGuest({ idGuest: 2, fullName: 'Ana Pérez', dni: '40111222', qrToken: 'qr-2' }),
      ],
    }),
  });

  /** Carga a Juan Pérez con una acompañante, en la A-01 para hoy. */
  async function fillJuan(): Promise<void> {
    await type('#walkin-name', '  Juan Pérez ');
    await type('#walkin-dni', '30111222');
    await chooseUnit('A-01');
    await addGuest('Ana Pérez', '40111222');
  }

  it('trae el balneario propio y arranca las fechas en hoy', async () => {
    await open();

    expect(text(page.querySelector('h1'))).toBe('Reserva en mostrador');
    // Hoy a hoy es un día, y se cobra.
    expect(summary()).toContain('1 día');
    expect(summary()).toContain('Total—');
  });

  it('muestra el total a cobrar: días por precio diario', async () => {
    await open();
    await chooseUnit('C-01');

    expect(summary()).toContain('Carpa C-01');
    expect(summary()).toContain('$ 14.500,00');
  });

  it('manda el titular, la unidad, las fechas y los acompañantes, sin clientId', async () => {
    await open();
    await fillJuan();
    await submit();

    const req = http.expectOne(WALKIN);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      startDate: '2027-01-10',
      endDate: '2027-01-10',
      rentalUnitId: 1,
      walkInName: 'Juan Pérez',
      walkInDni: '30111222',
      guests: [{ fullName: 'Ana Pérez', dni: '40111222' }],
    });
    expect(req.request.body).not.toHaveProperty('clientId');
  });

  it('al confirmar muestra una entrada por persona, Imprimir y Nueva reserva', async () => {
    await open();
    await fillJuan();
    await submit();
    http.expectOne(WALKIN).flush(confirmed(), { status: 201, statusText: 'Created' });
    await settle();

    const tickets = page.querySelectorAll('app-guest-qr');
    expect(tickets.length).toBe(2);
    expect(text(tickets[0])).toContain('Juan Pérez');
    expect(text(tickets[1])).toContain('Ana Pérez');
    expect(text(page)).toContain('Reserva #0061 confirmada');
    expect(text(page)).toContain('$ 8.500,00');
    expect(page.querySelector('form')).toBeNull();

    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    button('Imprimir').click();
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('«Nueva reserva» deja el formulario vacío para el siguiente', async () => {
    await open();
    await fillJuan();
    await submit();
    http.expectOne(WALKIN).flush(confirmed(), { status: 201, statusText: 'Created' });
    await settle();

    button('Nueva reserva').click();
    await fixture.whenStable();

    expect(page.querySelector('app-guest-qr')).toBeNull();
    expect(page.querySelector<HTMLInputElement>('#walkin-name')!.value).toBe('');
    expect(page.querySelector<HTMLInputElement>('#walkin-dni')!.value).toBe('');
    expect(page.querySelectorAll('.walkin__guest').length).toBe(0);
    expect(summary()).toContain('Unidad—');
  });

  it('sin nombre o sin DNI del titular no sale y marca los campos', async () => {
    await open();
    await chooseUnit('A-01');
    await submit();

    http.expectNone(WALKIN);
    expect(text(page)).toContain('Escribí el nombre del titular.');
    expect(text(page)).toContain('Escribí el DNI del titular.');
  });

  it('un DNI con puntos no se acepta', async () => {
    await open();
    await type('#walkin-name', 'Juan Pérez');
    await type('#walkin-dni', '30.111.222');
    await chooseUnit('A-01');
    await submit();

    http.expectNone(WALKIN);
    expect(text(page)).toContain('El DNI son 7 u 8 números, sin puntos.');
  });

  it('sin unidad no sale y lo pide en el resumen', async () => {
    await open();
    await type('#walkin-name', 'Juan Pérez');
    await type('#walkin-dni', '30111222');
    await submit();

    http.expectNone(WALKIN);
    expect(summary()).toContain('Elegí la unidad y las fechas para reservar.');
  });

  it('la unidad ocupada en esas fechas muestra el error del backend y no confirma', async () => {
    await open();
    await fillJuan();
    await submit();
    http
      .expectOne(WALKIN)
      .flush(
        { error: 'La unidad ya está reservada en esas fechas' },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    expect(summary()).toContain('La unidad ya está reservada en esas fechas');
    expect(page.querySelector('app-guest-qr')).toBeNull();

    // Al elegir otra unidad, el error ya no corresponde.
    await chooseUnit('C-01');
    expect(summary()).not.toContain('La unidad ya está reservada en esas fechas');
  });

  it('los errores por campo del backend van debajo de su campo', async () => {
    await open();
    await fillJuan();
    await submit();
    http.expectOne(WALKIN).flush(
      {
        error: 'Hay datos inválidos en el pedido',
        campos: { walkInDni: 'El DNI del titular no es válido' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    const dniField = page.querySelector('#walkin-dni')!.closest('z-field');
    expect(text(dniField)).toContain('El DNI del titular no es válido');
  });

  it('un administrador sin balneario lo ve dicho', async () => {
    fixture = TestBed.createComponent(WalkIn);
    page = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(MY_RESORT).flush({ error: 'x' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(text(page)).toContain('No tenés un balneario asignado');
  });
});
