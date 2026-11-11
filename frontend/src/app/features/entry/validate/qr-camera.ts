import { Injectable } from '@angular/core';
import type { Html5Qrcode } from 'html5-qrcode';

/** Por qué no se pudo prender la cámara. */
export type CameraProblem = 'insecure' | 'unsupported' | 'denied' | 'missing' | 'busy' | 'unknown';

/** Lo que se le dice al operador en cada caso, con lo que puede hacer. */
export const CAMERA_PROBLEM_MESSAGE: Record<CameraProblem, string> = {
  insecure:
    'La cámara solo anda con HTTPS o en localhost. Abrí la página con https://, o validá con el código o el DNI.',
  unsupported: 'Este navegador no puede usar la cámara. Validá con el código o el DNI.',
  denied:
    'No tenemos permiso para usar la cámara. Habilitalo en el navegador, desde el candado de la barra de direcciones, y reintentá.',
  missing: 'No encontramos una cámara en este dispositivo. Validá con el código o el DNI.',
  busy: 'Otra aplicación está usando la cámara. Cerrala y reintentá.',
  unknown: 'No pudimos prender la cámara. Reintentá, o validá con el código o el DNI.',
};

/** Los casos en los que reintentar puede andar: en los otros, el problema es del dispositivo. */
export function canRetry(problem: CameraProblem): boolean {
  return problem === 'denied' || problem === 'busy' || problem === 'unknown';
}

/**
 * La cámara que lee los QR de las entradas, con `html5-qrcode` 2.3.8. Prende la cámara de atrás
 * adentro de un elemento de la página y avisa cada QR que lee. La biblioteca se carga recién al
 * prender la cámara: quien valida por código o por DNI no la descarga.
 *
 * Prender y apagar se pueden pisar (se cambia de pestaña mientras la cámara arranca): cada `start()`
 * es una vuelta nueva, y una vuelta que quedó vieja no deja la cámara prendida.
 */
@Injectable({ providedIn: 'root' })
export class QrCamera {
  private scanner: Html5Qrcode | null = null;
  /** El `start()` de la biblioteca, mientras está en curso. */
  private starting: Promise<unknown> | null = null;
  /** El último apagado: termina cuando la cámara anterior quedó suelta. */
  private releasing: Promise<void> = Promise.resolve();
  private run = 0;

  /**
   * Prende la cámara adentro del elemento con ese id y llama a `onCode` con el texto de cada QR
   * que lee (puede llamarlo varias veces seguidas con el mismo). Devuelve `false` si mientras
   * arrancaba se pidió apagarla. Si no se puede prender, rechaza con un `CameraProblem`.
   */
  async start(elementId: string, onCode: (text: string) => void): Promise<boolean> {
    const run = ++this.run;
    await this.release();
    if (run !== this.run) return false;

    if (!window.isSecureContext) throw 'insecure' satisfies CameraProblem;
    if (!navigator.mediaDevices?.getUserMedia) throw 'unsupported' satisfies CameraProblem;

    const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
    if (run !== this.run) return false;

    const scanner = new Html5Qrcode(elementId, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });
    this.scanner = scanner;
    this.starting = scanner.start(
      { facingMode: 'environment' },
      // Sin `qrbox`: lee el cuadro entero, y el marco que se ve es solo una guía para apuntar.
      { fps: 10, aspectRatio: 1 },
      (text) => onCode(text),
      // Se llama en cada cuadro sin QR: no es un error.
      () => {},
    );

    try {
      await this.starting;
    } catch (error) {
      if (this.scanner === scanner) this.scanner = null;
      if (run !== this.run) return false;
      throw toCameraProblem(error);
    } finally {
      this.starting = null;
    }
    return run === this.run;
  }

  /** Apaga la cámara y suelta el permiso. Se puede llamar aunque no esté prendida. */
  stop(): Promise<void> {
    this.run++;
    return this.release();
  }

  /**
   * Los apagados van en fila: una cámara nueva no arranca hasta que la anterior terminó de
   * soltarse, que en algunos teléfonos es lo que tarda en liberarse.
   */
  private release(): Promise<void> {
    const scanner = this.scanner;
    const starting = this.starting;
    this.scanner = null;
    if (!scanner) return this.releasing;

    this.releasing = this.releasing.then(async () => {
      // Si todavía está arrancando, se espera a que termine para poder apagarla.
      await starting?.catch(() => {});
      try {
        // Saca el video y suelta la cámara.
        await scanner.stop();
      } catch {
        // No llegó a prenderse: no hay nada que apagar.
      }
    });
    return this.releasing;
  }
}

/**
 * La biblioteca rechaza con un texto que trae adentro el nombre del error del navegador
 * («Error getting userMedia, error = NotAllowedError: Permission denied»).
 */
export function toCameraProblem(error: unknown): CameraProblem {
  // Por las dudas, también un error del navegador suelto (un DOMException, que trae `name`).
  const text =
    typeof error === 'object' && error !== null && 'name' in error
      ? `${String(error.name)}: ${'message' in error ? String(error.message) : ''}`
      : String(error);
  if (/NotAllowedError|PermissionDenied|SecurityError/i.test(text)) return 'denied';
  if (/NotFoundError|DevicesNotFound|OverconstrainedError/i.test(text)) return 'missing';
  if (/NotReadableError|TrackStartError|AbortError/i.test(text)) return 'busy';
  if (/not supported/i.test(text)) return 'unsupported';
  return 'unknown';
}
