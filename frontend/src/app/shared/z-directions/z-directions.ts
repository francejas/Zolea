import { Component, computed, input } from '@angular/core';
import { LucideArrowUpRight, LucideMap } from '@lucide/angular';
import { directionsLabel, mapsUrl } from '../utils/maps';

/**
 * «Cómo llegar»: un enlace con forma de botón (secundario) que abre Google Maps con la dirección
 * del balneario en otra pestaña. Es un enlace y no un `<z-btn>`: lleva a otro sitio, no hace una
 * acción de la pantalla. Termina con una flecha hacia arriba y a la derecha, la señal de que se
 * abre en otra pestaña. Lo usan la Ficha, el Detalle de la reserva y, después, la reserva de hoy.
 */
@Component({
  selector: 'z-directions',
  imports: [LucideArrowUpRight, LucideMap],
  template: `
    <a
      class="z-btn z-btn--secondary"
      target="_blank"
      rel="noopener noreferrer"
      [href]="url()"
      [attr.aria-label]="label()"
    >
      <svg lucideMap class="z-icon" aria-hidden="true"></svg>
      Cómo llegar
      <!-- La flecha hacia arriba y a la derecha: se abre en otra pestaña. -->
      <svg lucideArrowUpRight class="z-icon z-icon--s" aria-hidden="true"></svg>
    </a>
  `,
  styles: ':host { display: block; }',
})
export class ZDirections {
  /** El nombre del balneario, para el lector de pantalla. */
  name = input.required<string>();
  /** La dirección del balneario (`location`): lo que se busca en Maps. */
  location = input.required<string>();

  protected readonly url = computed(() => mapsUrl(this.name(), this.location()));
  protected readonly label = computed(() => directionsLabel(this.name()));
}
