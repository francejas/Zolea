import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Resort, ResortSummary } from '../../../core/api/resort.models';
import { ZoleaResorts } from './zolea-resorts';

const RESORTS = `${environment.apiUrl}/api/resorts`;
const ALL = `${RESORTS}/all`;

const summary = (overrides: Partial<ResortSummary> = {}): ResortSummary => ({
  idResort: 1,
  name: 'Zolea Club de Playa',
  location: 'Av. Patricio Peralta Ramos 4800, Mar del Plata, Buenos Aires',
  active: true,
  unitCount: 38,
  admin: { firstName: 'Martín', lastName: 'Sosa', email: 'admin.mdp@zolea.com' },
  ...overrides,
});

const mdp = summary();
const pinamar = summary({
  idResort: 2,
  name: 'Ocean View Resort',
  location: 'Av. Bunge 900, Pinamar, Buenos Aires',
  unitCount: 20,
  admin: { firstName: 'Ana', lastName: 'Ruiz', email: 'admin.pinamar@zolea.com' },
});
const cerrado = summary({
  idResort: 3,
  name: 'Balneario Sin Dueño',
  location: 'Necochea, Buenos Aires',
  active: false,
  unitCount: 0,
  admin: null,
});

const resort = (overrides: Partial<Resort> = {}): Resort => ({
  idResort: 9,
  name: 'Balneario Pinamar Norte',
  location: 'Av. Bunge 1200, Pinamar, Buenos Aires',
  coverPhotoUrl: null,
  photos: [],
  description: null,
  active: true,
  amenities: [],
  rentalUnits: [],
  ...overrides,
});

/** Los espacios no separables se comparan como comunes. */
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

