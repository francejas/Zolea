import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { RentalUnit, Resort } from '../../../core/api/resort.models';
import { SessionService } from '../../../core/session/session.service';
import { ResortDetail } from './resort-detail';

const API = `${environment.apiUrl}/api/resorts`;

const unit = (
  id: number,
  identifier: string,
  type: RentalUnit['type'],
  price: number,
  blocked = false,
): RentalUnit => ({
  idRentalUnit: id,
  type,
  identifier,
  dailyPrice: price,
  isBlocked: blocked,
  resortId: 1,
});

function resort(overrides: Partial<Resort> = {}): Resort {
  return {
    idResort: 1,
    name: 'Zolea Club de Playa',
    location: 'Mar del Plata, Buenos Aires',
    coverPhotoUrl: 'https://fotos.test/zolea.jpg',
    description: 'El balneario más completo de Mar del Plata.',
    active: true,
    amenities: [
      { idAmenity: 1, name: 'WiFi' },
      { idAmenity: 2, name: 'Spa' },
      { idAmenity: 99, name: 'Ping Pong' },
    ],
    rentalUnits: [
      unit(1, 'A-01', 'UMBRELLA', 8500),
      unit(2, 'A-02', 'UMBRELLA', 8500, true),
      unit(3, 'C-01', 'TENT', 14500),
    ],
    ...overrides,
  };
}

