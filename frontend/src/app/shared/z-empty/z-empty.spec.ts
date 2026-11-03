import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZEmpty } from './z-empty';

describe('ZEmpty', () => {
  let fixture: ComponentFixture<ZEmpty>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ZEmpty] }).compileComponents();
    fixture = TestBed.createComponent(ZEmpty);
    page = fixture.nativeElement;
    fixture.componentRef.setInput('title', 'Todavía no reservaste');
    fixture.componentRef.setInput('text', 'Elegí balneario y lugar.');
    await fixture.whenStable();
  });

  it('muestra la frase, y sin acción no muestra botón', () => {
    expect(page.querySelector('.z-empty__title')!.textContent).toContain('Todavía no reservaste');
    expect(page.querySelector('.z-empty__text')!.textContent).toContain('Elegí balneario');
    expect(page.querySelector('button')).toBeNull();
  });

  it('avisa con action cuando se toca su botón', async () => {
    const action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    fixture.componentRef.setInput('actionLabel', 'Buscar balneario');
    await fixture.whenStable();

    const button = page.querySelector('button')!;
    expect(button.textContent).toContain('Buscar balneario');
    button.click();

    expect(action).toHaveBeenCalledOnce();
  });
});
