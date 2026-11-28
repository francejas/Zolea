import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { RentalUnit, UnitPosition } from '../../../../core/api/resort.models';
import { UnitsApi } from '../../../../core/api/units.api';
import { PlanDesigner } from './plan-designer';

const unit = (over: Partial<RentalUnit>): RentalUnit => ({
  idRentalUnit: 1,
  type: 'UMBRELLA',
  identifier: 'A-01',
  dailyPrice: 8500,
  isBlocked: false,
  resortId: 1,
  retired: false,
  posX: null,
  posY: null,
  ...over,
});

/** Dos ubicadas, una sin ubicar y una dada de baja, que no va. */
const units = (): RentalUnit[] => [
  unit({ idRentalUnit: 1, identifier: 'A-01', posX: 0, posY: 0 }),
  unit({ idRentalUnit: 2, identifier: 'A-02', posX: 1, posY: 0 }),
  unit({ idRentalUnit: 3, identifier: 'Carpa 12', type: 'TENT' }),
  unit({ idRentalUnit: 4, identifier: 'D-01', type: 'TENT', retired: true }),
];

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

describe('PlanDesigner', () => {
  let fixture: ComponentFixture<PlanDesigner>;
  let page: HTMLElement;
  let api: {
    list: ReturnType<typeof vi.fn>;
    savePlan: ReturnType<typeof vi.fn>;
  };

  async function render(list: Observable<RentalUnit[]> = of(units())) {
    api.list.mockReturnValue(list);
    fixture = TestBed.createComponent(PlanDesigner);
    page = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const cell = (x: number, y: number) =>
    page.querySelector<HTMLButtonElement>(`[data-cell="${x},${y}"]`)!;
  const chip = (identifier: string) =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('.designer__chip')).find((b) =>
      text(b).includes(identifier),
    )!;
  const button = (label: string) =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) => text(b) === label)!;
  const status = () => text(page.querySelector('.designer__status'));
  const iconButton = (label: string) =>
    page.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const key = (target: Element, k: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  beforeEach(() => {
    api = { list: vi.fn(), savePlan: vi.fn() };
    TestBed.configureTestingModule({
      imports: [PlanDesigner],
      providers: [provideRouter([]), { provide: UnitsApi, useValue: api }],
    });
  });

  describe('la grilla', () => {
    it('dibuja cada unidad ubicada en su casilla, con el mar arriba y la entrada abajo', async () => {
      await render();

      expect(text(cell(0, 0))).toContain('A-01');
      expect(text(cell(1, 0))).toContain('A-02');
      expect(cell(0, 0).getAttribute('aria-label')).toBe('Columna 1, fila 1: Sombrilla A-01');
      expect(cell(2, 0).getAttribute('aria-label')).toBe('Columna 3, fila 1, libre');
      expect(text(page.querySelector('.designer__sea'))).toBe('Mar');
      expect(text(page.querySelector('.designer__entry'))).toBe('Entrada del balneario');
    });

    it('arranca con 8 columnas y 6 filas, o más si alguna unidad está más lejos', async () => {
      await render();
      expect(page.querySelectorAll('[data-cell]').length).toBe(48);

      await render(of([unit({ posX: 11, posY: 7 })]));
      expect(page.querySelectorAll('[data-cell]').length).toBe(12 * 8);
    });

    it('al costado, las que no tienen casilla; las dadas de baja no aparecen', async () => {
      await render();

      const chips = Array.from(page.querySelectorAll('.designer__chip-id')).map((b) => text(b));
      expect(chips).toEqual(['Carpa 12']);
      expect(page.textContent).not.toContain('D-01');
    });
  });

  describe('ubicar, mover y sacar', () => {
    it('elegir una sin ubicar y tocar una casilla libre la ubica ahí', async () => {
      await render();

      chip('Carpa 12').click();
      await settle();
      expect(chip('Carpa 12').getAttribute('aria-pressed')).toBe('true');
      expect(status()).toBe('Elegiste la carpa Carpa 12: tocá una casilla para ubicarla.');

      cell(3, 2).click();
      await settle();

      expect(text(cell(3, 2))).toContain('Carpa 12');
      expect(page.querySelector('.designer__chip')).toBeNull();
      expect(status()).toBe('Carpa Carpa 12 en la columna 4, fila 3.');
    });

    it('tocar una ubicada la elige, y tocar otra libre la mueve', async () => {
      await render();

      cell(0, 0).click();
      await settle();
      expect(cell(0, 0).getAttribute('aria-label')).toBe(
        'Columna 1, fila 1: Sombrilla A-01, elegida',
      );

      cell(5, 4).click();
      await settle();

      expect(text(cell(5, 4))).toContain('A-01');
      expect(text(cell(0, 0))).not.toContain('A-01');
    });

    it('dos ubicadas se cambian de lugar', async () => {
      await render();

      cell(0, 0).click();
      await settle();
      cell(1, 0).click();
      await settle();

      expect(text(cell(0, 0))).toContain('A-02');
      expect(text(cell(1, 0))).toContain('A-01');
      expect(status()).toBe('Sombrilla A-01 y sombrilla A-02 cambiaron de lugar.');
    });

    it('una sin ubicar no pisa una casilla ocupada', async () => {
      await render();

      chip('Carpa 12').click();
      await settle();
      cell(0, 0).click();
      await settle();

      expect(text(cell(0, 0))).toContain('A-01');
      expect(chip('Carpa 12')).toBeTruthy();
      expect(status()).toBe(
        'Esa casilla es de la sombrilla A-01: elegí una libre, o mové esa primero.',
      );
    });

    it('«Sacar del plano» la manda a la lista del costado, todavía elegida', async () => {
      await render();

      cell(1, 0).click();
      await settle();
      button('Sacar del plano').click();
      await settle();

      expect(text(cell(1, 0))).not.toContain('A-02');
      expect(chip('A-02').getAttribute('aria-pressed')).toBe('true');
      expect(document.activeElement).toBe(chip('A-02'));
      expect(status()).toBe('Sombrilla A-02 salió del plano.');
    });
  });

  describe('con el teclado', () => {
    it('las flechas recorren la grilla y llevan el foco, con una sola casilla en el Tab', async () => {
      await render();

      expect(page.querySelectorAll('[data-cell][tabindex="0"]').length).toBe(1);
      cell(0, 0).focus();
      key(cell(0, 0), 'ArrowRight');
      await settle();
      expect(document.activeElement).toBe(cell(1, 0));
      key(cell(1, 0), 'ArrowDown');
      await settle();
      expect(document.activeElement).toBe(cell(1, 1));
      key(cell(1, 1), 'End');
      await settle();
      expect(document.activeElement).toBe(cell(7, 1));
      expect(cell(7, 1).getAttribute('tabindex')).toBe('0');
    });

    it('Escape deja de elegir, y Suprimir saca del plano la de la casilla', async () => {
      await render();

      cell(0, 0).click();
      await settle();
      key(cell(0, 0), 'Escape');
      await settle();
      expect(status()).toBe('Dejaste de elegir la sombrilla A-01.');

      key(cell(0, 0), 'Delete');
      await settle();
      expect(text(cell(0, 0))).not.toContain('A-01');
      expect(chip('A-01')).toBeTruthy();
    });
  });

  describe('filas y columnas', () => {
    it('se agregan y se quitan del final', async () => {
      await render();

      iconButton('Agregar columna').click();
      iconButton('Agregar fila').click();
      await settle();
      expect(page.querySelectorAll('[data-cell]').length).toBe(9 * 7);

      iconButton('Quitar fila').click();
      await settle();
      expect(page.querySelectorAll('[data-cell]').length).toBe(9 * 6);
    });

    it('no se quita una columna que tiene unidades', async () => {
      await render(of([unit({ posX: 7, posY: 0 })]));

      iconButton('Quitar columna').click();
      await settle();

      expect(page.querySelectorAll('[data-cell]').length).toBe(48);
      expect(status()).toBe('La última columna tiene unidades: movelas antes de quitarla.');
    });
  });

  describe('guardar', () => {
    it('«Guardar plano» manda la casilla de cada unidad y avisa', async () => {
      api.savePlan.mockImplementation((positions: UnitPosition[]) =>
        of(
          units().map((u) => {
            const p = positions.find((x) => x.idRentalUnit === u.idRentalUnit);
            return p ? { ...u, posX: p.posX, posY: p.posY } : u;
          }),
        ),
      );
      await render();

      chip('Carpa 12').click();
      await settle();
      cell(4, 3).click();
      await settle();
      button('Guardar plano').click();
      await settle();

      expect(api.savePlan).toHaveBeenCalledWith([
        { idRentalUnit: 1, posX: 0, posY: 0 },
        { idRentalUnit: 2, posX: 1, posY: 0 },
        { idRentalUnit: 3, posX: 4, posY: 3 },
      ]);
      expect(text(page.querySelector('z-alert'))).toContain('Guardamos el plano.');
      expect(fixture.componentInstance.canLeave()).toBe(true);
    });

    it('sin cambios no hay nada que guardar ni que descartar', async () => {
      await render();

      expect(page.querySelector<HTMLButtonElement>('.designer__save button')!.disabled).toBe(true);
      expect(button('Descartar cambios')).toBeUndefined();
    });

    it('«Descartar cambios» vuelve al plano guardado', async () => {
      await render();

      cell(0, 0).click();
      await settle();
      cell(6, 5).click();
      await settle();
      button('Descartar cambios').click();
      await settle();

      expect(text(cell(0, 0))).toContain('A-01');
      expect(text(cell(6, 5))).not.toContain('A-01');
    });

    it('un 400 vuelve a traer las unidades y dice el motivo', async () => {
      api.savePlan.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { error: 'La unidad A-02 está dada de baja: no se ubica en el plano.' },
            }),
        ),
      );
      await render();
      cell(0, 0).click();
      await settle();
      cell(3, 3).click();
      await settle();

      api.list.mockReturnValue(of([units()[0], units()[2]]));
      button('Guardar plano').click();
      await settle();

      expect(api.list).toHaveBeenCalledTimes(2);
      expect(text(page.querySelector('z-alert'))).toContain('La unidad A-02 está dada de baja');
      expect(text(cell(0, 0))).toContain('A-01');
      const cells = Array.from(page.querySelectorAll('[data-cell]'));
      expect(cells.some((c) => text(c).includes('A-02'))).toBe(false);
      expect(status()).toBe('Elegí una unidad y tocá una casilla para ubicarla.');
    });

    it('con cambios sin guardar, pregunta antes de salir', async () => {
      await render();
      expect(fixture.componentInstance.canLeave()).toBe(true);

      cell(0, 0).click();
      await settle();
      cell(6, 5).click();
      await settle();

      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      expect(fixture.componentInstance.canLeave()).toBe(false);
      expect(confirm).toHaveBeenCalledWith('Tenés cambios sin guardar en el plano. ¿Salir igual?');
      confirm.mockRestore();
    });
  });

  describe('los estados', () => {
    it('mientras carga, el esqueleto', async () => {
      await render(new Subject<RentalUnit[]>());
      expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it('si falla, el problema con «Reintentar»', async () => {
      await render(throwError(() => new HttpErrorResponse({ status: 500 })));
      expect(page.querySelector('z-problem')).not.toBeNull();
    });

    it('sin unidades en servicio, lleva a Unidades', async () => {
      await render(of([unit({ retired: true })]));
      expect(text(page.querySelector('z-empty'))).toContain('Todavía no cargaste unidades');
    });
  });
});
