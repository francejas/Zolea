import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Booking } from '../../../core/api/booking.models';
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

  async function respondWith(booking: Booking): Promise<void> {
    http.expectOne(`${API}/47`).flush(booking);
    await fixture.whenStable();
  }

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

  it('confirmada: una entrada por huésped, de a una, y sin pagar ni cancelar', async () => {
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
    expect(button('Cancelar reserva')).toBeUndefined();

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

  it('cancelada: ni acciones ni entradas', async () => {
    await respondWith(aBooking({ status: 'CANCELED' }));

    expect(page.querySelector('.z-status')!.textContent).toContain('Cancelada');
    expect(button('Pagar')).toBeUndefined();
    expect(button('Cancelar reserva')).toBeUndefined();
    expect(ticketNames()).toEqual([]);
  });

  it('cancelar pide confirmación y, confirmada, la reserva queda cancelada', async () => {
    await respondWith(aBooking({ status: 'PENDING' }));

    button('Cancelar reserva')!.click();
    await fixture.whenStable();
    const dialog = page.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    http.expectNone(`${API}/47/cancel`);

    dialog.querySelector<HTMLButtonElement>('z-btn[variant="danger"] button')!.click();
    const request = http.expectOne(`${API}/47/cancel`);
    expect(request.request.method).toBe('PATCH');
    request.flush(aBooking({ status: 'CANCELED' }));
    await fixture.whenStable();

    expect(dialog.hasAttribute('open')).toBe(false);
    expect(page.querySelector('.z-status')!.textContent).toContain('Cancelada');
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
