import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Amenity, RentalUnit, Resort } from '../../../core/api/resort.models';
import { SessionService } from '../../../core/session/session.service';
import { MyResort } from './my-resort';

const RESORTS = `${environment.apiUrl}/api/resorts`;
const AMENITIES = `${environment.apiUrl}/api/amenities`;

const catalog: Amenity[] = [
  { idAmenity: 1, name: 'Wi-Fi' },
  { idAmenity: 2, name: 'Estacionamiento' },
  { idAmenity: 3, name: 'Guardavidas' },
  { idAmenity: 4, name: 'Spa' },
  { idAmenity: 5, name: 'Snack bar' },
];

const unit = (id: number, price: number, blocked = false): RentalUnit => ({
  idRentalUnit: id,
  type: 'UMBRELLA',
  identifier: `A-0${id}`,
  dailyPrice: price,
  isBlocked: blocked,
  resortId: 1,
});

const myResort: Resort = {
  idResort: 1,
  name: 'Zolea Club de Playa',
  location: 'Mar del Plata, Buenos Aires',
  coverPhotoUrl: 'https://ejemplo.com/portada.jpg',
  description: 'Carpas y sombrillas frente al mar.',
  active: true,
  amenities: [catalog[0], catalog[2]],
  rentalUnits: [unit(1, 8500), unit(2, 6000, true), unit(3, 9000)],
};

/** Los espacios de «$ 8.500» son no separables: se comparan como espacios comunes. */
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

