import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Chart, ChartConfiguration } from 'chart.js';
import { ZChart } from './z-chart';

const bars = (data: number[]): ChartConfiguration<'bar'> => ({
  type: 'bar',
  data: { labels: data.map(String), datasets: [{ data }] },
  options: {},
});

@Component({
  imports: [ZChart],
  template: `
    @if (shown()) {
      <z-chart [config]="config()" label="Ocupación por día" />
    }
  `,
})
class Host {
  readonly shown = signal(true);
  readonly config = signal(bars([1, 2, 3]));
}

describe('ZChart', () => {
  // Un gráfico de mentira: jsdom no tiene canvas para dibujar.
  function fakeChart(config: ChartConfiguration<'bar'>) {
    return {
      config,
      data: config.data,
      options: config.options,
      update: vi.fn(),
      destroy: vi.fn(),
    };
  }

  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    create = vi.fn((_canvas: HTMLCanvasElement, config: ChartConfiguration<'bar'>) =>
      fakeChart(config),
    );
    vi.spyOn(ZChart.prototype as unknown as { create: typeof create }, 'create').mockImplementation(
      create as never,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  }

  it('crea el gráfico en su canvas, con el nombre para el lector de pantalla', async () => {
    const fixture = await render();

    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Ocupación por día');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toBe(canvas);
  });

  it('si cambia la configuración, actualiza el mismo gráfico', async () => {
    const fixture = await render();
    const chart = create.mock.results[0].value as ReturnType<typeof fakeChart>;

    fixture.componentInstance.config.set(bars([4, 5]));
    await fixture.whenStable();

    expect(create).toHaveBeenCalledTimes(1);
    expect(chart.update).toHaveBeenCalled();
    expect(chart.data.datasets[0].data).toEqual([4, 5]);
  });

  it('lo destruye al salir de la pantalla', async () => {
    const fixture = await render();
    const chart = create.mock.results[0].value as ReturnType<typeof fakeChart>;

    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();

    expect(chart.destroy).toHaveBeenCalled();
  });

  it('registra los controles de barras', () => {
    expect(Chart.registry.getController('bar')).toBeDefined();
  });
});
