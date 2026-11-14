import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Booking, CancellationResponse } from '../../../core/api/booking.models';
import { aBooking, aGuest } from '../booking.fixtures';
import { BookingDetail } from './booking-detail';

const API = `${environment.apiUrl}/api/bookings`;

describe('BookingDetail', () => {
  let fixture: ComponentFixture<BookingDetail>;
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
      imports: [BookingDetail],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BookingDetail);
    page = fixture.nativeElement;
    fixture.componentRef.setInput('id', '47');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  /** Lo que respondería el backend: una confirmada se reintegra entera; una pendiente, nada. */
  function termsFor(booking: Booking): CancellationResponse {
    const paid = booking.status === 'CONFIRMED';
    return {
      canCancel: true,
      refundAmount: paid ? booking.totalPrice : null,
      refundPercent: paid ? 100 : 0,
      reason: null,
    };
  }

  /** Responde la reserva y, si no está cancelada, las condiciones para cancelarla. */
  async function respondWith(
    booking: Booking,
    terms: CancellationResponse = termsFor(booking),
  ): Promise<void> {
    http.expectOne(`${API}/47`).flush(booking);
    await fixture.whenStable();
    if (booking.status !== 'CANCELED') {
      http.expectOne(`${API}/47/cancellation`).flush(terms);
      await fixture.whenStable();
    }
  }

  const plain = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function failWith(status: number): Promise<void> {
    http.expectOne(`${API}/47`).flush({ error: 'x' }, { status, statusText: 'x' });
    await fixture.whenStable();
  }

  function button(text: string): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent!.includes(text),
    );
  }

  function ticketNames(): string[] {
    return Array.from(page.querySelectorAll('.z-ticket__name')).map((n) => n.textContent!.trim());
  }

  it('muestra el balneario, la unidad, los días, el total y el estado', async () => {
    await respondWith(aBooking());

    expect(page.querySelector('h1')!.textContent).toContain('Zolea Club de Playa');
    expect(page.textContent).toContain('Sombrilla A-03');
    expect(page.textContent).toContain('15 → 17 ene · 3 días');
    expect(page.querySelector('.z-total')!.textContent!.replace(/\s/g, ' ')).toContain(
      '$ 36.000,00',
    );
    expect(page.querySelector('.z-status')!.textContent).toContain('Confirmada');
  });

  it('pendiente: ofrece pagar y cancelar, y todavía no hay entradas', async () => {
    await respondWith(aBooking({ status: 'PENDING' }));

    expect(page.querySelector('.z-status')!.textContent).toContain('Pendiente de pago');
    expect(button('Pagar')).toBeDefined();
    expect(button('Cancelar reserva')).toBeDefined();
    expect(ticketNames()).toEqual([]);
  });

  it('confirmada: una entrada por huésped, de a una, y sin pagar', async () => {
    await respondWith(
      aBooking({
        guests: [
          aGuest({ idGuest: 1, fullName: 'Santiago Rodríguez' }),
          aGuest({ idGuest: 2, fullName: 'Lucía Rodríguez', qrToken: 'otro-codigo' }),
        ],
      }),
    );

    expect(ticketNames()).toEqual(['Santiago Rodríguez']);
    expect(page.querySelector('.z-pager')!.textContent).toContain('1 de 2');
    expect(button('Pagar')).toBeUndefined();

    page.querySelector<HTMLButtonElement>('[aria-label="Entrada siguiente"]')!.click();
    await fixture.whenStable();

    expect(ticketNames()).toEqual(['Lucía Rodríguez']);
    expect(page.querySelector('.z-pager')!.textContent).toContain('2 de 2');
  });

  it('con una sola entrada no muestra el paso de una a otra', async () => {
    await respondWith(aBooking());

    expect(ticketNames()).toEqual(['Santiago Rodríguez']);
    expect(page.querySelector('.z-pager')).toBeNull();
  });

  it('cancelada: ni acciones ni entradas, y dice quién la canceló, cuándo y el reintegro', async () => {
    await respondWith(
      aBooking({
        status: 'CANCELED',
        canceledBy: 'CLIENT',
        canceledAt: '2026-01-09T18:30:00',
        refundAmount: 36000,
      }),
    );

    expect(page.querySelector('.z-status')!.textContent).toContain('Cancelada');
    expect(button('Pagar')).toBeUndefined();
    expect(button('Cancelar reserva')).toBeUndefined();
    expect(ticketNames()).toEqual([]);
    expect(plain(page.querySelector('.booking__note'))).toBe(
      'La cancelaste el vie 9 ene a las 18:30. Se reintegraron $ 36.000,00.',
    );
  });

  describe('cancelar', () => {
    const canceled = (refundAmount: number | null) =>
      aBooking({
        status: 'CANCELED',
        canceledBy: 'CLIENT',
        canceledAt: '2026-01-09T18:30:00',
        refundAmount,
      });

    it('una pendiente pide confirmación, sin reintegro, y queda cancelada', async () => {
      await respondWith(aBooking({ status: 'PENDING' }));

      button('Cancelar reserva')!.click();
      await fixture.whenStable();
      const dialog = page.querySelector('dialog')!;
      expect(dialog.hasAttribute('open')).toBe(true);
      expect(plain(dialog)).toContain('No pagaste nada todavía: no hay reintegro.');
      http.expectNone(`${API}/47/cancel`);

      dialog.querySelector<HTMLButtonElement>('z-btn[variant="danger"] button')!.click();
      http.expectOne(`${API}/47/cancel`).flush(canceled(null));
      await fixture.whenStable();

      expect(page.querySelector('.z-status')!.textContent).toContain('Cancelada');
      expect(plain(page.querySelector('.z-alert--success'))).toContain('Cancelamos tu reserva');
      expect(plain(page.querySelector('.z-alert--success'))).not.toContain('reintegrado');
    });

    it('una confirmada que se puede cancelar dice cuánto se devuelve y, al cancelar, el cartel verde', async () => {
      await respondWith(aBooking());

      button('Cancelar reserva')!.click();
      await fixture.whenStable();
      expect(plain(page.querySelector('dialog'))).toContain(
        'Te devolvemos $ 36.000,00, el 100 % de lo que pagaste.',
      );

      page.querySelector<HTMLButtonElement>('dialog z-btn[variant="danger"] button')!.click();
      http.expectOne(`${API}/47/cancel`).flush(canceled(36000));
      await fixture.whenStable();

      const notice = page.querySelector('.z-alert--success');
      expect(plain(notice)).toContain('Tu dinero fue reintegrado: $ 36.000,00.');
      expect(page.querySelector('.z-status')!.textContent).toContain('Cancelada');
      expect(ticketNames()).toEqual([]);
      // El botón ya no está: el foco pasa al cartel.
      expect(document.activeElement?.contains(notice)).toBe(true);
    });

    it('con el 50 %, la confirmación lo dice', async () => {
      await respondWith(aBooking(), {
        canCancel: true,
        refundAmount: 18000,
        refundPercent: 50,
        reason: null,
      });

      button('Cancelar reserva')!.click();
      await fixture.whenStable();

      expect(plain(page.querySelector('dialog'))).toContain(
        'Te devolvemos $ 18.000,00, el 50 % de lo que pagaste, porque falta un día para la entrada.',
      );
    });

    it('una confirmada que ya empezó no tiene el botón y dice por qué', async () => {
      await respondWith(aBooking(), {
        canCancel: false,
        refundAmount: null,
        refundPercent: null,
        reason: 'Tu estadía ya empezó: no se puede cancelar.',
      });

      expect(button('Cancelar reserva')).toBeUndefined();
      expect(page.textContent).toContain('Tu estadía ya empezó: no se puede cancelar.');
    });

    it('si no se pueden traer las condiciones, una confirmada no ofrece cancelar', async () => {
      http.expectOne(`${API}/47`).flush(aBooking());
      await fixture.whenStable();
      http
        .expectOne(`${API}/47/cancellation`)
        .flush({ error: 'x' }, { status: 500, statusText: 'Error' });
      await fixture.whenStable();

      expect(button('Cancelar reserva')).toBeUndefined();
      expect(ticketNames()).toEqual(['Santiago Rodríguez']);
    });

    it('si el backend no la deja cancelar, lo dice arriba de las acciones', async () => {
      await respondWith(aBooking());

      button('Cancelar reserva')!.click();
      await fixture.whenStable();
      page.querySelector<HTMLButtonElement>('dialog z-btn[variant="danger"] button')!.click();
      http
        .expectOne(`${API}/47/cancel`)
        .flush(
          { error: 'Tu estadía ya empezó: no se puede cancelar.' },
          { status: 400, statusText: 'Bad Request' },
        );
      await fixture.whenStable();

      expect(page.querySelector('dialog')!.hasAttribute('open')).toBe(false);
      expect(plain(page.querySelector('.z-alert--danger'))).toContain('Tu estadía ya empezó');
    });
  });

  it('pagar pide una dirección nueva y lleva a MercadoPago', async () => {
    await respondWith(aBooking({ status: 'PENDING' }));
    const redirect = vi
      .spyOn(fixture.componentInstance as unknown as { redirect(url: string): void }, 'redirect')
      .mockImplementation(() => {});

    button('Pagar')!.click();
    const request = http.expectOne(`${API}/47/pay`);
    expect(request.request.method).toBe('POST');
    request.flush({ paymentUrl: 'https://mercadopago.example/checkout' });

    expect(redirect).toHaveBeenCalledWith('https://mercadopago.example/checkout');
  });

  it('si la reserva es de otra persona, avisa en la misma página', async () => {
    await failWith(403);

    expect(page.querySelector('.z-alert--forbidden')!.textContent).toContain(
      'Esta reserva no es tuya',
    );
  });

  it('si la reserva no existe, lo dice', async () => {
    await failWith(404);

    expect(page.textContent).toContain('No encontramos esta reserva');
  });
});
