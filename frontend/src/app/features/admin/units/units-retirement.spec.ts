import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { Me } from '../../../core/api/auth.models';
import { RentalUnit } from '../../../core/api/resort.models';
import { SessionService } from '../../../core/session/session.service';
import { Units } from './units';

const API = `${environment.apiUrl}/api/rental-units`;

const admin: Me = {
  idClient: 2,
  firstName: 'Admin',
  lastName: 'Mar del Plata',
  email: 'admin.mdp@zolea.com',
  role: 'ADMIN',
  idManagedResort: 7,
};

function unit(overrides: Partial<RentalUnit> = {}): RentalUnit {
  return {
    idRentalUnit: 1,
    type: 'UMBRELLA',
    identifier: 'A-01',
    dailyPrice: 8500,
    isBlocked: false,
    retired: false,
    resortId: 7,
    ...overrides,
  };
}

const sombrilla = unit();

const carpa = unit({
  idRentalUnit: 2,
  type: 'TENT',
  identifier: 'C-01',
  dailyPrice: 14500,
});

const bloqueada = unit({
  idRentalUnit: 3,
  identifier: 'A-08',
  isBlocked: true,
});

describe('Units: baja definitiva y filtros', () => {
  let fixture: ComponentFixture<Units>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };

    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    await TestBed.configureTestingModule({
      imports: [Units],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            user: signal<Me | null>(admin),
          },
        },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Units);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  async function respondWith(units: RentalUnit[]): Promise<void> {
    http.expectOne(API).flush(units);
    await fixture.whenStable();
  }

  const rows = () => Array.from(page.querySelectorAll('tbody tr'));

  const cells = (row: Element) =>
    Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent!.trim());

  function rowOf(identifier: string): Element {
    return rows().find((row) => cells(row)[0] === identifier)!;
  }

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLSelectElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('change'));
  }

  describe('baja definitiva y filtros', () => {
    const retired = unit({
      idRentalUnit: 4,
      identifier: 'R-01',
      retired: true,
    });

    const dialog = () => page.querySelector<HTMLDialogElement>('[aria-labelledby="retire-title"]')!;

    const clickIn = (root: Element, text: string) =>
      Array.from(root.querySelectorAll('button'))
        .find((button) => button.textContent!.includes(text))!
        .click();

    async function askRetire(): Promise<void> {
      clickIn(rowOf('A-01'), 'Dar de baja');
      await fixture.whenStable();
    }

    beforeEach(async () => {
      await respondWith([sombrilla, carpa, bloqueada, retired]);
    });

    it('al entrar muestra disponibles y bloqueadas; filtra por tipo y estado sin otro HTTP', async () => {
      expect(rows()).toHaveLength(3);

      type('#units-filter-type', 'TENT');
      await fixture.whenStable();

      expect(rows().map((row) => cells(row)[0])).toEqual(['C-01']);

      type('#units-filter-type', '');
      type('#units-filter-state', 'BLOCKED');
      await fixture.whenStable();

      expect(rows().map((row) => cells(row)[0])).toEqual(['A-08']);

      type('#units-filter-state', 'RETIRED');
      await fixture.whenStable();

      expect(rows().map((row) => cells(row)[0])).toEqual(['R-01']);
      expect(rowOf('R-01').querySelectorAll('button')).toHaveLength(0);
      expect(rowOf('R-01').textContent).toContain('Dada de baja');
      expect(rowOf('R-01').querySelector('.z-status--neutral')).not.toBeNull();

      http.expectNone(API);
    });

    it('abrir y volver no envía la baja', async () => {
      await askRetire();

      expect(dialog().open).toBe(true);
      expect(dialog().textContent).toContain('La baja es definitiva');
      expect(dialog().textContent).toContain('Su historial de reservas se conserva');

      http.expectNone((request) => request.url.endsWith('/retire'));

      clickIn(dialog(), 'Volver');
      await fixture.whenStable();

      expect(dialog().open).toBe(false);

      http.expectNone((request) => request.url.endsWith('/retire'));
    });

    it('Escape cancela sin enviar', async () => {
      await askRetire();

      dialog().dispatchEvent(
        new Event('cancel', {
          cancelable: true,
        }),
      );

      await fixture.whenStable();

      expect(dialog().open).toBe(false);

      http.expectNone((request) => request.url.endsWith('/retire'));
    });

    it('confirmar envía una sola baja y deja la unidad visible, neutra y sin acciones', async () => {
      await askRetire();

      clickIn(dialog(), 'Confirmar baja definitiva');
      clickIn(dialog(), 'Confirmar baja definitiva');

      const request = http.expectOne(API + '/1/retire');

      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toBeNull();

      dialog().dispatchEvent(
        new Event('cancel', {
          cancelable: true,
        }),
      );

      expect(dialog().open).toBe(true);

      request.flush({
        ...sombrilla,
        retired: true,
      });

      await fixture.whenStable();

      expect(dialog().open).toBe(false);
      expect(rowOf('A-01').querySelectorAll('button')).toHaveLength(0);
      expect(rowOf('A-01').querySelector('.z-status--neutral')!.textContent).toContain(
        'Dada de baja',
      );
      expect((page.querySelector('#units-filter-state') as HTMLSelectElement).value).toBe(
        'RETIRED',
      );
    });

    it('el 400 queda dentro del diálogo y permite reintentar sin modificar la unidad', async () => {
      await askRetire();

      clickIn(dialog(), 'Confirmar baja definitiva');

      http.expectOne(API + '/1/retire').flush(
        {
          error: 'La unidad tiene reservas futuras',
        },
        {
          status: 400,
          statusText: 'Bad Request',
        },
      );

      await fixture.whenStable();

      expect(dialog().open).toBe(true);
      expect(dialog().querySelector('z-alert')!.textContent).toContain(
        'La unidad tiene reservas futuras',
      );
      expect(rowOf('A-01').textContent).toContain('Disponible');

      clickIn(dialog(), 'Confirmar baja definitiva');

      http.expectOne(API + '/1/retire').flush({
        ...sombrilla,
        retired: true,
      });

      await fixture.whenStable();

      expect(dialog().open).toBe(false);
    });
  });
});
