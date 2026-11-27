import { Location } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideHouse } from '@lucide/angular';
import { homeOf } from '../../core/auth/home';
import { SessionService } from '../../core/session/session.service';

/** Los dos errores que llegan a una página propia. Los demás se muestran en la pantalla. */
export type ErrorCode = 404 | 403;

/**
 * La página de error única (#65): el código grande, con el emblema como el 0, y un texto que no
 * dice de quién es nada. Lo ajeno responde como lo que no existe, así que el 404 cubre los dos
 * casos; el 403 es solo para el tipo de cuenta equivocado.
 *
 * La usan la ruta comodín (404), la ruta a la que mandan los guards (403) y los detalles de reserva
 * del cliente y del administrador, adentro de su pantalla, cuando la reserva no se puede ver.
 */
@Component({
  selector: 'app-error-page',
  imports: [RouterLink, LucideArrowLeft, LucideHouse],
  template: `
    <section class="error-page" aria-labelledby="error-page-title">
      <div class="error-page__art" aria-hidden="true">
        <span class="error-page__digit">{{ digits()[0] }}</span>
        <img src="emblema.svg" alt="" width="120" height="120" />
        <span class="error-page__digit">{{ digits()[1] }}</span>
      </div>

      <p class="z-eyebrow">Error {{ code() }}</p>
      @if (code() === 403) {
        <h1 id="error-page-title" class="error-page__title">No tenés acceso a esta página</h1>
        <p class="error-page__text">
          Con la cuenta con la que entraste no podés ver esta página. Seguí desde tu inicio.
        </p>
      } @else {
        <h1 id="error-page-title" class="error-page__title">No encontramos esta página</h1>
        <p class="error-page__text">
          La dirección <span class="z-code error-page__url">{{ url }}</span> no existe o cambió.
          Puede que el enlace esté mal escrito: revisalo o seguí por acá.
        </p>
      }

      <div class="error-page__actions">
        <a class="z-btn z-btn--primary" [routerLink]="home().path">
          <svg lucideHouse class="z-icon" aria-hidden="true"></svg>
          {{ home().label }}
        </a>
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

    .error-page {
      display: grid;
      justify-items: center;
      gap: var(--space-3);
      max-width: calc(560px + 2 * var(--gutter));
      margin: 0 auto;
      padding: var(--space-7) var(--gutter) var(--space-8);
      text-align: center;
    }

    .error-page__art {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .error-page__art img {
      width: 96px;
      height: 96px;
    }

    .error-page__digit {
      font: 400 88px / 1 var(--font-display);
      color: var(--color-ink);
    }

    .z-eyebrow {
      margin: 0;
    }

    .error-page__title {
      margin: 0;
      font: 400 var(--text-display-m) / var(--leading-title) var(--font-display);
    }

    .error-page__text {
      max-width: 44ch;
      margin: 0;
      color: var(--color-text-muted);
    }

    .error-page__url {
      overflow-wrap: anywhere;
      color: var(--color-text);
    }

    .error-page__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }

    @media (min-width: 768px) {
      .error-page {
        padding-top: var(--space-8);
      }

      .error-page__art img {
        width: 120px;
        height: 120px;
      }

      .error-page__digit {
        font-size: 120px;
      }

      .error-page__title {
        font-size: var(--text-display-l);
      }
    }
  `,
})
export class ErrorPage {
  private readonly session = inject(SessionService);
  private readonly location = inject(Location);

  /** En las rutas llega por `data`; adentro de una pantalla, como `[code]`. */
  readonly code = input<ErrorCode>(404);

  /** Las dos cifras del costado: el emblema hace de 0. */
  protected readonly digits = computed(() => {
    const text = String(this.code());
    return [text[0], text[2]];
  });

  /**
   * La dirección que se ve en el navegador. Se lee de `Location` y no del router: cuando un guard
   * manda al 403, la barra conserva lo que se pidió, y eso es lo que importa mostrar.
   */
  protected readonly url = this.location.path().split(/[?#]/)[0] || '/';

  /** Un solo camino para seguir: el inicio de quien está adentro, o la Portada. */
  protected readonly home = computed(() => {
    const user = this.session.user();
    if (!user) return { path: '/', label: 'Ir a la portada' };
    return {
      path: homeOf(user),
      label: user.role === 'ADMIN' ? 'Ir a mi panel' : 'Ir a mi inicio',
    };
  });

  protected back(): void {
    this.location.back();
  }
}
