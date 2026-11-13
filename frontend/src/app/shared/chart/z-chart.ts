import {
  afterRenderEffect,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  ChartOptions,
  LinearScale,
  Tooltip,
} from 'chart.js';

// Solo lo que usan los gráficos de barras: el resto de Chart.js no entra al paquete.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/**
 * Un gráfico de Chart.js. Recibe la configuración, lo dibuja en un `<canvas>`, lo vuelve a dibujar
 * cuando la configuración cambia y lo destruye al salir de la pantalla.
 *
 * El alto lo da quien lo usa, con `height` en CSS; el ancho es el del contenedor.
 */
@Component({
  selector: 'z-chart',
  template: `<canvas #canvas role="img" [attr.aria-label]="label()"></canvas>`,
  styles: `
    :host {
      display: block;
      position: relative;
      min-width: 0;
      height: 240px;
    }
  `,
})
export class ZChart {
  /** Por ahora el Panel usa solo barras: es lo único que se registra. */
  config = input.required<ChartConfiguration<'bar'>>();
  /** Qué muestra, para el lector de pantalla: el canvas no tiene texto. */
  label = input.required<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart<'bar'> | null = null;

  constructor() {
    afterRenderEffect(() => {
      const config = this.config();
      untracked(() => this.draw(config));
    });
    inject(DestroyRef).onDestroy(() => {
      this.chart?.destroy();
      this.chart = null;
    });
  }

  private draw(config: ChartConfiguration<'bar'>): void {
    const options: ChartOptions<'bar'> = { ...config.options };
    // Sin el crecimiento de las barras para quien pidió menos movimiento.
    if (prefersReducedMotion()) options.animation = false;

    if (this.chart) {
      this.chart.data = config.data;
      this.chart.options = options;
      this.chart.update();
      return;
    }
    this.chart = this.create(this.canvas().nativeElement, { ...config, options });
  }

  /** Crea el gráfico. Aparte, para poder reemplazarlo en las pruebas: jsdom no dibuja en un canvas. */
  protected create(canvas: HTMLCanvasElement, config: ChartConfiguration<'bar'>): Chart<'bar'> {
    return new Chart(canvas, config);
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
