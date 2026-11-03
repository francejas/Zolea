import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'z-btn',
  styleUrl: './z-btn.scss',
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
  variant = input<'primary' | 'secondary' | 'ghost' | 'danger'>('primary');
  size = input<'small' | 'normal' | 'large'>('normal');
  // Por defecto no envía formularios: un submit hay que pedirlo.
  type = input<'button' | 'submit' | 'reset'>('button');
  loading = input(false);
  disabled = input(false);

  // Las clases de componentes.css: el tamaño normal no lleva modificador.
  buttonClasses = computed(() => {
    const size = this.size() === 'normal' ? '' : ` z-btn--${this.size()}`;
    return `z-btn z-btn--${this.variant()}${size}`;
  });
}
