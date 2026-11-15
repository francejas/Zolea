import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZDirections } from './z-directions';

describe('ZDirections', () => {
  let fixture: ComponentFixture<ZDirections>;
  let link: HTMLAnchorElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ZDirections] }).compileComponents();
    fixture = TestBed.createComponent(ZDirections);
    fixture.componentRef.setInput('name', 'Zolea Club de Playa');
    fixture.componentRef.setInput(
      'location',
      'Av. Patricio Peralta Ramos 4800, Mar del Plata, Buenos Aires',
    );
    fixture.detectChanges();
    link = fixture.nativeElement.querySelector('a');
  });

  it('es un enlace con forma de botón secundario que dice «Cómo llegar»', () => {
    expect(link.classList).toContain('z-btn');
    expect(link.classList).toContain('z-btn--secondary');
    expect(link.textContent!.trim()).toBe('Cómo llegar');
    expect(link.querySelector('svg')).not.toBeNull();
  });

  it('abre Google Maps con la dirección, codificada', () => {
    expect(link.href).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        'Av.%20Patricio%20Peralta%20Ramos%204800%2C%20Mar%20del%20Plata%2C%20Buenos%20Aires',
    );
  });

  it('se abre en otra pestaña, sin darle acceso a esta', () => {
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('el lector de pantalla oye adónde lleva y que se abre en otra pestaña', () => {
    expect(link.getAttribute('aria-label')).toBe(
      'Cómo llegar a Zolea Club de Playa, en Google Maps (se abre en otra pestaña)',
    );
  });
});
