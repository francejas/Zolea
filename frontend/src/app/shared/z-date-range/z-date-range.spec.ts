import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZDateRange } from './z-date-range';

describe('ZDateRange', () => {
  let fixture: ComponentFixture<ZDateRange>;
  let page: HTMLElement;

  // Hoy es el 10 de enero de 2027: los días anteriores están apagados.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2027, 0, 10, 12));
    TestBed.configureTestingModule({ imports: [ZDateRange] });
    fixture = TestBed.createComponent(ZDateRange);
    page = fixture.nativeElement;
  });

  afterEach(() => vi.useRealTimers());

  const fields = () => Array.from(page.querySelectorAll<HTMLButtonElement>('.z-range__field'));
  /** Cada campo como «Entrada: vie 15 ene»: el rótulo y la fecha son dos bloques distintos. */
  const fieldTexts = () =>
    fields().map((f) => `${text(f.querySelector('span'))}: ${text(f.querySelector('strong'))}`);
  const day = (n: number) =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('.z-cal__day')).find(
      (b) => b.textContent!.trim() === String(n),
    )!;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function open(index: 0 | 1) {
    fields()[index].click();
    await fixture.whenStable();
  }

  async function pick(n: number) {
    day(n).click();
    await fixture.whenStable();
  }

  it('al principio los campos piden elegir y no hay calendario', async () => {
    await fixture.whenStable();

    expect(fieldTexts()).toEqual(['Entrada: Elegí fecha', 'Salida: Elegí fecha']);
    expect(page.querySelector('.z-cal')).toBeNull();
    expect(page.querySelector('.z-range__summary')).toBeNull();
  });

  it('tocar un campo abre el calendario del mes de hoy, con la semana desde el lunes', async () => {
    await open(0);

    expect(fields()[0].getAttribute('aria-expanded')).toBe('true');
    expect(text(page.querySelector('.z-cal__month'))).toBe('enero 2027');
    expect(Array.from(page.querySelectorAll('.z-cal__dow')).map((d) => text(d))).toEqual([
      'lu',
      'ma',
      'mi',
      'ju',
      'vi',
      'sá',
      'do',
    ]);
    // El 1 de enero de 2027 es viernes: cuatro huecos antes (lu, ma, mi, ju).
    const grid = page.querySelector('.z-cal__grid')!;
    const firstDay = day(1);
    const before = Array.from(grid.children).indexOf(firstDay) - 7;
    expect(before).toBe(4);
  });

  it('los días que ya pasaron están apagados y no se eligen', async () => {
    await open(0);

    expect(day(9).disabled).toBe(true);
    expect(day(9).classList).toContain('is-past');
    expect(day(10).disabled).toBe(false);

    day(9).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.from()).toBeNull();
  });

  it('elegir la entrada pasa solo a la salida', async () => {
    await open(0);
    await pick(15);

    expect(fixture.componentInstance.from()).toBe('2027-01-15');
    expect(fields()[1].getAttribute('aria-expanded')).toBe('true');
    expect(page.querySelector('.z-cal')!.getAttribute('aria-label')).toBe('Elegí la salida');
  });

  it('elegir la salida cierra el calendario y muestra los días contando los dos extremos', async () => {
    await open(0);
    await pick(15);
    await pick(17);

    expect(fixture.componentInstance.to()).toBe('2027-01-17');
    expect(page.querySelector('.z-cal')).toBeNull();
    expect(fieldTexts()).toEqual(['Entrada: vie 15 ene', 'Salida: dom 17 ene']);
    expect(text(page.querySelector('.z-range__summary strong'))).toBe('3 días');
    expect(text(page.querySelector('.z-range__summary p'))).toBe(
      'Entrás el viernes 15 y te vas el domingo 17: se cobran los dos.',
    );
  });

  it('la salida puede ser el mismo día: es un día', async () => {
    await open(0);
    await pick(15);
    await pick(15);

    expect(fixture.componentInstance.to()).toBe('2027-01-15');
    expect(text(page.querySelector('.z-range__summary strong'))).toBe('1 día');
  });

  it('una salida anterior a la entrada empieza de nuevo desde esa fecha', async () => {
    await open(0);
    await pick(15);
    await pick(12);

    expect(fixture.componentInstance.from()).toBe('2027-01-12');
    expect(fixture.componentInstance.to()).toBeNull();
    expect(page.querySelector('.z-cal')).not.toBeNull();
  });

  it('cambiar la entrada a después de la salida borra la salida', async () => {
    fixture.componentRef.setInput('from', '2027-01-15');
    fixture.componentRef.setInput('to', '2027-01-17');
    await open(0);
    await pick(20);

    expect(fixture.componentInstance.from()).toBe('2027-01-20');
    expect(fixture.componentInstance.to()).toBeNull();
  });

  it('marca la entrada, la salida y lo que queda en el medio', async () => {
    fixture.componentRef.setInput('from', '2027-01-15');
    fixture.componentRef.setInput('to', '2027-01-17');
    await open(1);

    expect(day(15).classList).toContain('is-start');
    expect(day(16).classList).toContain('is-in-range');
    expect(day(17).classList).toContain('is-end');
    expect(day(15).getAttribute('aria-pressed')).toBe('true');
    expect(day(16).getAttribute('aria-pressed')).toBeNull();
  });

  it('cada día dice su fecha completa para el lector de pantalla', async () => {
    await open(0);

    expect(day(15).getAttribute('aria-label')).toBe('viernes, 15 de enero de 2027');
  });

  it('se puede pasar de mes, pero no ir a un mes que ya pasó', async () => {
    await open(0);
    const [back, next] = Array.from(
      page.querySelectorAll<HTMLButtonElement>('.z-cal__head .z-icon-btn'),
    );
    expect(back.disabled).toBe(true);

    next.click();
    await fixture.whenStable();
    expect(text(page.querySelector('.z-cal__month'))).toBe('febrero 2027');
    expect(back.disabled).toBe(false);

    back.click();
    await fixture.whenStable();
    expect(text(page.querySelector('.z-cal__month'))).toBe('enero 2027');
  });

  it('Escape cierra el calendario', async () => {
    await open(0);

    page.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(page.querySelector('.z-cal')).toBeNull();
  });

  it('sin resumen, no explica los días', async () => {
    fixture.componentRef.setInput('summary', false);
    fixture.componentRef.setInput('from', '2027-01-15');
    fixture.componentRef.setInput('to', '2027-01-17');
    await fixture.whenStable();

    expect(page.querySelector('.z-range__summary')).toBeNull();
  });
});
