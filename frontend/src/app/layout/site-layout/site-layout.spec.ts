import { Component, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SessionService } from '../../core/session/session.service';
import { SiteLayout } from './site-layout';

const SANTIAGO = {
  idClient: 7,
  firstName: 'Santiago',
  lastName: 'Rodríguez',
  email: 'santi.rodriguez@gmail.com',
  role: 'USER' as const,
  idManagedResort: null,
};

const MAXIMILIANO = {
  idClient: 2,
  firstName: 'Maximiliano',
  lastName: 'Soria',
  email: 'admin.mdp@zolea.com',
  role: 'ADMIN' as const,
  idManagedResort: 1,
};

@Component({ template: '' })
class Blank {}

/** Las rutas del sitio que importan para marcar la sección actual. */
const ROUTES = ['', 'resorts/:id', 'my-bookings', 'bookings/:id', 'dashboard', 'profile'].map(
  (path) => ({ path, component: Blank }),
);

describe('SiteLayout', () => {
  let fixture: ComponentFixture<SiteLayout>;
  let page: HTMLElement;
  let logout: ReturnType<typeof vi.fn>;

  async function render(user: typeof SANTIAGO | typeof MAXIMILIANO | null): Promise<void> {
    const current = signal(user);
    logout = vi.fn();
    await TestBed.configureTestingModule({
      imports: [SiteLayout],
      providers: [
        provideRouter(ROUTES),
        {
          provide: SessionService,
          useValue: {
            user: current,
            isLoggedIn: computed(() => current() !== null),
            isAdmin: computed(() => current()?.role === 'ADMIN'),
            logout,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SiteLayout);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  function texts(selector: string): string[] {
    return Array.from(page.querySelectorAll(selector)).map((el) => el.textContent!.trim());
  }

  function userButton(): HTMLButtonElement {
    return page.querySelector('.z-user-btn')!;
  }

  async function click(element: HTMLElement): Promise<void> {
    element.click();
    await fixture.whenStable();
  }

  it('sin sesión ofrece Ingresar y Crear cuenta', async () => {
    await render(null);

    expect(texts('.z-topbar__actions a')).toEqual(['Crear cuenta', 'Ingresar']);
    expect(userButton()).toBeNull();
  });

  it('el logo lleva a la portada', async () => {
    await render(null);

    expect(page.querySelector('.z-logo')!.getAttribute('href')).toBe('/');
  });

  it('con sesión muestra el nombre y su menú', async () => {
    await render(SANTIAGO);

    expect(userButton().textContent).toContain('Santiago');
    expect(page.querySelector('#menu-usuario')!.hasAttribute('hidden')).toBe(true);

    await click(userButton());

    expect(userButton().getAttribute('aria-expanded')).toBe('true');
    expect(page.querySelector('#menu-usuario')!.hasAttribute('hidden')).toBe(false);
    expect(texts('#menu-usuario .z-menu__item')).toEqual(['Inicio', 'Mi cuenta', 'Cerrar sesión']);
  });

  async function go(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  }

  /** El aria-current de cada enlace de la barra, por su texto. */
  function current(selector: string): Record<string, string | null> {
    return Object.fromEntries(
      Array.from(page.querySelectorAll(selector)).map((el) => [
        el.textContent!.trim(),
        el.getAttribute('aria-current'),
      ]),
    );
  }

  describe('la barra del cliente', () => {
    it('entre el logo y el avatar muestra Balnearios y Mis reservas', async () => {
      await render(SANTIAGO);

      const nav = page.querySelector('.z-topbar__nav')!;
      expect(nav.getAttribute('aria-label')).toBe('Secciones');
      expect(texts('.z-topbar__nav a')).toEqual(['Balnearios', 'Mis reservas']);
      expect(page.querySelector('.z-topbar__nav a')!.getAttribute('href')).toBe('/');
      expect(page.querySelectorAll('.z-topbar__nav a')[1].getAttribute('href')).toBe(
        '/my-bookings',
      );

      const logo = page.querySelector('.z-logo')!;
      const actions = page.querySelector('.z-topbar__actions')!;
      expect(logo.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(nav.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('marca la sección actual: la portada y la ficha son Balnearios', async () => {
      await render(SANTIAGO);

      await go('/');
      expect(current('.z-topbar__nav a')).toEqual({ Balnearios: 'page', 'Mis reservas': null });

      await go('/resorts/3');
      expect(current('.z-topbar__nav a')).toEqual({ Balnearios: 'true', 'Mis reservas': null });
    });

    it('marca Mis reservas en la lista y en el detalle de una reserva', async () => {
      await render(SANTIAGO);

      await go('/my-bookings');
      expect(current('.z-topbar__nav a')).toEqual({ Balnearios: null, 'Mis reservas': 'page' });

      await go('/bookings/47');
      expect(current('.z-topbar__nav a')).toEqual({ Balnearios: null, 'Mis reservas': 'true' });

      await go('/profile');
      expect(current('.z-topbar__nav a')).toEqual({ Balnearios: null, 'Mis reservas': null });
    });

    it('en el menú del celular, Balnearios va primero y la sección actual se marca', async () => {
      await render(SANTIAGO);
      await go('/my-bookings');

      expect(texts('#menu-celular .z-menu__item')).toEqual([
        'Balnearios',
        'Inicio',
        'Mis reservas',
        'Mi cuenta',
        'Cerrar sesión',
      ]);
      expect(current('#menu-celular a.z-menu__item')).toEqual({
        Balnearios: null,
        Inicio: null,
        'Mis reservas': 'page',
        'Mi cuenta': null,
      });
    });
  });

  it('al administrador no le suma la barra de secciones', async () => {
    await render(MAXIMILIANO);

    expect(page.querySelector('.z-topbar__nav')).toBeNull();
    expect(texts('#menu-celular .z-menu__item')).toEqual([
      'Panel de mi balneario',
      'Cerrar sesión',
    ]);
  });

  it('sin sesión no hay barra de secciones', async () => {
    await render(null);

    expect(page.querySelector('.z-topbar__nav')).toBeNull();
  });

  it('al administrador le muestra solo el panel y cerrar sesión', async () => {
    await render(MAXIMILIANO);

    expect(userButton().textContent).toContain('Maximiliano');
    expect(texts('#menu-usuario .z-menu__item')).toEqual([
      'Panel de mi balneario',
      'Cerrar sesión',
    ]);
  });

  it('Cerrar sesión cierra la sesión', async () => {
    await render(SANTIAGO);
    await click(userButton());

    const button = page.querySelector<HTMLButtonElement>('#menu-usuario button')!;
    await click(button);

    expect(logout).toHaveBeenCalledOnce();
  });

  it('Escape cierra el menú y devuelve el foco al botón', async () => {
    await render(SANTIAGO);
    await click(userButton());

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(userButton().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(userButton());
  });

  it('un clic afuera cierra el menú', async () => {
    await render(SANTIAGO);
    await click(userButton());

    await click(page.querySelector('main')!);

    expect(userButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('el botón del celular abre y cierra el menú', async () => {
    await render(null);
    const button = page.querySelector<HTMLButtonElement>('.z-topbar__menu-btn')!;
    const sheet = page.querySelector('#menu-celular')!;

    expect(sheet.hasAttribute('hidden')).toBe(true);

    await click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Cerrar menú');
    expect(sheet.hasAttribute('hidden')).toBe(false);
    expect(texts('#menu-celular a')).toEqual(['Ingresar', 'Crear cuenta']);

    await click(button);
    expect(sheet.hasAttribute('hidden')).toBe(true);
  });
});
