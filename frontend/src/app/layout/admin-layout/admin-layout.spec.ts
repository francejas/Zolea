import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Me } from '../../core/api/auth.models';
import { SessionService } from '../../core/session/session.service';
import { AdminLayout } from './admin-layout';

const MY_RESORT = `${environment.apiUrl}/api/resorts/my`;

const resortAdmin: Me = {
  idClient: 2,
  firstName: 'Admin',
  lastName: 'Mar del Plata',
  email: 'admin.mdp@zolea.com',
  role: 'ADMIN',
  idManagedResort: 1,
};
/** La cuenta de Zolea: un administrador sin balneario. */
const zoleaAccount: Me = {
  ...resortAdmin,
  idClient: 3,
  email: 'zolea@zolea.com',
  idManagedResort: null,
};

describe('AdminLayout', () => {
  let fixture: ComponentFixture<AdminLayout>;
  let page: HTMLElement;
  let http: HttpTestingController;
  let logout: ReturnType<typeof vi.fn>;
  const user = signal<Me | null>(resortAdmin);

  beforeEach(async () => {
    // jsdom no trae matchMedia ni los métodos de <dialog>.
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    logout = vi.fn();
    user.set(resortAdmin);
    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { user, logout } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    create();
  });

  /** Arma el marco con la sesión que haya en `user`. */
  function create(): void {
    fixture = TestBed.createComponent(AdminLayout);
    page = fixture.nativeElement;
    // Hace salir el pedido del balneario; whenStable() esperaría su respuesta.
    TestBed.tick();
  }

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });

  function sidebar(): HTMLElement {
    return page.querySelector('.admin__sidebar')!;
  }

  it('muestra arriba el nombre y la ubicación de su balneario', async () => {
    http
      .expectOne(MY_RESORT)
      .flush({ idResort: 1, name: 'Zolea Club de Playa', location: 'Mar del Plata, Buenos Aires' });
    await fixture.whenStable();

    const resort = sidebar().querySelector('.z-sidebar__resort')!.textContent;
    expect(resort).toContain('Zolea Club de Playa');
    expect(resort).toContain('Mar del Plata, Buenos Aires');
  });

  it('sin balneario asignado, lo dice', async () => {
    http
      .expectOne(MY_RESORT)
      .flush({ error: 'No tenés balneario' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(sidebar().querySelector('.z-sidebar__resort')!.textContent).toContain(
      'Sin balneario asignado',
    );
  });

  const items = (within: ParentNode = sidebar()) =>
    Array.from(within.querySelectorAll('.z-sidebar__item')).map((item) => item.textContent!.trim());

  it('lista las secciones del panel, sin el catálogo, y abajo volver al sitio y salir', async () => {
    http.expectOne(MY_RESORT).flush({ name: 'Zolea Club de Playa', location: 'Mar del Plata' });
    await fixture.whenStable();

    expect(items()).toEqual([
      'Panel',
      'Mostrador',
      'Validar ingreso',
      'Reservas',
      'Mis clientes',
      'Unidades',
      'Mi balneario',
      'Ver el sitio público',
      'Salir',
    ]);
    expect(page.querySelector('.z-logo')!.getAttribute('href')).toBe('/admin');
  });

  describe('la cuenta de Zolea', () => {
    beforeEach(async () => {
      // El marco del administrador de un balneario ya pidió el suyo: se responde y se rearma.
      http.expectOne(MY_RESORT).flush({ name: 'Zolea Club de Playa', location: 'Mar del Plata' });
      fixture.destroy();
      user.set(zoleaAccount);
      create();
      await fixture.whenStable();
    });

    it('no pide un balneario y arriba dice «Zolea · Catálogo de servicios»', () => {
      http.expectNone(MY_RESORT);
      const resort = sidebar().querySelector('.z-sidebar__resort')!.textContent;
      expect(resort).toContain('Zolea · Catálogo de servicios');
      expect(resort).not.toContain('Sin balneario asignado');
    });

    it('su barra lleva solo el catálogo, volver al sitio y salir, también en el cajón', () => {
      const expected = ['Catálogo de servicios', 'Ver el sitio público', 'Salir'];
      expect(items()).toEqual(expected);
      expect(items(page.querySelector('dialog')!)).toEqual(expected);
      expect(sidebar().getAttribute('aria-label')).toBe('Panel de Zolea');
    });

    it('el logo la lleva a su catálogo', () => {
      expect(page.querySelector('.z-logo')!.getAttribute('href')).toBe('/admin/amenities');
    });
  });

  it('Salir cierra la sesión', async () => {
    http.expectOne(MY_RESORT).flush({ name: 'Zolea Club de Playa', location: 'Mar del Plata' });
    await fixture.whenStable();

    sidebar().querySelector<HTMLButtonElement>('button.z-sidebar__item')!.click();

    expect(logout).toHaveBeenCalledOnce();
  });

  it('en el celular, el botón abre el cajón y un clic en el fondo lo cierra', async () => {
    http.expectOne(MY_RESORT).flush({ name: 'Zolea Club de Playa', location: 'Mar del Plata' });
    await fixture.whenStable();
    const drawer = page.querySelector('dialog')!;

    page.querySelector<HTMLButtonElement>('.admin__bar button')!.click();
    expect(drawer.hasAttribute('open')).toBe(true);
    expect(drawer.querySelector('.z-sidebar__resort')!.textContent).toContain(
      'Zolea Club de Playa',
    );

    drawer.click();
    expect(drawer.hasAttribute('open')).toBe(false);
  });
});