/** Los espacios de «$ 8.500,00» son no separables: se comparan como espacios comunes. */
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('ResortDetail', () => {
  const loggedIn = signal(false);
  let fixture: ComponentFixture<ResortDetail>;
  let http: HttpTestingController;
  let router: Router;
  let page: HTMLElement;

  beforeEach(() => {
    loggedIn.set(false);
    TestBed.configureTestingModule({
      imports: [ResortDetail],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { isLoggedIn: loggedIn } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ResortDetail);
    fixture.componentRef.setInput('id', '1');
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  /** Responde el pedido del balneario y deja la pantalla dibujada. */
  async function respondWith(body: Resort) {
    http.expectOne(`${API}/1`).flush(body);
    await fixture.whenStable();
  }

  /** La tarjeta de reserva de la computadora: la barra y las fechas del celular son otras. */
  const card = () => page.querySelector('.z-book-card')!;
  const planUnit = (identifier: string) =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('.z-unit[aria-label]')).find((b) =>
      text(b.querySelector('.z-unit__id')).includes(identifier),
    )!;

  async function pickUnit(identifier: string) {
    planUnit(identifier).click();
    await fixture.whenStable();
  }

  async function pickDates(from: string, to: string) {
    fixture.componentInstance.from.set(from);
    fixture.componentInstance.to.set(to);
    await fixture.whenStable();
  }

  describe('la pantalla', () => {
    it('pide el balneario con el id de la ruta', () => {
      expect(http.expectOne(`${API}/1`).request.method).toBe('GET');
    });

    it('mientras carga muestra el esqueleto con aria-busy', () => {
      expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(page.querySelectorAll('z-skeleton').length).toBeGreaterThan(0);
      expect(page.querySelector('h1')).toBeNull();
      http.expectOne(`${API}/1`);
    });

    it('muestra la foto, el nombre, la ubicación y la descripción', async () => {
      await respondWith(resort());

      expect(text(page.querySelector('h1'))).toBe('Zolea Club de Playa');
      expect(text(page.querySelector('.z-place'))).toBe('Mar del Plata, Buenos Aires');
      expect(page.querySelector('.z-photo img')!.getAttribute('src')).toBe(
        'https://fotos.test/zolea.jpg',
      );
      expect(page.textContent).toContain('El balneario más completo de Mar del Plata.');
    });

    it('sin foto queda el degradado y sin descripción no hay sección', async () => {
      await respondWith(resort({ coverPhotoUrl: null, description: null }));

      expect(page.querySelector('.z-photo')).not.toBeNull();
      expect(page.querySelector('.z-photo img')).toBeNull();
      expect(page.textContent).not.toContain('Sobre el balneario');
    });

    it('muestra los servicios, cada uno con su ícono y uno genérico para los que no están', async () => {
      await respondWith(resort());

      const amenities = Array.from(page.querySelectorAll('.z-amenity'));
      expect(amenities.map((a) => text(a))).toEqual(['WiFi', 'Spa', 'Ping Pong']);
      for (const amenity of amenities) {
        expect(amenity.querySelector('svg.z-icon')).not.toBeNull();
      }
      // El de WiFi y el genérico de Ping Pong son dibujos distintos.
      const drawing = (a: Element) => a.querySelector('svg')!.innerHTML;
      expect(drawing(amenities[0])).not.toBe(drawing(amenities[2]));
    });

    it('el plano recibe las unidades del balneario', async () => {
      await respondWith(resort());

      expect(page.querySelectorAll('.z-unit[aria-label]').length).toBe(3);
    });

    it('la flecha de volver lleva a la portada', async () => {
      await respondWith(resort());

      expect(page.querySelector('.detail__back')!.getAttribute('href')).toBe('/');
    });
  });

  describe('la reserva', () => {
    beforeEach(async () => respondWith(resort()));

    it('sin lugar ni fechas no hay total y el botón pide elegir un lugar', () => {
      const button = card().querySelector<HTMLButtonElement>('button.z-btn--primary')!;

      expect(text(card().querySelector('.z-book-card__pick'))).toBe(
        'Tocá un lugar libre en el plano.',
      );
      expect(text(card().querySelector('.z-book-card__total strong'))).toBe('—');
      expect(button.disabled).toBe(true);
      expect(text(button)).toBe('Elegí un lugar');
    });

    it('con el lugar elegido muestra cuál es, su fila y su precio', async () => {
      await pickUnit('A-01');

      const pick = card().querySelector('.z-book-card__pick')!;
      expect(text(pick.querySelector('strong'))).toBe('Sombrilla A-01');
      expect(text(pick.querySelector('span:not(.z-unit):not(.z-unit__shape)'))).toBe(
        'Fila A · $ 8.500 por día',
      );
      expect(text(card().querySelector('.z-book-card__lines dd'))).toBe('$ 8.500,00');
    });

    it('con el lugar pero sin fechas, el botón pide las fechas', async () => {
      await pickUnit('A-01');

      const button = card().querySelector<HTMLButtonElement>('button.z-btn--primary')!;
      expect(button.disabled).toBe(true);
      expect(text(button)).toBe('Elegí tus fechas');
    });

    it('el total es el precio diario por los días, contando los dos extremos', async () => {
      await pickUnit('A-01');
      await pickDates('2027-01-15', '2027-01-17');

      const lines = Array.from(card().querySelectorAll('.z-book-card__lines dd')).map((d) =>
        text(d),
      );
      expect(lines).toEqual(['$ 8.500,00', '3 · se cobran los dos extremos']);
      expect(text(card().querySelector('.z-book-card__total strong'))).toBe('$ 25.500,00');
    });

    it('un solo día cobra un día, no cero', async () => {
      await pickUnit('C-01');
      await pickDates('2027-01-15', '2027-01-15');

      expect(text(card().querySelector('.z-book-card__total strong'))).toBe('$ 14.500,00');
    });

    it('con lugar y fechas, el botón queda habilitado con el lugar elegido', async () => {
      await pickUnit('A-01');
      await pickDates('2027-01-15', '2027-01-17');

      const button = card().querySelector<HTMLButtonElement>('button.z-btn--primary')!;
      expect(button.disabled).toBe(false);
      expect(text(button)).toBe('Reservar A-01');
    });

    it('una unidad bloqueada no se puede elegir', async () => {
      await pickUnit('A-02');

      expect(fixture.componentInstance.selectedUnit()).toBeNull();
    });

    it('Reservar lleva a /book/:resortId con la unidad y las fechas', async () => {
      await pickUnit('A-01');
      await pickDates('2027-01-15', '2027-01-17');

      card().querySelector<HTMLButtonElement>('button.z-btn--primary')!.click();

      expect(router.navigate).toHaveBeenCalledWith(['/book', 1], {
        queryParams: { unit: 1, from: '2027-01-15', to: '2027-01-17' },
      });
    });

    it('sin lugar o sin fechas, Reservar no navega', async () => {
      fixture.componentInstance.book();
      await pickUnit('A-01');
      fixture.componentInstance.book();

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('sin sesión avisa que va a pedir ingresar, y con sesión no', async () => {
      expect(text(card().querySelector('.z-book-card__note'))).toBe(
        'Te vamos a pedir que ingreses, y volvés acá.',
      );

      loggedIn.set(true);
      await fixture.whenStable();

      expect(card().querySelector('.z-book-card__note')).toBeNull();
    });

    it('la barra del celular muestra el lugar y el total, y reserva igual', async () => {
      const bar = page.querySelector('.z-bookbar')!;
      expect(text(bar.querySelector('strong'))).toBe('Elegí tu lugar');
      expect(text(bar.querySelector('span'))).toBe('Elegí tus fechas');

      await pickUnit('C-01');
      await pickDates('2027-01-15', '2027-01-16');

      expect(text(bar.querySelector('strong'))).toBe('Carpa C-01');
      expect(text(bar.querySelector('span'))).toBe('2 días · $ 29.000,00');

      bar.querySelector<HTMLButtonElement>('button')!.click();
      expect(router.navigate).toHaveBeenCalledWith(['/book', 1], {
        queryParams: { unit: 3, from: '2027-01-15', to: '2027-01-16' },
      });
    });

    it('las fechas se eligen en el celular y en la tarjeta con el mismo valor', async () => {
      await pickDates('2027-01-15', '2027-01-17');

      const entradas = Array.from(page.querySelectorAll('.z-range__field strong')).map((s) =>
        text(s),
      );
      expect(entradas).toEqual(['vie 15 ene', 'dom 17 ene', 'vie 15 ene', 'dom 17 ene']);
    });
  });

  describe('los otros estados', () => {
    it('si el balneario no existe dice «No encontramos este balneario» y vuelve a la portada', async () => {
      http.expectOne(`${API}/1`).flush(null, { status: 404, statusText: 'Not Found' });
      await fixture.whenStable();

      const empty = page.querySelector('z-empty')!;
      expect(text(empty)).toContain('No encontramos este balneario');
      expect(page.querySelector('.z-book-card')).toBeNull();

      empty.querySelector('button')!.click();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('si falla la carga muestra el error y Reintentar vuelve a pedir', async () => {
      http.expectOne(`${API}/1`).flush(null, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();

      const problem = page.querySelector('z-problem')!;
      expect(text(problem)).toContain('No pudimos traer este balneario');
      expect(problem.getAttribute('role')).toBe('alert');

      problem.querySelector('button')!.click();
      await fixture.whenStable();
      await respondWith(resort());

      expect(page.querySelector('z-problem')).toBeNull();
      expect(text(page.querySelector('h1'))).toBe('Zolea Club de Playa');
    });

    it('si está inactivo lo dice y no ofrece reservar', async () => {
      await respondWith(resort({ active: false }));

      expect(text(page.querySelector('z-alert'))).toContain(
        'Este balneario no está recibiendo reservas.',
      );
      expect(text(page.querySelector('h1'))).toBe('Zolea Club de Playa');
      expect(page.querySelector('.z-book-card')).toBeNull();
      expect(page.querySelector('.z-bookbar')).toBeNull();
      expect(page.querySelector('z-resort-plan')).toBeNull();
      expect(page.querySelector('button.z-btn--primary')).toBeNull();
    });

    it('si el balneario no cargó lugares, el plano lo dice', async () => {
      await respondWith(resort({ rentalUnits: [] }));

      expect(text(page.querySelector('.z-plan__empty'))).toBe(
        'Este balneario todavía no cargó sus lugares.',
      );
    });

    it('al cambiar de balneario vuelve a pedir y borra el lugar elegido', async () => {
      await respondWith(resort());
      await pickUnit('A-01');
      expect(fixture.componentInstance.selectedUnit()).not.toBeNull();

      fixture.componentRef.setInput('id', '2');
      fixture.detectChanges();

      expect(http.expectOne(`${API}/2`).request.method).toBe('GET');
      expect(fixture.componentInstance.selectedUnit()).toBeNull();
    });
  });
});
