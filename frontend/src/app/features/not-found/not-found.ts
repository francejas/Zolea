import { Location } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideHouse } from '@lucide/angular';
import { homeOf } from '../../core/auth/home';
import { SessionService } from '../../core/session/session.service';

/**
 * La página 404: la dirección no existe en Zolea. Dice qué se pidió y ofrece por dónde seguir: la
 * Portada, el inicio de quien está adentro (sus reservas o su panel) y volver atrás.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, LucideArrowLeft, LucideHouse],
  template: `
    <section class="not-found" aria-labelledby="not-found-title">
      <div class="not-found__art" aria-hidden="true">
        <span class="not-found__digit">4</span>
        <img src="emblema.svg" alt="" width="120" height="120" />
        <span class="not-found__digit">4</span>
      </div>

      <p class="z-eyebrow">Error 404</p>
      <h1 id="not-found-title" class="not-found__title">No encontramos esta página</h1>
      <p class="not-found__text">
        La dirección <span class="z-code not-found__url">{{ url }}</span> no existe o cambió. Puede
        que el enlace esté mal escrito: revisalo o seguí por acá.
      </p>

      <div class="not-found__actions">
        <a class="z-btn z-btn--primary" routerLink="/">
          <svg lucideHouse class="z-icon" aria-hidden="true"></svg>
          Ir a la portada
        </a>
        @if (home(); as link) {
          <a class="z-btn z-btn--secondary" [routerLink]="link.path">{{ link.label }}</a>
        }
        <button class="z-btn z-btn--ghost" type="button" (click)="back()">
          <svg lucideArrowLeft class="z-icon" aria-hidden="true"></svg>
          Volver atrás
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .not-found {
      display: grid;
      justify-items: center;
      gap: var(--space-3);
      max-width: calc(560px + 2 * var(--gutter));
      margin: 0 auto;
      padding: var(--space-7) var(--gutter) var(--space-8);
      text-align: center;
    }

    .not-found__art {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .not-found__art img {
      width: 96px;
      height: 96px;
    }

    .not-found__digit {
      font: 400 88px / 1 var(--font-display);
      color: var(--color-ink);
    }

    .z-eyebrow {
      margin: 0;
    }

    .not-found__title {
      margin: 0;
      font: 400 var(--text-display-m) / var(--leading-title) var(--font-display);
    }

    .not-found__text {
      max-width: 44ch;
      margin: 0;
      color: var(--color-text-muted);
    }

    .not-found__url {
      overflow-wrap: anywhere;
      color: var(--color-text);
    }

    .not-found__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }

    @media (min-width: 768px) {
      .not-found {
        padding-top: var(--space-8);
      }

      .not-found__art img {
        width: 120px;
        height: 120px;
      }

      .not-found__digit {
        font-size: 120px;
      }

      .not-found__title {
        font-size: var(--text-display-l);
      }
    }
  `,
})
export class NotFound {
  private readonly session = inject(SessionService);
  private readonly location = inject(Location);

  /** La dirección que se pidió: la ruta comodín se queda con todos sus tramos. */
  protected readonly url =
    '/' +
    inject(ActivatedRoute)
      .snapshot.url.map((segment) => segment.path)
      .join('/');

  /** Quien está adentro también puede ir a su inicio: el de cliente o el panel de su balneario. */
  protected readonly home = computed(() => {
    const user = this.session.user();
    if (!user) return null;
    return {
      path: homeOf(user),
      label: user.role === 'ADMIN' ? 'Ir a mi panel' : 'Ir a mi inicio',
    };
  });

  protected back(): void {
    this.location.back();
  }
}
