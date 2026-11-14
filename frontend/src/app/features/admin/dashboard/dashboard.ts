import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, filter, map, of, switchMap, tap } from 'rxjs';
import { BookingsApi } from '../../../core/api/bookings.api';
import { Review } from '../../../core/api/review.models';
import { ReviewsApi } from '../../../core/api/reviews.api';
import { StatsApi } from '../../../core/api/stats.api';
import { ResortStats } from '../../../core/api/stats.models';
import { toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { readChartTokens } from '../../../shared/chart/chart-tokens';
import { ZChart } from '../../../shared/chart/z-chart';
import { parseIsoDate, todayIso } from '../../../shared/utils/days';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { RangeLabels, ZDateRange } from '../../../shared/z-date-range/z-date-range';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZRating } from '../../../shared/z-rating/z-rating';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import {
  CancellationNotice,
  defaultRange,
  incomeChart,
  occupancyChart,
  recentCancellations,
  todayFigures,
  topUnitsChart,
} from './dashboard-data';

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';
type FeedState = 'loading' | 'ready' | 'error';

/** El rango del Panel no se cobra: son días para mirar, no una estadía. */
const RANGE_LABELS: RangeLabels = {
  from: 'Desde',
  to: 'Hasta',
  pickFrom: 'Elegí desde qué día',
  pickTo: 'Elegí hasta qué día',
};

const todayLabel = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * El Panel (`/admin`): cómo viene el balneario del administrador. Arriba, las cifras de hoy; en el
 * medio, tres gráficos en el rango de fechas que elija; abajo, las cancelaciones de la semana y
 * las últimas reseñas. Las tres partes se piden por separado: si una falla, las otras se ven igual.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, ZAlert, ZChart, ZDateRange, ZProblem, ZRating, ZSkeleton],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly statsApi = inject(StatsApi);
  private readonly bookingsApi = inject(BookingsApi);
  private readonly reviewsApi = inject(ReviewsApi);
  private readonly session = inject(SessionService);

  /** Hoy, una sola vez: es la fecha del resumen y del rango inicial. */
  private readonly today = todayIso();
  /** Chart.js necesita los colores ya resueltos: se leen de tokens.css al abrir. */
  private readonly tokens = readChartTokens();
  private readonly resortId = this.session.user()?.idManagedResort ?? null;

  protected readonly rangeLabels = RANGE_LABELS;
  /** Se puede mirar para atrás: el calendario no corta en hoy. */
  protected readonly minDate = '2020-01-01';
  protected readonly todayText = todayLabel.format(parseIsoDate(this.today));

  protected readonly from = signal<string | null>(defaultRange(this.today).from);
  protected readonly to = signal<string | null>(defaultRange(this.today).to);

  protected readonly state = signal<LoadState>(this.resortId === null ? 'forbidden' : 'loading');
  protected readonly loadError = signal('');
  /** Con los gráficos ya dibujados, se vuelven a pedir: quedan atenuados hasta que llegan. */
  protected readonly refreshing = signal(false);
  /** Falló el pedido de un rango nuevo: se avisa y quedan los gráficos anteriores. */
  protected readonly rangeError = signal('');
  private readonly stats = signal<ResortStats | null>(null);
  /** El ingreso del mes en curso: se guarda la última vez que vino, porque depende del rango. */
  private readonly monthIncome = signal<{ month: string; income: number } | null>(null);
  private readonly reload = signal(0);

  protected readonly noticesState = signal<FeedState>('loading');
  protected readonly notices = signal<CancellationNotice[]>([]);
  protected readonly reviewsState = signal<FeedState>('loading');
  protected readonly reviews = signal<Review[]>([]);

  protected readonly figures = computed(() => {
    const stats = this.stats();
    if (!stats) return [];
    const totalUnits = stats.occupancyByDay[0]?.totalUnits ?? null;
    return todayFigures(stats.today, totalUnits, this.monthIncome());
  });

  protected readonly charts = computed(() => {
    const stats = this.stats();
    if (!stats) return null;
    return {
      occupancy: occupancyChart(stats, this.tokens),
      income: incomeChart(stats, this.tokens),
      topUnits: topUnitsChart(stats, this.tokens),
    };
  });

  /** El pedido que corresponde al rango elegido; null mientras falta una de las dos fechas. */
  private readonly request = computed(() => {
    this.reload();
    const from = this.from();
    const to = this.to();
    return from && to && from <= to ? { from, to } : null;
  });

  constructor() {
    if (this.resortId === null) return;

    toObservable(this.request)
      .pipe(
        filter((range) => range !== null),
        tap(() => {
          this.rangeError.set('');
          if (this.stats()) this.refreshing.set(true);
          else this.state.set('loading');
        }),
        // Un rango nuevo descarta la respuesta del anterior, si todavía no llegó.
        switchMap(({ from, to }) =>
          this.statsApi.get(from, to).pipe(
            map((stats) => ({ stats, error: null })),
            catchError((error: HttpErrorResponse) => of({ stats: null, error })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ stats, error }) => {
        this.refreshing.set(false);
        if (stats) this.show(stats);
        else this.fail(error!);
      });

    this.loadNotices();
    this.loadReviews();
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  protected loadNotices(): void {
    this.noticesState.set('loading');
    this.bookingsApi.list().subscribe({
      next: (bookings) => {
        this.notices.set(recentCancellations(bookings, Date.now()));
        this.noticesState.set('ready');
      },
      error: () => this.noticesState.set('error'),
    });
  }

  protected loadReviews(): void {
    this.reviewsState.set('loading');
    this.reviewsApi.listByResort(this.resortId!).subscribe({
      next: (reviews) => {
        this.reviews.set(reviews.slice(0, 3));
        this.reviewsState.set('ready');
      },
      error: () => this.reviewsState.set('error'),
    });
  }

  /** «Santiago R.», o sin nombre si la reseña no lo trae. */
  protected author(review: Review): string {
    return review.author ?? 'Un cliente';
  }

  protected reviewDate(review: Review): string {
    return shortDate.format(parseIsoDate(review.createdAt.slice(0, 10))).replace(/\./g, '');
  }

  private show(stats: ResortStats): void {
    const month = this.today.slice(0, 7);
    const current = stats.incomeByMonth.find((entry) => entry.month === month);
    if (current) this.monthIncome.set(current);
    this.stats.set(stats);
    this.state.set('ready');
  }

  private fail(error: HttpErrorResponse): void {
    if (error.status === 403) {
      this.state.set('forbidden');
    } else if (this.stats()) {
      this.rangeError.set(toUserMessage(error));
    } else {
      this.loadError.set(toUserMessage(error));
      this.state.set('error');
    }
  }
}

const shortDate = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
