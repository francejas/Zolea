import { TestBed } from '@angular/core/testing';
import { ZBtn } from '../z-btn/z-btn';
import { ZField } from '../z-field/z-field';

describe('Sistema de Diseño UI', () => {
  describe('ZBtnComponent', () => {
    it('debería quedar deshabilitado cuando loading es true', async () => {
      await TestBed.configureTestingModule({
        imports: [ZBtn],
      }).compileComponents();

      const fixture = TestBed.createComponent(ZBtn);
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button');
      expect(button.disabled).toBe(true);
      expect(fixture.nativeElement.querySelector('.z-spinner')).not.toBeNull();
    });
  });

  describe('ZFieldComponent', () => {
    it('debería mostrar el mensaje del error server si está tocado', async () => {
      await TestBed.configureTestingModule({
        imports: [ZField],
      }).compileComponents();

      const fixture = TestBed.createComponent(ZField);
      fixture.componentRef.setInput('inputId', 'email');
      fixture.componentRef.setInput('touched', true);
      fixture.componentRef.setInput('errors', { server: 'El correo ya existe' });
      fixture.detectChanges();

      const errorSpan = fixture.nativeElement.querySelector('.z-field-error');
      expect(errorSpan.textContent).toContain('El correo ya existe');
      expect(errorSpan.id).toBe('email-error');
    });

    it('no debería mostrar error si no fue tocado', async () => {
      await TestBed.configureTestingModule({
        imports: [ZField],
      }).compileComponents();

      const fixture = TestBed.createComponent(ZField);
      fixture.componentRef.setInput('inputId', 'email');
      fixture.componentRef.setInput('touched', false);
      fixture.componentRef.setInput('errors', { required: true });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.z-field-error')).toBeNull();
    });
  });
});