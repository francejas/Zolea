import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZProblem } from './z-problem';

describe('ZProblem', () => {
  let fixture: ComponentFixture<ZProblem>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ZProblem] }).compileComponents();
    fixture = TestBed.createComponent(ZProblem);
    page = fixture.nativeElement;
    fixture.componentRef.setInput('title', 'No pudimos traer los balnearios');
    fixture.componentRef.setInput('text', 'Revisá tu conexión y probá de nuevo.');
    await fixture.whenStable();
  });

  it('dice qué pasó, y se anuncia como alerta', () => {
    expect(page.querySelector('.z-problem__title')!.textContent).toContain('No pudimos traer');
    expect(page.querySelector('.z-problem__text')!.textContent).toContain('Revisá tu conexión');
    expect(page.getAttribute('role')).toBe('alert');
  });

  it('avisa con retry cuando se toca Reintentar', () => {
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);

    const button = page.querySelector('button')!;
    expect(button.textContent).toContain('Reintentar');
    button.click();

    expect(retry).toHaveBeenCalledOnce();
  });
});
