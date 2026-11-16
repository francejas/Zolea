import { booleanAttribute, Component, computed, input } from '@angular/core';
import { LucideStar } from '@lucide/angular';

/** «4,5», o «5» si es entero. */
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/**
 * Una calificación: las estrellas y el número escrito al lado, siempre. Las estrellas son dibujo
 * (el lector de pantalla no las lee): lo que dice cuánto es, es el número.
 *
 * Con `count`, suma cuántas reseñas son («4,5 · 12 reseñas»). Con `compact`, una sola estrella,
 * para las tarjetas de la Portada.
 */
@Component({
  selector: 'z-rating',
  imports: [LucideStar],
  host: { class: 'z-rating' },
  template: `
    <span class="z-rating__stars" aria-hidden="true">
      <!-- El ícono maneja su propio class: va fijo en cada rama. -->
      @for (on of stars(); track $index) {
        @if (on) {
          <svg lucideStar class="z-icon z-rating__star z-rating__star--on"></svg>
        } @else {
          <svg lucideStar class="z-icon z-rating__star"></svg>
        }
      }
    </span>
    <span class="z-rating__value"
      >{{ valueText() }}<span class="z-visually-hidden"> de 5 estrellas</span></span
    >
    @if (countText(); as text) {
      <!-- El espacio de adelante es para el texto leído: a la vista lo separa el gap. -->
      <span class="z-rating__count"> · {{ text }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }

    .z-rating__stars {
      display: inline-flex;
      gap: 2px;
    }

    .z-rating__star {
      width: var(--icon-s);
      height: var(--icon-s);
      color: var(--color-line-strong);
    }

    /* Coral-texto: el coral de la marca no llega a 3:1 contra la espuma. */
    .z-rating__star--on {
      color: var(--color-coral-text);
      fill: var(--color-coral-text);
    }

    .z-rating__value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .z-rating__count {
      color: var(--color-text-muted);
    }
  `,
})
export class ZRating {
  /** De 0 a 5; puede tener decimales, como un promedio. */
  value = input.required<number>();
  /** Cuántas reseñas son; sin él, solo las estrellas y el número. */
  count = input<number | null>(null);
  compact = input(false, { transform: booleanAttribute });

  /** Llenas solo las enteras: 4,5 pinta cuatro, para no mostrar más de lo que dice el número. */
  protected readonly stars = computed(() =>
    this.compact() ? [true] : [1, 2, 3, 4, 5].map((star) => star <= Math.floor(this.value())),
  );

  protected readonly valueText = computed(() => decimal.format(this.value()));

  protected readonly countText = computed(() => {
    const count = this.count();
    if (count === null) return null;
    return count === 1 ? '1 reseña' : `${count} reseñas`;
  });
}
