import { ChartConfiguration, ChartDataset, ChartOptions, TooltipItem } from 'chart.js';
import { Booking } from '../../../core/api/booking.models';
import { ResortStats, TodayStats } from '../../../core/api/stats.models';
import { ChartTokens } from '../../../shared/chart/chart-tokens';
import { parseIsoDate, parseResortDateTime, toIsoDate } from '../../../shared/utils/days';
import { money, unitLabel } from '../../../shared/utils/format';

/**
 * Lo que muestra el Panel, armado desde las respuestas de la API. Son funciones sin estado para
 * poder probarlas sin pantalla: la pantalla solo las llama y dibuja lo que devuelven.
 */

/** Un gráfico listo para `z-chart`, con la frase que lo resume. */
export interface ChartView {
  config: ChartConfiguration<'bar'>;
  /** Lo que dice el gráfico en una frase: va debajo del título y la lee el lector de pantalla. */
  summary: string;
  /** Todo en cero: en lugar del gráfico va un aviso. */
  empty: boolean;
}

/** Una cifra del resumen de hoy. */
export interface Figure {
  label: string;
  value: string;
  context: string;
}

/** Un aviso de cancelación, ya escrito. */
export interface CancellationNotice {
  id: number;
  text: string;
  /** «mié 11 nov»: cuándo canceló. */
  when: string;
}

const WEEK_MS = 7 * 86_400_000;

// Se crean una sola vez: un formateador nuevo por cada dibujo es caro.
const integer = new Intl.NumberFormat('es-AR');
const compactMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const dayMonthShort = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
const dayMonthLong = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' });
const weekdayDayMonth = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const monthShort = new Intl.DateTimeFormat('es-AR', { month: 'short' });
const monthLong = new Intl.DateTimeFormat('es-AR', { month: 'long' });

/** El rango que pide el Panel al abrir: del primer día del mes pasado al último del que viene. */
export function defaultRange(today: string): { from: string; to: string } {
  const day = parseIsoDate(today);
  return {
    from: toIsoDate(new Date(day.getFullYear(), day.getMonth() - 1, 1)),
    to: toIsoDate(new Date(day.getFullYear(), day.getMonth() + 2, 0)),
  };
}

/** Las seis cifras de arriba. `totalUnits` y el ingreso del mes salen de los gráficos. */
export function todayFigures(
  today: TodayStats,
  totalUnits: number | null,
  monthIncome: { month: string; income: number } | null,
): Figure[] {
  return [
    {
      label: 'Reservas activas',
      value: integer.format(today.activeBookings),
      context: 'Confirmadas, con hoy adentro',
    },
    {
      label: 'Huéspedes esperados',
      value: integer.format(today.expectedGuests),
      context: 'Titulares y acompañantes',
    },
    {
      label: 'Ya entraron',
      value: integer.format(today.checkedIn),
      context:
        today.expectedGuests === 0
          ? 'Hoy no se espera a nadie'
          : `De ${integer.format(today.expectedGuests)} esperados`,
    },
    {
      label: 'Pendientes de pago',
      value: integer.format(today.pendingBookings),
      context: 'Vencen a la hora de hechas',
    },
    {
      label: 'Unidades libres',
      value: integer.format(today.freeUnits),
      context:
        totalUnits === null
          ? 'Sin reserva ni bloqueo hoy'
          : `De ${integer.format(totalUnits)} habilitadas`,
    },
    monthIncome === null
      ? { label: 'Ingresos del mes', value: '—', context: 'Elegí fechas que incluyan este mes' }
      : {
          label: `Ingresos de ${monthLong.format(monthDate(monthIncome.month))}`,
          value: money(monthIncome.income),
          context: 'Reservas confirmadas que empiezan este mes',
        },
  ];
}

/** Ocupación por día, en barras: el porcentaje de unidades con una reserva confirmada. */
export function occupancyChart(stats: ResortStats, tokens: ChartTokens): ChartView {
  const days = stats.occupancyByDay;
  const shares = days.map((day) => (day.totalUnits > 0 ? day.occupiedUnits / day.totalUnits : 0));
  const percents = shares.map((share) => Math.round(share * 100));
  const empty = days.every((day) => day.occupiedUnits === 0);
  const range = rangeText(stats.from, stats.to);

  let summary = `Ocupación ${range}: no hay reservas confirmadas.`;
  if (!empty) {
    const average = Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 100);
    const peak = shares.indexOf(Math.max(...shares));
    summary =
      `Ocupación ${range}: promedio ${average} %; el día más lleno, el ` +
      `${weekdayText(days[peak].date)}, con ${percents[peak]} %.`;
  }

  const options = barOptions(tokens, {
    categoryTicks: 8,
    // El tope sale de los datos, hasta 100: con poca ocupación, las barras igual se ven.
    valueMax: percents.some((percent) => percent > 90) ? 100 : undefined,
    valueTick: (value) => `${value} %`,
    title: (index) => weekdayText(days[index].date),
    label: (index) =>
      `${percents[index]} % · ${days[index].occupiedUnits} de ${days[index].totalUnits} unidades`,
  });

  return {
    config: {
      type: 'bar',
      data: {
        labels: days.map((day) => withoutDots(dayMonthShort.format(parseIsoDate(day.date)))),
        datasets: [bars(percents, tokens)],
      },
      options,
    },
    summary,
    empty,
  };
}

