import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
  viewChildren,
  ViewEncapsulation,
} from '@angular/core';
import {
  form,
  FormField,
  ReadonlyFieldTree,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import {
  LucideCamera,
  LucideCameraOff,
  LucideCheck,
  LucideHash,
  LucideIdCard,
  LucideScanLine,
  LucideX,
} from '@lucide/angular';
import { catchError, firstValueFrom, of } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { EntryApi } from '../../../core/api/entry.api';
import { UnitType } from '../../../core/api/resort.models';
import { UnitsApi } from '../../../core/api/units.api';
import { toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { unitLabel } from '../../../shared/utils/format';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { CAMERA_PROBLEM_MESSAGE, CameraProblem, canRetry, QrCamera } from './qr-camera';

/** Las tres formas de validar, en el orden de las pestañas. */
export type Mode = 'camera' | 'code' | 'dni';
const MODES: Mode[] = ['camera', 'code', 'dni'];

/** Lo que se ve después de validar. */
export type Outcome =
  /** Verde: entra. */
  | { kind: 'in'; name: string; unit: string }
  /** Rojo: no entra, con el motivo. */
  | { kind: 'out'; reason: string; hint: string | null }
  /** No hubo respuesta: todavía no se sabe si puede pasar. */
  | { kind: 'error'; message: string };

/** El elemento donde html5-qrcode pone el video: el mismo id que en la plantilla. */
const READER_ID = 'entry-reader';

/** Un `qrToken` tiene letras, números y guiones. Un QR con otra cosa no es una entrada de Zolea. */
const TOKEN_SHAPE = /^[A-Za-z0-9-]+$/;

const CODE_EMPTY = 'Escribí el código de la entrada.';
const CODE_SHAPE = 'El código lleva solo letras, números y guiones.';
const DNI_EMPTY = 'Escribí el DNI.';

const NOT_ZOLEA = 'Este QR no es una entrada de Zolea.';
const NOT_ZOLEA_HINT = 'Pedile el QR de la entrada, o buscala por el DNI.';
const OTHER_RESORT = 'Esta entrada es de otro balneario.';
const OTHER_RESORT_HINT = 'Solo se validan las reservas de tu balneario.';
const NO_RESORT = 'Tu cuenta no tiene un balneario asignado, así que no podés validar ingresos.';

/** Qué revisar cuando el backend no encuentra la entrada. */
const NOT_FOUND_HINT: Record<Mode, string> = {
  camera: 'Revisá que sea un QR de Zolea.',
  code: 'Revisá que el código esté bien escrito.',
  dni: 'Revisá el número, o validá con el QR de la entrada.',
};

/** El botón del resultado, que vuelve a validar. */
const AGAIN_LABEL: Record<Mode, string> = {
  camera: 'Escanear otra',
  code: 'Validar otro código',
  dni: 'Validar otro DNI',
};

/**
 * Validar ingreso (13.1): la pantalla que usa el administrador en la entrada, con el teléfono en la
 * mano, para dejar pasar a cada persona. Es del panel, pero se diseña desde el celular.
 *
 * Tres formas de validar: con la cámara, leyendo el QR; escribiendo el código; o con el DNI. El
 * resultado ocupa la pantalla y se lee a un metro: verde con el nombre y la unidad, o rojo con el
 * motivo que escribe el backend, tal cual. «Escanear otra» vuelve a la cámara sin recargar.
 *
 * Validar marca el ingreso. Por eso, cuando el pedido no tuvo respuesta (sin conexión, un error del
 * servidor), no se muestra rojo: se dice que no se sabe y se ofrece reintentar el mismo código.
 */
@Component({
  selector: 'app-validate',
  imports: [
    FormField,
    LucideCamera,
    LucideCameraOff,
    LucideCheck,
    LucideHash,
    LucideIdCard,
    LucideScanLine,
    LucideX,
    ZBtn,
    ZField,
    ZProblem,
  ],
  templateUrl: './validate.html',
  styleUrl: './validate.scss',
  // El video lo agrega html5-qrcode, sin el atributo del encapsulado: con el de siempre, las reglas
  // del lector no lo alcanzarían. Las clases llevan prefijo, así que no chocan con nada.
  encapsulation: ViewEncapsulation.None,
  host: { class: 'entry' },
})
export class Validate {
  private readonly entryApi = inject(EntryApi);
  private readonly unitsApi = inject(UnitsApi);
  private readonly session = inject(SessionService);
  private readonly camera = inject(QrCamera);
  private readonly injector = inject(Injector);

  protected readonly mode = signal<Mode>('camera');
  /** El pedido de validar está en curso. */
  protected readonly checking = signal(false);
  protected readonly outcome = signal<Outcome | null>(null);

  // --- Cámara -----------------------------------------------------------------------------

  protected readonly cameraOn = signal(false);
  protected readonly cameraProblem = signal<CameraProblem | null>(null);
  protected readonly cameraMessage = computed(() => {
    const problem = this.cameraProblem();
    return problem ? CAMERA_PROBLEM_MESSAGE[problem] : '';
  });
  protected readonly canRetryCamera = computed(() => {
    const problem = this.cameraProblem();
    return problem !== null && canRetry(problem);
  });

  /** El texto de abajo del escáner. */
  protected readonly hint = computed(() => {
    if (this.checking()) return 'Validando la entrada…';
    return this.cameraOn() ? 'Apuntá al QR de la entrada' : 'Prendiendo la cámara…';
  });

  protected readonly againLabel = computed(() => AGAIN_LABEL[this.mode()]);

  // --- Código y DNI -----------------------------------------------------------------------

  // Los campos se llaman como en la dirección del pedido.
  private readonly codeDraft = signal({ qrToken: '' });
  protected readonly codeForm = form(this.codeDraft, (path) => {
    required(path.qrToken, { message: CODE_EMPTY });
    validate(path.qrToken, ({ value }) => {
      const code = value().trim();
      // El campo vacío ya lo marca `required`; uno con solo espacios también está vacío.
      if (code === '') return value() === '' ? null : { kind: 'required', message: CODE_EMPTY };
      return TOKEN_SHAPE.test(code) ? null : { kind: 'pattern', message: CODE_SHAPE };
    });
  });

  private readonly dniDraft = signal({ dni: '' });
  protected readonly dniForm = form(this.dniDraft, (path) => {
    required(path.dni, { message: DNI_EMPTY });
  });

  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly dniInput = viewChild<ElementRef<HTMLInputElement>>('dniInput');
  private readonly result = viewChild<ElementRef<HTMLElement>>('result');

  /** El tipo de cada unidad del balneario, por su identificador, para decir «Sombrilla A-03». */
  private readonly unitTypes = signal(new Map<string, UnitType>());

  /** Lo último que se mandó a validar, para reintentarlo si no hubo respuesta. */
  private lastAttempt: { mode: Mode; value: string } | null = null;

  constructor() {
    // El tipo de la unidad es un dato de más: si no llega, el resultado dice «Unidad A-03».
    this.unitsApi
      .list()
      .pipe(catchError(() => of([])))
      .subscribe((units) =>
        this.unitTypes.set(new Map(units.map((unit) => [unit.identifier, unit.type]))),
      );

    // La pantalla abre en la cámara: es lo que se usa con la fila esperando.
    afterNextRender(() => void this.startCamera());
    // Al salir de la pantalla, la cámara se apaga y suelta el permiso.
    inject(DestroyRef).onDestroy(() => void this.camera.stop());
  }

  /** El campo mostró su error: se marca también para el lector de pantalla. */
  protected hasError(field: ReadonlyFieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  // --- Pestañas ---------------------------------------------------------------------------

  /** Con un toque en la pestaña, el foco va al campo: se escribe sin tocar de nuevo. */
  protected selectMode(mode: Mode, focusField = true): void {
    if (mode === this.mode()) return;
    if (this.mode() === 'camera') this.stopCamera();
    this.mode.set(mode);

    this.afterRender(() => {
      if (mode === 'camera') void this.startCamera();
      else if (focusField) this.focusField();
    });
  }

  /** Flechas, Inicio y Fin cambian de pestaña y llevan el foco a la que quedó activa. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const index = MODES.indexOf(this.mode());
    const next =
      event.key === 'ArrowRight'
        ? MODES[(index + 1) % MODES.length]
        : event.key === 'ArrowLeft'
          ? MODES[(index + MODES.length - 1) % MODES.length]
          : event.key === 'Home'
            ? MODES[0]
            : event.key === 'End'
              ? MODES[MODES.length - 1]
              : null;
    if (next === null) return;

    event.preventDefault();
    this.selectMode(next, false);
    this.tabs()[MODES.indexOf(next)]?.nativeElement.focus();
  }

  // --- Cámara -----------------------------------------------------------------------------

  protected async startCamera(): Promise<void> {
    this.cameraProblem.set(null);
    this.cameraOn.set(false);
    try {
      const started = await this.camera.start(READER_ID, (text) => this.onScan(text));
      if (started) this.cameraOn.set(true);
    } catch (problem) {
      // Si mientras arrancaba se cambió de pestaña o ya se leyó un QR, el problema no importa.
      if (this.mode() !== 'camera' || this.checking() || this.outcome()) return;
      this.cameraProblem.set(problem as CameraProblem);
    }
  }

  private stopCamera(): void {
    this.cameraOn.set(false);
    void this.camera.stop();
  }

  /** La biblioteca avisa el mismo QR varias veces seguidas: vale el primero. */
  private onScan(text: string): void {
    if (this.mode() !== 'camera' || this.checking() || this.outcome()) return;
    this.stopCamera();
    void this.check('camera', text.trim());
  }

  // --- Código y DNI -----------------------------------------------------------------------

  protected onCodeSubmit(event: Event): void {
    event.preventDefault();
    void this.submitCode();
  }

  protected onDniSubmit(event: Event): void {
    event.preventDefault();
    void this.submitDni();
  }

  /**
   * El DNI es solo números: lo que no es un dígito (los puntos de «30.123.456») se descarta al
   * escribir o pegar. Se corrige también el valor que muestra el navegador, porque si el modelo no
   * cambia Angular no lo vuelve a escribir.
   */
  protected onlyDigits(event: Event): void {
    const control = event.target as HTMLInputElement;
    const digits = control.value.replace(/\D/g, '');
    if (digits !== control.value) control.value = digits;
    this.dniForm.dni().value.set(digits);
  }

  private async submitCode(): Promise<void> {
    // Mientras el pedido está en curso no se manda otro: el botón también queda deshabilitado.
    if (this.checking()) return;
    await submit(this.codeForm, async () => {
      await this.check('code', this.codeForm().value().qrToken.trim());
      return;
    });
    if (this.hasError(this.codeForm.qrToken)) this.codeInput()?.nativeElement.focus();
  }

  private async submitDni(): Promise<void> {
    if (this.checking()) return;
    await submit(this.dniForm, async () => {
      await this.check('dni', this.dniForm().value().dni);
      return;
    });
    if (this.hasError(this.dniForm.dni)) this.dniInput()?.nativeElement.focus();
  }

  // --- Validar ----------------------------------------------------------------------------

  private async check(mode: Mode, value: string): Promise<void> {
    this.lastAttempt = { mode, value };

    // Un QR que no tiene forma de código no se manda: no es una entrada de Zolea.
    if (mode !== 'dni' && !TOKEN_SHAPE.test(value)) {
      this.show({ kind: 'out', reason: NOT_ZOLEA, hint: NOT_ZOLEA_HINT });
      return;
    }

    this.checking.set(true);
    try {
      const request =
        mode === 'dni' ? this.entryApi.validateDni(value) : this.entryApi.validateQr(value);
      const guest = await firstValueFrom(request);
      this.show({
        kind: 'in',
        name: guest.fullName,
        unit: this.unitName(guest.rentalUnitIdentifier),
      });
    } catch (error) {
      this.show(this.toOutcome(error, mode));
    } finally {
      this.checking.set(false);
    }
  }

  /**
   * El 400 y el 404 son el motivo por el que no entra, escrito por el backend para mostrarse tal
   * cual: ya se usó, no existe, no empezó, venció o no está pagada. El 403 no trae el motivo: con
   * un balneario asignado, es una entrada de otro. Lo demás es que no hubo respuesta.
   */
  private toOutcome(error: unknown, mode: Mode): Outcome {
    if (!(error instanceof HttpErrorResponse)) {
      return { kind: 'error', message: 'Algo salió mal. Probá de nuevo.' };
    }

    const reason = (error.error as ApiError | null)?.error;
    if (error.status === 400 && reason) return { kind: 'out', reason, hint: null };
    if (error.status === 404 && reason) return { kind: 'out', reason, hint: NOT_FOUND_HINT[mode] };
    if (error.status === 403) {
      return this.session.user()?.idManagedResort == null
        ? { kind: 'error', message: NO_RESORT }
        : { kind: 'out', reason: OTHER_RESORT, hint: OTHER_RESORT_HINT };
    }
    return { kind: 'error', message: toUserMessage(error) };
  }

  /** «Sombrilla A-03», o «Unidad A-03» si no se sabe el tipo. */
  private unitName(identifier: string): string {
    const type = this.unitTypes().get(identifier);
    return type ? unitLabel(type, identifier) : `Unidad ${identifier}`;
  }

  private show(outcome: Outcome): void {
    this.outcome.set(outcome);
    // El foco va al primer botón del resultado: con Enter se sigue con la próxima persona.
    this.afterRender(() => this.result()?.nativeElement.querySelector('button')?.focus());
  }

  // --- Después del resultado --------------------------------------------------------------

  /** Vuelve a la forma de validar que se estaba usando, sin recargar la página. */
  protected again(): void {
    // Si no hubo respuesta, lo escrito se conserva para corregirlo o mandarlo de nuevo.
    const answered = this.outcome()?.kind !== 'error';
    this.outcome.set(null);
    this.lastAttempt = null;
    if (answered) {
      this.codeDraft.set({ qrToken: '' });
      this.codeForm().reset();
      this.dniDraft.set({ dni: '' });
      this.dniForm().reset();
    }

    this.afterRender(() => {
      if (this.mode() === 'camera') void this.startCamera();
      else this.focusField();
    });
  }

  /** Manda de nuevo lo último, cuando no hubo respuesta. La cámara sigue apagada mientras tanto. */
  protected retry(): void {
    const attempt = this.lastAttempt;
    if (!attempt || this.checking()) return;
    this.outcome.set(null);
    void this.check(attempt.mode, attempt.value);
  }

  private focusField(): void {
    (this.mode() === 'dni' ? this.dniInput() : this.codeInput())?.nativeElement.focus();
  }

  private afterRender(callback: () => void): void {
    afterNextRender(callback, { injector: this.injector });
  }
}
