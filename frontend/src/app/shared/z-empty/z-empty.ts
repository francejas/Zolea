import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { ZBtn } from '../z-btn/z-btn';

/** Lo que se ve cuando no hay nada para mostrar: una frase que explica y una acción para salir. */
@Component({
  selector: 'z-empty',
  imports: [ZBtn],
  styleUrl: './z-empty.scss',
  // La regla .z-empty .z-btn tiene que alcanzar el botón de adentro de z-btn.
  encapsulation: ViewEncapsulation.None,
  host: { class: 'z-empty' },
  template: `
    <img src="emblema.svg" alt="" width="72" height="72" />
    <p class="z-empty__title">{{ title() }}</p>
    @if (text()) {
      <p class="z-empty__text">{{ text() }}</p>
    }
    @if (actionLabel()) {
      <z-btn (click)="action.emit()">{{ actionLabel() }}</z-btn>
    }
  `,
})
export class ZEmpty {
  title = input.required<string>();
  text = input<string>();
  actionLabel = input<string>();
  /** Se emite cuando se toca el botón de la acción. */
  action = output<void>();
}
