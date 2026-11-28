import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RentalUnit, UnitType } from '../../core/api/resort.models';
import { ResortPlan } from './resort-plan';

/** Las unidades del Zolea Club de Playa: filas A y B de sombrillas, C y D de carpas, A-08 bloqueada. */
function zoleaClub(): RentalUnit[] {
  const units: RentalUnit[] = [];
  const add = (prefix: string, count: number, type: UnitType, price: number, blocked: number[]) => {
    for (let n = 1; n <= count; n++) {
      units.push({
        idRentalUnit: units.length + 1,
        type,
        identifier: `${prefix}-${String(n).padStart(2, '0')}`,
        dailyPrice: price,
        isBlocked: blocked.includes(n),
        resortId: 1,
        retired: false,
      });
    }
  };
  add('A', 8, 'UMBRELLA', 8500, [8]);
  add('B', 8, 'UMBRELLA', 7000, []);
  add('C', 6, 'TENT', 14500, []);
  add('D', 2, 'TENT', 12000, []);
  return units;
}

/** Los espacios de «$ 8.500» son no separables: se comparan como espacios comunes. */
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const label = (el: Element) => (el.getAttribute('aria-label') ?? '').replace(/\u00a0/g, ' ');

describe('ResortPlan', () => {
  let fixture: ComponentFixture<ResortPlan>;
  let page: HTMLElement;

  async function render(units: RentalUnit[], inputs: Record<string, unknown> = {}) {
    fixture = TestBed.createComponent(ResortPlan);
    fixture.componentRef.setInput('units', units);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  const unitButton = (identifier: string) =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('.z-unit[aria-label]')).find((b) =>
      b.querySelector('.z-unit__id')!.textContent!.includes(identifier),
    )!;

  beforeEach(() => TestBed.configureTestingModule({ imports: [ResortPlan] }));

  describe('el plano', () => {
    it('agrupa las unidades por fila según el prefijo del identificador', async () => {
      await render(zoleaClub());

      const rows = Array.from(page.querySelectorAll('.z-plan__row'));
      expect(rows.map((r) => text(r.querySelector('strong')))).toEqual([
        'Fila A',
        'Fila B',
        'Fila C',
        'Fila D',
      ]);
      expect(rows.map((r) => r.querySelectorAll('.z-unit').length)).toEqual([8, 8, 6, 2]);
    });

    it('pone el mar arriba, las sombrillas, el paseo y las carpas atrás', async () => {
      await render(zoleaClub());

      const order = Array.from(
        page.querySelectorAll('.z-plan__sea, .z-plan__zone-label, .z-plan__walk, .z-plan__entry'),
      ).map((el) => text(el));
      expect(order).toEqual(['Mar', 'Sombrillas', 'Paseo', 'Carpas', 'Entrada del balneario']);
    });

    it('ordena las unidades de la fila por identificador, vengan como vengan', async () => {
      await render(zoleaClub().reverse());

      const ids = Array.from(
        page.querySelectorAll('.z-plan__row')[0].querySelectorAll('.z-unit__id'),
      );
      expect(ids.map((i) => text(i))).toEqual([
        'A-01',
        'A-02',
        'A-03',
        'A-04',
        'A-05',
        'A-06',
        'A-07',
        'A-08',
      ]);
    });

    it('rotula la fila con su precio, y con «desde» si no todas cuestan lo mismo', async () => {
      const units = zoleaClub();
      units.find((u) => u.identifier === 'D-02')!.dailyPrice = 15000;
      await render(units);

      const prices = Array.from(page.querySelectorAll('.z-plan__row-label span')).map((s) =>
        text(s),
      );
      // Al pie de las columnas de carpas, el precio corto, que no se parte (ZV-04).
      expect(prices).toEqual([
        '$ 8.500 por día',
        '$ 7.000 por día',
        '$ 14.500/día',
        'desde $ 12.000/día',
      ]);
    });

    it('cada fila es un grupo con nombre', async () => {
      await render(zoleaClub());

      const group = page.querySelector('.z-plan__row')!;
      expect(group.getAttribute('role')).toBe('group');
      expect(label(group)).toBe('Fila A, $ 8.500 por día');
    });

    it('las unidades sin guion van a «Otras», al final de su zona', async () => {
      const extra: RentalUnit = { ...zoleaClub()[0], idRentalUnit: 99, identifier: 'VIP' };
      await render([extra, ...zoleaClub()]);

      const names = Array.from(page.querySelectorAll('.z-plan__row strong')).map((s) => text(s));
      expect(names).toEqual(['Fila A', 'Fila B', 'Otras', 'Fila C', 'Fila D']);
    });

    it('cada unidad dice su tipo, estado y precio en la etiqueta', async () => {
      await render(zoleaClub());

      expect(label(unitButton('A-01'))).toBe('Sombrilla A-01, libre, $ 8.500 por día');
      expect(label(unitButton('C-01'))).toBe('Carpa C-01, libre, $ 14.500 por día');
      expect(label(unitButton('A-08'))).toBe('Sombrilla A-08, no disponible, $ 8.500 por día');
    });

    it('cada unidad lleva la forma de su tipo', async () => {
      await render(zoleaClub());

      expect(unitButton('A-01').classList).toContain('z-unit--umbrella');
      expect(unitButton('C-01').classList).toContain('z-unit--tent');
    });

    it('una unidad bloqueada se marca aria-disabled y no se puede elegir', async () => {
      await render(zoleaClub());
      const selected = vi.fn();
      fixture.componentInstance.unitSelected.subscribe(selected);

      const blocked = unitButton('A-08');
      expect(blocked.getAttribute('aria-disabled')).toBe('true');
      expect(blocked.hasAttribute('aria-pressed')).toBe(false);

      blocked.click();
      await fixture.whenStable();

      expect(selected).not.toHaveBeenCalled();
      expect(fixture.componentInstance.selectedId()).toBeNull();
    });

    it('tocar una libre avisa cuál es y queda elegida', async () => {
      await render(zoleaClub());
      const selected = vi.fn();
      fixture.componentInstance.unitSelected.subscribe(selected);

      const free = unitButton('A-03');
      expect(free.getAttribute('aria-pressed')).toBe('false');

      free.click();
      await fixture.whenStable();

      expect(selected).toHaveBeenCalledOnce();
      expect(selected.mock.calls[0][0].identifier).toBe('A-03');
      expect(free.getAttribute('aria-pressed')).toBe('true');
    });

    it('al elegir otra, la anterior deja de estar elegida', async () => {
      await render(zoleaClub());

      unitButton('A-03').click();
      await fixture.whenStable();
      unitButton('C-02').click();
      await fixture.whenStable();

      expect(unitButton('A-03').getAttribute('aria-pressed')).toBe('false');
      expect(unitButton('C-02').getAttribute('aria-pressed')).toBe('true');
    });

    it('tocar la elegida la deselecciona y avisa con null', async () => {
      await render(zoleaClub(), { selectedId: 3 });
      const selected = vi.fn();
      fixture.componentInstance.unitSelected.subscribe(selected);

      expect(unitButton('A-03').getAttribute('aria-pressed')).toBe('true');
      unitButton('A-03').click();
      await fixture.whenStable();

      expect(selected).toHaveBeenCalledWith(null);
      expect(unitButton('A-03').getAttribute('aria-pressed')).toBe('false');
    });

    it('muestra como elegida la unidad que llega de afuera', async () => {
      await render(zoleaClub(), { selectedId: 11 });

      expect(unitButton('B-03').getAttribute('aria-pressed')).toBe('true');
      expect(page.querySelectorAll('.z-unit[aria-pressed="true"][aria-label]').length).toBe(1);
    });

    it('la leyenda explica libre, elegida y no disponible', async () => {
      await render(zoleaClub());

      const items = Array.from(page.querySelectorAll('.z-plan-legend li')).map((li) => text(li));
      expect(items).toEqual(['Libre', 'Elegida', 'No disponible']);
    });

    it('la bloqueada lleva la marca de no disponible, y la leyenda usa la misma (ZV-06)', async () => {
      await render(zoleaClub());

      expect(unitButton('A-08').classList).toContain('z-unit--blocked');
      expect(unitButton('A-08').classList).not.toContain('z-unit--occupied');
      expect(unitButton('A-01').classList).not.toContain('z-unit--blocked');
      const legend = Array.from(page.querySelectorAll('.z-plan-legend li')).find(
        (li) => text(li) === 'No disponible',
      )!;
      const marks = legend.querySelectorAll('.z-unit--mini');
      expect(marks.length).toBe(2);
      marks.forEach((mark) => expect(mark.classList).toContain('z-unit--blocked'));
    });
  });

  describe('las carpas en columnas', () => {
    const columns = () => Array.from(page.querySelectorAll<HTMLElement>('.z-plan__column'));
    const pairIds = (column: Element) =>
      Array.from(column.querySelectorAll('.z-plan__pair')).map((pair) =>
        Array.from(pair.querySelectorAll('.z-unit__id')).map((id) => text(id)),
      );

    it('las carpas de un prefijo quedan en la misma columna, de a dos y de arriba abajo', async () => {
      await render(zoleaClub().reverse());

      const [c, d] = columns();
      expect(columns().length).toBe(2);
      expect(pairIds(c)).toEqual([
        ['C-01', 'C-02'],
        ['C-03', 'C-04'],
        ['C-05', 'C-06'],
      ]);
      expect(pairIds(d)).toEqual([['D-01', 'D-02']]);
      // Cada columna en su pista de la grilla, con el pasillo entre las dos.
      expect(c.style.gridColumn).not.toBe(d.style.gridColumn);
      expect(page.querySelectorAll('.z-plan__aisle').length).toBe(1);
    });

    it('con una cantidad impar, el último renglón queda a medias', async () => {
      await render(zoleaClub().filter((u) => u.identifier !== 'C-06'));

      expect(pairIds(columns()[0]).map((pair) => pair.length)).toEqual([2, 2, 1]);
    });

    it('al pie de cada columna va la letra del prefijo, y el grupo se llama igual que antes', async () => {
      await render(zoleaClub());

      const [c] = columns();
      const badge = c.querySelector('.z-plan__badge')!;
      // Se ve «C»; «Fila» queda solo para el lector de pantalla.
      expect(text(badge)).toBe('Fila C');
      expect(text(badge.querySelector('.z-visually-hidden'))).toBe('Fila');
      expect(label(c)).toBe('Fila C, $ 14.500 por día');
      expect(c.getAttribute('role')).toBe('group');
    });

    it('hay una bajada al mar por cada pasillo, en la misma pista', async () => {
      const extra: RentalUnit[] = [1, 2, 3].map((n) => ({
        ...zoleaClub()[20],
        idRentalUnit: 200 + n,
        identifier: `E-0${n}`,
      }));
      await render([...zoleaClub(), ...extra]);

      const aisles = Array.from(page.querySelectorAll<HTMLElement>('.z-plan__aisle'));
      const accesses = Array.from(
        page.querySelectorAll<HTMLElement>('.z-plan__sea .z-plan__access'),
      );
      expect(aisles.length).toBe(2);
      expect(accesses.map((a) => a.style.gridColumn)).toEqual(
        aisles.map((a) => a.style.gridColumn),
      );
      expect(accesses.every((a) => a.getAttribute('aria-hidden') === 'true')).toBe(true);
    });

    it('las sombrillas siguen en filas frente al mar, con la A más cerca', async () => {
      await render(zoleaClub());

      const rows = Array.from(page.querySelectorAll('.z-plan__row:not(.z-plan__column)'));
      expect(rows.map((r) => text(r.querySelector('strong')))).toEqual(['Fila A', 'Fila B']);
      expect(page.querySelector('.z-plan__column .z-unit--umbrella')).toBeNull();
    });

    it('un balneario de una sola columna no dibuja pasillos ni bajadas', async () => {
      await render(zoleaClub().filter((u) => !u.identifier.startsWith('D')));

      expect(columns().length).toBe(1);
      expect(page.querySelector('.z-plan__aisle')).toBeNull();
      expect(page.querySelector('.z-plan__access')).toBeNull();
    });
  });

  describe('las ocupadas en las fechas', () => {
    // A-03 es la unidad 3 del Zolea Club de Playa.
    it('una ocupada se marca aria-disabled, lo dice en la etiqueta y no se puede elegir', async () => {
      await render(zoleaClub(), { occupiedIds: [3] });
      const selected = vi.fn();
      fixture.componentInstance.unitSelected.subscribe(selected);

      const occupied = unitButton('A-03');
      expect(occupied.getAttribute('aria-disabled')).toBe('true');
      expect(occupied.hasAttribute('aria-pressed')).toBe(false);
      expect(label(occupied)).toBe('Sombrilla A-03, ocupada en tus fechas, $ 8.500 por día');

      occupied.click();
      await fixture.whenStable();

      expect(selected).not.toHaveBeenCalled();
      expect(fixture.componentInstance.selectedId()).toBeNull();
    });

    it('la leyenda suma «Ocupada en tus fechas» solo si hay alguna', async () => {
      await render(zoleaClub(), { occupiedIds: [3] });

      const items = Array.from(page.querySelectorAll('.z-plan-legend li')).map((li) => text(li));
      expect(items).toEqual(['Libre', 'Elegida', 'No disponible', 'Ocupada en tus fechas']);
    });

    it('la ocupada se dibuja distinto de la no disponible, y la leyenda usa la misma marca (ZV-06)', async () => {
      await render(zoleaClub(), { occupiedIds: [3] });

      expect(unitButton('A-03').classList).toContain('z-unit--occupied');
      expect(unitButton('A-03').classList).not.toContain('z-unit--blocked');
      const legend = Array.from(page.querySelectorAll('.z-plan-legend li')).find(
        (li) => text(li) === 'Ocupada en tus fechas',
      )!;
      const marks = legend.querySelectorAll('.z-unit--mini');
      expect(marks.length).toBe(2);
      marks.forEach((mark) => expect(mark.classList).toContain('z-unit--occupied'));
    });

    it('una bloqueada que además está ocupada sigue diciendo «no disponible»', async () => {
      await render(zoleaClub(), { occupiedIds: [8] });

      expect(label(unitButton('A-08'))).toBe('Sombrilla A-08, no disponible, $ 8.500 por día');
      expect(page.querySelectorAll('.z-plan-legend li').length).toBe(3);
    });

    it('en la lista, la ocupada está deshabilitada y dice «Ocupada en tus fechas»', async () => {
      await render(zoleaClub(), { occupiedIds: [3] });
      page.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
      await fixture.whenStable();

      const option = Array.from(page.querySelectorAll('.z-unit-option')).find((o) =>
        text(o).includes('A-03'),
      )!;
      expect(option.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
      expect(text(option.querySelector('.z-unit-option__state'))).toBe('Ocupada en tus fechas');
    });
  });

  describe('la lista', () => {
    async function openList() {
      await render(zoleaClub());
      page.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
      await fixture.whenStable();
    }

    it('las pestañas muestran una sola vista a la vez', async () => {
      await render(zoleaClub());
      const [plan, list] = Array.from(page.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
      const [planTab, listTab] = Array.from(page.querySelectorAll('[role="tab"]'));

      expect(plan.hidden).toBe(false);
      expect(list.hidden).toBe(true);
      expect(planTab.getAttribute('aria-selected')).toBe('true');

      (listTab as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(plan.hidden).toBe(true);
      expect(list.hidden).toBe(false);
      expect(listTab.getAttribute('aria-selected')).toBe('true');
      expect(planTab.getAttribute('aria-selected')).toBe('false');
    });

    it('las flechas cambian de pestaña y llevan el foco', async () => {
      await render(zoleaClub());
      document.body.append(page);
      const [planTab, listTab] = Array.from(
        page.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      );

      planTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await fixture.whenStable();

      expect(listTab.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(listTab);
      expect(listTab.tabIndex).toBe(0);
      expect(planTab.tabIndex).toBe(-1);
      page.remove();
    });

    it('lista las mismas unidades como botones de opción, por fila', async () => {
      await openList();

      const groups = page.querySelectorAll('.z-unit-list__group');
      expect(groups.length).toBe(4);
      expect(text(groups[0].querySelector('legend'))).toBe('Sombrillas · Fila A · $ 8.500 por día');
      expect(page.querySelectorAll('.z-unit-option input[type="radio"]').length).toBe(24);
    });

    it('la unidad bloqueada está deshabilitada y dice «No disponible»', async () => {
      await openList();

      const option = Array.from(page.querySelectorAll('.z-unit-option')).find((o) =>
        text(o).includes('A-08'),
      )!;
      expect(option.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
      expect(text(option.querySelector('.z-unit-option__state'))).toBe('No disponible');
    });

    it('si la fila dice «desde», cada opción dice cuánto cuesta; si no, alcanza con el título', async () => {
      const units = zoleaClub();
      units.find((u) => u.identifier === 'D-02')!.dailyPrice = 15000;
      await render(units);
      page.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
      await fixture.whenStable();

      const option = (identifier: string) =>
        Array.from(page.querySelectorAll('.z-unit-option')).find((o) =>
          text(o).includes(identifier),
        )!;
      const price = (identifier: string) =>
        text(option(identifier).querySelector('.z-unit-option__price'));

      expect(price('D-01')).toBe('$ 12.000');
      expect(price('D-02')).toBe('$ 15.000');
      expect(option('A-01').querySelector('.z-unit-option__price')).toBeNull();
      expect(option('C-01').querySelector('.z-unit-option__price')).toBeNull();
    });

    it('elegir en la lista elige también en el plano y avisa', async () => {
      await openList();
      const selected = vi.fn();
      fixture.componentInstance.unitSelected.subscribe(selected);

      const option = Array.from(page.querySelectorAll('.z-unit-option')).find((o) =>
        text(o).includes('C-02'),
      )!;
      const radio = option.querySelector<HTMLInputElement>('input')!;
      radio.click();
      await fixture.whenStable();

      expect(selected.mock.calls[0][0].identifier).toBe('C-02');
      expect(unitButton('C-02').getAttribute('aria-pressed')).toBe('true');
    });

    it('elegir en el plano marca la opción de la lista', async () => {
      await render(zoleaClub());

      unitButton('B-01').click();
      await fixture.whenStable();

      const checked = page.querySelectorAll<HTMLInputElement>('.z-unit-option input:checked');
      expect(checked.length).toBe(1);
      expect(text(checked[0].closest('.z-unit-option'))).toContain('B-01');
    });
  });

  describe('los estados', () => {
    it('mientras carga muestra el esqueleto con aria-busy y ningún botón', async () => {
      await render([], { loading: true });

      expect(page.querySelector('.z-plan')!.getAttribute('aria-busy')).toBe('true');
      expect(page.querySelectorAll('z-skeleton').length).toBeGreaterThan(0);
      expect(page.querySelector('.z-unit')).toBeNull();
      expect(page.querySelector('[role="tablist"]')).toBeNull();
    });

    it('sin unidades dice «Este balneario todavía no cargó sus lugares.»', async () => {
      await render([]);

      expect(text(page.querySelector('.z-plan__empty'))).toBe(
        'Este balneario todavía no cargó sus lugares.',
      );
      expect(page.querySelector('.z-unit')).toBeNull();
      expect(page.querySelector('[role="tablist"]')).toBeNull();
    });

    it('si solo hay sombrillas, no dibuja el paseo ni la zona de carpas', async () => {
      await render(zoleaClub().filter((u) => u.type === 'UMBRELLA'));

      expect(page.querySelector('.z-plan__walk')).toBeNull();
      expect(page.querySelectorAll('.z-plan__zone').length).toBe(1);
    });
  });

  describe('el plano libre (GH-68)', () => {
    /** Tres unidades ubicadas y una sin casilla. */
    function placed(): RentalUnit[] {
      const all = zoleaClub();
      const [a1, a2, c1, c2] = [all[0], all[1], all[16], all[17]];
      return [
        { ...c1, identifier: 'Carpa 12', posX: 4, posY: 2 },
        { ...a1, identifier: 'Palmera 3', posX: 1, posY: 0 },
        { ...a2, posX: 0, posY: 0 },
        { ...c2, identifier: 'Carpa 13', posX: null, posY: null },
      ];
    }

    const spots = () =>
      Array.from(page.querySelectorAll<HTMLElement>('.z-plan__grid .z-plan__spot'));

    it('sin ninguna unidad ubicada, el plano queda como siempre', async () => {
      await render(zoleaClub().map((unit) => ({ ...unit, posX: null, posY: null })));

      expect(page.querySelector('.z-plan__grid')).toBeNull();
      expect(page.querySelectorAll('.z-plan__column').length).toBe(2);
      expect(page.querySelector('.z-plan__walk')).not.toBeNull();
    });

    it('con unidades ubicadas, dibuja la grilla hasta la última casilla y cada una en la suya', async () => {
      await render(placed());

      const grid = page.querySelector<HTMLElement>('.z-plan__grid')!;
      expect(grid.style.gridTemplateColumns).toBe('repeat(5, var(--plan-cell))');
      expect(grid.style.gridTemplateRows).toBe('repeat(3, auto)');
      const carpa = spots().find((spot) => text(spot).includes('Carpa 12'))!;
      expect(carpa.style.gridColumn).toContain('5');
      expect(carpa.style.gridRow).toContain('3');
      expect(page.querySelector('.z-plan__column')).toBeNull();
      expect(page.querySelector('.z-plan__walk')).toBeNull();
    });

    it('recorre la grilla de arriba abajo y de izquierda a derecha', async () => {
      await render(placed());

      expect(spots().map((spot) => text(spot.querySelector('.z-unit__id')))).toEqual([
        'A-02',
        'Palmera 3',
        'Carpa 12',
      ]);
    });

    it('las que no tienen casilla van abajo, en su fila, antes de la entrada', async () => {
      await render(placed());

      const unplaced = page.querySelector('.z-plan__zone--unplaced')!;
      expect(text(unplaced.querySelector('.z-plan__zone-label'))).toBe('Carpas fuera del plano');
      expect(text(unplaced.querySelector('.z-unit__id'))).toBe('Carpa 13');
      expect(unplaced.nextElementSibling!.classList).toContain('z-plan__entry');
      expect(spots().some((spot) => text(spot).includes('Carpa 13'))).toBe(false);
    });

    it('cada unidad ubicada se elige igual que en el plano de siempre', async () => {
      await render(placed());
      const selected = vi.fn();
      fixture.componentInstance.unitSelected.subscribe(selected);

      unitButton('Palmera 3').click();
      await fixture.whenStable();

      expect(selected).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'Palmera 3' }));
      expect(unitButton('Palmera 3').getAttribute('aria-pressed')).toBe('true');
    });

    it('la lista agrupa por tipo, en el orden de la grilla y con las que no tienen casilla al final', async () => {
      await render(placed());
      page.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
      await fixture.whenStable();

      const groups = Array.from(page.querySelectorAll('.z-unit-list__group'));
      expect(groups.map((group) => text(group.querySelector('legend')))).toEqual([
        'Sombrillas · $ 8.500 por día',
        'Carpas · $ 14.500 por día',
      ]);
      expect(Array.from(groups[0].querySelectorAll('.z-code')).map((code) => text(code))).toEqual([
        'A-02',
        'Palmera 3',
      ]);
      expect(Array.from(groups[1].querySelectorAll('.z-code')).map((code) => text(code))).toEqual([
        'Carpa 12',
        'Carpa 13',
      ]);
    });
  });
});
