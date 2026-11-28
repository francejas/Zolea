import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { Amenity, Resort } from '../../../core/api/resort.models';
import { Amenities } from './amenities';

const API = `${environment.apiUrl}/api/amenities`;
const RESORTS = `${environment.apiUrl}/api/resorts`;

const wifi: Amenity = { idAmenity: 1, name: 'WiFi' };
const spa: Amenity = { idAmenity: 6, name: 'Spa' };
const duchas: Amenity = { idAmenity: 8, name: 'Duchas y Vestuarios' };
const musica: Amenity = { idAmenity: 13, name: 'Música en Vivo' };

function resort(idResort: number, amenities: Amenity[]): Resort {
  return {
    idResort,
    name: `Balneario ${idResort}`,
    location: 'Costa Atlántica',
    coverPhotoUrl: null,
    photos: [],
    description: null,
    active: true,
    amenities,
    rentalUnits: [],
  };
}

/** WiFi en tres balnearios, Spa en dos, Duchas en uno y Música en ninguno. */
const resorts: Resort[] = [
  resort(1, [wifi, duchas]),
  resort(2, [wifi, spa]),
  resort(3, [wifi, spa]),
];

describe('Amenities', () => {
  let fixture: ComponentFixture<Amenities>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    // jsdom no trae los métodos de <dialog>.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    await TestBed.configureTestingModule({
      imports: [Amenities],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Amenities);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  /** Deja correr lo que espera un pedido, sin esperar a que termine el HTTP. */
  const flushMicrotasks = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
  };

  async function respondWith(amenities: Amenity[], withResorts: Resort[] = resorts): Promise<void> {
    http.expectOne(API).flush(amenities);
    http.expectOne(RESORTS).flush(withResorts);
    await fixture.whenStable();
  }

  const text = (element: Element | null) => element?.textContent!.replace(/\s+/g, ' ').trim();
  const rows = () => Array.from(page.querySelectorAll('tbody tr'));
  const cells = (row: Element) => Array.from(row.querySelectorAll('td')).map((cell) => text(cell));
  const dialog = () => page.querySelector<HTMLDialogElement>('dialog')!;
  /** El error que muestra el campo con ese id, o `null` si no muestra ninguno. */
  const errorOf = (inputId: string) =>
    text(page.querySelector(`#${inputId}`)!.closest('z-field')!.querySelector('.z-field__error')) ??
    null;

  function button(label: string, within: ParentNode = page): HTMLButtonElement | undefined {
    return Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent!.includes(label),
    );
  }

  function rowOf(name: string): Element {
    return rows().find((row) => row.querySelector('td')!.textContent!.includes(name))!;
  }

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }

  describe('los cuatro estados', () => {
    it('cargando: el esqueleto, sin tabla, y ya pide el catálogo y los balnearios', () => {
      expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(page.querySelector('table')).toBeNull();
      expect(http.expectOne(API).request.method).toBe('GET');
      expect(http.expectOne(RESORTS).request.method).toBe('GET');
    });

    it('con servicios: en orden alfabético, con cuántos balnearios los ofrecen', async () => {
      await respondWith([wifi, spa, duchas, musica]);

      const headers = Array.from(page.querySelectorAll('th')).map((th) => text(th));
      expect(headers).toEqual(['Servicio', 'Lo ofrecen', 'Acciones']);
      expect(rows().map((row) => cells(row).slice(0, 2))).toEqual([
        ['Duchas y Vestuarios', '1 balneario'],
        ['Música en Vivo', 'Ninguno'],
        ['Spa', '2 balnearios'],
        ['WiFi', '3 balnearios'],
      ]);
      expect(text(page.querySelector('.amenities__summary'))).toBe('4 servicios en el catálogo');
      expect(text(page.querySelector('table'))).not.toContain('tuyo');
    });

    it('cada servicio lleva su ícono, el mismo que en la ficha', async () => {
      await respondWith([wifi, spa]);

      for (const row of rows()) {
        expect(row.querySelector('td svg.z-icon')).not.toBeNull();
      }
    });

    it('vacío: lo explica y ofrece crear el primero', async () => {
      await respondWith([]);

      expect(page.querySelector('table')).toBeNull();
      expect(text(page.querySelector('z-empty'))).toContain('El catálogo está vacío');
      expect(button('Nuevo servicio')).toBeDefined();
    });

    it('con error: lo dice y Reintentar vuelve a pedir', async () => {
      const resortsReq = http.expectOne(RESORTS);
      http.expectOne(API).flush(null, { status: 0, statusText: 'Unknown Error' });
      await fixture.whenStable();

      // Sin catálogo no hay nada que contar: el pedido de los balnearios se cancela.
      expect(resortsReq.cancelled).toBe(true);
      expect(text(page.querySelector('z-problem'))).toContain('No pudimos traer el catálogo');
      expect(text(page.querySelector('z-problem'))).toContain('No hay conexión con el servidor.');

      button('Reintentar')!.click();
      await respondWith([wifi]);
      expect(rows()).toHaveLength(1);
    });

    it('si los balnearios no llegan, el catálogo se muestra igual, sin la columna del conteo', async () => {
      http.expectOne(API).flush([wifi, spa]);
      http.expectOne(RESORTS).flush(null, { status: 500, statusText: 'x' });
      await fixture.whenStable();

      const headers = Array.from(page.querySelectorAll('th')).map((th) => text(th));
      expect(headers).toEqual(['Servicio', 'Acciones']);
      expect(rows()).toHaveLength(2);

      // Sin el conteo, la confirmación de borrar lo dice sin número.
      button('Borrar', rowOf('Spa'))!.click();
      await fixture.whenStable();
      expect(text(dialog())).toContain('Se les saca a todos los balnearios que lo ofrecen.');
    });

    it('el aviso de que el catálogo es de todos está fijo arriba, en todos los estados', async () => {
      const notice = () => text(page.querySelector('z-alert'));
      expect(notice()).toContain('El catálogo es de todos los balnearios');

      await respondWith([wifi]);
      expect(notice()).toContain('El catálogo es de todos los balnearios');
      expect(notice()).toContain('lo pueden elegir todos los balnearios');
      expect(notice()).not.toContain('tuyo');
    });
  });

  describe('crear', () => {
    beforeEach(async () => {
      await respondWith([wifi, spa]);
      button('Nuevo servicio')!.click();
      await fixture.whenStable();
    });

    async function submitCreate(): Promise<void> {
      button('Crear servicio')!.click();
      await flushMicrotasks();
    }

    it('el formulario tiene el nombre, con su etiqueta visible, y el foco va ahí', () => {
      const label = page.querySelector('label[for="amenity-name"]');
      expect(text(label)).toBe('Nombre');
      expect(document.activeElement?.id).toBe('amenity-name');
    });

    it('arma POST /api/amenities con { name } sin espacios de más y el nuevo entra a la tabla', async () => {
      type('#amenity-name', '  Estacionamiento  ');
      await fixture.whenStable();
      await submitCreate();

      const req = http.expectOne(API);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Estacionamiento' });
      req.flush({ idAmenity: 3, name: 'Estacionamiento' });
      await flushMicrotasks();
      await fixture.whenStable();

      expect(rows().map((row) => cells(row)[0])).toEqual(['Estacionamiento', 'Spa', 'WiFi']);
      expect(cells(rowOf('Estacionamiento'))[1]).toBe('Ninguno');
      expect(text(page.querySelector('z-alert[variant="success"]'))).toContain(
        'Sumamos «Estacionamiento» al catálogo',
      );
      // Queda abierto y vacío para cargar el siguiente.
      expect(page.querySelector<HTMLInputElement>('#amenity-name')!.value).toBe('');
    });

    it('sin nombre no envía y avisa en el campo', async () => {
      await submitCreate();
      await fixture.whenStable();

      expect(errorOf('amenity-name')).toBe('Escribí el nombre del servicio.');
      http.expectNone((r) => r.method === 'POST');
    });

    it('con solo espacios tampoco envía', async () => {
      type('#amenity-name', '    ');
      await fixture.whenStable();
      await submitCreate();
      await fixture.whenStable();

      expect(errorOf('amenity-name')).toBe('Escribí el nombre del servicio.');
      http.expectNone((r) => r.method === 'POST');
    });

    it('con menos de tres letras no envía, como pide el backend', async () => {
      type('#amenity-name', 'Sp');
      await fixture.whenStable();
      await submitCreate();
      await fixture.whenStable();

      expect(errorOf('amenity-name')).toBe('El nombre tiene que tener al menos 3 letras.');
      http.expectNone((r) => r.method === 'POST');
    });

    it('uno que ya está en el catálogo, aunque cambien tildes o mayúsculas, no se repite', async () => {
      type('#amenity-name', 'wifi');
      await fixture.whenStable();
      await submitCreate();
      await fixture.whenStable();

      expect(errorOf('amenity-name')).toBe('Ya está en el catálogo como «WiFi».');
      http.expectNone((r) => r.method === 'POST');
    });

    it('si el backend rechaza el nombre (400), el motivo va debajo del campo', async () => {
      type('#amenity-name', 'Cancha de vóley');
      await fixture.whenStable();
      await submitCreate();

      http
        .expectOne(API)
        .flush(
          { error: 'El nombre debe tener al menos 3 caracteres' },
          { status: 400, statusText: 'Bad Request' },
        );
      await flushMicrotasks();
      await fixture.whenStable();

      expect(errorOf('amenity-name')).toBe('El nombre debe tener al menos 3 caracteres');
    });

    it('un error sin campo, como no tener conexión, va en un aviso arriba del formulario', async () => {
      type('#amenity-name', 'Cancha de vóley');
      await fixture.whenStable();
      await submitCreate();

      http.expectOne(API).flush(null, { status: 0, statusText: 'Unknown Error' });
      await flushMicrotasks();
      await fixture.whenStable();

      expect(text(page.querySelector('form z-alert'))).toContain(
        'No hay conexión con el servidor.',
      );
      expect(errorOf('amenity-name')).toBeNull();
    });
  });

  describe('renombrar', () => {
    beforeEach(async () => {
      await respondWith([wifi, spa]);
    });

    async function startRename(name: string): Promise<void> {
      button('Renombrar', rowOf(name))!.click();
      await fixture.whenStable();
    }

    it('se edita en la fila y manda PUT /api/amenities/{id} con { name }', async () => {
      await startRename('Spa');
      const input = page.querySelector<HTMLInputElement>('#amenity-new-name')!;
      expect(input.value).toBe('Spa');
      expect(document.activeElement).toBe(input);

      type('#amenity-new-name', 'Spa y Masajes ');
      await fixture.whenStable();
      button('Guardar')!.click();
      await flushMicrotasks();

      const req = http.expectOne(`${API}/6`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ name: 'Spa y Masajes' });
      req.flush({ idAmenity: 6, name: 'Spa y Masajes' });
      await flushMicrotasks();
      await fixture.whenStable();

      expect(page.querySelector('#amenity-new-name')).toBeNull();
      expect(rows().map((row) => cells(row)[0])).toEqual(['Spa y Masajes', 'WiFi']);
      expect(text(page.querySelector('z-alert[variant="success"]'))).toContain(
        '«Spa» ahora se llama «Spa y Masajes»',
      );
    });

    it('con Enter guarda y con Escape cancela', async () => {
      await startRename('Spa');
      const input = page.querySelector<HTMLInputElement>('#amenity-new-name')!;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();
      expect(page.querySelector('#amenity-new-name')).toBeNull();

      await startRename('Spa');
      type('#amenity-new-name', 'Spa termal');
      await fixture.whenStable();
      page
        .querySelector('#amenity-new-name')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await flushMicrotasks();

      http.expectOne(`${API}/6`).flush({ idAmenity: 6, name: 'Spa termal' });
      await flushMicrotasks();
      await fixture.whenStable();
      expect(rowOf('Spa termal')).toBeDefined();
    });

    it('al nombre de otro servicio del catálogo no lo deja pasar', async () => {
      await startRename('Spa');
      type('#amenity-new-name', 'WIFI');
      await fixture.whenStable();
      button('Guardar')!.click();
      await flushMicrotasks();
      await fixture.whenStable();

      expect(errorOf('amenity-new-name')).toBe('Ya está en el catálogo como «WiFi».');
      http.expectNone(`${API}/6`);
    });

    it('cambiar solo mayúsculas del propio sí se puede', async () => {
      await startRename('WiFi');
      type('#amenity-new-name', 'Wifi');
      await fixture.whenStable();
      button('Guardar')!.click();
      await flushMicrotasks();

      http.expectOne(`${API}/1`).flush({ idAmenity: 1, name: 'Wifi' });
      await flushMicrotasks();
    });

    it('sin cambios no manda nada y cierra la edición', async () => {
      await startRename('Spa');
      button('Guardar')!.click();
      await flushMicrotasks();
      await fixture.whenStable();

      http.expectNone(`${API}/6`);
      expect(page.querySelector('#amenity-new-name')).toBeNull();
    });

    it('si ya no existe (404), lo dice debajo del campo y sigue editando', async () => {
      await startRename('Spa');
      type('#amenity-new-name', 'Spa termal');
      await fixture.whenStable();
      button('Guardar')!.click();
      await flushMicrotasks();

      http
        .expectOne(`${API}/6`)
        .flush({ error: 'Amenity con id 6 no encontrada' }, { status: 404, statusText: 'x' });
      await flushMicrotasks();
      await fixture.whenStable();

      expect(errorOf('amenity-new-name')).toContain('ya no está en el catálogo');
      expect(page.querySelector('#amenity-new-name')).not.toBeNull();
    });

    it('Cancelar deja el nombre como estaba', async () => {
      await startRename('Spa');
      type('#amenity-new-name', 'Otra cosa');
      button('Cancelar')!.click();
      await fixture.whenStable();

      expect(cells(rowOf('Spa'))[0]).toBe('Spa');
      http.expectNone(`${API}/6`);
    });
  });

  describe('borrar', () => {
    beforeEach(async () => {
      await respondWith([wifi, spa, duchas, musica]);
    });

    async function askDelete(name: string): Promise<void> {
      button('Borrar', rowOf(name))!.click();
      await fixture.whenStable();
    }

    it('en la fila es un botón de texto rojo, y el que confirma va relleno', async () => {
      expect(button('Borrar', rowOf('Spa'))!.classList).toContain('z-btn--danger-text');

      await askDelete('Spa');

      expect(button('Borrar del catálogo', dialog())!.classList).toContain('z-btn--danger');
    });

    it('no avanza sin confirmar: pide confirmación y, con Volver, no manda nada', async () => {
      await askDelete('Spa');

      expect(dialog().hasAttribute('open')).toBe(true);
      http.expectNone((r) => r.method === 'DELETE');

      button('Volver', dialog())!.click();
      await fixture.whenStable();

      expect(dialog().hasAttribute('open')).toBe(false);
      http.expectNone((r) => r.method === 'DELETE');
      expect(rowOf('Spa')).toBeDefined();
    });

    it('la confirmación dice a cuántos balnearios se les saca y que no se deshace', async () => {
      await askDelete('Spa');

      expect(text(dialog().querySelector('h2'))).toBe('¿Borrar «Spa» del catálogo?');
      const body = text(dialog().querySelector('.z-modal__body'));
      expect(body).toContain('Se les saca a los 2 balnearios que hoy lo ofrecen.');
      expect(body).toContain('no se puede deshacer');
      expect(body).not.toContain('tuyo');
    });

    it('con uno o ningún balneario también lo dice', async () => {
      await askDelete('WiFi');
      expect(text(dialog())).toContain('Se les saca a los 3 balnearios que hoy lo ofrecen.');
      button('Volver', dialog())!.click();

      await askDelete('Duchas y Vestuarios');
      expect(text(dialog())).toContain('Se le saca al único balneario que hoy lo ofrece.');
      button('Volver', dialog())!.click();

      await askDelete('Música en Vivo');
      expect(text(dialog())).toContain('Hoy no lo ofrece ningún balneario.');
    });

    it('confirmado, manda DELETE /api/amenities/{id} y desaparece del listado', async () => {
      await askDelete('Spa');
      button('Borrar del catálogo', dialog())!.click();

      const req = http.expectOne(`${API}/6`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await fixture.whenStable();

      expect(dialog().hasAttribute('open')).toBe(false);
      expect(rows().map((row) => cells(row)[0])).not.toContain('Spa');
      expect(rows()).toHaveLength(3);
      expect(text(page.querySelector('z-alert[variant="success"]'))).toContain(
        'Borramos «Spa» del catálogo',
      );
    });

    it('si ya lo había borrado otro (404), también lo saca de la lista', async () => {
      await askDelete('Spa');
      button('Borrar del catálogo', dialog())!.click();

      http
        .expectOne(`${API}/6`)
        .flush({ error: 'Amenity con id 6 no encontrada' }, { status: 404, statusText: 'x' });
      await fixture.whenStable();

      expect(rows().map((row) => cells(row)[0])).not.toContain('Spa');
      expect(page.querySelector('z-alert[variant="danger"]')).toBeNull();
    });

    it('si falla, cierra la confirmación y avisa sin sacar la fila', async () => {
      await askDelete('Spa');
      button('Borrar del catálogo', dialog())!.click();

      http
        .expectOne(`${API}/6`)
        .flush({ error: 'Hace falta rol de administrador' }, { status: 403, statusText: 'x' });
      await fixture.whenStable();

      expect(dialog().hasAttribute('open')).toBe(false);
      expect(text(page.querySelector('z-alert[variant="danger"]'))).toContain(
        'Hace falta rol de administrador',
      );
      expect(rowOf('Spa')).toBeDefined();
    });
  });

  describe('en el celular (GH-79)', () => {
    beforeEach(async () => {
      await respondWith([wifi, spa, duchas, musica]);
    });

    const menuOf = (name: string) =>
      rowOf(name).querySelector<HTMLButtonElement>('.z-row-menu__trigger')!;

    async function choose(name: string, label: string): Promise<void> {
      menuOf(name).click();
      await fixture.whenStable();
      Array.from(rowOf(name).querySelectorAll<HTMLButtonElement>('.z-row-menu__item'))
        .find((b) => b.textContent!.trim() === label)!
        .click();
      await fixture.whenStable();
    }

    it('la tabla es compacta y cada servicio tiene su menú, con su nombre', async () => {
      expect(page.querySelector('table')!.classList).toContain('z-table--compact');
      expect(menuOf('Spa').getAttribute('aria-label')).toBe('Acciones de Spa');

      menuOf('Spa').click();
      await fixture.whenStable();
      expect(
        Array.from(rowOf('Spa').querySelectorAll('.z-row-menu__item')).map((b) => text(b)),
      ).toEqual(['Renombrar', 'Borrar']);
    });

    it('sin la columna, cuántos lo ofrecen se lee como frase', () => {
      const verb = (name: string) =>
        rowOf(name).querySelector('.amenities__usage')!.getAttribute('data-verb');
      expect(verb('WiFi')).toBe('lo ofrecen');
      expect(verb('Duchas')).toBe('lo ofrece');
      expect(verb('Música')).toBe('lo ofrece');
    });

    it('Borrar desde el menú abre la misma confirmación', async () => {
      await choose('Spa', 'Borrar');

      expect(dialog().hasAttribute('open')).toBe(true);
      expect(text(dialog())).toContain('¿Borrar «Spa» del catálogo?');
    });

    it('Renombrar desde el menú abre el campo en la fila', async () => {
      await choose('Spa', 'Renombrar');

      // Mientras se renombra, el nombre está en el campo: la fila se busca por la marca.
      const editing = page.querySelector('tbody tr.is-editing')!;
      expect(editing.querySelector('#amenity-new-name')!.getAttribute('aria-label')).toBe(
        'Nuevo nombre de Spa',
      );
    });
  });
});
