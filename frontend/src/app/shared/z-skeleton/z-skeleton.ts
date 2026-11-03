import { Component, input, ViewEncapsulation } from '@angular/core';

/**
 * Un bloque del esqueleto que se ve mientras carga. Con varios se arma la forma de lo que viene: un
 * título, dos líneas, una foto. Quien lo usa marca su contenedor con `aria-busy="true"`.
 */
@Component({
  selector: 'z-skeleton',
  styleUrl: './z-skeleton.scss',
  // La clase va en el propio elemento: sin encapsular, la regla de .z-skeleton lo alcanza tal cual.
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'z-skeleton',
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
  template: '',
})
export class ZSkeleton {
  width = input('100%');
  height = input('16px');
}
