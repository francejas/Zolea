import { Component, input, signal, ViewEncapsulation } from '@angular/core';
import { LucideSlidersHorizontal } from '@lucide/angular';

let nextId = 0;

/**
 * Los filtros de una lista del panel (GH-79). En la computadora se ven siempre, como antes; debajo
 * de 768 px se pliegan detrás de un botón «Filtros» que dice cuántos hay puestos, como «Más
 * filtros» en la Portada. Los filtros van adentro, tal cual.
 */
@Component({
  selector: 'z-filters',
  imports: [LucideSlidersHorizontal],
  styleUrl: './z-filters.scss',
  // Las reglas alcanzan al botón y al panel desde la hoja de cada pantalla.
  encapsulation: ViewEncapsulation.None,
  host: { class: 'z-filters', '[class.z-filters--open]': 'open()' },
  template: `
    <button
      class="z-btn z-btn--secondary z-btn--compact z-filters__toggle"
      type="button"
      [attr.aria-controls]="panelId"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <svg lucideSlidersHorizontal class="z-icon z-icon--s" aria-hidden="true"></svg>
      Filtros
      @if (count() > 0) {
        <span class="z-filters__count"
          >{{ count() }}<span class="z-visually-hidden"> puestos</span></span
        >
      }
    </button>

    <div class="z-filters__panel" [id]="panelId" role="group" [attr.aria-label]="label()">
      <ng-content />
    </div>
  `,
})
export class ZFilters {
  /** El nombre del grupo para el lector de pantalla, por ejemplo «Filtrar reservas». */
  label = input.required<string>();
  /** Cuántos filtros hay puestos: se muestra en el botón del celular. */
  count = input(0);

  protected readonly open = signal(false);
  protected readonly panelId = `z-filters-${nextId++}`;
}
