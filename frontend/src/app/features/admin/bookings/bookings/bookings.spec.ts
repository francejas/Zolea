import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { aBooking } from '../../../bookings/booking.fixtures';
import { Bookings } from './bookings';

const API = `${environment.apiUrl}/api/bookings`;

describe('Bookings', () => {
  let fixture: ComponentFixture<Bookings>;
  let http: HttpTestingController;
  let page: HTMLElement;

  // Hoy es el 20 de enero de 2026.
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 20, 12));
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };

    await TestBed.configureTestingModule({
      imports: [Bookings],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(Bookings);
    page = fixture.nativeElement;
    await fixture.whenStable();
    http
      .expectOne(API)
      .flush([
        aBooking({ id: 1, startDate: '2026-01-10', endDate: '2026-01-12' }),
        aBooking({ id: 2, startDate: '2026-01-19', endDate: '2026-01-22' }),
        aBooking({ id: 3, startDate: '2026-01-10', endDate: '2026-01-12', status: 'PENDING' }),
      ]);
    await fixture.whenStable();
  });

  afterEach(() => vi.useRealTimers());

  const cancelOf = (id: number) => {
    const row = Array.from(page.querySelectorAll('tbody tr')).find((tr) =>
      tr.querySelector(`a[href="/admin/bookings/${id}"]`),
    )!;
    return Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent!.trim() === 'Cancelar',
    );
  };

  it('una estadía confirmada que ya terminó no se puede cancelar: la fila no tiene el botón', () => {
    expect(cancelOf(1)).toBeUndefined();
  });

  it('una estadía en curso o una pendiente sí se cancelan, con un botón de texto rojo', () => {
    expect(cancelOf(2)!.disabled).toBe(false);
    expect(cancelOf(3)!.disabled).toBe(false);
    expect(cancelOf(2)!.classList).toContain('z-btn--danger-text');
  });

  it('la tabla no tiene botones rojos rellenos: el relleno queda para la confirmación', async () => {
    expect(page.querySelector('table .z-btn--danger')).toBeNull();

    cancelOf(2)!.click();
    await fixture.whenStable();

    const dialog = page.querySelector('dialog')!;
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent!.includes('Cancelar reserva'),
    )!;
    expect(confirm.classList).toContain('z-btn--danger');
  });

  it('el estado se elige entre opciones a la vista, sin desplegable', async () => {
    expect(page.querySelector('select')).toBeNull();
    const options = Array.from(page.querySelectorAll<HTMLInputElement>('.bookings__status input'));
    expect(options.map((o) => o.closest('label')!.textContent!.trim())).toEqual([
      'Todas',
      'Pendientes de pago',
      'Confirmadas',
      'Canceladas',
    ]);

    options[1].click();
    await fixture.whenStable();

    expect(page.querySelector('.bookings__summary')!.textContent).toContain('1 de 3 reservas');
  });

  it('las fechas usan el selector de la app, no el del navegador', () => {
    expect(page.querySelector('input[type="date"]')).toBeNull();
    expect(page.querySelector('.bookings__dates z-date-range')).not.toBeNull();
  });
});
