import { Component, input, computed } from '@angular/core';
import { LucideLoaderCircle } from '@lucide/angular';

@Component({
  selector: 'z-btn',
  standalone: true,
  imports: [LucideLoaderCircle],
  template: `
    <button [class]="buttonClasses()" [disabled]="loading() || disabled()">
      @if (loading()) {
        <svg lucideLoaderCircle [strokeWidth]="1.75" class="z-spinner"></svg>
      }
      <span [class.opacity-0]="loading()">
        <ng-content></ng-content>
      </span>
    </button>
  `,
})
export class ZBtn {
  variant = input<'primary' | 'secondary' | 'ghost' | 'danger'>('primary');
  size = input<'sm' | 'md' | 'lg'>('md');
  loading = input(false);
  disabled = input(false);

  buttonClasses = computed(() => {
    // Estas clases las definís en componentes.css usando tus var(--...)
    return `z-btn z-btn--${this.variant()} z-btn--${this.size()}`;
  });
}
