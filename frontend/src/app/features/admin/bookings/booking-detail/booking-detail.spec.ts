import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { PaymentSummary } from '../../../../core/api/booking.models';

import { aBooking, aGuest } from '../../../bookings/booking.fixtures';

import { money as formatMoney } from '../../../bookings/booking-format';

import { AdminBookingDetail } from './booking-detail';

const money = (amount: number) => formatMoney(amount).replace(/\s+/g, ' ');

const API = `${environment.apiUrl}/api/bookings`;

const payment = (overrides: Partial<PaymentSummary> = {}): PaymentSummary => ({
  gatewayPaymentId: '1234567890',
  amount: 36000,
  status: 'approved',
  paidAt: '2026-01-10T10:15:00',
  ...overrides,
});

describe('Detalle de reserva del administrador', () => {
  let fixture: ComponentFixture<AdminBookingDetail>;
  let http: HttpTestingController;
  let page: HTMLElement;

  const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const section = (id: string) => page.querySelector(`section[aria-labelledby="${id}"]`)!;

  const button = (name: string, scope: ParentNode = page) =>
    [...scope.querySelectorAll('button')].find((b) => text(b) === name)!;

  const dialog = () => page.querySelector('dialog')!;

  async function respond(booking = aBooking()) {
    http.expectOne(`${API}/47`).flush(booking);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal ??= function () {
      this.setAttribute('open', '');
    };

    HTMLDialogElement.prototype.close ??= function () {
      this.removeAttribute('open');
    };

    await TestBed.configureTestingModule({
      imports: [AdminBookingDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminBookingDetail);
    fixture.componentRef.setInput('id', '47');
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('muestra carga, datos de estadía y enlace al listado administrativo', async () => {
    expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();

    await respond();

    expect(text(page.querySelector('h1'))).toBe('Zolea Club de Playa');
    expect(text(section('stay-title'))).toContain('Sombrilla A-03');
    expect(text(section('stay-title'))).toContain('15/01/2026');
    expect(text(section('stay-title'))).toContain('17/01/2026');
    expect(text(section('stay-title'))).toContain(money(36000));
    expect(page.querySelector('a')?.getAttribute('href')).toBe('/admin/bookings');
    expect(button('Pagar ahora')).toBeUndefined();
  });

  it('muestra por separado el ingreso del titular y el de cada acompañante', async () => {
    await respond(
      aBooking({
        guests: [
          aGuest({
            fullName: 'Ana Pérez',
            isEntryValidated: true,
          }),
          aGuest({
            idGuest: 2,
            fullName: 'Luis García',
            isEntryValidated: false,
          }),
        ],
      }),
    );

    const rows = section('guests-title').querySelectorAll('tbody tr');

    expect(text(rows[0].querySelectorAll('td')[0])).toBe('Ana Pérez');
    expect(text(rows[0].querySelectorAll('td')[1])).toBe('Titular');
    expect(text(rows[0])).toContain('Ya entró');

    expect(text(rows[1].querySelectorAll('td')[0])).toBe('Luis García');
    expect(text(rows[1].querySelectorAll('td')[1])).toBe('Acompañante');
    expect(text(rows[1])).toContain('Todavía no entró');

    expect(text(section('entry-title'))).toContain('1 de 2');
  });

  it('actualizar refleja un ingreso validado desde otra pantalla', async () => {
    await respond(
      aBooking({
        guests: [aGuest({ isEntryValidated: false })],
      }),
    );

    button('Actualizar').click();
    await fixture.whenStable();

    await respond(
      aBooking({
        guests: [aGuest({ isEntryValidated: true })],
      }),
    );

    expect(text(section('guests-title'))).toContain('Ya entró');
    expect(text(section('entry-title'))).toContain('1 de 1');
  });

  it('muestra todos los cobros, sus operaciones, importes, fechas y estados', async () => {
    await respond(
      aBooking({
        payments: [
          payment(),
          payment({
            gatewayPaymentId: '9876543210',
            amount: 1200.5,
            status: 'rejected',
            paidAt: null,
          }),
        ],
      }),
    );

    const rows = section('payments-title').querySelectorAll('tbody tr');

    expect(rows).toHaveLength(2);

    expect(text(rows[0])).toContain('1234567890');
    expect(text(rows[0])).toContain(money(36000));
    expect(text(rows[0])).toContain('10/01/2026 · 10:15');
    expect(text(rows[0])).toContain('Aprobado');

    expect(text(rows[1])).toContain('9876543210');
    expect(text(rows[1])).toContain(money(1200.5));
    expect(text(rows[1])).toContain('Rechazado');
    expect(text(rows[1])).toContain('Sin fecha informada');
  });

  it('una pendiente sin cobros dice que todavía no se pagó', async () => {
    await respond(
      aBooking({
        status: 'PENDING',
        payments: [],
      }),
    );

    expect(text(section('payments-title'))).toContain('Todavía no se pagó');
    expect(section('payments-title').querySelector('table')).toBeNull();
  });

  it('una reserva de mostrador sin pagos de pasarela muestra el cobro presencial', async () => {
    await respond(
      aBooking({
        idClient: null,
        walkInName: 'Ana Pérez',
        payments: [],
      }),
    );

    expect(text(section('stay-title'))).toContain('Ana Pérez');
    expect(text(section('payments-title'))).toContain('Se cobró en el mostrador');
    expect(text(section('payments-title'))).not.toContain('Todavía no se pagó');
  });

  it('no oculta cobros registrados en una reserva de mostrador', async () => {
    await respond(
      aBooking({
        walkInName: 'Ana Pérez',
        payments: [payment()],
      }),
    );

    expect(section('payments-title').querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('el aviso respeta el reintegro parcial registrado por cancelación del cliente', async () => {
    await respond(
      aBooking({
        status: 'CANCELED',
        canceledBy: 'CLIENT',
        refundAmount: 18000,
        payments: [payment({ amount: 36000 })],
      }),
    );

    const warning = section('payments-title').querySelector('z-alert');

    expect(text(warning)).toContain('Hay que reintegrar a mano ' + money(18000));
    expect(text(warning)).not.toContain(money(36000));
    expect(text(section('entry-title'))).toContain(money(18000));
  });

  it('un reintegro registrado en cero no se reemplaza por los pagos aprobados', async () => {
    await respond(
      aBooking({
        status: 'CANCELED',
        refundAmount: 0,
        payments: [payment({ amount: 36000 })],
      }),
    );

    expect(section('payments-title').querySelector('z-alert')).toBeNull();
    expect(text(section('entry-title'))).toContain(money(0));
  });

  it('una cancelada sin reintegro registrado suma solo los pagos aprobados en el aviso manual', async () => {
    await respond(
      aBooking({
        status: 'CANCELED',
        refundAmount: null,
        payments: [
          payment({ amount: 10.1 }),
          payment({
            gatewayPaymentId: '2',
            amount: 20.2,
            status: 'APPROVED',
          }),
          payment({
            gatewayPaymentId: '3',
            amount: 500,
            status: 'rejected',
          }),
          payment({
            gatewayPaymentId: '4',
            amount: 800,
            status: 'refunded',
          }),
        ],
      }),
    );

    const warning = section('payments-title').querySelector('z-alert');

    expect(text(warning)).toContain('Hay que reintegrar a mano ' + money(30.3));
    expect(button('Cancelar reserva')).toBeUndefined();
  });

  it.each(['CONFIRMED', 'PENDING'] as const)(
    'no pide reintegro manual en una %s',
    async (status) => {
      await respond(
        aBooking({
          status,
          payments: [payment()],
        }),
      );

      expect(section('payments-title').querySelector('z-alert')).toBeNull();
    },
  );

  it('una cancelada sin pagos aprobados ni reintegro registrado no muestra el aviso manual', async () => {
    await respond(
      aBooking({
        status: 'CANCELED',
        refundAmount: null,
        payments: [payment({ status: 'refunded' })],
      }),
    );

    expect(section('payments-title').querySelector('z-alert')).toBeNull();
  });

  it('muestra quién canceló, cuándo y el reintegro simulado, incluido cero', async () => {
    await respond(
      aBooking({
        status: 'CANCELED',
        canceledBy: 'SYSTEM',
        canceledAt: '2026-01-10T10:15:00',
        refundAmount: 0,
      }),
    );

    expect(text(section('entry-title'))).toContain('Cancelada por el sistema');
    expect(text(section('entry-title'))).toContain('10/01/2026 · 10:15');
    expect(text(section('entry-title'))).toContain(money(0));
  });

  it('maneja una lista vacía de personas', async () => {
    await respond(aBooking({ guests: [] }));

    expect(text(section('guests-title'))).toContain('No hay personas registradas');
    expect(text(section('entry-title'))).toContain('0 de 0');
  });

  it.each([403, 404, 500])(
    'maneja el error %s sin mostrar información de otra reserva',
    async (status) => {
      http
        .expectOne(`${API}/47`)
        .flush({ error: 'Error del servidor' }, { status, statusText: 'Error' });

      await fixture.whenStable();

      expect(page.querySelector('table')).toBeNull();

      expect(
        page.querySelector(
          status === 403
            ? 'z-alert[variant="forbidden"]'
            : status === 404
              ? 'z-empty'
              : 'z-problem',
        ),
      ).not.toBeNull();

      if (status === 500) {
        button('Reintentar').click();
        await fixture.whenStable();
        await respond();

        expect(page.querySelector('h1')).not.toBeNull();
      }
    },
  );

  it('al cambiar el id cancela la consulta anterior y carga la nueva', async () => {
    const previous = http.expectOne(`${API}/47`);

    fixture.componentRef.setInput('id', '48');
    await fixture.whenStable();

    expect(previous.cancelled).toBe(true);

    http.expectOne(`${API}/48`).flush(
      aBooking({
        id: 48,
        resortName: 'Reserva nueva',
      }),
    );

    await fixture.whenStable();

    expect(text(page.querySelector('h1'))).toBe('Reserva nueva');
  });

  async function ask(allowed = true) {
    await respond(aBooking({ status: 'PENDING' }));

    button('Cancelar reserva').click();

    http.expectOne(`${API}/47/cancellation`).flush({
      canCancel: allowed,
      refundAmount: null,
      refundPercent: 0,
      reason: allowed ? null : 'La estadía ya terminó.',
    });

    await fixture.whenStable();
  }

  it('volver cierra el diálogo sin enviar PATCH', async () => {
    await ask();

    expect(dialog().hasAttribute('open')).toBe(true);
    http.expectNone(`${API}/47/cancel`);

    button('Volver', dialog()).click();
    await fixture.whenStable();

    expect(dialog().hasAttribute('open')).toBe(false);
    http.expectNone(`${API}/47/cancel`);
  });

  it('confirmar envía un solo PATCH y usa la reserva devuelta por el servidor', async () => {
    await ask();

    button('Confirmar cancelación', dialog()).click();
    button('Confirmar cancelación', dialog()).click();

    const req = http.expectOne(`${API}/47/cancel`);
    expect(req.request.method).toBe('PATCH');

    req.flush(
      aBooking({
        status: 'CANCELED',
        canceledBy: 'ADMIN',
        refundAmount: null,
        payments: [payment()],
      }),
    );

    await fixture.whenStable();

    expect(dialog().hasAttribute('open')).toBe(false);
    expect(text(section('entry-title'))).toContain('el administrador');
    expect(text(section('payments-title'))).toContain('Hay que reintegrar a mano');
    expect(button('Cancelar reserva')).toBeUndefined();
  });

  it('impide confirmar cuando el servidor no permite cancelar', async () => {
    await ask(false);

    expect(button('Confirmar cancelación', dialog()).disabled).toBe(true);

    expect(text(dialog())).toContain('La estadía ya terminó.');

    http.expectNone(`${API}/47/cancel`);
  });

  it('muestra el error de cancelación y conserva los datos', async () => {
    await ask();
    button('Confirmar cancelación', dialog()).click();

    http
      .expectOne(`${API}/47/cancel`)
      .flush({ error: 'No tenés permiso' }, { status: 403, statusText: 'Forbidden' });

    await fixture.whenStable();

    expect(text(dialog())).toContain('No tenés permiso');

    expect(text(page.querySelector('header'))).toContain('Pendiente de pago');

    expect(button('Confirmar cancelación', dialog()).disabled).toBe(false);
  });

  it('permite salir mientras consulta condiciones y no habilita una respuesta vieja', async () => {
    await respond();
    button('Cancelar reserva').click();

    const terms = http.expectOne(`${API}/47/cancellation`);

    await fixture.whenStable();
    button('Volver', dialog()).click();
    await fixture.whenStable();

    expect(terms.cancelled).toBe(true);
    expect(dialog().hasAttribute('open')).toBe(false);
    http.expectNone(`${API}/47/cancel`);
  });

  it('si fallan las condiciones, informa el error y no permite confirmar', async () => {
    await respond();
    button('Cancelar reserva').click();

    http.expectOne(`${API}/47/cancellation`).flush(null, { status: 500, statusText: 'Error' });

    await fixture.whenStable();

    expect(dialog().querySelector('z-alert[variant="danger"]')).not.toBeNull();

    expect(button('Confirmar cancelación', dialog()).disabled).toBe(true);
  });
});
