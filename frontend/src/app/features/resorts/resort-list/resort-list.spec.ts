import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Amenity, Resort } from '../../../core/api/resort.models';
import { dayRange, money } from '../../../shared/utils/format';
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
      resortId: 1,
      retired: false,
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

  it('los servicios de la tarjeta van por id: los tres primeros y «+N»', async () => {
    const amenity = (idAmenity: number, name: string) => ({ idAmenity, name });
    await respondWith([
      resort({
        idResort: 1,
        name: 'Con servicios',
        // El backend no garantiza el orden.
        amenities: [
          amenity(9, 'Spa'),
          amenity(2, 'Estacionamiento'),
          amenity(5, 'Guardavidas'),
          amenity(1, 'WiFi'),
        ],
      }),
    ]);

    const chips = Array.from(page.querySelectorAll('.z-resort-card .z-amenity')).map((chip) =>
      chip.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(chips).toEqual(['WiFi', 'Estacionamiento', 'Guardavidas', '+1 servicios más']);
  });

  it('cada tarjeta con reseñas lleva el promedio y la cantidad; sin reseñas, nada', async () => {
    await respondWith([
      resort({ idResort: 1, name: 'Con reseñas', averageRating: 4.5, reviewCount: 12 }),
      resort({ idResort: 2, name: 'Sin reseñas', averageRating: null, reviewCount: 0 }),
    ]);

    const cards = page.querySelectorAll('.z-resort-card');
    expect(cards[0].querySelector('z-rating')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      '4,5 de 5 estrellas · 12 reseñas',
    );
    expect(cards[1].querySelector('z-rating')).toBeNull();
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
      const form = page.querySelector<HTMLFormElement>('form.search')!;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
    }

    const typeInput = (type: 'TENT' | 'UMBRELLA') =>
      page.querySelector<HTMLInputElement>(`.filters__types input[value="${type}"]`)!;
    const amenityInputs = () =>
      page.querySelectorAll<HTMLInputElement>('.filters__amenities .z-choice input');

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
      await respondWith([{ ...arenaDorada, availableUnits: 8 }]);

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

      typeInput('TENT').click();
      const price = page.querySelector<HTMLInputElement>('#f-max-price')!;
      price.value = '20000';
      price.dispatchEvent(new Event('input'));
      const choices = amenityInputs();
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

      expect(typeInput('TENT').checked).toBe(false);
      expect(typeInput('UMBRELLA').checked).toBe(true);
      expect(page.querySelector<HTMLInputElement>('#f-max-price')!.value).toBe('9000');
      const checked = Array.from(amenityInputs()).map((input) => input.checked);
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
      expect(page.querySelector('.filters__types')).not.toBeNull();
    });

    it('después de Buscar, la pantalla baja hasta los balnearios', async () => {
      await respondWith([]);
      const scroll = vi.fn();
      const results = page.querySelector<HTMLElement>('.resorts-section')!;
      results.scrollIntoView = scroll;

      await submitFilters();
      await fixture.whenStable();

      expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    });

    it('Carpa y Sombrilla son dos botones: con los dos marcados se busca cualquiera, y quedan marcados', async () => {
      await respondWith([]);
      await withAmenities();

      typeInput('TENT').click();
      typeInput('UMBRELLA').click();
      await fixture.whenStable();
      await submitFilters();

      expect(router.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: { type: 'TENT,UMBRELLA' },
      });
    });

    it('con los dos tipos en la dirección, al backend no viaja el tipo', async () => {
      await arriveWith({ type: 'TENT,UMBRELLA' });
      http.expectOne(API).flush([]);
      await fixture.whenStable();

      expect(typeInput('TENT').checked).toBe(true);
      expect(typeInput('UMBRELLA').checked).toBe(true);
    });

    describe('puntaje, orden, servicios y chips (#73)', () => {
      const select = (id: string) => page.querySelector<HTMLSelectElement>(`#${id}`)!;

      async function choose(id: string, value: string): Promise<void> {
        const element = select(id);
        element.value = value;
        element.dispatchEvent(new Event('change'));
        await fixture.whenStable();
      }

      const chips = () =>
        Array.from(page.querySelectorAll<HTMLButtonElement>('.filters__chip')).map((chip) =>
          chip.textContent!.replace(/\s+/g, ' ').trim(),
        );
      const servicesToggle = () =>
        page.querySelector<HTMLButtonElement>('.filters__services-toggle')!;
      const servicesPanel = () => page.querySelector<HTMLElement>('#filters-services')!;

      it('el puntaje y el orden de la dirección viajan al backend', async () => {
        await arriveWith({ minRating: '4.5', sort: 'rating' });
        http.expectOne(`${API}?minRating=4.5&sort=rating`).flush([]);
        await fixture.whenStable();

        expect(select('f-rating').value).toBe('min:4.5');
        expect(select('f-sort').value).toBe('rating');
      });

      it('las estrellas exactas de la dirección viajan al backend', async () => {
        await arriveWith({ stars: '4' });
        http.expectOne(`${API}?stars=4`).flush([]);
        await fixture.whenStable();

        expect(select('f-rating').value).toBe('stars:4');
      });

      it('descarta un puntaje, unas estrellas o un orden que no existen', async () => {
        await arriveWith({ minRating: '7', stars: '0', sort: 'precio' });

        expect(http.match((req) => req.url === API)).toEqual([]);
      });

      it('Aplicar lleva el puntaje y el orden a la dirección', async () => {
        await respondWith([]);

        await choose('f-rating', 'stars:5');
        await choose('f-sort', 'rating');
        await submitFilters();

        expect(router.navigate).toHaveBeenCalledWith(['/'], {
          queryParams: { stars: 5, sort: 'rating' },
        });
      });

      it('con Carpa y Sombrilla marcadas, que es cualquiera, no hay chip de tipo', async () => {
        await arriveWith({ type: 'TENT,UMBRELLA', maxPrice: '9000' });
        http.expectOne(`${API}?maxPrice=9000`).flush([]);
        await fixture.whenStable();

        expect(chips()).toEqual([`Hasta ${money(9000)}`.replace(/\s+/g, ' ')]);
      });

      it('la × del único tipo marcado amplía la búsqueda a los dos', async () => {
        await arriveWith({ type: 'UMBRELLA', maxPrice: '9000' });
        http.expectOne(`${API}?type=UMBRELLA&maxPrice=9000`).flush([]);
        await fixture.whenStable();

        const typeChip = Array.from(
          page.querySelectorAll<HTMLButtonElement>('.filters__chip'),
        ).find((chip) => chip.textContent!.includes('Sombrilla'))!;
        typeChip.click();
        await fixture.whenStable();

        expect(router.navigate).toHaveBeenCalledWith(['/'], { queryParams: { maxPrice: 9000 } });
      });

      it('cada filtro puesto es un chip; el orden no', async () => {
        await arriveWith({
          from: '2027-01-15',
          to: '2027-01-17',
          type: 'TENT',
          maxPrice: '20000',
          amenityIds: '1,2',
          minRating: '4',
          sort: 'rating',
        });
        http
          .expectOne(
            `${API}?from=2027-01-15&to=2027-01-17&type=TENT&maxPrice=20000&amenityIds=1,2&minRating=4&sort=rating`,
          )
          .flush([]);
        await withAmenities();

        expect(chips()).toEqual([
          dayRange('2027-01-15', '2027-01-17'),
          'Carpa',
          'Hasta $ 20.000',
          'WiFi',
          'Spa',
          '4 o más',
        ]);
        expect(page.querySelector('.filters__chip')!.getAttribute('aria-label')).toBe(
          `Quitar ${dayRange('2027-01-15', '2027-01-17')}`,
        );
      });

      it('la × de un chip saca solo ese filtro de la dirección', async () => {
        await arriveWith({ type: 'TENT', amenityIds: '1,2', stars: '4', sort: 'rating' });
        http.expectOne(`${API}?type=TENT&amenityIds=1,2&stars=4&sort=rating`).flush([]);
        await withAmenities();

        const wifiChip = Array.from(
          page.querySelectorAll<HTMLButtonElement>('.filters__chip'),
        ).find((chip) => chip.textContent!.includes('WiFi'))!;
        wifiChip.click();
        await fixture.whenStable();

        expect(router.navigate).toHaveBeenCalledWith(['/'], {
          queryParams: { type: 'TENT', amenityIds: '2', stars: 4, sort: 'rating' },
        });
      });

      it('el botón Servicios cuenta los marcados, como los chips de servicios', async () => {
        await arriveWith({ amenityIds: '1,2' });
        http.expectOne(`${API}?amenityIds=1,2`).flush([]);
        await withAmenities();

        expect(servicesToggle().textContent).toContain('2');
        expect(chips().filter((chip) => chip === 'WiFi' || chip === 'Spa')).toHaveLength(2);
      });

      it('el panel de servicios se abre con el botón, se cierra con Esc y el foco vuelve', async () => {
        await respondWith([]);
        await withAmenities();

        expect(servicesToggle().getAttribute('aria-expanded')).toBe('false');
        expect(servicesToggle().getAttribute('aria-controls')).toBe('filters-services');

        servicesToggle().click();
        await fixture.whenStable();
        expect(servicesToggle().getAttribute('aria-expanded')).toBe('true');
        expect(servicesPanel().classList).toContain('is-open');

        amenityInputs()[0].focus();
        amenityInputs()[0].dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        await fixture.whenStable();

        expect(servicesToggle().getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(servicesToggle());
      });

      it('el panel de servicios se cierra con un clic afuera', async () => {
        await respondWith([]);
        await withAmenities();

        servicesToggle().click();
        await fixture.whenStable();
        amenityInputs()[0].click();
        await fixture.whenStable();
        expect(servicesToggle().getAttribute('aria-expanded')).toBe('true');

        page.querySelector<HTMLElement>('.hero')!.click();
        await fixture.whenStable();
        expect(servicesToggle().getAttribute('aria-expanded')).toBe('false');
      });

      it('arriba de la grilla dice cuántos balnearios hay', async () => {
        await respondWith([arenaDorada, solYMar]);

        expect(page.querySelector('.results__count')!.textContent!.trim()).toBe('2 balnearios');
      });

      it('con solo el puntaje puesto, se ofrece limpiar los filtros', async () => {
        await arriveWith({ minRating: '3' });
        http.expectOne(`${API}?minRating=3`).flush([arenaDorada]);
        await fixture.whenStable();

        const clear = Array.from(page.querySelectorAll('button')).find((button) =>
          button.textContent!.includes('Limpiar filtros'),
        );
        expect(clear).toBeDefined();
      });
    });

    it('un servicio marcado muestra el ícono de check', async () => {
      await respondWith([]);
      await withAmenities();

      amenityInputs()[0].click();
      await fixture.whenStable();

      const check = page.querySelector('.filters__amenities .z-choice__check')!;
      // El ícono se dibuja: no es un <svg> vacío.
      expect(check.children.length).toBeGreaterThan(0);
    });
  });
});
