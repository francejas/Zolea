import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Resort } from '../../../core/api/resort.models';
import { ResortList } from './resort-list';

const API = `${environment.apiUrl}/api/resorts`;

function resort(overrides: Partial<Resort>): Resort {
  return {
    idResort: 1,
    name: 'Balneario',
    location: 'Mar del Plata',
    coverPhotoUrl: null,
    description: null,
    active: true,
    amenities: [],
    rentalUnits: [],
    ...overrides,
  };
}

const arenaDorada = resort({ idResort: 1, name: 'Arena Dorada', location: 'Villa Gesell' });
const solYMar = resort({ idResort: 2, name: 'Sol y Mar', location: 'Mar del Plata' });

describe('ResortList', () => {
  let fixture: ComponentFixture<ResortList>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResortList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ResortList);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  /** Responde el pedido de la lista y deja la pantalla dibujada. */
  async function respondWith(resorts: Resort[]): Promise<void> {
    http.expectOne(API).flush(resorts);
    await fixture.whenStable();
  }

  async function search(term: string): Promise<void> {
    const input = page.querySelector<HTMLInputElement>('#f-search')!;
    input.value = term;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  const names = () =>
    Array.from(page.querySelectorAll('.z-resort-card__name')).map((n) => n.textContent!.trim());

  it('se crea y pide los balnearios a la API', () => {
    expect(fixture.componentInstance).toBeTruthy();
    expect(http.expectOne(API).request.method).toBe('GET');
  });

  it('mientras carga muestra el esqueleto y marca la grilla como ocupada', () => {
    expect(page.querySelector('.resorts-grid')!.getAttribute('aria-busy')).toBe('true');
    expect(page.querySelectorAll('z-skeleton').length).toBeGreaterThan(0);
    http.expectOne(API);
  });

  it('el filtro ignora mayúsculas y tildes', async () => {
    await respondWith([arenaDorada, solYMar]);
    expect(names()).toEqual(['Arena Dorada', 'Sol y Mar']);

    await search('GÉSELL');

    expect(names()).toEqual(['Arena Dorada']);
  });

  it('el filtro ignora los espacios al principio y al final', async () => {
    await respondWith([arenaDorada, solYMar]);

    await search('  gesell ');

    expect(names()).toEqual(['Arena Dorada']);
  });

  it('si falla la carga muestra el error y Reintentar vuelve a pedir', async () => {
    http.expectOne(API).flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    const problem = page.querySelector('z-problem')!;
    expect(problem.textContent).toContain('No pudimos traer los balnearios');
    expect(problem.getAttribute('role')).toBe('alert');

    problem.querySelector('button')!.click();
    await fixture.whenStable();

    await respondWith([arenaDorada]);
    expect(page.querySelector('z-problem')).toBeNull();
    expect(names()).toEqual(['Arena Dorada']);
  });

  it('sin balnearios muestra un vacío sin botón', async () => {
    await respondWith([]);

    const empty = page.querySelector('z-empty')!;
    expect(empty.textContent).toContain('Todavía no hay balnearios');
    expect(empty.querySelector('button')).toBeNull();
  });

  it('una búsqueda sin resultados ofrece Limpiar búsqueda y devuelve el foco al buscador', async () => {
    await respondWith([arenaDorada, solYMar]);
    await search('zzz');

    const empty = page.querySelector('z-empty')!;
    expect(empty.textContent).toContain('No encontramos balnearios con esa búsqueda');

    empty.querySelector('button')!.click();
    await fixture.whenStable();

    expect(names()).toEqual(['Arena Dorada', 'Sol y Mar']);
    expect(document.activeElement).toBe(page.querySelector('#f-search'));
  });

  it('el precio «desde» ignora las unidades bloqueadas y no aparece sin unidades', async () => {
    const unit = (dailyPrice: number, isBlocked: boolean) => ({
      idRentalUnit: dailyPrice,
      type: 'TENT' as const,
      identifier: `C${dailyPrice}`,
      dailyPrice,
      isBlocked,
      resortId: 1,
    });
    await respondWith([
      resort({
        idResort: 1,
        name: 'Con precio',
        rentalUnits: [unit(5000, true), unit(9000, false)],
      }),
      resort({ idResort: 2, name: 'Sin unidades' }),
    ]);

    const cards = page.querySelectorAll('.z-resort-card');
    expect(cards[0].querySelector('.z-money')!.textContent).toContain('9.000');
    expect(cards[1].querySelector('.z-price-from')).toBeNull();
  });

  it('anuncia la cantidad de resultados en un texto aparte, sin aria-live en la sección', async () => {
    await respondWith([arenaDorada, solYMar]);

    expect(page.querySelector('[aria-live]')).toBeNull();
    expect(page.querySelector('[role="status"]')!.textContent!.trim()).toBe('2 balnearios');
  });
});
