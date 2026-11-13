import { TooltipItem } from 'chart.js';
import { ResortStats } from '../../../core/api/stats.models';
import { ChartTokens } from '../../../shared/chart/chart-tokens';
import { parseResortDateTime } from '../../../shared/utils/days';
import { aBooking, aGuest } from '../../bookings/booking.fixtures';
import {
  ChartView,
  defaultRange,
  incomeChart,
  occupancyChart,
  rangeText,
  recentCancellations,
  shortName,
  todayFigures,
  topUnitsChart,
} from './dashboard-data';

const tokens: ChartTokens = {
  mark: '#AA442B',
  markHover: '#482A1D',
  grid: 'rgb(72 42 29 / 0.16)',
  text: '#6B5244',
  tooltip: '#482A1D',
  tooltipText: '#FFFCF6',
  font: 'Hanken Grotesk',
};

/** `Intl` separa el signo de la cifra con un espacio duro. */
const plain = (text: string) => text.replace(/\s/g, ' ');

function aStats(overrides: Partial<ResortStats> = {}): ResortStats {
  return {
    from: '2026-01-01',
    to: '2026-01-03',
    today: {
      activeBookings: 3,
      expectedGuests: 8,
      checkedIn: 2,
      pendingBookings: 1,
      freeUnits: 17,
    },
    occupancyByDay: [
      { date: '2026-01-01', occupiedUnits: 0, totalUnits: 4 },
      { date: '2026-01-02', occupiedUnits: 2, totalUnits: 4 },
      { date: '2026-01-03', occupiedUnits: 4, totalUnits: 4 },
    ],
    incomeByMonth: [{ month: '2026-01', income: 254000 }],
    topUnits: [
      { idRentalUnit: 9, identifier: 'C-01', type: 'TENT', days: 14 },
      { idRentalUnit: 3, identifier: 'A-03', type: 'UMBRELLA', days: 1 },
    ],
    ...overrides,
  };
}

/** Lo que dice el globo de una barra, como lo pide Chart.js. */
function tooltipOf(view: ChartView, index: number): { title: string; label: string } {
  const callbacks = view.config.options!.plugins!.tooltip!.callbacks!;
  const item = { dataIndex: index } as TooltipItem<'bar'>;
  const call = (fn: unknown, arg: unknown) =>
    (fn as (this: unknown, arg: unknown) => string).call(undefined, arg);
  return { title: call(callbacks.title, [item]), label: call(callbacks.label, item) };
}

