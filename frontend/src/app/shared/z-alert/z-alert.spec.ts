import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZAlert } from './z-alert';

describe('ZAlert', () => {
  let component: ZAlert;
  let fixture: ComponentFixture<ZAlert>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZAlert],
    }).compileComponents();

    fixture = TestBed.createComponent(ZAlert);
    component = fixture.componentInstance;
    page = fixture.nativeElement;

    fixture.componentRef.setInput('variant', 'info');
    fixture.componentRef.setInput('text', 'Aviso de prueba');
    await fixture.whenStable();
  });

  it('sin acción no muestra botón', () => {
    expect(page.querySelector('.z-alert__action')).toBeNull();
  });

  it('avisa con action cuando se toca su botón', async () => {
    const action = vi.fn();
    component.action.subscribe(action);
    fixture.componentRef.setInput('actionLabel', 'Ir a Mis reservas');
    await fixture.whenStable();

    page.querySelector<HTMLButtonElement>('.z-alert__action button')!.click();

    expect(action).toHaveBeenCalledOnce();
  });

  it('sin permiso es el aviso forbidden, y se anuncia como alerta', async () => {
    fixture.componentRef.setInput('variant', 'forbidden');
    fixture.componentRef.setInput('title', 'Esta reserva no es tuya');
    await fixture.whenStable();

    const alert = page.querySelector('.z-alert')!;
    expect(alert.classList).toContain('z-alert--forbidden');
    expect(alert.getAttribute('role')).toBe('alert');
  });
});