/** Ingresos por mes, en barras: lo que suman las reservas confirmadas que empiezan cada mes. */
export function incomeChart(stats: ResortStats, tokens: ChartTokens): ChartView {
  const months = stats.incomeByMonth;
  const incomes = months.map((month) => month.income);
  const empty = incomes.every((income) => income === 0);
  const years = new Set(months.map((month) => month.month.slice(0, 4)));
  const range = monthRangeText(months.map((month) => month.month));

  let summary = `Ingresos ${range}: todavía no hay reservas confirmadas.`;
  if (!empty && months.length === 1) {
    summary = `Ingresos ${range}: ${money(incomes[0])}.`;
  } else if (!empty) {
    const total = incomes.reduce((a, b) => a + b, 0);
    const best = months[incomes.indexOf(Math.max(...incomes))];
    summary =
      `Ingresos ${range}: ${money(total)} en total; el mejor mes, ` +
      `${monthLong.format(monthDate(best.month))}, con ${money(best.income)}.`;
  }

  const options = barOptions(tokens, {
    valueTick: (value) => compactMoney.format(value),
    title: (index) => capitalize(monthYearText(months[index].month)),
    label: (index) => money(incomes[index]),
  });

  return {
    config: {
      type: 'bar',
      data: {
        labels: months.map((month) => {
          const name = withoutDots(monthShort.format(monthDate(month.month)));
          return years.size > 1 ? `${name} ${month.month.slice(2, 4)}` : name;
        }),
        datasets: [bars(incomes, tokens)],
      },
      options,
    },
    summary,
    empty,
  };
}

/** Las cinco unidades más reservadas, en barras horizontales: los días reservados de cada una. */
export function topUnitsChart(stats: ResortStats, tokens: ChartTokens): ChartView {
  const units = stats.topUnits;
  const names = units.map((unit) => unitLabel(unit.type, unit.identifier));
  const range = rangeText(stats.from, stats.to);
  const empty = units.length === 0;

  const summary = empty
    ? `Unidades más reservadas ${range}: ninguna tiene reservas confirmadas.`
    : `Unidades más reservadas ${range}: ` +
      units.map((unit, index) => `${names[index]}, ${daysText(unit.days)}`).join('; ') +
      '.';

  const options = barOptions(tokens, {
    horizontal: true,
    valuePrecision: 0,
    title: (index) => names[index],
    label: (index) => daysText(units[index].days),
  });

  return {
    config: {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          bars(
            units.map((unit) => unit.days),
            tokens,
          ),
        ],
      },
      options,
    },
    summary,
    empty,
  };
}

/**
 * Las reservas que canceló el cliente en los últimos 7 días, de la más nueva a la más vieja. Las
 * del administrador no van: las canceló él.
 */
export function recentCancellations(bookings: Booking[], now: number): CancellationNotice[] {
  return bookings
    .filter((booking) => booking.status === 'CANCELED' && booking.canceledBy === 'CLIENT')
    .map((booking) => ({ booking, at: parseResortDateTime(booking.canceledAt ?? '') }))
    .filter(({ at }) => !Number.isNaN(at) && at <= now && now - at <= WEEK_MS)
    .sort((a, b) => b.at - a.at)
    .map(({ booking }) => ({
      id: booking.id,
      text:
        `${shortName(booking.guests[0]?.fullName)} canceló la ${booking.rentalUnitIdentifier} ` +
        `${stayText(booking.startDate, booking.endDate)}: ${refundText(booking.refundAmount)}`,
      when: weekdayText(booking.canceledAt!.slice(0, 10)),
    }));
}

