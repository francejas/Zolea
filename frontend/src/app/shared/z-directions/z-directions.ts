import { Component, computed, input } from '@angular/core';
import { LucideMap } from '@lucide/angular';
import { directionsLabel, mapsUrl } from '../utils/maps';

/**
 * «Cómo llegar»: un enlace con forma de botón (secundario) que abre Google Maps con la dirección
 * del balneario en otra pestaña. Es un enlace y no un `<z-btn>`: lleva a otro sitio, no hace una
 * acción de la pantalla. Lo usan la Ficha, el Detalle de la reserva y, después, la reserva de hoy.
 */
@Component({
  selector: 'z-directions',
  imports: [LucideMap],
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
    </a>
  `,
  styles: ':host { display: block; }',
})
export class ZDirections {
  /** El nombre del balneario, para el lector de pantalla. */
  name = input.required<string>();
  /** La dirección del balneario (`location`): lo que se busca en Maps. */
  location = input.required<string>();

  protected readonly url = computed(() => mapsUrl(this.location()));
  protected readonly label = computed(() => directionsLabel(this.name()));
}
