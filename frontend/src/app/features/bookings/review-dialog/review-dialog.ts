import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { LucideStar } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { Booking } from '../../../core/api/booking.models';
import { Review } from '../../../core/api/review.models';
import { ReviewsApi } from '../../../core/api/reviews.api';
import { toFieldErrors, toUserMessage } from '../../../core/errors/error-message';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZField } from '../../../shared/z-field/z-field';
import { dayRange, unitLabel } from '../booking-format';

/** El comentario, como `Review.MAX_COMMENT` en el backend. */
export const MAX_COMMENT = 500;

const STAR_COUNT = [1, 2, 3, 4, 5];

/**
 * Calificar una estadía terminada: las estrellas, como un grupo de opciones que se maneja con las
 * flechas, y un comentario opcional. Se abre al aparecer y avisa al cerrarse: si calificó, con la
 * reseña (`saved`); si no, con `closed`.
 */
@Component({
  selector: 'app-review-dialog',
  imports: [FormField, LucideStar, ZAlert, ZBtn, ZField],
  templateUrl: './review-dialog.html',
  styleUrl: './review-dialog.scss',
})
export class ReviewDialog {
  private readonly reviewsApi = inject(ReviewsApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly booking = input.required<Booking>();
  /** Calificó: la reseña, como quedó. */
  readonly saved = output<Review>();
  /** Se cerró sin calificar. */
  readonly closed = output<void>();
  /**
   * El backend respondió 400 sin errores de campo: ya estaba calificada o la estadía no terminó.
   * La reserva pudo cambiar desde que se cargó la pantalla, y quien abrió el diálogo la vuelve a traer.
   */
  readonly rejected = output<void>();

  protected readonly stars = STAR_COUNT;
  protected readonly maxComment = MAX_COMMENT;

  // Los campos se llaman igual que en el pedido (`ReviewRequest`), para que `toFieldErrors` pegue
  // cada error en su campo. Las estrellas son texto porque así las dejan los `radio`.
  protected readonly reviewForm = form(signal({ rating: '', comment: '' }), (path) => {
    required(path.rating, { message: 'Elegí de 1 a 5 estrellas.' });
    maxLength(path.comment, MAX_COMMENT, {
      message: `El comentario puede tener hasta ${MAX_COMMENT} caracteres.`,
    });
  });

  /** El error que no es de un campo: «Ya calificaste esta reserva.», sin conexión, etc. */
  protected readonly formError = signal('');

  protected readonly rating = computed(() => Number(this.reviewForm.rating().value()) || 0);

  protected readonly ratingError = computed(() => {
    const state = this.reviewForm.rating();
    const [first] = state.errors();
    return state.touched() && first ? (first.message ?? null) : null;
  });

  protected readonly counter = computed(
    () => `${this.reviewForm.comment().value().length} de ${MAX_COMMENT} caracteres`,
  );

  protected readonly stay = computed(() => {
    const booking = this.booking();
    return `${unitLabel(booking.rentalUnitType, booking.rentalUnitIdentifier)} · ${dayRange(booking.startDate, booking.endDate)}`;
  });

  /** Ya avisó cómo terminó: el `close` del diálogo no tiene que volver a avisar. */
  private done = false;

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  protected starLabel(star: number): string {
    return star === 1 ? '1 estrella' : `${star} estrellas`;
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  protected cancel(): void {
    this.finish();
    this.closed.emit();
  }

  /**
   * Esc mientras se envía no cierra: si se cerrara, Mis reservas sacaría el diálogo y la respuesta
   * ya no tendría a quién avisar, así que la tarjeta seguiría ofreciendo «Calificar».
   */
  protected onCancel(event: Event): void {
    if (this.reviewForm().submitting()) event.preventDefault();
  }

  /** El `close` del diálogo: solo avisa si se cerró con Esc, sin pasar por los botones. */
  protected onClose(): void {
    if (this.done) return;
    // Un segundo Esc seguido el navegador no deja frenarlo: se vuelve a abrir hasta la respuesta.
    if (this.reviewForm().submitting()) {
      this.dialog().nativeElement.showModal();
      return;
    }
    this.done = true;
    this.closed.emit();
  }

  private finish(): void {
    this.done = true;
    this.dialog().nativeElement.close();
  }

  private async send(): Promise<void> {
    if (this.reviewForm().submitting()) return;
    this.formError.set('');

    await submit(this.reviewForm, async () => {
      const { rating, comment } = this.reviewForm().value();
      try {
        const review = await firstValueFrom(
          this.reviewsApi.create(this.booking().id, {
            rating: Number(rating),
            comment: comment.trim() || null,
          }),
        );
        this.finish();
        this.saved.emit(review);
      } catch (error) {
        const err = error as HttpErrorResponse;
        const fieldErrors = toFieldErrors(this.reviewForm, err);
        if (fieldErrors.length > 0) return fieldErrors;
        this.formError.set(toUserMessage(err));
        // Se mira el código, no el texto, igual que al pagar.
        if (err.status === 400) this.rejected.emit();
      }
      return;
    });
  }
}
