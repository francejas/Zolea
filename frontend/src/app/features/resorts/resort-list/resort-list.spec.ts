import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Amenity, Resort } from '../../../core/api/resort.models';
import { ResortList } from './resort-list';

const API = `${environment.apiUrl}/api/resorts`;
const AMENITIES = `${environment.apiUrl}/api/amenities`;

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
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResortList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ResortList);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    // El catálogo de servicios del filtro: las pruebas que no lo miran lo dejan sin responder.
    for (const req of http.match(AMENITIES)) req.flush([]);
    http.verify();
  });

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
      retired: false,
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

  describe('los filtros', () => {
    const wifi: Amenity = { idAmenity: 1, name: 'WiFi' };
    const spa: Amenity = { idAmenity: 2, name: 'Spa' };

    /** Las fechas van en <z-date-range>: en la prueba se ponen directo en el borrador. */
    const draft = () =>
      fixture.componentInstance as unknown as {
        draftFrom: { set(value: string): void };
        draftTo: { set(value: string): void };
      };

    async function withAmenities(amenities: Amenity[] = [wifi, spa]): Promise<void> {
      http.expectOne(AMENITIES).flush(amenities);
      await fixture.whenStable();
    }

    /** Pone los filtros en la dirección, como si se llegara con ellos. */
    async function arriveWith(params: Record<string, string>): Promise<void> {
      await respondWith([]);
      for (const [name, value] of Object.entries(params)) {
        fixture.componentRef.setInput(name, value);
      }
      await fixture.whenStable();
    }

    async function submitFilters(): Promise<void> {
      const panel = page.querySelector<HTMLFormElement>('#filters-panel')!;
      panel.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
    }

    it('con los filtros en la dirección vuelve a pedir la lista con esos filtros', async () => {
      await arriveWith({
        from: '2027-01-15',
        to: '2027-01-17',
        type: 'TENT',
        maxPrice: '20000',
        amenityIds: '2,1',
      });

      http
        .expectOne(`${API}?from=2027-01-15&to=2027-01-17&type=TENT&maxPrice=20000&amenityIds=1,2`)
        .flush([]);
    });

    it('descarta de la dirección los filtros que no sirven', async () => {
      await arriveWith({ from: '2020-01-15', to: '2020-01-17', type: 'YATE', maxPrice: '-5' });

      // Quedó igual que la Portada sin filtros: no hay un pedido nuevo.
      expect(http.match((req) => req.url === API)).toEqual([]);
    });

    it('con fechas, cada tarjeta dice cuántos lugares libres tiene y lleva esas fechas', async () => {
      await arriveWith({ from: '2027-01-15', to: '2027-01-17' });
      http.expectOne(`${API}?from=2027-01-15&to=2027-01-17`).flush([
        { ...arenaDorada, availableUnits: 8 },
        { ...solYMar, availableUnits: 1 },
      ]);
      await fixture.whenStable();

      const free = Array.from(page.querySelectorAll('.z-resort-card__free')).map((p) =>
        p.textContent!.trim(),
      );
      expect(free).toEqual(['8 lugares libres', '1 lugar libre']);
      expect(page.querySelector('.z-resort-card__name a')!.getAttribute('href')).toBe(
        '/resorts/1?from=2027-01-15&to=2027-01-17',
      );
    });

    it('sin fechas las tarjetas no hablan de lugares libres y llevan a la ficha sola', async () => {
      await respondWith([arenaDorada]);

      expect(page.querySelector('.z-resort-card__free')).toBeNull();
      expect(page.querySelector('.z-resort-card__name a')!.getAttribute('href')).toBe('/resorts/1');
    });

    it('sin resultados con filtros lo dice y Limpiar filtros vuelve a la Portada sin filtros', async () => {
      await arriveWith({ type: 'TENT' });
      http.expectOne(`${API}?type=TENT`).flush([]);
      await fixture.whenStable();

      const empty = page.querySelector('z-empty')!;
      expect(empty.textContent).toContain('No hay lugares libres con esos filtros');

      empty.querySelector('button')!.click();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('Buscar lleva a la dirección solo los filtros puestos', async () => {
      await respondWith([]);
      await withAmenities();

      const type = page.querySelector<HTMLSelectElement>('#f-type')!;
      type.value = 'TENT';
      // Un <select> real dispara los dos eventos; Signal Forms escucha `input`.
      type.dispatchEvent(new Event('input'));
      type.dispatchEvent(new Event('change'));
      const price = page.querySelector<HTMLInputElement>('#f-max-price')!;
      price.value = '20000';
      price.dispatchEvent(new Event('input'));
      const choices = page.querySelectorAll<HTMLInputElement>('.z-choice input');
      choices[1].click();
      choices[0].click();
      await fixture.whenStable();

      await submitFilters();

      expect(router.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: { type: 'TENT', maxPrice: 20000, amenityIds: '1,2' },
      });
    });

    it('Buscar con las fechas las manda en la dirección', async () => {
      await respondWith([]);
      draft().draftFrom.set('2027-01-15');
      draft().draftTo.set('2027-01-17');
      await fixture.whenStable();

      await submitFilters();

      expect(router.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: { from: '2027-01-15', to: '2027-01-17' },
      });
    });

    it('con la entrada y sin la salida no busca y pide la salida', async () => {
      await respondWith([]);
      draft().draftFrom.set('2027-01-15');
      await fixture.whenStable();

      await submitFilters();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(page.querySelector('.filters__error')!.textContent).toContain(
        'Elegí también la salida.',
      );
    });

    it('el formulario arranca con los filtros de la dirección', async () => {
      await arriveWith({ type: 'UMBRELLA', maxPrice: '9000', amenityIds: '2' });
      http.expectOne(`${API}?type=UMBRELLA&maxPrice=9000&amenityIds=2`).flush([]);
      await withAmenities();

      expect(page.querySelector<HTMLSelectElement>('#f-type')!.value).toBe('UMBRELLA');
      expect(page.querySelector<HTMLInputElement>('#f-max-price')!.value).toBe('9000');
      const checked = Array.from(page.querySelectorAll<HTMLInputElement>('.z-choice input')).map(
        (input) => input.checked,
      );
      expect(checked).toEqual([false, true]);
    });

    it('el texto del buscador sigue filtrando al instante sin volver a pedir', async () => {
      await arriveWith({ type: 'TENT' });
      http.expectOne(`${API}?type=TENT`).flush([arenaDorada, solYMar]);
      await fixture.whenStable();

      await search('sol');

      expect(names()).toEqual(['Sol y Mar']);
    });

    it('en el celular, «Filtros» abre y cierra el panel y cuenta los filtros puestos', async () => {
      await arriveWith({ type: 'TENT', maxPrice: '9000' });
      http.expectOne(`${API}?type=TENT&maxPrice=9000`).flush([]);
      await fixture.whenStable();

      const toggle = page.querySelector<HTMLButtonElement>('.filters__toggle')!;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-controls')).toBe('filters-panel');
      expect(toggle.querySelector('.filters__count')!.textContent).toContain('2');

      toggle.click();
      await fixture.whenStable();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(page.querySelector('.filters')!.classList).toContain('filters--open');

      toggle.click();
      await fixture.whenStable();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('si el catálogo de servicios no llega, el filtro de servicios no aparece', async () => {
      await respondWith([]);
      http.expectOne(AMENITIES).flush(null, { status: 500, statusText: 'Error' });
      await fixture.whenStable();

      expect(page.querySelector('.filters__amenities')).toBeNull();
      expect(page.querySelector('#f-type')).not.toBeNull();
    });
  });
});
