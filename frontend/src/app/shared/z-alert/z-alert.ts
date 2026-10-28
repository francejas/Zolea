import { Component, input } from '@angular/core';
import { ZBtn } from '../z-btn/z-btn';

@Component({
  selector: 'z-alert',
  standalone: true,
  imports: [ZBtn],
  template: `
    <div class="z-alert z-alert--{{ variant() }}">
      <div class="z-alert-content">
        @if (title()) { <strong class="z-alert-title">{{ title() }}</strong> }
        <p class="z-alert-text">{{ text() }}</p>
      </div>
      @if (actionLabel()) {
        <z-btn [variant]="variant() === 'forbidden' ? 'danger' : 'secondary'" size="sm">
          {{ actionLabel() }}
        </z-btn>
      }
    </div>
  `
})
export class ZAlert {
  variant = input.required<'info' | 'success' | 'warning' | 'error' | 'forbidden'>();
  title = input<string>();
  text = input.required<string>();
  actionLabel = input<string>();
}