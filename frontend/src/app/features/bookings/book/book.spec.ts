import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Me } from '../../../core/api/auth.models';
import { BookingCheckout } from '../../../core/api/booking.models';
import { RentalUnit, Resort } from '../../../core/api/resort.models';
import { SessionService } from '../../../core/session/session.service';
import { aBooking } from '../booking.fixtures';
import { Book, PENDING_BOOKING_KEY } from './book';

const RESORTS = `${environment.apiUrl}/api/resorts`;
const BOOKINGS = `${environment.apiUrl}/api/bookings`;

const me: Me = {
  idClient: 7,
  firstName: 'Santiago',
  lastName: 'Rodríguez',
  email: 'santi.rodriguez@gmail.com',
  role: 'USER',
  idManagedResort: null,
};

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

function resort(overrides: Partial<Resort> = {}): Resort {
  return {
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
    ...overrides,
  };
}

/** Los espacios de «$ 25.500,00» son no separables: se comparan como espacios comunes. */
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('Book', () => {
  const user = signal<Me | null>(me);
  let fixture: ComponentFixture<Book>;
  let http: HttpTestingController;
  let page: HTMLElement;
  let redirect: ReturnType<typeof vi.fn>;

  // Hoy es el 10 de enero de 2027: las fechas anteriores no se aceptan.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2027, 0, 10, 12));
    sessionStorage.clear();
    user.set(me);

    TestBed.configureTestingModule({
      imports: [Book],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { user } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** Abre la pantalla con esos parámetros de la dirección y responde con el balneario. */
  async function open(
    params: { unit?: string; from?: string; to?: string } = {},
    body: Resort = resort(),
  ): Promise<void> {
    fixture = TestBed.createComponent(Book);
    page = fixture.nativeElement;
    redirect = vi.fn();
    (fixture.componentInstance as unknown as { redirect: typeof redirect }).redirect = redirect;

    fixture.componentRef.setInput('resortId', '1');
    for (const [name, value] of Object.entries(params)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    await fixture.whenStable();

    http.expectOne(`${RESORTS}/1`).flush(body);
    await settle();
  }

  const fromFicha = { unit: '1', from: '2027-01-15', to: '2027-01-17' };

  const summary = () => text(page.querySelector('.book__summary'));
  const submitButton = () => page.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  const addGuestButton = () =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent!.includes('Agregar acompañante'),
    )!;
  const guestRows = () => Array.from(page.querySelectorAll('.book__guest'));

  async function type(selector: string, value: string): Promise<void> {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function addGuest(name: string, dni: string): Promise<void> {
    const index = guestRows().length;
    addGuestButton().click();
    await fixture.whenStable();
    await type(`#guest-name-${index}`, name);
    await type(`#guest-dni-${index}`, dni);
  }

  /** Deja correr lo que queda pendiente después de un pedido: las promesas de `submit()`. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  async function submit(): Promise<void> {
    submitButton().click();
    await settle();
  }

  const checkout = (): BookingCheckout => ({
    booking: aBooking({ id: 52, status: 'PENDING' }),
    paymentUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=abc',
  });

  describe('al abrir', () => {
    it('muestra el balneario y, mientras carga, un esqueleto', async () => {
      fixture = TestBed.createComponent(Book);
      page = fixture.nativeElement;
      fixture.componentRef.setInput('resortId', '1');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
      http.expectOne(`${RESORTS}/1`).flush(resort());
      await settle();

      expect(text(page.querySelector('h1'))).toBe('Zolea Club de Playa');
      expect(text(page)).toContain('Mar del Plata, Buenos Aires');
    });

    it('toma la unidad y las fechas de la dirección y calcula el total', async () => {
      await open(fromFicha);

      const text_ = summary();
      expect(text_).toContain('Sombrilla A-01');
      expect(text_).toContain('3 días');
      // Tres días a $ 8.500 por día: del 15 al 17 se cobran los dos extremos.
      expect(text_).toContain('$ 25.500,00');
      expect(submitButton().disabled).toBe(false);
    });

    it('sin lo de la Ficha, pide elegir y no deja reservar', async () => {
      await open();

      expect(summary()).toContain('—');
      expect(submitButton().disabled).toBe(true);
    });

    it('descarta una unidad bloqueada o que no existe', async () => {
      await open({ ...fromFicha, unit: '2' });
      expect(summary()).not.toContain('A-02');
      expect(submitButton().disabled).toBe(true);
    });

    it('descarta fechas pasadas, mal escritas o al revés', async () => {
      await open({ unit: '1', from: '2027-01-17', to: '2027-01-15' });
      expect(summary()).toContain('Días—');
      expect(submitButton().disabled).toBe(true);
    });

    it('un balneario inexistente muestra que no se encontró', async () => {
      fixture = TestBed.createComponent(Book);
      page = fixture.nativeElement;
      fixture.componentRef.setInput('resortId', '1');
      fixture.detectChanges();
      await fixture.whenStable();

      http.expectOne(`${RESORTS}/1`).flush({ error: 'x' }, { status: 404, statusText: 'x' });
      await settle();

      expect(text(page)).toContain('No encontramos este balneario');
    });

    it('un balneario que no recibe reservas lo avisa y no muestra el formulario', async () => {
      await open(fromFicha, resort({ active: false }));

      expect(text(page)).toContain('Este balneario no está recibiendo reservas.');
      expect(page.querySelector('form')).toBeNull();
    });

    it('avisa que la reserva queda pendiente y se cancela sola a las 24 horas', async () => {
      await open(fromFicha);

      expect(summary()).toContain(
        'La reserva queda pendiente hasta que se acredite el pago y se cancela sola a las 24 horas.',
      );
    });
  });

  describe('los acompañantes', () => {
    it('se agregan y se quitan', async () => {
      await open(fromFicha);
      expect(guestRows().length).toBe(0);
      expect(summary()).toContain('Personas1');

      await addGuest('Lucía Pérez', '30111222');
      await addGuest('Mateo Pérez', '45111222');
      expect(guestRows().length).toBe(2);
      expect(summary()).toContain('Personas3');

      page.querySelector<HTMLButtonElement>('.book__remove')!.click();
      await fixture.whenStable();

      expect(guestRows().length).toBe(1);
      expect(page.querySelector<HTMLInputElement>('#guest-name-0')!.value).toBe('Mateo Pérez');
    });

    it('con un acompañante sin completar no reserva y marca el campo', async () => {
      await open(fromFicha);
      await addGuest('', '');
      await submit();

      http.expectNone(BOOKINGS);
      expect(text(page)).toContain('Escribí el nombre completo.');
      expect(text(page)).toContain('Escribí el DNI.');
    });

    it('un DNI con puntos no se acepta', async () => {
      await open(fromFicha);
      await addGuest('Lucía Pérez', '30.111.222');
      await submit();

      http.expectNone(BOOKINGS);
      expect(text(page)).toContain('El DNI son 7 u 8 números, sin puntos.');
    });
  });

  describe('reservar', () => {
    it('arma bien el pedido, guarda el id antes de salir y va a MercadoPago', async () => {
      await open(fromFicha);
      await addGuest('  Lucía Pérez ', '30111222');
      await submit();

      const request = http.expectOne(BOOKINGS);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        startDate: '2027-01-15',
        endDate: '2027-01-17',
        clientId: 7,
        rentalUnitId: 1,
        guests: [{ fullName: 'Lucía Pérez', dni: '30111222' }],
      });

      request.flush(checkout());
      await settle();

      expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBe('52');
      expect(redirect).toHaveBeenCalledWith(
        'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=abc',
      );
    });

    it('sin acompañantes manda la lista vacía: el titular lo agrega el backend', async () => {
      await open(fromFicha);
      await submit();

      const request = http.expectOne(BOOKINGS);
      expect(request.request.body.guests).toEqual([]);
      request.flush(checkout());
      await settle();
    });

    it('mientras el pedido está en curso no se manda otro', async () => {
      await open(fromFicha);
      await submit();
      await submit();

      http.expectOne(BOOKINGS).flush(checkout());
      await settle();
    });

    it.each([
      [409, 'Alguien se adelantó: la unidad ya está ocupada en esas fechas.'],
      [400, 'La unidad está bloqueada.'],
    ])('con un %i muestra el motivo, no sale y deja volver a intentar', async (status, error) => {
      await open(fromFicha);
      await submit();

      http.expectOne(BOOKINGS).flush({ error }, { status, statusText: 'x' });
      await settle();

      expect(text(page.querySelector('[role="alert"]'))).toContain(error);
      expect(redirect).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();
      expect(submitButton().disabled).toBe(false);
    });

    it('si MercadoPago no respondió (502) lo dice sin romper la pantalla', async () => {
      await open(fromFicha);
      await submit();

      http.expectOne(BOOKINGS).flush(null, { status: 502, statusText: 'Bad Gateway' });
      await settle();

      expect(text(page)).toContain('MercadoPago no respondió');
      expect(redirect).not.toHaveBeenCalled();
    });

    it('sin lugar o sin fechas avisa y no manda nada', async () => {
      await open();
      // El botón está deshabilitado, pero Enter dentro del formulario también envía.
      page.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();

      http.expectNone(BOOKINGS);
      expect(text(page)).toContain('Elegí tu lugar y tus fechas para reservar.');
    });
  });
});