/** «Santiago R.»: el nombre y la inicial del apellido, como las reseñas. */
export function shortName(fullName: string | null | undefined): string {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return 'Un cliente';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Cómo cambia cada gráfico lo que comparten los tres. */
interface BarSetup {
  /** Barras horizontales: las categorías van en el eje vertical. */
  horizontal?: boolean;
  /** Cuántas fechas se escriben abajo como mucho, para que no se pisen. */
  categoryTicks?: number;
  valueMax?: number;
  /** Decimales de las marcas del eje de los valores: 0 para contar días. */
  valuePrecision?: number;
  valueTick?: (value: number) => string;
  /** El globo: la categoría arriba y el valor, más fuerte, abajo. */
  title: (index: number) => string;
  label: (index: number) => string;
}

/** Lo que comparten los tres gráficos: ejes discretos, una sola serie y el globo con el valor. */
function barOptions(tokens: ChartTokens, setup: BarSetup): ChartOptions<'bar'> {
  const font = { family: tokens.font, size: 12 };
  const category = {
    type: 'category' as const,
    grid: { display: false },
    border: { color: tokens.grid },
    ticks: {
      color: tokens.text,
      font,
      maxRotation: 0,
      autoSkip: true,
      ...(setup.categoryTicks !== undefined && { maxTicksLimit: setup.categoryTicks }),
    },
  };
  const value = {
    type: 'linear' as const,
    beginAtZero: true,
    ...(setup.valueMax !== undefined && { max: setup.valueMax }),
    grid: { color: tokens.grid },
    border: { display: false },
    ticks: {
      color: tokens.text,
      font,
      maxTicksLimit: 5,
      ...(setup.valuePrecision !== undefined && { precision: setup.valuePrecision }),
      ...(setup.valueTick && {
        callback: (tick: string | number) => setup.valueTick!(Number(tick)),
      }),
    },
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: setup.horizontal ? 'y' : 'x',
    // El globo aparece con el puntero en cualquier parte de la columna, no solo sobre la barra.
    interaction: { mode: 'index', intersect: false },
    scales: setup.horizontal ? { x: value, y: category } : { x: category, y: value },
    plugins: {
      tooltip: {
        backgroundColor: tokens.tooltip,
        titleColor: tokens.tooltipText,
        bodyColor: tokens.tooltipText,
        titleFont: { family: tokens.font, size: 12, weight: 'normal' },
        bodyFont: { family: tokens.font, size: 14, weight: 'bold' },
        padding: 10,
        cornerRadius: 4,
        displayColors: false,
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => setup.title(items[0].dataIndex),
          label: (item: TooltipItem<'bar'>) => setup.label(item.dataIndex),
        },
      },
    },
  };
}

/** Barras finas, con la punta redondeada y la base recta, y un poco de aire entre una y otra. */
function bars(data: number[], tokens: ChartTokens): ChartDataset<'bar'> {
  return {
    data,
    backgroundColor: tokens.mark,
    hoverBackgroundColor: tokens.markHover,
    borderRadius: 4,
    maxBarThickness: 24,
    categoryPercentage: 0.9,
    barPercentage: 0.9,
  };
}

/** «del 1 al 30 de enero», «del 1 de octubre al 31 de diciembre», o con los años si cambian. */
export function rangeText(from: string, to: string): string {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (from === to) return `el ${dayMonthLong.format(end)}`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `del ${dayMonthLong.format(start)} de ${start.getFullYear()} al ${dayMonthLong.format(end)} de ${end.getFullYear()}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `del ${start.getDate()} al ${dayMonthLong.format(end)}`;
  }
  return `del ${dayMonthLong.format(start)} al ${dayMonthLong.format(end)}`;
}

/** «de noviembre», «de octubre a diciembre», o con los años si cambian. */
function monthRangeText(months: string[]): string {
  if (months.length === 0) return '';
  const first = months[0];
  const last = months[months.length - 1];
  if (first === last) return `de ${monthLong.format(monthDate(first))}`;
  if (first.slice(0, 4) !== last.slice(0, 4)) {
    return `de ${monthYearText(first)} a ${monthYearText(last)}`;
  }
  return `de ${monthLong.format(monthDate(first))} a ${monthLong.format(monthDate(last))}`;
}

/** «noviembre de 2026». */
function monthYearText(month: string): string {
  return `${monthLong.format(monthDate(month))} de ${month.slice(0, 4)}`;
}

/** «del 15 al 17/01», «del 30/01 al 02/02» o «el 15/01». */
function stayText(start: string, end: string): string {
  const [, startMonth, startDay] = start.split('-');
  const [, endMonth, endDay] = end.split('-');
  if (start === end) return `el ${Number(startDay)}/${startMonth}`;
  if (startMonth === endMonth) return `del ${Number(startDay)} al ${Number(endDay)}/${endMonth}`;
  return `del ${Number(startDay)}/${startMonth} al ${Number(endDay)}/${endMonth}`;
}

function refundText(refund: number | null): string {
  return refund !== null && refund > 0
    ? `se reintegraron ${money(refund)}.`
    : 'no estaba paga, sin reintegro.';
}

function daysText(days: number): string {
  return days === 1 ? '1 día' : `${integer.format(days)} días`;
}

/** «vie 13 nov». */
function weekdayText(iso: string): string {
  return withoutDots(weekdayDayMonth.format(parseIsoDate(iso)).replace(',', ''));
}

/** El día 1 de un mes `YYYY-MM`, como fecha local. */
function monthDate(month: string): Date {
  return parseIsoDate(`${month}-01`);
}

function withoutDots(text: string): string {
  return text.replace(/\./g, '');
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
