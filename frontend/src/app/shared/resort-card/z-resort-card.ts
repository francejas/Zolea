import { Component, computed, input, output, signal } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { LucideCheck, LucideMapPin } from '@lucide/angular';
import { Amenity, RentalUnit } from '../../core/api/resort.models';
import { byAmenityId } from '../utils/amenity-icons';
import { ZRating } from '../z-rating/z-rating';

const VISIBLE_AMENITIES = 3;
const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export interface ResortCardData {
  name: string;
  location: string;
  coverPhotoUrl: string | null;
  amenities: Amenity[];
  rentalUnits: RentalUnit[];
  averageRating?: number | null;
  reviewCount?: number;
  availableUnits?: number | null;
}

export interface ResortCardLink {
  commands: unknown[];
  queryParams?: Params | null;
}

@Component({
  selector: 'z-resort-card',
  imports: [LucideCheck, LucideMapPin, RouterLink, ZRating],
  host: {
    class: 'z-resort-card',
    '[class.z-resort-card--muted]': 'muted()',
  },
  template: `
    <div class="z-photo">
      @if (photo(); as photo) {
        <img [src]="photo" alt="" loading="lazy" (error)="onPhotoError(photo)" />
      }
    </div>

    <div class="z-resort-card__body">
      @if (link(); as link) {
        <h3 class="z-resort-card__name">
          <a [routerLink]="link.commands" [queryParams]="link.queryParams">{{ data().name }}</a>
        </h3>
      } @else {
        <p class="z-resort-card__name">
          <span>{{ data().name }}</span>
        </p>
      }
      <p class="z-place">
        <svg lucideMapPin class="z-icon" aria-hidden="true"></svg>{{ data().location }}
      </p>

      @if (rating(); as rating) {
        <z-rating
          class="z-resort-card__rating"
          [value]="rating.value"
          [count]="rating.count"
          compact
        />
      }

      @if (freeUnits(); as free) {
        <p class="z-resort-card__free">{{ free }}</p>
      }

      <div class="z-amenities">
        @for (amenity of topAmenities(); track amenity.idAmenity) {
          <span class="z-amenity">
            <svg lucideCheck class="z-icon" aria-hidden="true"></svg>{{ amenity.name }}
          </span>
        }
        @if (moreAmenities() > 0) {
          <span class="z-amenity z-amenity--more">
            +{{ moreAmenities() }}<span class="z-visually-hidden"> servicios más</span>
          </span>
        }
      </div>

      <div class="z-resort-card__foot">
        @if (minPrice(); as price) {
          <span class="z-price-from">
            desde
            <span class="z-price-from__amount"
              ><strong class="z-money">{{ price }}</strong> por día</span
            >
          </span>
        }
        @if (link()) {
          <span class="z-btn z-btn--primary z-btn--compact z-resort-card__cta" aria-hidden="true">
            Ver balneario
          </span>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: var(--border);
      border-radius: var(--radius-m);
      background: var(--color-sand);
      transition:
        border-color var(--duration) var(--ease),
        opacity var(--duration) var(--ease);
    }

    :host(:hover) {
      border-color: var(--color-line-strong);
    }

    :host(:hover) .z-resort-card__cta {
      background: var(--color-ink-hover);
    }

    :host(.z-resort-card--muted) {
      opacity: 0.55;
      filter: grayscale(1);
    }

    .z-resort-card__body {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
    }

    .z-resort-card__name {
      margin: 0;
      font: 400 var(--text-display-s) / var(--leading-title) var(--font-display);
      overflow-wrap: anywhere;
    }

    .z-resort-card__name a {
      color: inherit;
      text-decoration: none;
    }

    .z-resort-card__name a::after {
      content: '';
      position: absolute;
      inset: 0;
    }

    .z-resort-card__name a:focus-visible {
      outline: none;
    }

    :host(:has(a:focus-visible)) {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }

    .z-resort-card__rating {
      font-size: var(--text-small);
    }

    .z-resort-card__free {
      margin: 0;
      font-weight: 600;
      font-size: var(--text-small);
      color: var(--color-ink);
    }

    .z-resort-card__foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-top: var(--space-1);
    }

    .z-price-from {
      font-size: var(--text-small);
      color: var(--color-text-muted);
    }

    .z-price-from strong {
      color: var(--color-ink);
      font-size: 16px;
    }

    .z-price-from__amount {
      white-space: nowrap;
    }

    .z-resort-card__cta {
      margin-left: auto;
    }
  `,
})
export class ZResortCard {
  /** Datos que se muestran en la tarjeta, tanto en la Portada como en la vista previa. */
  readonly data = input.required<ResortCardData>();
  /** En la Portada cubre toda la tarjeta; en la vista previa queda vacío. */
  readonly link = input<ResortCardLink | null>(null);
  /** Atenúa una tarjeta que no está publicada, sin cambiar su contenido. */
  readonly muted = input(false);
  /** El padre lo usa solo para mostrar su aviso contextual. */
  readonly photoError = output<string>();
  private readonly brokenPhoto = signal<string | null>(null);

  protected readonly photo = computed(() => {
    const photo = this.data().coverPhotoUrl;
    return photo !== this.brokenPhoto() ? photo : null;
  });
  protected readonly topAmenities = computed(() =>
    [...this.data().amenities].sort(byAmenityId).slice(0, VISIBLE_AMENITIES),
  );
  protected readonly moreAmenities = computed(() =>
    Math.max(this.data().amenities.length - VISIBLE_AMENITIES, 0),
  );
  protected readonly minPrice = computed(() => {
    const prices = this.data()
      .rentalUnits.filter((unit) => !unit.isBlocked && !unit.retired)
      .map((unit) => unit.dailyPrice);
    return prices.length > 0 ? pesos.format(Math.min(...prices)) : null;
  });
  protected readonly rating = computed(() => {
    const value = this.data().averageRating;
    const count = this.data().reviewCount ?? 0;
    return value != null && count > 0 ? { value, count } : null;
  });
  protected readonly freeUnits = computed(() => {
    const count = this.data().availableUnits;
    if (count == null) return null;
    return count === 1 ? '1 lugar libre' : `${count} lugares libres`;
  });

  protected onPhotoError(url: string): void {
    this.brokenPhoto.set(url);
    this.photoError.emit(url);
  }
}
