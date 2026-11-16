import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { environment } from '../../../../environments/environment';
import { Review } from '../../../core/api/review.models';
import { ResortStats } from '../../../core/api/stats.models';
import { SessionService } from '../../../core/session/session.service';
import { ZChart } from '../../../shared/chart/z-chart';
import { aBooking, aGuest } from '../../bookings/booking.fixtures';
import { Dashboard } from './dashboard';

const API = environment.apiUrl;
// Hoy es el sábado 10 de enero de 2026: el rango inicial va del 1 de diciembre al 28 de febrero.
const STATS = `${API}/api/resorts/my/stats?from=2025-12-01&to=2026-02-28`;

function aStats(overrides: Partial<ResortStats> = {}): ResortStats {
  return {
    from: '2025-12-01',
    to: '2026-02-28',
    today: {
      activeBookings: 3,
      expectedGuests: 8,
      checkedIn: 2,
      pendingBookings: 1,
      freeUnits: 17,
    },
    occupancyByDay: [
      { date: '2025-12-01', occupiedUnits: 5, totalUnits: 22 },
      { date: '2025-12-02', occupiedUnits: 11, totalUnits: 22 },
    ],
    incomeByMonth: [
      { month: '2025-12', income: 120000 },
      { month: '2026-01', income: 254000 },
      { month: '2026-02', income: 0 },
    ],
    topUnits: [{ idRentalUnit: 9, identifier: 'C-01', type: 'TENT', days: 14 }],
    ...overrides,
  };
}

