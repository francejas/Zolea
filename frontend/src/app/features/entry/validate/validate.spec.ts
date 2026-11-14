import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { Me } from '../../../core/api/auth.models';
import { GuestValidation } from '../../../core/api/entry.models';
import { RentalUnit } from '../../../core/api/resort.models';
import { SessionService } from '../../../core/session/session.service';
import { CameraProblem, QrCamera } from './qr-camera';
import { Validate } from './validate';

const VALIDATE = `${environment.apiUrl}/api/guests/validate`;
const UNITS = `${environment.apiUrl}/api/rental-units`;

const admin: Me = {
  idClient: 2,
  firstName: 'Admin',
  lastName: 'Mar del Plata',
  email: 'admin.mdp@zolea.com',
  role: 'ADMIN',
  idManagedResort: 1,
};

const TOKEN = 'tok-00004-A3-VAL1';

const valentina: GuestValidation = {
  idGuest: 4,
  fullName: 'Valentina García',
  rentalUnitIdentifier: 'A-03',
  message: '¡Acceso Permitido! Dirigirse a la unidad: A-03',
};

const units: RentalUnit[] = [
  {
    idRentalUnit: 3,
    type: 'UMBRELLA',
    identifier: 'A-03',
    dailyPrice: 8500,
    isBlocked: false,
    retired: false,
    resortId: 1,
  },
  {
    idRentalUnit: 9,
    type: 'TENT',
    identifier: 'C-01',
    dailyPrice: 15000,
    isBlocked: false,
    retired: false,
    resortId: 1,
  },
];

const ALREADY_USED = 'ALERTA: Este código ya registró su ingreso al balneario.';

/** La cámara de mentira: `read()` hace de cuenta que leyó un QR. */
class FakeCamera {
  private onCode: ((text: string) => void) | null = null;
  /** El problema con el que va a fallar el próximo `start()`, si hay. */
  failWith: CameraProblem | null = null;

  start = vi.fn(async (_elementId: string, onCode: (text: string) => void) => {
    if (this.failWith) throw this.failWith;
    this.onCode = onCode;
    return true;
  });

  stop = vi.fn(async () => {
    this.onCode = null;
  });

  get on(): boolean {
    return this.onCode !== null;
  }

  read(text: string): void {
    this.onCode?.(text);
  }
}

