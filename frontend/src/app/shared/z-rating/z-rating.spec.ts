import { TestBed } from '@angular/core/testing';
import { ZRating } from './z-rating';

describe('ZRating', () => {
  function render(inputs: { value: number; count?: number | null; compact?: boolean }) {
    const fixture = TestBed.createComponent(ZRating);
    fixture.componentRef.setInput('value', inputs.value);
    if (inputs.count !== undefined) fixture.componentRef.setInput('count', inputs.count);
    if (inputs.compact !== undefined) fixture.componentRef.setInput('compact', inputs.compact);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    return {
      text: host.textContent!.replace(/\s+/g, ' ').trim(),
      stars: host.querySelectorAll('.z-rating__star').length,
      on: host.querySelectorAll('.z-rating__star--on').length,
      hidden: host.querySelector('.z-rating__stars')!.getAttribute('aria-hidden'),
    };
  }

  it('dibuja cinco estrellas y escribe el número al lado', () => {
    const rating = render({ value: 4 });

    expect(rating.stars).toBe(5);
    expect(rating.on).toBe(4);
    expect(rating.text).toBe('4 de 5 estrellas');
    expect(rating.hidden).toBe('true');
  });

  it('un promedio va con una coma decimal y pinta las estrellas redondeando', () => {
    expect(render({ value: 4.5 })).toMatchObject({ on: 5, text: '4,5 de 5 estrellas' });
    expect(render({ value: 4.4 })).toMatchObject({ on: 4, text: '4,4 de 5 estrellas' });
  });

  it('suma cuántas reseñas son', () => {
    expect(render({ value: 4.5, count: 12 }).text).toBe('4,5 de 5 estrellas · 12 reseñas');
    expect(render({ value: 5, count: 1 }).text).toBe('5 de 5 estrellas · 1 reseña');
  });

  it('compacta, una sola estrella', () => {
    const rating = render({ value: 4.5, count: 12, compact: true });

    expect(rating.stars).toBe(1);
    expect(rating.on).toBe(1);
    expect(rating.text).toContain('4,5');
  });
});
