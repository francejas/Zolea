import { Component, computed, input } from '@angular/core';
import { ZBtn } from '../z-btn/z-btn';

@Component({
  selector: 'z-alert',
  imports: [ZBtn],
  styleUrl: './z-alert.scss',
  template: `
    <div class="z-alert z-alert--{{ variant() }}" [attr.role]="role()">
      <div>
        @if (title()) {
          <strong class="z-alert__title">{{ title() }}</strong>
        }
        <p class="z-alert__text">{{ text() }}</p>
        @if (actionLabel()) {
          <div class="z-alert__action">
            <z-btn variant="secondary" size="small">{{ actionLabel() }}</z-btn>
          </div>
        }
      </div>
    </div>
  `,
})
export class ZAlert {
  variant = input.required<'info' | 'success' | 'warning' | 'danger' | 'forbidden'>();
  title = input<string>();
  text = input.required<string>();
  actionLabel = input<string>();

  // Como en el sistema de diseño: el error y el sin permiso se anuncian enseguida; el resto, sin
  // interrumpir.
  role = computed(() =>
    this.variant() === 'danger' || this.variant() === 'forbidden' ? 'alert' : 'status',
  );
}
