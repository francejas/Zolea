import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Booking } from '../../../core/api/booking.models';
import { SessionService } from '../../../core/session/session.service';
import { aBooking, aGuest } from '../booking.fixtures';
import { ClientDashboard } from './dashboard';

const API = `${environment.apiUrl}/api/bookings`;

describe('ClientDashboard', () => {
  let fixture: ComponentFixture<ClientDashboard>;
  let http: HttpTestingController;
  let page: HTMLElement;

  // Hoy es el sábado 10 de enero de 2026.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 10, 12));

    TestBed.configureTestingModule({
      imports: [ClientDashboard],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: { user: () => ({ idClient: 16, firstName: 'Natalia' }) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ClientDashboard);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  async function respondWith(bookings: Booking[]): Promise<void> {
    http.expectOne(`${API}/client/16`).flush(bookings);
    await fixture.whenStable();
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent!.includes(label),
    );
  }

  function link(label: string): HTMLAnchorElement | undefined {
    return Array.from(page.querySelectorAll<HTMLAnchorElement>('a')).find((a) =>
      a.textContent!.includes(label),
    );
  }

  /** La de hoy con dos entradas, una pendiente que viene y una que ya pasó. */
  const today = aBooking({
    id: 32,
    resortName: 'Arena Dorada',
    startDate: '2026-01-09',
    endDate: '2026-01-12',
    guests: [
      aGuest({ idGuest: 1, fullName: 'Natalia Romero' }),
      aGuest({ idGuest: 2, fullName: 'Juan Romero', qrToken: 'otro-codigo' }),
    ],
  });
  const pending = aBooking({
    id: 14,
    resortName: 'Zolea Club de Playa',
    status: 'PENDING',
    startDate: '2026-01-28',
    endDate: '2026-02-01',
    // Hecha recién: todavía se puede pagar.
    createdAt: '2026-01-10T11:50:00',
  });
  const past = aBooking({ id: 59, startDate: '2025-12-20', endDate: '2025-12-22' });

  it('saluda con el nombre', async () => {
    await respondWith([today]);

    expect(text(page.querySelector('h1'))).toBe('Hola, Natalia');
  });

  it('arriba de todo, la reserva de hoy con sus entradas y el pasador', async () => {
    await respondWith([pending, today, past]);

    const section = page.querySelector('.home__today')!;
    expect(page.querySelector('section > section, .home > *:nth-child(2)')).toBe(section);
    expect(text(section)).toContain('Arena Dorada');
    expect(text(section.querySelector('.z-ticket__name'))).toBe('Natalia Romero');
    expect(text(section.querySelector('.z-pager'))).toContain('1 de 2');

    section.querySelector<HTMLButtonElement>('[aria-label="Entrada siguiente"]')!.click();
    await fixture.whenStable();

    expect(text(section.querySelector('.z-ticket__name'))).toBe('Juan Romero');
    expect(link('Ver la reserva')?.getAttribute('href')).toBe('/bookings/32');
  });

  it('sin reserva hoy, no hay sección de hoy', async () => {
    await respondWith([pending, past]);

    expect(page.querySelector('.home__today')).toBeNull();
  });

  it('las próximas, con la tarjeta de Mis reservas: la pendiente con «Pagar», y «Ver todas»', async () => {
    await respondWith([pending, today, past]);

    const cards = page.querySelectorAll('.home__list .z-booking-card');
    expect(cards.length).toBe(1);
    expect(text(cards[0].querySelector('.z-booking-card__title'))).toBe('Zolea Club de Playa');
    expect(text(cards[0].querySelector('.z-status'))).toBe('Pendiente de pago');
    expect(text(cards[0])).toContain('mié 28 ene → dom 1 feb · 5 días');
    expect(button('Pagar')).toBeDefined();
    expect(link('Ver todas')?.getAttribute('href')).toBe('/my-bookings');
  });

  it('cuenta todas, las confirmadas y las pendientes de pago', async () => {
    await respondWith([pending, today, past, aBooking({ id: 70, status: 'CANCELED' })]);

    const figures = Array.from(page.querySelectorAll('.home__figure')).map(
      (f) => `${text(f.querySelector('dt'))}: ${text(f.querySelector('dd'))}`,
    );
    expect(figures).toEqual(['Reservas: 4', 'Confirmadas: 2', 'Pendientes de pago: 1']);
  });

  it('lleva a buscar balnearios', async () => {
    await respondWith([past]);

    expect(link('Buscar balnearios')?.getAttribute('href')).toBe('/');
    expect(page.textContent).toContain('No tenés reservas por delante.');
  });

  it('sin ninguna reserva, «Todavía no reservaste» y el botón para empezar', async () => {
    await respondWith([]);

    expect(page.textContent).toContain('Todavía no reservaste');
    expect(button('Buscar balnearios')).toBeDefined();
    expect(page.querySelector('.home__figures')).toBeNull();
  });

  it('si falla la carga, deja reintentar', async () => {
    http.expectOne(`${API}/client/16`).flush({ error: 'x' }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();

    expect(page.textContent).toContain('No pudimos traer tus reservas');

    button('Reintentar')!.click();
    await respondWith([today]);

    expect(page.querySelector('.home__today')).not.toBeNull();
  });

  describe('pagar', () => {
    function spyRedirect() {
      return vi
        .spyOn(fixture.componentInstance as unknown as { redirect(url: string): void }, 'redirect')
        .mockImplementation(() => undefined);
    }

    it('pide una dirección nueva y va a MercadoPago', async () => {
      await respondWith([pending]);
      const redirect = spyRedirect();

      button('Pagar')!.click();
      http.expectOne(`${API}/14/pay`).flush({ paymentUrl: 'https://mercadopago.example/checkout' });

      expect(redirect).toHaveBeenCalledWith('https://mercadopago.example/checkout');
    });

    it('si responde 400, vuelve a traer las reservas: si ya se pagó, queda confirmada', async () => {
      await respondWith([pending]);
      spyRedirect();

      button('Pagar')!.click();
      http.expectOne(`${API}/14/pay`).flush({ error: 'x' }, { status: 400, statusText: 'x' });
      http.expectOne(`${API}/client/16`).flush([{ ...pending, status: 'CONFIRMED' }]);
      await fixture.whenStable();

      expect(text(page.querySelector('.z-status'))).toBe('Confirmada');
      expect(button('Pagar')).toBeUndefined();
      expect(link('Ver entradas')).toBeDefined();
    });

    it('si responde 400 y sigue pendiente, venció: ofrece volver a reservar', async () => {
      await respondWith([pending]);
      spyRedirect();

      button('Pagar')!.click();
      http.expectOne(`${API}/14/pay`).flush({ error: 'x' }, { status: 400, statusText: 'x' });
      http.expectOne(`${API}/client/16`).flush([pending]);
      await fixture.whenStable();

      expect(page.textContent).toContain('La reserva venció');
      expect(button('Pagar')).toBeUndefined();
      expect(link('Volver a reservar')?.getAttribute('href')).toBe(
        '/book/1?unit=3&from=2026-01-28&to=2026-02-01',
      );
    });
  });
});
