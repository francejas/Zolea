import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Booking } from '../../../core/api/booking.models';
import { SessionService } from '../../../core/session/session.service';
import { aBooking } from '../booking.fixtures';
import { MyBookings, tabOf } from './my-bookings';

const API = `${environment.apiUrl}/api/bookings`;

describe('tabOf', () => {
  it('una reserva que termina hoy todavía es próxima; la de ayer, pasada', () => {
    expect(tabOf(aBooking({ endDate: '2026-01-10' }), '2026-01-10')).toBe('upcoming');
    expect(tabOf(aBooking({ endDate: '2026-01-09' }), '2026-01-10')).toBe('past');
    expect(tabOf(aBooking({ status: 'PENDING', endDate: '2026-01-09' }), '2026-01-10')).toBe(
      'past',
    );
    expect(tabOf(aBooking({ status: 'CANCELED', endDate: '2026-05-01' }), '2026-01-10')).toBe(
      'canceled',
    );
  });
});

describe('MyBookings', () => {
  let fixture: ComponentFixture<MyBookings>;
  let http: HttpTestingController;
  let page: HTMLElement;

  // Hoy es el sábado 10 de enero de 2026.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 10, 12));

    TestBed.configureTestingModule({
      imports: [MyBookings],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { user: () => ({ idClient: 7 }) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MyBookings);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  async function respondWith(bookings: Booking[]): Promise<void> {
    http.expectOne(`${API}/client/7`).flush(bookings);
    await fixture.whenStable();
  }

  function tab(label: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) =>
      t.textContent!.includes(label),
    )!;
  }

  async function open(label: string): Promise<void> {
    tab(label).click();
    await fixture.whenStable();
  }

  function cardTitles(): string[] {
    return Array.from(page.querySelectorAll('.z-booking-card__title')).map((t) =>
      t.textContent!.trim(),
    );
  }

  function button(text: string): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent!.includes(text),
    );
  }

  function link(text: string): HTMLAnchorElement | undefined {
    return Array.from(page.querySelectorAll<HTMLAnchorElement>('a')).find((a) =>
      a.textContent!.includes(text),
    );
  }

  /** Las seis del reparto: dos próximas y una pendiente, una pasada y dos canceladas. */
  const mixed = [
    aBooking({ id: 1, resortName: 'Hoy', startDate: '2026-01-08', endDate: '2026-01-10' }),
    aBooking({ id: 2, resortName: 'Febrero', startDate: '2026-02-01', endDate: '2026-02-03' }),
    aBooking({
      id: 3,
      resortName: 'Pendiente',
      status: 'PENDING',
      startDate: '2026-01-20',
      endDate: '2026-01-21',
    }),
    aBooking({ id: 4, resortName: 'Diciembre', startDate: '2025-12-20', endDate: '2026-01-09' }),
    aBooking({
      id: 5,
      resortName: 'Cancelada futura',
      status: 'CANCELED',
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    }),
    aBooking({
      id: 6,
      resortName: 'Cancelada pasada',
      status: 'CANCELED',
      startDate: '2025-11-01',
      endDate: '2025-11-02',
    }),
  ];

  describe('el reparto en pestañas', () => {
    it('reparte las reservas en las tres pestañas, con la cantidad de cada una', async () => {
      await respondWith(mixed);

      expect(tab('Próximas').textContent).toContain('3');
      expect(tab('Pasadas').textContent).toContain('1');
      expect(tab('Canceladas').textContent).toContain('2');
      expect(tab('Próximas').getAttribute('aria-selected')).toBe('true');
      // De la más cercana a la más lejana.
      expect(cardTitles()).toEqual(['Hoy', 'Pendiente', 'Febrero']);

      await open('Pasadas');
      expect(cardTitles()).toEqual(['Diciembre']);

      await open('Canceladas');
      // De la más nueva a la más vieja.
      expect(cardTitles()).toEqual(['Cancelada futura', 'Cancelada pasada']);
    });

    it('con las flechas se pasa de pestaña', async () => {
      await respondWith(mixed);

      tab('Próximas').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      await fixture.whenStable();

      expect(tab('Pasadas').getAttribute('aria-selected')).toBe('true');
      expect(cardTitles()).toEqual(['Diciembre']);
    });

    it('la reserva de hoy se destaca', async () => {
      await respondWith(mixed);

      const today = page.querySelector('.z-booking-card--today');
      expect(today?.textContent).toContain('Hoy');
      expect(page.querySelectorAll('.z-booking-card--today').length).toBe(1);
    });

    it('una pestaña sin reservas lo dice', async () => {
      await respondWith([aBooking({ startDate: '2026-02-01', endDate: '2026-02-03' })]);

      await open('Canceladas');

      expect(page.querySelectorAll('.z-booking-card').length).toBe(0);
      expect(page.textContent).toContain('No tenés reservas canceladas.');
    });
  });

  describe('la tarjeta', () => {
    it('muestra el balneario, la unidad, las fechas cortas, el estado y el total', async () => {
      await respondWith([aBooking()]);

      const card = page.querySelector('.z-booking-card')!;
      expect(card.textContent).toContain('Zolea Club de Playa');
      expect(card.textContent).toContain('Sombrilla A-03');
      expect(card.textContent).toContain('jue 15 ene → sáb 17 ene · 3 días');
      expect(card.querySelector('.z-status')!.textContent).toContain('Confirmada');
      expect(card.querySelector('.z-total')!.textContent!.replace(/\s/g, ' ')).toContain(
        '$ 36.000,00',
      );
    });

    it('confirmada: lleva a las entradas; si ya pasó, a la reserva', async () => {
      await respondWith(mixed);

      expect(link('Ver entradas')?.getAttribute('href')).toBe('/bookings/1');

      await open('Pasadas');
      expect(link('Ver reserva')?.getAttribute('href')).toBe('/bookings/4');
    });

    it('cancelada: no tiene acción', async () => {
      await respondWith([aBooking({ status: 'CANCELED' })]);
      await open('Canceladas');

      const foot = page.querySelector('.z-booking-card__foot')!;
      expect(foot.querySelector('a, button')).toBeNull();
    });
  });

  describe('pagar una pendiente', () => {
    // Hecha a las 11:30 de Buenos Aires: se puede pagar hasta las 12:30.
    const pending = aBooking({ id: 52, status: 'PENDING', createdAt: '2026-01-10T11:30:00' });

    beforeEach(() => vi.setSystemTime(new Date('2026-01-10T12:00:00-03:00')));

    function spyRedirect() {
      return vi
        .spyOn(fixture.componentInstance as unknown as { redirect(url: string): void }, 'redirect')
        .mockImplementation(() => undefined);
    }

    /** Toca «Pagar», el backend responde 400 y la reserva vuelve a traerse como está ahora. */
    async function payRejected(now: Booking): Promise<void> {
      button('Pagar')!.click();
      http
        .expectOne(`${API}/52/pay`)
        .flush({ error: 'otro texto cualquiera' }, { status: 400, statusText: 'Bad Request' });
      http.expectOne(`${API}/52`).flush(now);
      await fixture.whenStable();
    }

    it('pide una dirección de pago nueva y va a MercadoPago', async () => {
      await respondWith([pending]);
      const redirect = spyRedirect();

      button('Pagar')!.click();
      http.expectOne(`${API}/52/pay`).flush({ paymentUrl: 'https://mercadopago.example/checkout' });

      expect(redirect).toHaveBeenCalledWith('https://mercadopago.example/checkout');
    });

    it('si pasó la hora, ya al cargar avisa que venció y ofrece volver a reservar', async () => {
      vi.setSystemTime(new Date('2026-01-10T12:30:00-03:00'));
      await respondWith([pending]);

      expect(page.textContent).toContain('La reserva venció');
      expect(button('Pagar')).toBeUndefined();
      expect(link('Volver a reservar')?.getAttribute('href')).toBe(
        '/book/1?unit=3&from=2026-01-15&to=2026-01-17',
      );
    });

    it('si responde 400 y sigue pendiente, venció: lo avisa y ofrece volver a reservar', async () => {
      await respondWith([pending]);
      spyRedirect();

      // La computadora atrasa: para el backend ya pasó la hora, para la pantalla todavía no.
      await payRejected(pending);

      expect(page.textContent).toContain('La reserva venció');
      expect(button('Pagar')).toBeUndefined();
      expect(link('Volver a reservar')?.getAttribute('href')).toBe(
        '/book/1?unit=3&from=2026-01-15&to=2026-01-17',
      );
    });

    it('si responde 400 porque ya se pagó, muestra que está confirmada y sus entradas', async () => {
      await respondWith([pending]);
      spyRedirect();

      await payRejected({ ...pending, status: 'CONFIRMED' });

      expect(page.textContent).toContain('Ya está paga');
      expect(page.textContent).not.toContain('La reserva venció');
      expect(page.querySelector('.z-status')!.textContent).toContain('Confirmada');
      expect(button('Pagar')).toBeUndefined();
      expect(link('Volver a reservar')).toBeUndefined();
      expect(link('Ver entradas')?.getAttribute('href')).toBe('/bookings/52');
    });

    it('si la limpieza ya la canceló, avisa que venció sin sacarla de la pestaña', async () => {
      await respondWith([pending]);
      spyRedirect();

      await payRejected({ ...pending, status: 'CANCELED', canceledBy: 'SYSTEM' });

      expect(tab('Próximas').getAttribute('aria-selected')).toBe('true');
      expect(tab('Próximas').textContent).toContain('1');
      expect(page.querySelector('.z-status')!.textContent).toContain('Cancelada');
      expect(page.textContent).toContain('La reserva venció');
      expect(link('Volver a reservar')).toBeDefined();
    });

    it('si la cancelaron desde otro lado, lo dice y ofrece volver a reservar', async () => {
      await respondWith([pending]);
      spyRedirect();

      await payRejected({ ...pending, status: 'CANCELED', canceledBy: 'CLIENT' });

      expect(page.textContent).toContain('La reserva se canceló');
      expect(page.textContent).not.toContain('La reserva venció');
      expect(link('Volver a reservar')).toBeDefined();
    });

    it('si responde 400 y no se puede volver a traer, muestra el motivo del backend', async () => {
      await respondWith([pending]);
      spyRedirect();

      button('Pagar')!.click();
      http
        .expectOne(`${API}/52/pay`)
        .flush(
          { error: 'La reserva no está pendiente de pago.' },
          { status: 400, statusText: 'Bad Request' },
        );
      http.expectOne(`${API}/52`).flush({ error: 'x' }, { status: 500, statusText: 'Error' });
      await fixture.whenStable();

      expect(page.textContent).toContain('No se pudo pagar');
      expect(page.textContent).toContain('La reserva no está pendiente de pago.');
    });

    it('volver a cargar la pantalla deja cada reserva en su pestaña', async () => {
      await respondWith([pending]);
      spyRedirect();
      await payRejected({ ...pending, status: 'CANCELED', canceledBy: 'SYSTEM' });

      (fixture.componentInstance as unknown as { load(): void }).load();
      await respondWith([{ ...pending, status: 'CANCELED', canceledBy: 'SYSTEM' }]);

      expect(tab('Próximas').textContent).toContain('0');
      expect(tab('Canceladas').textContent).toContain('1');
      expect(page.textContent).not.toContain('La reserva venció');
    });

    it('con otro error, lo muestra y deja volver a intentar', async () => {
      await respondWith([pending]);
      spyRedirect();

      button('Pagar')!.click();
      http
        .expectOne(`${API}/52/pay`)
        .flush({ error: 'MercadoPago no respondió' }, { status: 502, statusText: 'Bad Gateway' });
      await fixture.whenStable();

      expect(page.textContent).toContain('No se pudo pagar');
      expect(page.textContent).not.toContain('La reserva venció');
      expect(button('Pagar')?.disabled).toBe(false);
    });
  });

  describe('calificar', () => {
    // Terminó ayer, el 9 de enero: ya se puede calificar.
    const past = aBooking({ id: 21, startDate: '2026-01-07', endDate: '2026-01-09' });

    beforeEach(() => {
      // jsdom no trae los métodos de <dialog>.
      HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
      HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    });

    /** La respuesta termina el `submit` del diálogo, que es una promesa: se deja correr. */
    async function settle(): Promise<void> {
      for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    }

    it('una pasada confirmada y sin calificar lleva «Calificar»', async () => {
      await respondWith([past]);
      await open('Pasadas');

      expect(button('Calificar')).toBeDefined();
      expect(link('Ver reserva')?.getAttribute('href')).toBe('/bookings/21');
    });

    it('una próxima no se califica, y una ya calificada tampoco', async () => {
      await respondWith([
        aBooking({ id: 22, startDate: '2026-01-10', endDate: '2026-01-12' }),
        aBooking({ ...past, reviewed: true }),
      ]);

      expect(button('Calificar')).toBeUndefined();

      await open('Pasadas');
      expect(button('Calificar')).toBeUndefined();
      expect(page.textContent).toContain('Ya calificaste esta estadía.');
    });

    it('al calificar, la tarjeta deja el botón y dice con cuántas estrellas', async () => {
      await respondWith([past]);
      await open('Pasadas');

      button('Calificar')!.click();
      await fixture.whenStable();
      const dialog = page.querySelector('dialog')!;
      expect(dialog.hasAttribute('open')).toBe(true);

      dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')[3].click();
      await fixture.whenStable();
      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      http.expectOne(`${API}/21/review`).flush({
        author: 'Santiago R.',
        rating: 4,
        comment: null,
        createdAt: '2026-01-10T12:00:00',
      });
      await settle();

      expect(page.querySelector('dialog')).toBeNull();
      expect(button('Calificar')).toBeUndefined();
      expect(page.textContent).toContain('Calificaste con 4 estrellas.');
      // El botón ya no está: el foco pasa al resultado, que así también se lee.
      expect(document.activeElement?.textContent).toContain('Calificaste con 4 estrellas.');
    });

    it('si ya estaba calificada, vuelve a traer la reserva y la tarjeta deja el botón', async () => {
      await respondWith([past]);
      await open('Pasadas');

      button('Calificar')!.click();
      await fixture.whenStable();
      const dialog = page.querySelector('dialog')!;
      dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')[3].click();
      await fixture.whenStable();
      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      http
        .expectOne(`${API}/21/review`)
        .flush({ error: 'otro texto cualquiera' }, { status: 400, statusText: 'Bad Request' });
      await settle();
      http.expectOne(`${API}/21`).flush({ ...past, reviewed: true });
      await settle();

      // El aviso sigue en el diálogo; la tarjeta de atrás ya se actualizó.
      expect(dialog.textContent).toContain('otro texto cualquiera');
      expect(page.textContent).toContain('Ya calificaste esta estadía.');

      button('Ahora no')!.click();
      await settle();

      expect(page.querySelector('dialog')).toBeNull();
      expect(button('Calificar')).toBeUndefined();
      expect(document.activeElement?.textContent).toContain('Ya calificaste esta estadía.');
    });

    it('cerrar el diálogo sin calificar deja el botón', async () => {
      await respondWith([past]);
      await open('Pasadas');

      button('Calificar')!.click();
      await fixture.whenStable();
      button('Ahora no')!.click();
      await fixture.whenStable();

      expect(page.querySelector('dialog')).toBeNull();
      expect(button('Calificar')).toBeDefined();
    });
  });

  describe('sin reservas o sin respuesta', () => {
    it('sin ninguna reserva: «Todavía no reservaste» y buscar balnearios', async () => {
      await respondWith([]);

      expect(page.textContent).toContain('Todavía no reservaste');
      expect(button('Buscar balnearios')).toBeDefined();
      expect(page.querySelector('[role="tablist"]')).toBeNull();
    });

    it('sin cliente en la sesión, no queda cargando: muestra el problema', async () => {
      http.expectOne(`${API}/client/7`).flush([]);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [MyBookings],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: SessionService, useValue: { user: () => null } },
        ],
      });
      http = TestBed.inject(HttpTestingController);
      const noClient = TestBed.createComponent(MyBookings);
      noClient.detectChanges();
      await noClient.whenStable();

      const text = noClient.nativeElement.textContent;
      expect(text).toContain('No pudimos traer tus reservas');
      expect(noClient.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
      http.expectNone(`${API}/client/undefined`);
    });

    it('si falla la carga, deja reintentar', async () => {
      http
        .expectOne(`${API}/client/7`)
        .flush({ error: 'x' }, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();

      expect(page.textContent).toContain('No pudimos traer tus reservas');

      button('Reintentar')!.click();
      await respondWith([aBooking()]);

      expect(cardTitles()).toEqual(['Zolea Club de Playa']);
    });
  });
});
