import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RowAction, ZRowMenu } from './z-row-menu';

@Component({
  imports: [ZRowMenu],
  template: `
    <z-row-menu label="Acciones de Sombrilla A-01" [actions]="actions" />
    <p id="afuera">Afuera</p>
  `,
})
class Host {
  readonly ran = signal<string[]>([]);
  readonly actions: RowAction[] = [
    { label: 'Precio', run: () => this.ran.update((r) => [...r, 'precio']) },
    { label: 'Dar de baja', danger: true, run: () => this.ran.update((r) => [...r, 'baja']) },
  ];
}

describe('ZRowMenu', () => {
  let fixture: ComponentFixture<Host>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    page = fixture.nativeElement;
    document.body.appendChild(page);
    await fixture.whenStable();
  });

  afterEach(() => page.remove());

  const trigger = () => page.querySelector<HTMLButtonElement>('.z-row-menu__trigger')!;
  const items = () =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('.z-row-menu__item')).map((b) =>
      b.textContent!.trim(),
    );

  async function open(): Promise<void> {
    trigger().click();
    await fixture.whenStable();
  }

  it('el botón tiene nombre y arranca cerrado, sin las acciones en la página', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Acciones de Sombrilla A-01');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(items()).toEqual([]);
  });

  it('al abrirlo muestra las acciones y el foco va a la primera', async () => {
    await open();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(items()).toEqual(['Precio', 'Dar de baja']);
    expect(document.activeElement!.textContent!.trim()).toBe('Precio');
    expect(page.querySelector('.z-row-menu__item--danger')!.textContent!.trim()).toBe(
      'Dar de baja',
    );
  });

  it('elegir una acción la corre, cierra el menú y deja el foco en el botón', async () => {
    await open();
    page.querySelectorAll<HTMLButtonElement>('.z-row-menu__item')[1].click();
    await fixture.whenStable();

    expect(fixture.componentInstance.ran()).toEqual(['baja']);
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(trigger());
  });

  it('Escape cierra y devuelve el foco al botón', async () => {
    await open();
    page
      .querySelector('.z-row-menu')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(trigger());
  });

  it('un clic afuera lo cierra', async () => {
    await open();
    page.querySelector<HTMLElement>('#afuera')!.click();
    await fixture.whenStable();

    expect(items()).toEqual([]);
  });
});