describe('ZoleaResorts', () => {
  let fixture: ComponentFixture<ZoleaResorts>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };

    await TestBed.configureTestingModule({
      imports: [ZoleaResorts],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(ZoleaResorts);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function respondWith(list: ResortSummary[]): Promise<void> {
    http.expectOne(ALL).flush(list);
    await fixture.whenStable();
  }

  /** Deja correr lo que queda pendiente después de un pedido: las promesas de `submit()`. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  const rows = () => Array.from(page.querySelectorAll('tbody tr'));
  const rowOf = (name: string) => rows().find((row) => text(row).includes(name))!;

  function button(label: string, within: ParentNode = page): HTMLButtonElement | undefined {
    return Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      text(b).includes(label),
    );
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  const fieldError = (inputId: string) =>
    text(page.querySelector(`#${inputId}`)!.closest('z-field')!.querySelector('.z-field__error'));

  describe('los cuatro estados', () => {
    it('cargando: el esqueleto, sin tabla', async () => {
      expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(page.querySelector('table')).toBeNull();
      await respondWith([]);
    });

    it('con balnearios: nombre, dirección, administrador, unidades y estado', async () => {
      await respondWith([mdp, cerrado]);

      const headers = Array.from(page.querySelectorAll('thead th')).map((th) => text(th));
      expect(headers).toEqual([
        'Balneario',
        'Dirección',
        'Administrador',
        'Unidades',
        'Estado',
        'Acciones',
      ]);
      expect(text(rowOf('Zolea Club'))).toContain('Martín Sosa');
      expect(text(rowOf('Zolea Club'))).toContain('admin.mdp@zolea.com');
      expect(text(rowOf('Zolea Club'))).toContain('38');
      expect(text(rowOf('Zolea Club'))).toContain('Activo');
      expect(text(rowOf('Sin Dueño'))).toContain('Sin administrador');
      expect(text(rowOf('Sin Dueño'))).toContain('Inactivo');
    });

    it('vacío: lo dice y ofrece dar de alta el primero', async () => {
      await respondWith([]);

      expect(text(page)).toContain('Todavía no hay balnearios');
      expect(button('Nuevo balneario')).toBeDefined();
    });

    it('con error: lo dice y Reintentar vuelve a pedir', async () => {
      http.expectOne(ALL).flush({ error: 'x' }, { status: 500, statusText: 'Error' });
      await fixture.whenStable();

      expect(text(page)).toContain('No pudimos traer los balnearios');
      button('Reintentar')!.click();
      await fixture.whenStable();
      await respondWith([mdp]);
      expect(rows()).toHaveLength(1);
    });
  });

  describe('buscar', () => {
    beforeEach(async () => {
      await respondWith([mdp, pinamar, cerrado]);
    });

    it('por nombre, dirección o administrador, y dice cuántos muestra', async () => {
      await type('#resorts-search', 'pinamar');
      expect(rows().map((row) => text(row.querySelector('td')))).toEqual(['Ocean View Resort']);
      expect(text(page.querySelector('.resorts__summary'))).toBe('1 de 3 balnearios');

      await type('#resorts-search', 'SOSA');
      expect(rows().map((row) => text(row.querySelector('td')))).toEqual(['Zolea Club de Playa']);
    });

    it('si nada coincide lo dice, y Borrar la búsqueda vuelve a la lista', async () => {
      await type('#resorts-search', 'miramar');

      expect(page.querySelector('table')).toBeNull();
      expect(text(page)).toContain('Ningún balneario coincide con «miramar»');

      button('Borrar la búsqueda')!.click();
      await fixture.whenStable();
      expect(rows()).toHaveLength(3);
    });
  });

  describe('nuevo balneario', () => {
    beforeEach(async () => {
      await respondWith([mdp]);
      button('Nuevo balneario')!.click();
      await fixture.whenStable();
    });

    async function fill(): Promise<void> {
      await type('#resort-name', 'Balneario Pinamar Norte');
      await type('#resort-location', 'Av. Bunge 1200, Pinamar, Buenos Aires');
      await type('#admin-first-name', 'Laura');
      await type('#admin-last-name', 'Gómez');
      await type('#admin-email', 'laura.gomez@pinamar.com');
      await type('#admin-phone', '2254123456');
      await type('#admin-dni', '30111222');
      await type('#admin-password', 'provisoria1');
    }

    async function submit(): Promise<void> {
      page.querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();
      await settle();
    }

    it('el formulario tiene dos partes: el balneario y su administrador', () => {
      const legends = Array.from(page.querySelectorAll('form legend')).map((l) => text(l));
      expect(legends).toEqual(['El balneario', 'Su administrador']);
    });

    it('manda el balneario con su administrador y suma la fila', async () => {
      await fill();
      await submit();

      const req = http.expectOne(RESORTS);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        name: 'Balneario Pinamar Norte',
        location: 'Av. Bunge 1200, Pinamar, Buenos Aires',
        admin: {
          firstName: 'Laura',
          lastName: 'Gómez',
          email: 'laura.gomez@pinamar.com',
          phone: '+54 2254123456',
          dni: '30111222',
          password: 'provisoria1',
        },
      });
      req.flush({ message: 'Balneario registrado correctamente.', resort: resort() });
      await settle();

      expect(page.querySelector('form')).toBeNull();
      expect(text(rowOf('Pinamar Norte'))).toContain('Laura Gómez');
      expect(text(rowOf('Pinamar Norte'))).toContain('Activo');
      expect(text(page.querySelector('z-alert'))).toContain(
        'Dimos de alta «Balneario Pinamar Norte»',
      );
      expect(text(page.querySelector('z-alert'))).toContain('laura.gomez@pinamar.com');
    });

    it('sin datos no manda nada y marca cada campo', async () => {
      await submit();

      http.expectNone(RESORTS);
      expect(fieldError('resort-name')).toBe('Escribí el nombre del balneario.');
      expect(fieldError('admin-email')).toBe('Escribí el email.');
      expect(fieldError('admin-password')).toBe('Escribí una contraseña provisoria.');
    });

    it('un email que ya es de otra cuenta queda debajo del email del administrador', async () => {
      await fill();
      await submit();

      http.expectOne(RESORTS).flush(
        {
          error: 'Ya hay otra cuenta con ese email.',
          campos: { 'admin.email': 'Ya hay otra cuenta con ese email.' },
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(fieldError('admin-email')).toBe('Ya hay otra cuenta con ese email.');
      expect(page.querySelector('form')).not.toBeNull();
      expect(rows()).toHaveLength(1);
    });

    it('un error sin campo, como el nombre repetido, va en un aviso arriba del formulario', async () => {
      await fill();
      await submit();

      http
        .expectOne(RESORTS)
        .flush(
          { error: 'Ya hay un balneario con ese nombre.' },
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      expect(text(page.querySelector('form z-alert'))).toContain(
        'Ya hay un balneario con ese nombre.',
      );
    });
  });

  describe('desactivar y reactivar', () => {
    beforeEach(async () => {
      await respondWith([mdp, cerrado]);
    });

    const dialog = () => page.querySelector<HTMLDialogElement>('dialog')!;

    it('desactivar pide confirmación; con Volver no manda nada', async () => {
      button('Desactivar', rowOf('Zolea Club'))!.click();
      await fixture.whenStable();

      expect(dialog().hasAttribute('open')).toBe(true);
      expect(text(dialog())).toContain('¿Desactivar «Zolea Club de Playa»?');
      expect(text(dialog())).toContain('Deja de aparecer en la Portada');

      button('Volver', dialog())!.click();
      await fixture.whenStable();
      expect(dialog().hasAttribute('open')).toBe(false);
      http.expectNone(`${RESORTS}/1/inactive`);
    });

    it('confirmado, lo desactiva y la fila queda inactiva con Reactivar', async () => {
      button('Desactivar', rowOf('Zolea Club'))!.click();
      await fixture.whenStable();
      button('Desactivar el balneario', dialog())!.click();
      await fixture.whenStable();

      const req = http.expectOne(`${RESORTS}/1/inactive`);
      expect(req.request.method).toBe('PUT');
      req.flush({ message: 'ok', resort: resort({ idResort: 1, active: false }) });
      await fixture.whenStable();

      expect(dialog().hasAttribute('open')).toBe(false);
      expect(text(rowOf('Zolea Club'))).toContain('Inactivo');
      expect(button('Reactivar', rowOf('Zolea Club'))).toBeDefined();
    });

    it('reactivar no pide confirmación', async () => {
      button('Reactivar', rowOf('Sin Dueño'))!.click();
      await fixture.whenStable();

      http
        .expectOne(`${RESORTS}/3/active`)
        .flush({ message: 'ok', resort: resort({ idResort: 3, active: true }) });
      await fixture.whenStable();

      expect(text(rowOf('Sin Dueño'))).toContain('Activo');
      expect(text(page.querySelector('z-alert'))).toContain('Reactivamos «Balneario Sin Dueño»');
    });

    it('si falla, lo dice y la fila queda como estaba', async () => {
      button('Reactivar', rowOf('Sin Dueño'))!.click();
      await fixture.whenStable();

      http
        .expectOne(`${RESORTS}/3/active`)
        .flush({ error: 'Sin conexión' }, { status: 500, statusText: 'Error' });
      await fixture.whenStable();

      expect(text(rowOf('Sin Dueño'))).toContain('Inactivo');
      expect(page.querySelector('z-alert[variant="danger"]')).not.toBeNull();
    });
  });
});
