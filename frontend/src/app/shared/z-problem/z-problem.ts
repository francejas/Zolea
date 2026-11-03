import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { LucideCircleAlert, LucideRefreshCw } from '@lucide/angular';
import { ZBtn } from '../z-btn/z-btn';

/** Lo que se ve cuando falló la carga: qué pasó, qué hacer y un botón para reintentar. */
@Component({
  selector: 'z-problem',
  imports: [ZBtn, LucideCircleAlert, LucideRefreshCw],
  styleUrl: './z-problem.scss',
  // La regla .z-problem .z-btn tiene que alcanzar el botón de adentro de z-btn.
  encapsulation: ViewEncapsulation.None,
  host: { class: 'z-problem', role: 'alert' },
  template: `
    <span class="z-problem__icon">
      <svg lucideCircleAlert class="z-icon" aria-hidden="true"></svg>
    </span>
    <p class="z-problem__title">{{ title() }}</p>
    @if (text()) {
      <p class="z-problem__text">{{ text() }}</p>
    }
    <z-btn variant="secondary" (click)="retry.emit()">
      <svg lucideRefreshCw class="z-icon z-icon--s" aria-hidden="true"></svg>
      Reintentar
    </z-btn>
  `,
})
export class ZProblem {
  title = input.required<string>();
  text = input<string>();
  /** Se emite cuando se toca Reintentar. */
  retry = output<void>();
}