describe('Validate', () => {
  let fixture: ComponentFixture<Validate>;
  let http: HttpTestingController;
  let camera: FakeCamera;
  let page: HTMLElement;
  const user = signal<Me | null>(admin);

  beforeEach(async () => {
    user.set(admin);
    camera = new FakeCamera();

    await TestBed.configureTestingModule({
      imports: [Validate],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { user } },
        { provide: QrCamera, useValue: camera },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Validate);
    page = fixture.nativeElement;
    await settle();
  });

  afterEach(() => http.verify());

  /** Deja correr los pedidos y los `afterNextRender`, y vuelve a dibujar. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    await fixture.whenStable();
  }

  async function withUnits(list: RentalUnit[] = units): Promise<void> {
    http.expectOne(UNITS).flush(list);
    await settle();
  }

  const text = (element: Element | null) => element?.textContent!.replace(/\s+/g, ' ').trim();
  const verdict = () => text(page.querySelector('.z-scan-result__verdict'));
  const resultName = () => text(page.querySelector('.z-scan-result__name'));
  const resultDetail = () => text(page.querySelector('.z-scan-result__detail'));
  const selectedTab = () => text(page.querySelector('[role="tab"][aria-selected="true"]'));
  const errorOf = (inputId: string) =>
    text(page.querySelector(`#${inputId}`)!.closest('z-field')!.querySelector('.z-field__error')) ??
    null;

  function button(label: string): HTMLButtonElement {
    const found = Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      text(b)!.includes(label),
    );
    if (!found) throw new Error(`No hay un botón «${label}»`);
    return found;
  }

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  async function goTo(tab: 'Cámara' | 'Código' | 'DNI'): Promise<void> {
    button(tab).click();
    await settle();
  }

  async function answer(url: string, body: object, status = 200): Promise<void> {
    const req = http.expectOne(url);
    expect(req.request.method).toBe('POST');
    req.flush(body, { status, statusText: status === 200 ? 'OK' : 'Error' });
    await settle();
  }

  describe('con la cámara', () => {
    it('abre en la cámara, ya prendida, y pide las unidades del balneario', async () => {
      await withUnits();

      expect(selectedTab()).toBe('Cámara');
      expect(camera.start).toHaveBeenCalledWith('entry-reader', expect.any(Function));
      expect(page.querySelector('#entry-reader')).not.toBeNull();
      expect(text(page.querySelector('.z-scanner__hint'))).toBe('Apuntá al QR de la entrada');
    });

    it('un QR válido sale verde con el nombre y la unidad, y apaga la cámara', async () => {
      await withUnits();

      camera.read(TOKEN);
      await settle();
      expect(camera.stop).toHaveBeenCalled();
      expect(text(page.querySelector('.z-scanner__hint'))).toBe('Validando la entrada…');

      await answer(`${VALIDATE}/${TOKEN}`, valentina);

      const result = page.querySelector('.z-scan-result')!;
      expect(result.classList).toContain('z-scan-result--ok');
      expect(result.getAttribute('role')).toBe('status');
      expect(verdict()).toBe('Puede pasar');
      expect(resultName()).toBe('Valentina García');
      expect(resultDetail()).toBe('Sombrilla A-03');
      // El foco queda en «Escanear otra»: con Enter se sigue.
      expect(document.activeElement).toBe(button('Escanear otra'));
    });

    it('el mismo QR otra vez sale rojo con el mensaje del backend, tal cual', async () => {
      await withUnits();
      camera.read(TOKEN);
      await settle();
      await answer(`${VALIDATE}/${TOKEN}`, valentina);

      // «Escanear otra» vuelve a la cámara sin recargar la página.
      button('Escanear otra').click();
      await settle();
      expect(camera.start).toHaveBeenCalledTimes(2);
      expect(page.querySelector('.z-scan-result')).toBeNull();
      expect(page.querySelector('#entry-reader')).not.toBeNull();

      camera.read(TOKEN);
      await settle();
      await answer(`${VALIDATE}/${TOKEN}`, { error: ALREADY_USED }, 400);

      const result = page.querySelector('.z-scan-result')!;
      expect(result.classList).toContain('z-scan-result--fail');
      expect(result.getAttribute('role')).toBe('alert');
      expect(verdict()).toBe('No puede pasar');
      expect(resultName()).toBe(ALREADY_USED);
    });

    it('si lee el mismo QR varias veces seguidas, valida una sola vez', async () => {
      await withUnits();

      camera.read(TOKEN);
      camera.read(TOKEN);
      camera.read(TOKEN);
      await settle();

      // `expectOne` falla si hubo más de un pedido.
      await answer(`${VALIDATE}/${TOKEN}`, valentina);
      expect(verdict()).toBe('Puede pasar');
    });

    it('un QR que no es de Zolea sale rojo sin preguntarle al backend', async () => {
      await withUnits();

      camera.read('https://otro.sitio/promo');
      await settle();

      http.expectNone(() => true);
      expect(verdict()).toBe('No puede pasar');
      expect(resultName()).toBe('Este QR no es una entrada de Zolea.');
    });

    it('si la cámara no tiene permiso, lo dice y deja reintentar', async () => {
      camera.failWith = 'denied';
      await goTo('Código');
      await goTo('Cámara');
      await withUnits();

      expect(text(page.querySelector('.entry__camera-problem'))).toContain(
        'No tenemos permiso para usar la cámara',
      );

      camera.failWith = null;
      button('Reintentar').click();
      await settle();
      expect(page.querySelector('.entry__camera-problem')).toBeNull();
      expect(camera.on).toBe(true);
    });

    it('sin HTTPS no ofrece reintentar: no va a andar', async () => {
      camera.failWith = 'insecure';
      await goTo('Código');
      await goTo('Cámara');
      await withUnits();

      expect(text(page.querySelector('.entry__camera-problem'))).toContain(
        'La cámara solo anda con HTTPS o en localhost',
      );
      expect(page.querySelector('.entry__camera-problem button')).toBeNull();
    });

    it('al pasar a otra pestaña apaga la cámara, y al volver la prende', async () => {
      await withUnits();

      await goTo('Código');
      expect(camera.on).toBe(false);
      expect(page.querySelector('#entry-reader')).toBeNull();

      await goTo('Cámara');
      expect(camera.on).toBe(true);
    });

    it('al salir de la pantalla apaga la cámara', async () => {
      await withUnits();
      camera.stop.mockClear();

      fixture.destroy();
      expect(camera.stop).toHaveBeenCalled();
    });
  });

  describe('con el código', () => {
    beforeEach(async () => {
      await withUnits();
      await goTo('Código');
    });

    it('al tocar la pestaña, el foco va al campo', () => {
      expect(document.activeElement).toBe(page.querySelector('#entry-code'));
    });

    it('verde, y después el mismo código sale rojo con el motivo', async () => {
      type('#entry-code', `  ${TOKEN} `);
      await submit();
      await answer(`${VALIDATE}/${TOKEN}`, valentina);
      expect(verdict()).toBe('Puede pasar');
      expect(resultDetail()).toBe('Sombrilla A-03');

      button('Validar otro código').click();
      await settle();
      expect(page.querySelector<HTMLInputElement>('#entry-code')!.value).toBe('');
      expect(document.activeElement).toBe(page.querySelector('#entry-code'));

      type('#entry-code', TOKEN);
      await submit();
      await answer(`${VALIDATE}/${TOKEN}`, { error: ALREADY_USED }, 400);
      expect(verdict()).toBe('No puede pasar');
      expect(resultName()).toBe(ALREADY_USED);
    });

    it('un código que no existe sale rojo con el mensaje y qué revisar', async () => {
      type('#entry-code', 'tok-99999');
      await submit();
      await answer(
        `${VALIDATE}/tok-99999`,
        { error: 'El código ingresado no existe o es incorrecto.' },
        404,
      );

      expect(resultName()).toBe('El código ingresado no existe o es incorrecto.');
      expect(resultDetail()).toBe('Revisá que el código esté bien escrito.');
    });

    it('la reserva que no empezó sale roja con la fecha que manda el backend', async () => {
      const message = 'La reserva todavía no comenzó. El ingreso se habilita el 20/01/2027.';
      type('#entry-code', TOKEN);
      await submit();
      await answer(`${VALIDATE}/${TOKEN}`, { error: message }, 400);

      expect(resultName()).toBe(message);
    });

    it('vacío no se manda', async () => {
      await submit();

      http.expectNone(() => true);
      expect(errorOf('entry-code')).toBe('Escribí el código de la entrada.');
    });

    it('con algo que no es un código, no se manda', async () => {
      type('#entry-code', 'tok 00004/A3');
      await submit();

      http.expectNone(() => true);
      expect(errorOf('entry-code')).toBe('El código lleva solo letras, números y guiones.');
    });

    it('una entrada de otro balneario sale roja, aunque el backend no diga por qué', async () => {
      type('#entry-code', TOKEN);
      await submit();
      await answer(
        `${VALIDATE}/${TOKEN}`,
        { error: 'No tenés permiso para realizar esta operación' },
        403,
      );

      expect(verdict()).toBe('No puede pasar');
      expect(resultName()).toBe('Esta entrada es de otro balneario.');
    });

    it('sin conexión no sale rojo: dice que no se sabe y reintenta el mismo código', async () => {
      type('#entry-code', TOKEN);
      await submit();
      http
        .expectOne(`${VALIDATE}/${TOKEN}`)
        .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      await settle();

      expect(page.querySelector('.z-scan-result')).toBeNull();
      expect(text(page.querySelector('.z-problem__title'))).toBe('No sabemos si puede pasar');
      expect(text(page.querySelector('.z-problem__text'))).toBe('No hay conexión con el servidor.');

      button('Reintentar').click();
      await settle();
      await answer(`${VALIDATE}/${TOKEN}`, valentina);
      expect(verdict()).toBe('Puede pasar');
    });

    it('sin conexión, Volver conserva lo escrito', async () => {
      type('#entry-code', TOKEN);
      await submit();
      http
        .expectOne(`${VALIDATE}/${TOKEN}`)
        .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      await settle();

      button('Volver').click();
      await settle();
      expect(page.querySelector<HTMLInputElement>('#entry-code')!.value).toBe(TOKEN);
    });
  });

  describe('con el DNI', () => {
    beforeEach(async () => {
      await withUnits();
      await goTo('DNI');
    });

    it('descarta los puntos y sale verde', async () => {
      type('#entry-dni', '30.123.456');
      await fixture.whenStable();
      expect(page.querySelector<HTMLInputElement>('#entry-dni')!.value).toBe('30123456');

      await submit();
      await answer(`${VALIDATE}/dni/30123456`, { ...valentina, rentalUnitIdentifier: 'C-01' });

      expect(verdict()).toBe('Puede pasar');
      expect(resultName()).toBe('Valentina García');
      expect(resultDetail()).toBe('Carpa C-01');
      expect(text(button('Validar otro DNI'))).toBe('Validar otro DNI');
    });

    it('el DNI que ya entró sale rojo con el mensaje del backend', async () => {
      const message = 'ALERTA: El ingreso para este DNI ya fue registrado.';
      type('#entry-dni', '30123456');
      await submit();
      await answer(`${VALIDATE}/dni/30123456`, { error: message }, 400);

      expect(verdict()).toBe('No puede pasar');
      expect(resultName()).toBe(message);
    });

    it('un DNI sin reserva sale rojo con qué revisar', async () => {
      const message = 'No se encontró una reserva confirmada con el DNI ingresado.';
      type('#entry-dni', '11111111');
      await submit();
      await answer(`${VALIDATE}/dni/11111111`, { error: message }, 404);

      expect(resultName()).toBe(message);
      expect(resultDetail()).toBe('Revisá el número, o validá con el QR de la entrada.');
    });

    it('vacío no se manda', async () => {
      await submit();

      http.expectNone(() => true);
      expect(errorOf('entry-dni')).toBe('Escribí el DNI.');
    });
  });

  describe('las pestañas', () => {
    beforeEach(() => withUnits());

    it('con las flechas se pasa de una a otra y el foco las sigue', async () => {
      const cameraTab = page.querySelector<HTMLButtonElement>('#entry-tab-camera')!;
      cameraTab.focus();
      cameraTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      await settle();
      expect(selectedTab()).toBe('Código');
      expect(document.activeElement?.id).toBe('entry-tab-code');

      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
      await settle();
      expect(selectedTab()).toBe('DNI');

      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      await settle();
      expect(selectedTab()).toBe('Cámara');
    });
  });

  it('si las unidades no llegan, el verde dice «Unidad» y el código', async () => {
    http.expectOne(UNITS).flush(null, { status: 500, statusText: 'Error' });
    await settle();

    camera.read(TOKEN);
    await settle();
    await answer(`${VALIDATE}/${TOKEN}`, valentina);

    expect(resultDetail()).toBe('Unidad A-03');
  });

  it('una cuenta sin balneario asignado no ve rojo: ve que no puede validar', async () => {
    user.set({ ...admin, idManagedResort: null });
    await withUnits([]);

    camera.read(TOKEN);
    await settle();
    await answer(
      `${VALIDATE}/${TOKEN}`,
      { error: 'No tenés permiso para realizar esta operación' },
      403,
    );

    expect(page.querySelector('.z-scan-result')).toBeNull();
    expect(text(page.querySelector('.z-problem__text'))).toBe(
      'Tu cuenta no tiene un balneario asignado, así que no podés validar ingresos.',
    );
  });
});