describe('MyResort', () => {
  let fixture: ComponentFixture<MyResort>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(() => {
    // jsdom no trae los métodos de <dialog>.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    TestBed.configureTestingModule({
      imports: [MyResort],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            user: () => ({
              idClient: 7,
              firstName: 'Marina',
              lastName: 'Costa',
              email: 'admin.mdp@zolea.com',
              role: 'ADMIN',
              idManagedResort: 1,
            }),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Deja correr lo que queda pendiente después de un pedido: las promesas de `submit()`. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  /** Abre la pantalla y responde el balneario y el catálogo. */
  async function open(resort: Resort = myResort): Promise<void> {
    fixture = TestBed.createComponent(MyResort);
    page = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne(`${RESORTS}/my`).flush(resort);
    http.expectOne(AMENITIES).flush(catalog);
    await settle();
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  const button = (label: string) =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      text(b).includes(label),
    );

  const amenity = (name: string) =>
    Array.from(page.querySelectorAll<HTMLLabelElement>('.my-resort__amenities .z-choice'))
      .find((label) => text(label) === name)!
      .querySelector('input')!;

  async function save(): Promise<void> {
    button('Guardar cambios')!.click();
    await settle();
  }

  it('arriba, la cuenta del administrador, solo para ver', async () => {
    await open();

    const account = page.querySelector('.my-resort__account')!;
    expect(text(account)).toContain('Marina Costa');
    expect(text(account)).toContain('admin.mdp@zolea.com');
    expect(account.querySelector('input')).toBeNull();
  });

  it('carga los datos en el formulario y marca los servicios que ofrece', async () => {
    await open();

    expect(page.querySelector<HTMLInputElement>('#resort-name')!.value).toBe('Zolea Club de Playa');
    expect(page.querySelector<HTMLInputElement>('#resort-location')!.value).toBe(
      'Mar del Plata, Buenos Aires',
    );
    expect(page.querySelector<HTMLTextAreaElement>('#resort-description')!.value).toBe(
      'Carpas y sombrillas frente al mar.',
    );
    expect(page.querySelector<HTMLInputElement>('#resort-photo')!.value).toBe(
      'https://ejemplo.com/portada.jpg',
    );
    expect(catalog.map((a) => amenity(a.name).checked)).toEqual([true, false, true, false, false]);
    // Los servicios los carga Zolea: el balneario solo elige, y no hay enlace para pedirlos.
    const missing = page.querySelector('.my-resort__missing')!;
    expect(text(missing)).toBe('¿Falta un servicio? Pedíselo a Zolea.');
    expect(missing.querySelector('a')).toBeNull();
  });

  it('guarda todos los datos y los servicios marcados, y avisa', async () => {
    await open();

    await type('#resort-description', 'Carpas, sombrillas y parador.');
    amenity('Wi-Fi').click();
    amenity('Spa').click();
    await fixture.whenStable();
    await save();

    const put = http.expectOne(`${RESORTS}/my`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      name: 'Zolea Club de Playa',
      location: 'Mar del Plata, Buenos Aires',
      description: 'Carpas, sombrillas y parador.',
      coverPhotoUrl: 'https://ejemplo.com/portada.jpg',
      amenityIds: [3, 4],
    });
    put.flush({
      message: 'Balneario actualizado correctamente.',
      resort: {
        ...myResort,
        description: 'Carpas, sombrillas y parador.',
        amenities: [catalog[2], catalog[3]],
      },
    });
    await settle();

    expect(text(page.querySelector('.z-alert--success'))).toContain('Guardamos los cambios');
  });

  it('con el nombre vacío no manda el pedido y el error queda debajo del campo', async () => {
    await open();

    await type('#resort-name', '   ');
    await save();

    http.expectNone(`${RESORTS}/my`);
    expect(text(page.querySelector('#resort-name')!.closest('z-field'))).toContain(
      'Escribí el nombre del balneario.',
    );
  });

  it('un 400 con campos marca cada uno debajo', async () => {
    await open();

    await save();
    http
      .expectOne(`${RESORTS}/my`)
      .flush(
        { error: 'Datos inválidos', campos: { location: 'La ubicación es obligatoria' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    expect(text(page.querySelector('#resort-location')!.closest('z-field'))).toContain(
      'La ubicación es obligatoria',
    );
    expect(page.querySelector('.z-alert--success')).toBeNull();
  });

  it('la vista previa muestra la tarjeta de la Portada con lo que se está escribiendo', async () => {
    await open();

    const preview = page.querySelector('.my-resort__preview')!;
    expect(text(preview)).toContain('Así te ven en la Portada');
    expect(preview.querySelector('img')!.getAttribute('src')).toBe(
      'https://ejemplo.com/portada.jpg',
    );
    // El precio más bajo de las que se pueden reservar: la de $ 6.000 está bloqueada.
    expect(text(preview)).toContain('desde $ 8.500 por día');

    await type('#resort-name', 'Zolea Playa Norte');
    amenity('Snack bar').click();
    await fixture.whenStable();

    expect(text(preview.querySelector('.my-resort__card-name'))).toBe('Zolea Playa Norte');
    expect(Array.from(preview.querySelectorAll('.z-amenity')).map((chip) => text(chip))).toEqual([
      'Wi-Fi',
      'Guardavidas',
      'Snack bar',
    ]);
  });

  describe('desactivar', () => {
    it('no avanza sin confirmar', async () => {
      await open();

      button('Desactivar el balneario')!.click();
      await fixture.whenStable();
      const dialog = page.querySelector('dialog')!;
      expect(dialog.hasAttribute('open')).toBe(true);
      expect(text(dialog)).toContain('Deja de aparecer en la Portada');
      expect(text(dialog)).toContain('las reservas que ya tiene siguen valiendo');
      http.expectNone(`${RESORTS}/1/inactive`);

      dialog.querySelector<HTMLButtonElement>('z-btn[variant="secondary"] button')!.click();
      await fixture.whenStable();

      expect(dialog.hasAttribute('open')).toBe(false);
      http.expectNone(`${RESORTS}/1/inactive`);
    });

    it('al confirmar lo desactiva, lo muestra en neutro y ofrece reactivarlo', async () => {
      await open();

      button('Desactivar el balneario')!.click();
      await fixture.whenStable();
      page.querySelector<HTMLButtonElement>('dialog z-btn[variant="danger"] button')!.click();
      const put = http.expectOne(`${RESORTS}/1/inactive`);
      expect(put.request.method).toBe('PUT');
      put.flush({ message: 'ok', resort: { ...myResort, active: false } });
      await settle();

      expect(text(page.querySelector('.my-resort__head .z-status'))).toBe('Desactivado');
      expect(page.querySelector('.my-resort__head .z-status--neutral')).not.toBeNull();
      expect(text(page.querySelector('.my-resort__preview'))).toContain('No aparece en la Portada');
      expect(button('Desactivar el balneario')).toBeUndefined();
      // El botón que se tocó ya no está: el foco pasa al aviso.
      const notice = page.querySelector('.z-alert--success')!;
      expect(text(notice)).toContain('Desactivamos Zolea Club de Playa');
      expect(document.activeElement?.contains(notice)).toBe(true);
    });

    it('reactivar no pide confirmación', async () => {
      await open({ ...myResort, active: false });

      button('Reactivar')!.click();
      const put = http.expectOne(`${RESORTS}/1/active`);
      expect(put.request.method).toBe('PUT');
      put.flush({ message: 'ok', resort: myResort });
      await settle();

      expect(text(page.querySelector('.my-resort__head .z-status'))).toBe('Publicado');
      expect(button('Desactivar el balneario')).toBeDefined();
      expect(text(page.querySelector('.z-alert--success'))).toContain(
        'Vuelve a aparecer en la Portada',
      );
    });

    it('el aviso de guardado se va: hablaba de cuando estaba publicado', async () => {
      await open();
      await save();
      http.expectOne(`${RESORTS}/my`).flush({ message: 'ok', resort: myResort });
      await settle();
      expect(text(page.querySelector('.my-resort__form .z-alert--success'))).toContain(
        'Los clientes ya ven lo nuevo',
      );

      button('Desactivar el balneario')!.click();
      await fixture.whenStable();
      page.querySelector<HTMLButtonElement>('dialog z-btn[variant="danger"] button')!.click();
      http
        .expectOne(`${RESORTS}/1/inactive`)
        .flush({ message: 'ok', resort: { ...myResort, active: false } });
      await settle();

      expect(page.querySelector('.my-resort__form .z-alert--success')).toBeNull();
    });

    it('si falla, lo dice y deja el balneario como estaba', async () => {
      await open();

      button('Desactivar el balneario')!.click();
      await fixture.whenStable();
      page.querySelector<HTMLButtonElement>('dialog z-btn[variant="danger"] button')!.click();
      http
        .expectOne(`${RESORTS}/1/inactive`)
        .flush({ error: 'Sin conexión' }, { status: 500, statusText: 'Error' });
      await settle();

      expect(page.querySelector('.z-alert--danger')).not.toBeNull();
      expect(text(page.querySelector('.my-resort__head .z-status'))).toBe('Publicado');
      expect(button('Desactivar el balneario')).toBeDefined();
    });
  });

  it('sin balneario asignado, lo dice', async () => {
    fixture = TestBed.createComponent(MyResort);
    page = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne(`${RESORTS}/my`).flush({ error: 'x' }, { status: 404, statusText: 'x' });
    http.expectOne(AMENITIES).flush(catalog);
    await settle();

    expect(page.textContent).toContain('No tenés un balneario asignado');
    expect(page.querySelector('form')).toBeNull();
  });

  it('si falla la carga, deja reintentar', async () => {
    fixture = TestBed.createComponent(MyResort);
    page = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne(`${RESORTS}/my`).flush({ error: 'x' }, { status: 500, statusText: 'x' });
    http.expectOne(AMENITIES).flush(catalog);
    await settle();

    expect(page.textContent).toContain('No pudimos traer tu balneario');

    button('Reintentar')!.click();
    await fixture.whenStable();
    http.expectOne(`${RESORTS}/my`).flush(myResort);
    http.expectOne(AMENITIES).flush(catalog);
    await settle();

    expect(page.querySelector('form')).not.toBeNull();
  });
});
