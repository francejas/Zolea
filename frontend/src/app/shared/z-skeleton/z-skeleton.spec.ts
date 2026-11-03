import { TestBed } from '@angular/core/testing';
import { ZSkeleton } from './z-skeleton';

describe('ZSkeleton', () => {
  it('toma el ancho y el alto de lo que viene, y no lo leen los lectores de pantalla', async () => {
    await TestBed.configureTestingModule({ imports: [ZSkeleton] }).compileComponents();
    const fixture = TestBed.createComponent(ZSkeleton);
    fixture.componentRef.setInput('width', '70%');
    fixture.componentRef.setInput('height', '26px');
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList).toContain('z-skeleton');
    expect(host.style.width).toBe('70%');
    expect(host.style.height).toBe('26px');
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });
});
