import {
  Component,
  computed,
  contentChild,
  effect,
  ElementRef,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { FormField, ReadonlyFieldTree } from '@angular/forms/signals';

/** El texto para los errores de los validadores que no traen mensaje propio. */
const MESSAGES: Record<string, string> = {
  required: 'Este campo es obligatorio.',
  email: 'El formato no es válido.',
  pattern: 'El formato no es válido.',
};

/**
 * Etiqueta, control y error de un campo de Signal Forms. El control se proyecta adentro, con su
 * `[formField]`; cuando el campo está tocado, se muestra el mensaje de su primer error, sea de un
 * validador o el `server` que devuelve `toFieldErrors`.
 */
@Component({
  selector: 'z-field',
  styleUrl: './z-field.scss',
  // El control llega por ng-content: con el encapsulado de siempre, las reglas de .z-input no lo
  // alcanzarían. Las clases llevan el prefijo z-, así que no chocan con nada.
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'z-field',
    '[class.z-field--invalid]': 'errorMessage() !== null',
  },
  template: `
    @if (label()) {
      <label class="z-field__label" [attr.for]="inputId()">{{ label() }}</label>
    }

    <!-- El control proyectado. Su aria-describedby lo pone el campo. -->
    <ng-content />

    @if (errorMessage(); as message) {
      <p class="z-field__error" [id]="errorId()" aria-live="polite">{{ message }}</p>
    } @else if (help()) {
      <p class="z-field__hint" [id]="helpId()">{{ help() }}</p>
    }
  `,
})
export class ZField {
  field = input.required<ReadonlyFieldTree<unknown>>();
  inputId = input.required<string>();
  label = input<string>();
  help = input<string>();

  errorId = computed(() => `${this.inputId()}-error`);
  helpId = computed(() => `${this.inputId()}-help`);

  errorMessage = computed(() => {
    const state = this.field()();
    const [first] = state.errors();
    if (!state.touched() || !first) return null;

    return first.message ?? MESSAGES[first.kind] ?? null;
  });

  /** El control proyectado: el que lleva el `[formField]`. */
  private readonly control = contentChild(FormField, { read: ElementRef });

  constructor() {
    // El control queda descripto por el texto que se ve debajo: el error o, si no hay, la ayuda.
    effect(() => {
      const control: HTMLElement | undefined = this.control()?.nativeElement;
      if (!control) return;

      const describedBy =
        this.errorMessage() !== null ? this.errorId() : this.help() ? this.helpId() : null;
      if (describedBy) {
        control.setAttribute('aria-describedby', describedBy);
      } else {
        control.removeAttribute('aria-describedby');
      }
    });
  }
}
