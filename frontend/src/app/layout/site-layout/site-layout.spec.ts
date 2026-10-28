import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
        provideRouter([]),
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
    expect(texts('#menu-usuario .z-menu__item')).toEqual([
      'Mis reservas',
      'Mi cuenta',
      'Cerrar sesión',
    ]);
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
