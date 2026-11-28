import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AccountPage, AccountSummary } from '../../../core/api/account.models';
import { ZoleaUsers } from './zolea-users';

const ACCOUNTS = `${environment.apiUrl}/api/accounts`;

const account = (overrides: Partial<AccountSummary> = {}): AccountSummary => ({
  idClient: 16,
  firstName: 'Natalia',
  lastName: 'Romero',
  email: 'nati.romero@gmail.com',
  dni: '40000016',
  type: 'CLIENT',
  active: true,
  managedResort: null,
  ...overrides,
});

const nati = account();
const martin = account({
  idClient: 2,
  firstName: 'Martín',
  lastName: 'Sosa',
  email: 'admin.mdp@zolea.com',
  dni: '30111222',
  type: 'RESORT_ADMIN',
  managedResort: { idResort: 1, name: 'Zolea Club de Playa', active: true },
});
const baja = account({ idClient: 7, firstName: 'Santiago', lastName: 'Rodríguez', active: false });

const pageOf = (content: AccountSummary[], overrides: Partial<AccountPage> = {}): AccountPage => ({
  content,
  page: 0,
  size: 20,
  totalElements: content.length,
  totalPages: content.length ? 1 : 0,
  ...overrides,
});

/** Los parámetros con que salió el pedido. */
type SentParams = Partial<Record<'q' | 'type' | 'page' | 'size', string>>;

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

describe('ZoleaUsers', () => {
  let fixture: ComponentFixture<ZoleaUsers>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoleaUsers],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(ZoleaUsers);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  /** Responde el pedido que está pendiente y devuelve sus parámetros. */
  async function respondWith(result: AccountPage): Promise<SentParams> {
    const req = http.expectOne((r) => r.url === ACCOUNTS);
    const params: Record<string, string> = {};
    req.request.params.keys().forEach((key) => (params[key] = req.request.params.get(key)!));
    req.flush(result);
    await fixture.whenStable();
    return params;
  }

  const rows = () => Array.from(page.querySelectorAll('tbody tr'));

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      text(b).includes(label),
    );
  }

  /** Lo que se escribe en el buscador viaja después de una pausa corta. */
  async function search(value: string): Promise<void> {
    const input = page.querySelector<HTMLInputElement>('#users-search')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();
  }

  describe('los cuatro estados', () => {
    it('cargando: el esqueleto, sin tabla', async () => {
      expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(page.querySelector('table')).toBeNull();
      await respondWith(pageOf([]));
    });

    it('con cuentas: nombre, email, DNI, tipo y estado', async () => {
      await respondWith(pageOf([martin, nati, baja], { totalElements: 3 }));

      expect(rows()).toHaveLength(3);
      const [first, second, third] = rows();
      expect(text(first)).toContain('Martín Sosa');
      expect(text(first)).toContain('admin.mdp@zolea.com');
      expect(text(first)).toContain('30.111.222');
      expect(text(first)).toContain('Administrador');
      expect(text(first)).toContain('Zolea Club de Playa');
      expect(text(first)).toContain('Activa');
      expect(text(second)).toContain('Cliente');
      expect(text(third)).toContain('Desactivada');
      expect(text(page.querySelector('.users__summary'))).toBe('3 cuentas');
    });

    it('el nombre lleva al detalle de la cuenta', async () => {
      await respondWith(pageOf([nati]));

      const link = rows()[0].querySelector('a')!;
      expect(link.getAttribute('href')).toBe('/admin/users/16');
    });

    it('error: el problema con «Reintentar», que vuelve a pedir', async () => {
      http.expectOne((r) => r.url === ACCOUNTS).flush(null, { status: 500, statusText: 'x' });
      await fixture.whenStable();

      expect(text(page)).toContain('No pudimos traer las cuentas');
      button('Reintentar')!.click();
      await fixture.whenStable();
      await respondWith(pageOf([nati]));
      expect(rows()).toHaveLength(1);
    });

    it('sin resultados: lo dice y ofrece borrar la búsqueda', async () => {
      await respondWith(pageOf([nati]));
      await search('zzz');
      expect((await respondWith(pageOf([]))).q).toBe('zzz');

      expect(text(page)).toContain('Ninguna cuenta coincide');
      button('Borrar la búsqueda')!.click();
      await fixture.whenStable();
      const params = await respondWith(pageOf([nati]));
      expect(params.q).toBeUndefined();
      expect(page.querySelector<HTMLInputElement>('#users-search')!.value).toBe('');
    });
  });

  describe('buscar, filtrar y paginar', () => {
    it('la búsqueda viaja al backend y vuelve a la primera página', async () => {
      await respondWith(pageOf([nati], { totalElements: 45, totalPages: 3 }));
      button('Siguiente')!.click();
      await fixture.whenStable();
      expect(
        (await respondWith(pageOf([nati], { page: 1, totalElements: 45, totalPages: 3 }))).page,
      ).toBe('1');

      await search('romero');
      const params = await respondWith(pageOf([nati]));
      expect(params.q).toBe('romero');
      expect(params.page).toBe('0');
    });

    it('el filtro por tipo viaja al backend', async () => {
      await respondWith(pageOf([nati, martin]));

      const select = page.querySelector<HTMLSelectElement>('#users-type')!;
      select.value = 'RESORT_ADMIN';
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect((await respondWith(pageOf([martin]))).type).toBe('RESORT_ADMIN');
      expect(rows()).toHaveLength(1);
    });

    it('pagina con «Anterior» y «Siguiente», deshabilitados en las puntas', async () => {
      await respondWith(pageOf([nati], { totalElements: 45, totalPages: 3 }));

      expect(text(page.querySelector('.users__pages'))).toContain('Página 1 de 3');
      expect(button('Anterior')!.disabled).toBe(true);
      expect(button('Siguiente')!.disabled).toBe(false);

      button('Siguiente')!.click();
      await fixture.whenStable();
      await respondWith(pageOf([nati], { page: 1, totalElements: 45, totalPages: 3 }));
      button('Siguiente')!.click();
      await fixture.whenStable();
      await respondWith(pageOf([nati], { page: 2, totalElements: 45, totalPages: 3 }));

      expect(text(page.querySelector('.users__pages'))).toContain('Página 3 de 3');
      expect(button('Siguiente')!.disabled).toBe(true);
      button('Anterior')!.click();
      await fixture.whenStable();
      expect(
        (await respondWith(pageOf([nati], { page: 1, totalElements: 45, totalPages: 3 }))).page,
      ).toBe('1');
    });

    it('con una sola página no muestra la paginación', async () => {
      await respondWith(pageOf([nati]));
      expect(page.querySelector('.users__pages')).toBeNull();
    });

    it('si llega una respuesta vieja después de una nueva, se queda con la nueva', async () => {
      await respondWith(pageOf([nati, martin]));
      const select = page.querySelector<HTMLSelectElement>('#users-type')!;

      select.value = 'CLIENT';
      select.dispatchEvent(new Event('change'));
      select.value = 'RESORT_ADMIN';
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      const [older, newer] = http.match((r) => r.url === ACCOUNTS);
      newer.flush(pageOf([martin]));
      older.flush(pageOf([nati, baja]));
      await fixture.whenStable();

      expect(rows()).toHaveLength(1);
      expect(text(rows()[0])).toContain('Martín Sosa');
    });
  });
});
