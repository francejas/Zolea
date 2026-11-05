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
      expect(prices).toEqual([
        '$ 8.500 por día',
        '$ 7.000 por día',
        '$ 14.500 por día',
        'desde $ 12.000 por día',
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
});
