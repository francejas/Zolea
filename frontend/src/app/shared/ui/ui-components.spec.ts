import { TestBed } from '@angular/core/testing';
import { ZBtn } from '../z-btn/z-btn';

// Las pruebas del campo están en z-field.spec.ts, con un formulario de Signal Forms de verdad.
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
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(button.querySelector('.z-spinner')).not.toBeNull();
    });

    it('arma las clases de componentes.css: el tamaño normal no lleva modificador', async () => {
      await TestBed.configureTestingModule({
        imports: [ZBtn],
      }).compileComponents();

      const fixture = TestBed.createComponent(ZBtn);
      fixture.componentRef.setInput('variant', 'secondary');
      fixture.detectChanges();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
      expect(button.className).toBe('z-btn z-btn--secondary');

      fixture.componentRef.setInput('size', 'small');
      fixture.detectChanges();
      expect(button.className).toBe('z-btn z-btn--secondary z-btn--small');
    });
  });
});
