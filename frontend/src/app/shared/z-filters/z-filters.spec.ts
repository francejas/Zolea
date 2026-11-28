import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZFilters } from './z-filters';

@Component({
  imports: [ZFilters],
  template: `
    <z-filters label="Filtrar reservas" [count]="count()">
      <label>Estado <select id="estado"></select></label>
    </z-filters>
  `,
})
class Host {
  readonly count = signal(0);
}

describe('ZFilters', () => {
  let fixture: ComponentFixture<Host>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  const toggle = () => page.querySelector<HTMLButtonElement>('.z-filters__toggle')!;
  const panel = () => page.querySelector<HTMLElement>('.z-filters__panel')!;

  it('el botón dice «Filtros», controla el panel y arranca cerrado', () => {
    expect(toggle().textContent!.trim()).toBe('Filtros');
    expect(toggle().getAttribute('aria-controls')).toBe(panel().id);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(page.querySelector('.z-filters')!.classList).not.toContain('z-filters--open');
  });

  it('el panel es un grupo con nombre y trae los filtros de adentro', () => {
    expect(panel().getAttribute('role')).toBe('group');
    expect(panel().getAttribute('aria-label')).toBe('Filtrar reservas');
    expect(panel().querySelector('#estado')).not.toBeNull();
  });

  it('abre y cierra el panel', async () => {
    toggle().click();
    await fixture.whenStable();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(page.querySelector('.z-filters')!.classList).toContain('z-filters--open');

    toggle().click();
    await fixture.whenStable();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('con filtros puestos muestra cuántos, y sin filtros no muestra contador', async () => {
    expect(page.querySelector('.z-filters__count')).toBeNull();

    fixture.componentInstance.count.set(2);
    await fixture.whenStable();

    expect(page.querySelector('.z-filters__count')!.textContent!.trim()).toBe('2 puestos');
  });
});