const review = (rating: number, author: string): Review => ({
  author,
  rating,
  comment: `Comentario de ${author}`,
  createdAt: '2026-01-08T18:30:00',
});

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let http: HttpTestingController;
  let page: HTMLElement;
  let created: ChartConfiguration<'bar'>[];

  function setup(idManagedResort: number | null = 4) {
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { user: () => ({ idManagedResort }) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Dashboard);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 10, 12));
    created = [];
    // jsdom no dibuja en un canvas: se guarda lo que se le pediría a Chart.js.
    vi.spyOn(ZChart.prototype as unknown as { create(): unknown }, 'create').mockImplementation(((
      _canvas: HTMLCanvasElement,
      config: ChartConfiguration<'bar'>,
    ) => {
      created.push(config);
      return { data: config.data, options: config.options, update: vi.fn(), destroy: vi.fn() };
    }) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    http.verify();
  });

  /** Responde los tres pedidos del Panel: las estadísticas, las reservas y las reseñas. */
  async function respond(
    stats: ResortStats = aStats(),
    bookings = [aBooking()],
    reviews: Review[] = [],
  ): Promise<void> {
    await fixture.whenStable();
    http.expectOne(STATS).flush(stats);
    http.expectOne(`${API}/api/bookings`).flush(bookings);
    http.expectOne(`${API}/api/resorts/4/reviews`).flush(reviews);
    await fixture.whenStable();
  }

  function text(): string {
    return page.textContent!.replace(/\s+/g, ' ');
  }

  it('muestra las cifras de hoy, con el ingreso del mes en curso', async () => {
    setup();
    await respond();

    const figures = Array.from(page.querySelectorAll('.panel__figure')).map((f) =>
      Array.from(f.children)
        .map((part) => part.textContent!.replace(/\s+/g, ' ').trim())
        .join(' | '),
    );
    expect(figures).toEqual([
      'Reservas activas | 3 | Confirmadas, con hoy adentro',
      'Huéspedes esperados | 8 | Titulares y acompañantes',
      'Ya entraron | 2 | De 8 esperados',
      'Pendientes de pago | 1 | Vencen a la hora de hechas',
      'Unidades libres | 17 | De 22 habilitadas',
      'Ingresos de enero | $ 254.000,00 | Reservas confirmadas que empiezan este mes',
    ]);
  });

  it('dibuja los tres gráficos, cada uno con su título y su resumen', async () => {
    setup();
    await respond();

    expect(created.length).toBe(3);
    expect(created[0].data.datasets[0].data).toEqual([23, 50]);
    expect(created[1].data.datasets[0].data).toEqual([120000, 254000, 0]);
    expect(created[2].options!.indexAxis).toBe('y');
    expect(text()).toContain('Ocupación por día');
    expect(text()).toContain('promedio 36 %');
    expect(text()).toContain('Ingresos por mes');
    expect(text()).toContain('Unidades más reservadas del 1 de diciembre de 2025');
    const labels = Array.from(page.querySelectorAll('canvas')).map((c) =>
      c.getAttribute('aria-label'),
    );
    expect(labels).toEqual([
      'Gráfico de barras de la ocupación por día',
      'Gráfico de barras de los ingresos por mes',
      'Gráfico de barras de las cinco unidades más reservadas',
    ]);
  });

  it('cambiar el rango vuelve a pedir las estadísticas y redibuja', async () => {
    setup();
    await respond();
    const component = fixture.componentInstance as unknown as {
      from: { set(v: string): void };
      to: { set(v: string): void };
    };

    component.from.set('2026-01-01');
    component.to.set('2026-01-31');
    await fixture.whenStable();
    const request = http.expectOne(`${API}/api/resorts/my/stats?from=2026-01-01&to=2026-01-31`);
    expect(page.querySelector('.panel__grid--refreshing')).not.toBeNull();

    request.flush(
      aStats({
        from: '2026-01-01',
        to: '2026-01-31',
        occupancyByDay: [{ date: '2026-01-01', occupiedUnits: 22, totalUnits: 22 }],
        incomeByMonth: [{ month: '2026-01', income: 300000 }],
      }),
    );
    await fixture.whenStable();

    expect(page.querySelector('.panel__grid--refreshing')).toBeNull();
    expect(text()).toContain('Ocupación del 1 al 31 de enero: promedio 100 %');
    expect(text()).toContain('$ 300.000,00');
  });

  it('un rango sin reservas confirmadas muestra el aviso en lugar del gráfico', async () => {
    setup();
    await respond(
      aStats({
        occupancyByDay: [{ date: '2025-12-01', occupiedUnits: 0, totalUnits: 22 }],
        incomeByMonth: [{ month: '2026-01', income: 0 }],
        topUnits: [],
      }),
    );

    expect(created.length).toBe(0);
    expect(text()).toContain('No hay reservas confirmadas en estas fechas.');
    expect(text()).toContain('Todavía no hay ingresos en estas fechas.');
  });

  it('avisa las cancelaciones de los clientes de la semana, con el enlace a la reserva', async () => {
    setup();
    await respond(aStats(), [
      aBooking({
        id: 31,
        status: 'CANCELED',
        canceledBy: 'CLIENT',
        canceledAt: '2026-01-09T10:00:00',
        refundAmount: 25500,
        guests: [aGuest({ fullName: 'Santiago Rodríguez' })],
      }),
      aBooking({
        id: 32,
        status: 'CANCELED',
        canceledBy: 'ADMIN',
        canceledAt: '2026-01-09T10:00:00',
      }),
    ]);

    const links = page.querySelectorAll<HTMLAnchorElement>('.panel__notice');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/admin/bookings/31');
    expect(links[0].textContent!.replace(/\s+/g, ' ')).toContain(
      'Santiago R. canceló la A-03 del 15 al 17/01: se reintegraron $ 25.500,00.',
    );
  });

  it('muestra las tres reseñas más nuevas, con sus estrellas', async () => {
    setup();
    await respond(
      aStats(),
      [],
      [
        review(5, 'Santiago R.'),
        review(4, 'Lucía M.'),
        review(3, 'Pedro G.'),
        review(1, 'Viejo V.'),
      ],
    );

    const reviews = page.querySelectorAll('.panel__review');
    expect(reviews.length).toBe(3);
    expect(reviews[1].querySelector('z-rating')!.textContent!.replace(/\s+/g, ' ')).toContain(
      '4 de 5 estrellas',
    );
    expect(reviews[1].querySelectorAll('.z-rating__star--on').length).toBe(4);
    expect(text()).not.toContain('Viejo V.');
    expect(text()).toContain('Ningún cliente canceló en los últimos 7 días.');
  });

  it('un administrador sin balneario ve el aviso y no se pide nada', async () => {
    setup(null);
    await fixture.whenStable();

    expect(text()).toContain('Todavía no tenés un balneario');
    expect(page.querySelector('.panel__feeds')).toBeNull();
    http.expectNone(() => true);
  });

  it('si la API responde 403, también es que no tiene balneario', async () => {
    setup();
    await fixture.whenStable();
    http.expectOne(STATS).flush({ error: 'x' }, { status: 403, statusText: 'Forbidden' });
    http.expectOne(`${API}/api/bookings`).flush([]);
    http.expectOne(`${API}/api/resorts/4/reviews`).flush([]);
    await fixture.whenStable();

    expect(text()).toContain('Todavía no tenés un balneario');
  });

  it('si fallan las estadísticas, deja reintentar y lo demás se ve igual', async () => {
    setup();
    await fixture.whenStable();
    http.expectOne(STATS).flush({ error: 'x' }, { status: 500, statusText: 'Error' });
    http.expectOne(`${API}/api/bookings`).flush([]);
    http.expectOne(`${API}/api/resorts/4/reviews`).flush([review(5, 'Santiago R.')]);
    await fixture.whenStable();

    expect(text()).toContain('No pudimos traer los números del balneario');
    expect(text()).toContain('Santiago R.');

    Array.from(page.querySelectorAll('button'))
      .find((b) => b.textContent!.includes('Reintentar'))!
      .click();
    await fixture.whenStable();
    http.expectOne(STATS).flush(aStats());
    await fixture.whenStable();

    expect(created.length).toBe(3);
  });
});
