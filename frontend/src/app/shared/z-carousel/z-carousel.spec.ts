import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZCarousel } from './z-carousel';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** Un toque o un clic: jsdom no trae `PointerEvent`. */
function pointer(type: string, clientX: number, pointerType = 'touch'): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    pointerType: { value: pointerType },
  });
  return event;
}

describe('ZCarousel', () => {
  let fixture: ComponentFixture<ZCarousel>;
  let page: HTMLElement;

  async function open(photos: string[]): Promise<void> {
    fixture = TestBed.createComponent(ZCarousel);
    page = fixture.nativeElement;
    fixture.componentRef.setInput('photos', photos);
    fixture.componentRef.setInput('label', 'Fotos de Arena Dorada');
    await fixture.whenStable();
  }

  const count = () => text(page.querySelector('.z-carousel__count'));
  const button = (label: string) =>
    page.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const frame = () => page.querySelector<HTMLElement>('.z-carousel__frame')!;

  async function click(label: string): Promise<void> {
    button(label).click();
    await fixture.whenStable();
  }

  async function key(name: string): Promise<void> {
    frame().dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    await fixture.whenStable();
  }

  async function swipe(from: number, to: number, pointerType = 'touch'): Promise<void> {
    frame().dispatchEvent(pointer('pointerdown', from, pointerType));
    frame().dispatchEvent(pointer('pointerup', to, pointerType));
    await fixture.whenStable();
  }

  it('sin fotos no dibuja nada', async () => {
    await open([]);

    expect(page.querySelector('img')).toBeNull();
  });

  it('con una sola foto, la foto sin controles', async () => {
    await open(['a.jpg']);

    expect(page.querySelector('img')!.getAttribute('src')).toBe('a.jpg');
    expect(page.querySelector('button')).toBeNull();
    expect(page.querySelector('.z-carousel__count')).toBeNull();
  });

  it('dice cuál foto es y se nombra para el lector de pantalla', async () => {
    await open(['a.jpg', 'b.jpg', 'c.jpg']);

    const region = page.querySelector('.z-carousel')!;
    expect(region.getAttribute('aria-label')).toBe('Fotos de Arena Dorada');
    expect(region.getAttribute('aria-roledescription')).toBe('carrusel');
    expect(count()).toBe('Foto 1 de 3');
    expect(page.querySelector('.z-carousel__count')!.getAttribute('aria-live')).toBe('polite');
  });

  it('las flechas pasan de foto, y de las puntas vuelve a empezar', async () => {
    await open(['a.jpg', 'b.jpg', 'c.jpg']);

    await click('Foto siguiente');
    expect(count()).toBe('Foto 2 de 3');
    expect(page.querySelector<HTMLElement>('.z-carousel__track')!.style.transform).toBe(
      'translateX(-100%)',
    );

    await click('Foto anterior');
    await click('Foto anterior');
    expect(count()).toBe('Foto 3 de 3');

    await click('Foto siguiente');
    expect(count()).toBe('Foto 1 de 3');
  });

  it('solo la foto que se ve se puede alcanzar; las otras quedan inertes', async () => {
    await open(['a.jpg', 'b.jpg']);

    const slides = page.querySelectorAll<HTMLElement>('.z-carousel__slide');
    expect(slides[0].inert).toBe(false);
    expect(slides[1].inert).toBe(true);
    expect(slides[1].getAttribute('aria-label')).toBe('Foto 2 de 2');
  });

  it('los puntos llevan a cada foto y marcan la actual', async () => {
    await open(['a.jpg', 'b.jpg', 'c.jpg']);

    await click('Ver la foto 3');

    expect(count()).toBe('Foto 3 de 3');
    expect(button('Ver la foto 3').getAttribute('aria-current')).toBe('true');
    expect(button('Ver la foto 1').hasAttribute('aria-current')).toBe(false);
  });

  it('con el teclado: flechas, Inicio y Fin', async () => {
    await open(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(frame().tabIndex).toBe(0);

    await key('ArrowRight');
    expect(count()).toBe('Foto 2 de 3');
    await key('End');
    expect(count()).toBe('Foto 3 de 3');
    await key('ArrowLeft');
    expect(count()).toBe('Foto 2 de 3');
    await key('Home');
    expect(count()).toBe('Foto 1 de 3');
  });

  it('deslizando el dedo pasa de foto; un roce corto no', async () => {
    await open(['a.jpg', 'b.jpg', 'c.jpg']);

    await swipe(300, 200);
    expect(count()).toBe('Foto 2 de 3');

    await swipe(200, 300);
    expect(count()).toBe('Foto 1 de 3');

    await swipe(200, 180);
    expect(count()).toBe('Foto 1 de 3');
  });

  it('arrastrar con el mouse no pasa de foto', async () => {
    await open(['a.jpg', 'b.jpg']);

    await swipe(300, 100, 'mouse');

    expect(count()).toBe('Foto 1 de 2');
  });

  it('si cambian las fotos, vuelve a la primera', async () => {
    await open(['a.jpg', 'b.jpg', 'c.jpg']);
    await click('Ver la foto 3');

    fixture.componentRef.setInput('photos', ['x.jpg', 'y.jpg']);
    await fixture.whenStable();

    expect(count()).toBe('Foto 1 de 2');
  });
});
