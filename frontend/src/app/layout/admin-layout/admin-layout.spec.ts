import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { SessionService } from '../../core/session/session.service';
import { AdminLayout } from './admin-layout';

const MY_RESORT = `${environment.apiUrl}/api/resorts/my`;

describe('AdminLayout', () => {
  let fixture: ComponentFixture<AdminLayout>;
  let page: HTMLElement;
  let http: HttpTestingController;
  let logout: ReturnType<typeof vi.fn>;

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
    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { logout } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminLayout);
    page = fixture.nativeElement;
    http = TestBed.inject(HttpTestingController);
    // Hace salir el pedido del balneario; whenStable() esperaría su respuesta.
    TestBed.tick();
  });

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

  it('lista las secciones del panel, y abajo volver al sitio y salir', async () => {
    http.expectOne(MY_RESORT).flush({ name: 'Zolea Club de Playa', location: 'Mar del Plata' });
    await fixture.whenStable();

    const items = Array.from(sidebar().querySelectorAll('.z-sidebar__item')).map((item) =>
      item.textContent!.trim(),
    );
    expect(items).toEqual([
      'Panel',
      'Mostrador',
      'Validar ingreso',
      'Reservas',
      'Mis clientes',
      'Unidades',
      'Mi balneario',
      'Catálogo de servicios',
      'Ver el sitio público',
      'Salir',
    ]);
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
