import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { Review } from '../../../core/api/review.models';
import { aBooking } from '../booking.fixtures';
import { ReviewDialog } from './review-dialog';

const URL = `${environment.apiUrl}/api/bookings/47/review`;

describe('ReviewDialog', () => {
  let fixture: ComponentFixture<ReviewDialog>;
  let http: HttpTestingController;
  let page: HTMLElement;
  let saved: Review[];
  let closed: number;

  beforeEach(async () => {
    // jsdom no trae los métodos de <dialog>.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    TestBed.configureTestingModule({
      imports: [ReviewDialog],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReviewDialog);
    fixture.componentRef.setInput('booking', aBooking({ id: 47 }));
    saved = [];
    closed = 0;
    fixture.componentInstance.saved.subscribe((review) => saved.push(review));
    fixture.componentInstance.closed.subscribe(() => closed++);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function star(n: number): HTMLInputElement {
    return page.querySelectorAll<HTMLInputElement>('input[type="radio"]')[n - 1];
  }

  async function pick(n: number): Promise<void> {
    star(n).click();
    await fixture.whenStable();
  }

  async function type(text: string): Promise<void> {
    const comment = page.querySelector<HTMLTextAreaElement>('textarea')!;
    comment.value = text;
    comment.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function send(): Promise<void> {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  /** La respuesta termina el `submit`, que es una promesa: se deja correr antes de mirar. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent!.includes(text))!;
  }

  it('se abre solo, con el balneario, la unidad y los días', () => {
    expect(page.querySelector('dialog')!.hasAttribute('open')).toBe(true);
    expect(page.textContent).toContain('Zolea Club de Playa');
    expect(page.textContent).toContain('Sombrilla A-03 · 15 → 17 ene');
  });

  it('las estrellas son un grupo de cinco opciones, cada una con su nombre', () => {
    const radios = page.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios.length).toBe(5);
    // El mismo nombre en las cinco (lo pone Signal Forms): es lo que las vuelve un grupo.
    const names = new Set(Array.from(radios).map((r) => r.name));
    expect(names.size).toBe(1);
    expect([...names][0]).not.toBe('');
    expect(page.querySelector('legend')!.textContent).toContain('¿Cuántas estrellas le das?');
    expect(radios[0].closest('label')!.textContent).toContain('1 estrella');
    expect(radios[3].closest('label')!.textContent).toContain('4 estrellas');
  });

  it('no envía sin estrellas', async () => {
    await send();

    http.expectNone(URL);
    expect(page.textContent).toContain('Elegí de 1 a 5 estrellas.');
  });

  it('envía sin comentario, y avisa con la reseña', async () => {
    await pick(4);
    expect(page.querySelector('.review__value')!.textContent).toContain('4 de 5');
    expect(page.querySelectorAll('.review__star--on').length).toBe(4);

    await send();
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ rating: 4, comment: null });
    req.flush({
      author: 'Santiago R.',
      rating: 4,
      comment: null,
      createdAt: '2026-01-20T10:00:00',
    });
    await fixture.whenStable();

    expect(saved).toEqual([
      { author: 'Santiago R.', rating: 4, comment: null, createdAt: '2026-01-20T10:00:00' },
    ]);
    expect(closed).toBe(0);
    expect(page.querySelector('dialog')!.hasAttribute('open')).toBe(false);
  });

  it('manda el comentario sin los espacios de las puntas y cuenta los caracteres', async () => {
    await pick(5);
    await type('  Muy lindo.  ');
    expect(page.textContent).toContain('14 de 500 caracteres');

    await send();
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ rating: 5, comment: 'Muy lindo.' });
    req.flush({ author: 'Santiago R.', rating: 5, comment: 'Muy lindo.', createdAt: '' });
  });

  it('no envía un comentario de más de 500 caracteres', async () => {
    await pick(3);
    await type('a'.repeat(501));

    await send();

    http.expectNone(URL);
    expect(page.textContent).toContain('El comentario puede tener hasta 500 caracteres.');
  });

  it('«Ya calificaste esta reserva.» va en el aviso de arriba', async () => {
    await pick(4);
    await send();
    http
      .expectOne(URL)
      .flush({ error: 'Ya calificaste esta reserva.' }, { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(page.querySelector('z-alert')!.textContent).toContain('Ya calificaste esta reserva.');
    expect(saved).toEqual([]);
  });

  it('un error de un campo va debajo de ese campo', async () => {
    await pick(4);
    await type('Muy lindo.');
    await send();
    http
      .expectOne(URL)
      .flush(
        { error: 'Datos inválidos', campos: { comment: 'El comentario no es válido.' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    expect(page.querySelector('z-field')!.textContent).toContain('El comentario no es válido.');
    expect(page.querySelector('z-alert')).toBeNull();
  });

  it('«Ahora no» cierra sin calificar', async () => {
    button('Ahora no').click();
    await fixture.whenStable();

    expect(closed).toBe(1);
    expect(page.querySelector('dialog')!.hasAttribute('open')).toBe(false);
  });
});
