import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { Review } from '../../../core/api/review.models';
import { ResortReviews } from './resort-reviews';

const URL = `${environment.apiUrl}/api/resorts/4/reviews`;

const review = (overrides: Partial<Review> = {}): Review => ({
  author: 'Santiago R.',
  rating: 5,
  comment: 'La carpa estaba lista al llegar.',
  createdAt: '2026-01-12T18:30:00',
  ...overrides,
});

describe('ResortReviews', () => {
  let fixture: ComponentFixture<ResortReviews>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ResortReviews],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ResortReviews);
    fixture.componentRef.setInput('resortId', 4);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function respond(reviews: Review[]): Promise<void> {
    http.expectOne(URL).flush(reviews);
    await fixture.whenStable();
  }

  it('lista las reseñas en el orden en que llegan, con las estrellas, el autor y la fecha', async () => {
    await respond([
      review(),
      review({ author: 'Lucía M.', rating: 3, comment: null, createdAt: '2026-01-02T10:00:00' }),
    ]);

    const items = Array.from(page.querySelectorAll('.reviews__item')).map((item) =>
      Array.from(item.children)
        .map((part) => part.textContent!.replace(/\s+/g, ' ').trim())
        .join(' | '),
    );
    expect(items).toEqual([
      '5 de 5 estrellas | La carpa estaba lista al llegar. | Santiago R. · 12 de enero de 2026',
      '3 de 5 estrellas | Lucía M. · 2 de enero de 2026',
    ]);
  });

  it('sin reseñas, lo dice', async () => {
    await respond([]);

    expect(page.textContent).toContain('Todavía nadie calificó este balneario.');
  });

  it('si falla, deja reintentar', async () => {
    http.expectOne(URL).flush({ error: 'x' }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();

    expect(page.textContent).toContain('No pudimos traer las reseñas.');

    page.querySelector<HTMLButtonElement>('z-alert button')!.click();
    await fixture.whenStable();
    await fixture.whenStable();
    await respond([review()]);

    expect(page.querySelectorAll('.reviews__item').length).toBe(1);
  });
});
