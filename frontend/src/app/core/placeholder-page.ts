import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Página provisoria: muestra el título de la ruta (`data: { title }`) mientras la pantalla real
 * no existe. Se borra cuando estén todas.
 */
@Component({
  selector: 'app-placeholder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="placeholder">
      <h1>{{ title() }}</h1>
      <p>Esta pantalla todavía no está construida.</p>
    </main>
  `,
  styles: `
    .placeholder {
      padding: var(--space-7) var(--space-4);
      color: var(--color-text);
    }
    h1 {
      font-family: var(--font-display);
    }
    p {
      color: var(--color-text-muted);
    }
  `,
})
export class PlaceholderPage {
  /** Llega de `data: { title }` de la ruta, por `withComponentInputBinding()`. */
  readonly title = input<string>('');
}
