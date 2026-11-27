import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { QRCodeComponent } from 'angularx-qrcode';
import { aBooking, aGuest } from '../../features/bookings/booking.fixtures';
import { entryLine, GuestQr } from './guest-qr';

describe('GuestQr', () => {
  let fixture: ComponentFixture<GuestQr>;
  let page: HTMLElement;

  async function render(guest = aGuest(), you = false): Promise<void> {
    await TestBed.configureTestingModule({ imports: [GuestQr] }).compileComponents();
    fixture = TestBed.createComponent(GuestQr);
    page = fixture.nativeElement;
    fixture.componentRef.setInput('booking', aBooking({ guests: [guest] }));
    fixture.componentRef.setInput('guest', guest);
    fixture.componentRef.setInput('you', you);
    await fixture.whenStable();
  }

  function fact(name: string): string {
    const term = Array.from(page.querySelectorAll('dt')).find((dt) => dt.textContent === name);
    return term!.nextElementSibling!.textContent!.trim();
  }

  it('dibuja el QR del huésped, con su nombre y su DNI debajo', async () => {
    await render();

    // El dibujo del SVG es de la librería, y en jsdom no llega a armarlo: se prueba que reciba el
    // código del huésped. Que se vea, se revisa en el navegador.
    const qr = fixture.debugElement.query(By.directive(QRCodeComponent)).componentInstance;
    expect(qr.qrdata).toBe(aGuest().qrToken);
    expect(qr.elementType).toBe('svg');
    expect(page.querySelector('.z-ticket__name')!.textContent).toContain('Santiago Rodríguez');
    expect(page.querySelector('.z-ticket__dni')!.textContent).toContain('DNI 38.456.912');
  });

  it('dice la unidad, los días, el número de la reserva y si ya entró', async () => {
    await render();

    expect(fact('Unidad')).toBe('Sombrilla A-03');
    expect(fact('Días')).toBe('15 → 17 ene');
    expect(fact('Reserva')).toBe('#0047');
    expect(fact('Ingreso')).toBe('Todavía no entró');
  });

  it('si ya entró hoy dice a qué hora', async () => {
    await render(aGuest({ isEntryValidated: true, lastEntryAt: '2026-01-15T10:00:00' }));

    expect(fact('Ingreso')).toBe('Entró hoy a las 10:00');
  });

  it('a quien mira le habla de vos, y si entró otro día dice cuándo', async () => {
    await render(aGuest({ isEntryValidated: false, lastEntryAt: '2026-01-14T18:05:30' }), true);

    expect(fact('Ingreso')).toBe('Entraste el 14/01 a las 18:05');
  });

  it('a quien mira: «Entraste hoy a las…»', () => {
    expect(
      entryLine(aGuest({ isEntryValidated: true, lastEntryAt: '2026-01-15T10:12:00' }), true),
    ).toBe('Entraste hoy a las 10:12');
    expect(entryLine(aGuest({ lastEntryAt: null }), true)).toBe('Todavía no entraste');
  });

  it('sin DNI no muestra la línea del DNI', async () => {
    await render(aGuest({ dni: null }));

    expect(page.querySelector('.z-ticket__dni')).toBeNull();
  });

  it('ofrece descargar la entrada', async () => {
    await render();

    const button = Array.from(page.querySelectorAll('button')).find((b) =>
      b.textContent!.includes('Descargar'),
    );
    expect(button).toBeDefined();
  });
});