describe('el rango del Panel', () => {
  it('abre del primer día del mes pasado al último del que viene', () => {
    expect(defaultRange('2026-11-13')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(defaultRange('2026-01-10')).toEqual({ from: '2025-12-01', to: '2026-02-28' });
  });

  it('dice el rango sin repetir el mes ni el año', () => {
    expect(rangeText('2026-01-01', '2026-01-30')).toBe('del 1 al 30 de enero');
    expect(rangeText('2026-10-01', '2026-12-31')).toBe('del 1 de octubre al 31 de diciembre');
    expect(rangeText('2025-12-01', '2026-02-28')).toBe(
      'del 1 de diciembre de 2025 al 28 de febrero de 2026',
    );
    expect(rangeText('2026-01-15', '2026-01-15')).toBe('el 15 de enero');
  });
});

describe('las cifras de hoy', () => {
  it('arma las seis, con el total de unidades y el ingreso del mes', () => {
    const figures = todayFigures(aStats().today, 22, { month: '2026-11', income: 254000 });

    expect(figures.map((f) => f.label)).toEqual([
      'Reservas activas',
      'Huéspedes esperados',
      'Ya entraron',
      'Pendientes de pago',
      'Unidades libres',
      'Ingresos de noviembre',
    ]);
    expect(figures.map((f) => plain(f.value))).toEqual(['3', '8', '2', '1', '17', '$ 254.000,00']);
    expect(figures[2].context).toBe('De 8 esperados');
    expect(figures[4].context).toBe('De 22 habilitadas');
  });

  it('sin el mes en curso en el rango, no inventa el ingreso', () => {
    const figures = todayFigures(aStats().today, null, null);

    expect(figures[5].value).toBe('—');
    expect(figures[4].context).toBe('Sin reserva ni bloqueo hoy');
  });
});

describe('ocupación por día', () => {
  it('pasa cada día a porcentaje de unidades ocupadas, con la fecha corta', () => {
    const view = occupancyChart(aStats(), tokens);

    expect(view.config.type).toBe('bar');
    expect(view.config.data.labels).toEqual(['1 ene', '2 ene', '3 ene']);
    expect(view.config.data.datasets[0].data).toEqual([0, 50, 100]);
    expect(view.config.data.datasets[0].backgroundColor).toBe('#AA442B');
    expect(view.empty).toBe(false);
  });

  it('lo resume con el promedio y el día más lleno', () => {
    const view = occupancyChart(aStats(), tokens);

    expect(view.summary).toBe(
      'Ocupación del 1 al 3 de enero: promedio 50 %; el día más lleno, el sáb 3 ene, con 100 %.',
    );
    expect(tooltipOf(view, 1)).toEqual({ title: 'vie 2 ene', label: '50 % · 2 de 4 unidades' });
  });

  it('un balneario sin unidades no divide por cero', () => {
    const view = occupancyChart(
      aStats({ occupancyByDay: [{ date: '2026-01-01', occupiedUnits: 0, totalUnits: 0 }] }),
      tokens,
    );

    expect(view.config.data.datasets[0].data).toEqual([0]);
    expect(view.empty).toBe(true);
    expect(view.summary).toBe('Ocupación del 1 al 3 de enero: no hay reservas confirmadas.');
  });
});

describe('ingresos por mes', () => {
  it('una barra por mes, con la suma y el mejor mes', () => {
    const view = incomeChart(
      aStats({
        incomeByMonth: [
          { month: '2026-10', income: 100000 },
          { month: '2026-11', income: 200000 },
          { month: '2026-12', income: 0 },
        ],
      }),
      tokens,
    );

    expect(view.config.data.labels).toEqual(['oct', 'nov', 'dic']);
    expect(view.config.data.datasets[0].data).toEqual([100000, 200000, 0]);
    expect(plain(view.summary)).toBe(
      'Ingresos de octubre a diciembre: $ 300.000,00 en total; el mejor mes, noviembre, con $ 200.000,00.',
    );
    expect(plain(tooltipOf(view, 1).label)).toBe('$ 200.000,00');
  });

  it('con un solo mes, no compara con ningún otro', () => {
    const view = incomeChart(aStats(), tokens);

    expect(plain(view.summary)).toBe('Ingresos de enero: $ 254.000,00.');
  });

  it('si cruza de año, cada mes lleva el suyo', () => {
    const view = incomeChart(
      aStats({
        incomeByMonth: [
          { month: '2025-12', income: 0 },
          { month: '2026-01', income: 0 },
        ],
      }),
      tokens,
    );

    expect(view.config.data.labels).toEqual(['dic 25', 'ene 26']);
    expect(view.empty).toBe(true);
    expect(view.summary).toBe(
      'Ingresos de diciembre de 2025 a enero de 2026: todavía no hay reservas confirmadas.',
    );
  });
});

describe('unidades más reservadas', () => {
  it('una barra horizontal por unidad, con su nombre y sus días', () => {
    const view = topUnitsChart(aStats(), tokens);

    expect(view.config.options!.indexAxis).toBe('y');
    expect(view.config.data.labels).toEqual(['Carpa C-01', 'Sombrilla A-03']);
    expect(view.config.data.datasets[0].data).toEqual([14, 1]);
    expect(view.summary).toBe(
      'Unidades más reservadas del 1 al 3 de enero: Carpa C-01, 14 días; Sombrilla A-03, 1 día.',
    );
    expect(tooltipOf(view, 0)).toEqual({ title: 'Carpa C-01', label: '14 días' });
  });

  it('sin reservas en el rango, lo dice', () => {
    const view = topUnitsChart(aStats({ topUnits: [] }), tokens);

    expect(view.empty).toBe(true);
    expect(view.summary).toContain('ninguna tiene reservas confirmadas');
  });
});

describe('avisos de cancelación', () => {
  // Hoy es el sábado 10 de enero de 2026, al mediodía de Buenos Aires.
  const now = parseResortDateTime('2026-01-10T12:00:00');
  const canceled = (id: number, canceledAt: string, overrides = {}) =>
    aBooking({
      id,
      status: 'CANCELED',
      canceledBy: 'CLIENT',
      canceledAt,
      guests: [aGuest({ fullName: 'Santiago Rodríguez' })],
      ...overrides,
    });

  it('trae las que canceló el cliente en los últimos 7 días, la más nueva primero', () => {
    const notices = recentCancellations(
      [
        canceled(1, '2026-01-09T10:00:00', { refundAmount: 25500 }),
        canceled(2, '2026-01-03T11:59:00'),
        canceled(3, '2026-01-09T10:00:00', { canceledBy: 'ADMIN' }),
        canceled(4, '2026-01-10T09:00:00', { refundAmount: null }),
        canceled(5, '2026-01-03T12:00:00'),
        aBooking({ id: 6, status: 'CONFIRMED' }),
      ],
      now,
    );

    // La 2 es de hace más de 7 días; la 3 la canceló el balneario; la 6 no está cancelada.
    expect(notices.map((n) => n.id)).toEqual([4, 1, 5]);
  });

  it('escribe quién, qué unidad, qué días y cuánto se reintegró', () => {
    const [notice] = recentCancellations(
      [canceled(1, '2026-01-09T10:00:00', { refundAmount: 25500 })],
      now,
    );

    expect(plain(notice.text)).toBe(
      'Santiago R. canceló la A-03 del 15 al 17/01: se reintegraron $ 25.500,00.',
    );
    expect(notice.when).toBe('vie 9 ene');
  });

  it('una pendiente cancelada no tenía nada para reintegrar', () => {
    const [notice] = recentCancellations(
      [
        canceled(1, '2026-01-09T10:00:00', {
          refundAmount: null,
          startDate: '2026-01-30',
          endDate: '2026-02-02',
        }),
      ],
      now,
    );

    expect(notice.text).toBe(
      'Santiago R. canceló la A-03 del 30/01 al 2/02: no estaba paga, sin reintegro.',
    );
  });

  it('acorta el nombre como las reseñas', () => {
    expect(shortName('Santiago Rodríguez')).toBe('Santiago R.');
    expect(shortName('María José García')).toBe('María G.');
    expect(shortName('Cher')).toBe('Cher');
    expect(shortName(undefined)).toBe('Un cliente');
  });
});
