import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { Review } from '../../../core/api/review.models';
import { ReviewsApi } from '../../../core/api/reviews.api';
import { parseIsoDate } from '../../../shared/utils/days';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZRating } from '../../../shared/z-rating/z-rating';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';

type State = 'loading' | 'ready' | 'error';

/** «12 de enero de 2026». */
const longDate = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Lo que opinaron del balneario, la reseña más nueva primero (así las manda la API), con quién la
 * escribió y cuándo. Se pide aparte de la Ficha: si falla, la Ficha se sigue usando para reservar.
 */
@Component({
  selector: 'app-resort-reviews',
  imports: [ZAlert, ZRating, ZSkeleton],
  templateUrl: './resort-reviews.html',
  styleUrl: './resort-reviews.scss',
})
export class ResortReviews {
  private readonly reviewsApi = inject(ReviewsApi);

  readonly resortId = input.required<number>();

  protected readonly state = signal<State>('loading');
  protected readonly reviews = signal<Review[]>([]);
  private readonly attempt = signal(0);

  constructor() {
    toObservable(computed(() => ({ id: this.resortId(), attempt: this.attempt() })))
      .pipe(
        tap(() => this.state.set('loading')),
        switchMap(({ id }) =>
          this.reviewsApi.listByResort(id).pipe(
            map((reviews) => ({ reviews, ok: true })),
            catchError(() => of({ reviews: [], ok: false })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ reviews, ok }) => {
        this.reviews.set(reviews);
        this.state.set(ok ? 'ready' : 'error');
      });
  }

  protected retry(): void {
    this.attempt.update((attempt) => attempt + 1);
  }

  protected author(review: Review): string {
    return review.author ?? 'Un cliente';
  }

  protected date(review: Review): string {
    return longDate.format(parseIsoDate(review.createdAt.slice(0, 10)));
  }
}
