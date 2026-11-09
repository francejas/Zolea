import { booleanAttribute, Component, input, computed } from '@angular/core';

/** Un botón para una acción. Sus estilos son globales (styles/buttons.scss): un enlace que tiene
 * que verse como botón usa las mismas clases, sin este componente. */
@Component({
  selector: 'z-btn',
  template: `
    <button
      [type]="type()"
      [class]="buttonClasses()"
      [disabled]="loading() || disabled()"
      [attr.aria-busy]="loading() || null"
    >
      @if (loading()) {
        <span class="z-spinner" aria-hidden="true"></span>
      }
      <ng-content />
    </button>
  `,
})
export class ZBtn {
  /** `on-color` va sobre un fondo de color, como el verde o el rojo del resultado del ingreso. */
  variant = input<'primary' | 'secondary' | 'ghost' | 'danger' | 'on-color'>('primary');
  size = input<'small' | 'normal' | 'large'>('normal');
  // Por defecto no envía formularios: un submit hay que pedirlo.
  type = input<'button' | 'submit' | 'reset'>('button');
  loading = input(false);
  disabled = input(false);
  /** Ocupa todo el ancho de su contenedor. Se escribe solo: `<z-btn block>`. */
  block = input(false, { transform: booleanAttribute });

  // Las clases de componentes.css: el tamaño normal no lleva modificador.
  buttonClasses = computed(() => {
    const size = this.size() === 'normal' ? '' : ` z-btn--${this.size()}`;
    const block = this.block() ? ' z-btn--block' : '';
    return `z-btn z-btn--${this.variant()}${size}${block}`;
  });
}
