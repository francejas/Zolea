import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Booking } from '../../../core/api/booking.models';
import { aBooking, aGuest } from '../booking.fixtures';
import { PENDING_BOOKING_KEY } from '../book/book';
import { MAX_RETRIES, PaymentSuccess, POLL_MS } from './payment-success/payment-success';
import { PaymentPending } from './payment-pending/payment-pending';
import { PaymentFailure } from './payment-failure/payment-failure';

const BOOKINGS = `${environment.apiUrl}/api/bookings`;
const MP_URL = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=nueva';

/** Los espacios de «$ 36.000,00» son no separables: se comparan como espacios comunes. */
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('La Vuelta del pago', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  describe('Confirmado', () => {
    let fixture: ComponentFixture<PaymentSuccess>;
    let page: HTMLElement;
    let navigate: ReturnType<typeof vi.spyOn>;

    /** Abre la pantalla como llega del backend: `/payment/success?bookingId=…`. */
    async function open(bookingId?: string): Promise<void> {
      navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      fixture = TestBed.createComponent(PaymentSuccess);
      page = fixture.nativeElement;
      if (bookingId !== undefined) fixture.componentRef.setInput('bookingId', bookingId);
      fixture.detectChanges();
      await fixture.whenStable();
    }

    const answer = async (booking: Booking | null, status = 200) => {
      const request = http.expectOne(`${BOOKINGS}/47`);
      expect(request.request.method).toBe('GET');
      if (booking) request.flush(booking);
      else request.flush({ error: 'x' }, { status, statusText: 'x' });
      await fixture.whenStable();
    };

    /** Deja pasar el tiempo de una espera y responde al pedido que sale. */
    const waitAndAnswer = async (booking: Booking) => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
      await answer(booking);
    };

    it('con la reserva confirmada muestra el resumen y los QR, y borra el id guardado', async () => {
      sessionStorage.setItem(PENDING_BOOKING_KEY, '47');
      await open('47');
      await answer(
        aBooking({ guests: [aGuest(), aGuest({ idGuest: 2, fullName: 'Lucía Pérez' })] }),
      );

      expect(text(page.querySelector('h1'))).toBe('¡Pago confirmado!');
      expect(text(page)).toContain('Zolea Club de Playa');
      expect(text(page)).toContain('Sombrilla A-03');
      expect(text(page)).toContain('15 → 17 ene · 3 días');
      expect(text(page)).toContain('$ 36.000,00');
      expect(page.querySelector('app-guest-qr')).not.toBeNull();
      expect(text(page.querySelector('.z-ticket__name'))).toBe('Santiago Rodríguez');
      expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();

      // Una entrada por persona, y se pasa de una a otra.
      expect(text(page.querySelector('.z-pager'))).toContain('1 de 2');
      page.querySelector<HTMLButtonElement>('[aria-label="Entrada siguiente"]')!.click();
      await fixture.whenStable();
      expect(text(page.querySelector('.z-ticket__name'))).toBe('Lucía Pérez');
    });

    it('mientras carga muestra un esqueleto', async () => {
      await open('47');

      expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
      await answer(aBooking());
    });

    it('si todavía figura pendiente dice que está confirmando y vuelve a consultar cada 3 segundos', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      sessionStorage.setItem(PENDING_BOOKING_KEY, '47');
      await open('47');
      await answer(aBooking({ status: 'PENDING', guests: [] }));

      expect(text(page.querySelector('h1'))).toBe('Estamos confirmando tu pago');
      expect(page.querySelector('app-guest-qr')).toBeNull();

      // Antes de los 3 segundos no vuelve a preguntar.
      await vi.advanceTimersByTimeAsync(POLL_MS - 1);
      http.expectNone(`${BOOKINGS}/47`);

      await waitAndAnswer(aBooking({ status: 'PENDING' }));
      expect(text(page.querySelector('h1'))).toBe('Estamos confirmando tu pago');
      expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBe('47');

      // Cuando confirma, muestra los QR, borra el id y deja de consultar.
      await waitAndAnswer(aBooking({ status: 'CONFIRMED' }));
      expect(text(page.querySelector('h1'))).toBe('¡Pago confirmado!');
      expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();

      await vi.advanceTimersByTimeAsync(POLL_MS * 5);
      http.expectNone(`${BOOKINGS}/47`);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('si pasa el minuto sin confirmarse, lleva al detalle y deja de consultar', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      sessionStorage.setItem(PENDING_BOOKING_KEY, '47');
      await open('47');
      await answer(aBooking({ status: 'PENDING' }));

      for (let retry = 1; retry <= MAX_RETRIES; retry++) {
        expect(navigate).not.toHaveBeenCalled();
        await waitAndAnswer(aBooking({ status: 'PENDING' }));
      }

      expect(navigate).toHaveBeenCalledWith(['/bookings', '47'], { replaceUrl: true });
      // La clave queda: la reserva sigue pendiente y Rechazado todavía la puede necesitar.
      expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBe('47');
      await vi.advanceTimersByTimeAsync(POLL_MS * 5);
      http.expectNone(`${BOOKINGS}/47`);
    });

    it('un fallo de la red mientras espera no tira la pantalla: sigue preguntando', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      await open('47');
      await answer(aBooking({ status: 'PENDING' }));

      await vi.advanceTimersByTimeAsync(POLL_MS);
      http.expectOne(`${BOOKINGS}/47`).flush(null, { status: 500, statusText: 'x' });
      await fixture.whenStable();
      expect(text(page.querySelector('h1'))).toBe('Estamos confirmando tu pago');

      await waitAndAnswer(aBooking({ status: 'CONFIRMED' }));
      expect(text(page.querySelector('h1'))).toBe('¡Pago confirmado!');
    });

    it('si la reserva figura cancelada, lleva al detalle', async () => {
      await open('47');
      await answer(aBooking({ status: 'CANCELED' }));

      expect(navigate).toHaveBeenCalledWith(['/bookings', '47'], { replaceUrl: true });
    });

    it('al salir de la pantalla deja de consultar', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      await open('47');
      await answer(aBooking({ status: 'PENDING' }));

      fixture.destroy();
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      http.expectNone(`${BOOKINGS}/47`);
    });

    it('sin número de reserva en la dirección no pide nada y manda a Mis reservas', async () => {
      await open();

      http.expectNone(`${BOOKINGS}/undefined`);
      expect(text(page)).toContain('No encontramos la reserva');
    });

    it('un número que no es un número no se pide', async () => {
      await open('../admin');

      expect(text(page)).toContain('No encontramos la reserva');
    });

    it('una reserva de otra persona avisa que no es suya', async () => {
      await open('47');
      await answer(null, 403);

      expect(text(page)).toContain('Esta reserva no es tuya');
    });

    it('una reserva que no existe lo avisa', async () => {
      await open('47');
      await answer(null, 404);

      expect(text(page)).toContain('No encontramos esta reserva');
    });

    it('si falla el pedido muestra el problema y Reintentar vuelve a pedir', async () => {
      await open('47');
      await answer(null, 500);

      expect(text(page)).toContain('No pudimos traer la reserva');
      page.querySelector<HTMLButtonElement>('button')!.click();
      await fixture.whenStable();

      await answer(aBooking());
      expect(text(page.querySelector('h1'))).toBe('¡Pago confirmado!');
    });
  });

  describe('Pendiente', () => {
    const open = async () => {
      const fixture = TestBed.createComponent(PaymentPending);
      fixture.detectChanges();
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    };

    it('dice que el pago está en proceso y que no hay que pagar de nuevo, sin pedir nada', async () => {
      const page = await open();

      expect(text(page.querySelector('h1'))).toBe('Tu pago está en proceso');
      expect(text(page)).toContain('No hace falta que pagues de nuevo.');
      expect(text(page)).toContain('la entrada con el QR aparece en la reserva');
    });

    it('con el id guardado lleva a la reserva', async () => {
      sessionStorage.setItem(PENDING_BOOKING_KEY, '47');
      const page = await open();

      const link = page.querySelector<HTMLAnchorElement>('a[href="/bookings/47"]');
      expect(text(link)).toBe('Ver la reserva');
    });

    it('sin id guardado lleva a Mis reservas', async () => {
      const page = await open();

      expect(page.querySelector('a[href^="/bookings/"]')).toBeNull();
      expect(text(page.querySelector('a[href="/my-bookings"]'))).toBe('Ir a Mis reservas');
    });

    it('un id guardado que no es un número se ignora', async () => {
      sessionStorage.setItem(PENDING_BOOKING_KEY, '../admin');
      const page = await open();

      expect(page.querySelector('a[href^="/bookings/"]')).toBeNull();
    });
  });

  describe('Rechazado', () => {
    let fixture: ComponentFixture<PaymentFailure>;
    let page: HTMLElement;
    let redirect: ReturnType<typeof vi.fn>;

    /** Abre la pantalla; si hay id guardado, responde con la reserva que se pide para saber su estado. */
    async function open(options: { id?: string; booking?: Booking } = {}): Promise<void> {
      if (options.id) sessionStorage.setItem(PENDING_BOOKING_KEY, options.id);
      fixture = TestBed.createComponent(PaymentFailure);
      page = fixture.nativeElement;
      redirect = vi.fn();
      (fixture.componentInstance as unknown as { redirect: typeof redirect }).redirect = redirect;
      fixture.detectChanges();
      await fixture.whenStable();

      if (options.id) {
        http
          .expectOne(`${BOOKINGS}/${options.id}`)
          .flush(options.booking ?? aBooking({ status: 'PENDING' }));
        await fixture.whenStable();
      }
    }

    const retryButton = () =>
      Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        b.textContent!.includes('Reintentar el pago'),
      );

    it('explica qué pasó sin culpar a la persona y recuerda la hora', async () => {
      await open({ id: '47' });

      expect(text(page.querySelector('h1'))).toBe('No se pudo completar el pago');
      expect(text(page)).toContain('casi nunca es culpa tuya');
      expect(text(page)).toContain('La reserva se cancela sola a la hora de haberla hecho.');
      expect(text(page)).not.toContain('24');
    });

    it('Reintentar pide una dirección de pago nueva y abre MercadoPago', async () => {
      await open({ id: '47' });
      retryButton()!.click();
      await fixture.whenStable();

      const request = http.expectOne(`${BOOKINGS}/47/pay`);
      expect(request.request.method).toBe('POST');
      request.flush({ paymentUrl: MP_URL });
      await fixture.whenStable();

      expect(redirect).toHaveBeenCalledWith(MP_URL);
    });

    it('si ya pasó la hora (400) muestra que la reserva venció y un enlace para volver a reservar', async () => {
      await open({ id: '47' });
      retryButton()!.click();
      await fixture.whenStable();

      http
        .expectOne(`${BOOKINGS}/47/pay`)
        .flush(
          { error: 'La reserva no está pendiente de pago.' },
          { status: 400, statusText: 'x' },
        );
      await fixture.whenStable();
      // Se vuelve a pedir la reserva: ahora figura cancelada y dice a qué balneario volver.
      http
        .expectOne(`${BOOKINGS}/47`)
        .flush(aBooking({ status: 'CANCELED', resortId: 5, rentalUnitId: 3 }));
      await fixture.whenStable();

      expect(text(page.querySelector('h1'))).toBe('La reserva venció');
      expect(retryButton()).toBeUndefined();
      const link = page.querySelector<HTMLAnchorElement>('a[href^="/book/5"]')!;
      expect(text(link)).toBe('Volver a reservar');
      expect(link.getAttribute('href')).toBe('/book/5?unit=3&from=2026-01-15&to=2026-01-17');
    });

    it('si la reserva ya figura cancelada al abrir, no ofrece reintentar', async () => {
      await open({ id: '47', booking: aBooking({ status: 'CANCELED' }) });

      expect(text(page.querySelector('h1'))).toBe('La reserva venció');
      expect(retryButton()).toBeUndefined();
    });

    it('si en el medio se acreditó el pago (400 y confirmada) lo dice y lleva a las entradas', async () => {
      await open({ id: '47' });
      retryButton()!.click();
      await fixture.whenStable();

      http.expectOne(`${BOOKINGS}/47/pay`).flush({ error: 'x' }, { status: 400, statusText: 'x' });
      await fixture.whenStable();
      http.expectOne(`${BOOKINGS}/47`).flush(aBooking({ status: 'CONFIRMED' }));
      await fixture.whenStable();

      expect(text(page.querySelector('h1'))).toBe('Esta reserva ya está pagada');
      expect(page.querySelector('a[href="/bookings/47"]')).not.toBeNull();
    });

    it('si MercadoPago no respondió (502) lo dice y deja volver a intentar', async () => {
      await open({ id: '47' });
      retryButton()!.click();
      await fixture.whenStable();

      http.expectOne(`${BOOKINGS}/47/pay`).flush(null, { status: 502, statusText: 'x' });
      await fixture.whenStable();

      expect(text(page)).toContain('MercadoPago no respondió');
      expect(redirect).not.toHaveBeenCalled();
      expect(retryButton()!.disabled).toBe(false);
    });

    it('sin id guardado no se puede reintentar: manda a Mis reservas', async () => {
      await open();

      expect(retryButton()).toBeUndefined();
      expect(text(page.querySelector('a[href="/my-bookings"]'))).toBe('Ir a Mis reservas');
    });

    it('si no se pudo traer la reserva, igual se puede reintentar', async () => {
      sessionStorage.setItem(PENDING_BOOKING_KEY, '47');
      fixture = TestBed.createComponent(PaymentFailure);
      page = fixture.nativeElement;
      fixture.detectChanges();
      await fixture.whenStable();
      http.expectOne(`${BOOKINGS}/47`).flush(null, { status: 500, statusText: 'x' });
      await fixture.whenStable();

      expect(retryButton()).toBeDefined();
    });
  });
});
