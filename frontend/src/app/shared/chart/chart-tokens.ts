/**
 * Los colores y la letra de los gráficos, leídos de tokens.css. Chart.js dibuja en un `<canvas>` y
 * no entiende `var(--…)`: hay que pasarle el valor ya resuelto.
 */
export interface ChartTokens {
  /** Las barras: coral-texto, que pasa 3:1 contra la espuma. */
  mark: string;
  /** La barra con el puntero encima. */
  markHover: string;
  /** Las líneas de la grilla y el eje. */
  grid: string;
  /** Las marcas de los ejes. */
  text: string;
  /** El fondo del globo que aparece al pasar el puntero. */
  tooltip: string;
  /** El texto de ese globo. */
  tooltipText: string;
  font: string;
}

export function readChartTokens(element: Element = document.documentElement): ChartTokens {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    mark: token('--color-coral-text'),
    markHover: token('--color-ink'),
    grid: token('--color-line'),
    text: token('--color-ink-soft'),
    tooltip: token('--color-ink'),
    tooltipText: token('--color-foam'),
    font: token('--font-body'),
  };
}
