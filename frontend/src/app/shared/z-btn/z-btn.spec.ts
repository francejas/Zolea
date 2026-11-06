import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZBtn } from './z-btn';

describe('ZBtn', () => {
  let fixture: ComponentFixture<ZBtn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZBtn],
    }).compileComponents();

    fixture = TestBed.createComponent(ZBtn);
    await fixture.whenStable();
  });

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  it('por defecto es type="button", para no enviar formularios sin querer', () => {
    expect(button().type).toBe('button');
  });

  it('deja elegir otro type, como el submit de un formulario', async () => {
    fixture.componentRef.setInput('type', 'submit');
    await fixture.whenStable();

    expect(button().type).toBe('submit');
  });

  it('con block, el botón lleva z-btn--block para ocupar todo el ancho', async () => {
    expect(button().classList).not.toContain('z-btn--block');

    fixture.componentRef.setInput('block', true);
    await fixture.whenStable();

    expect(button().classList).toContain('z-btn--block');
    expect(button().classList).toContain('z-btn--primary');
  });
});
