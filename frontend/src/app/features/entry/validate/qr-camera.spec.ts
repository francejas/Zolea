import { TestBed } from '@angular/core/testing';
import { QrCamera, toCameraProblem } from './qr-camera';

describe('QrCamera', () => {
  let camera: QrCamera;

  beforeEach(() => {
    camera = TestBed.inject(QrCamera);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sin HTTPS ni localhost no intenta prender la cámara', async () => {
    vi.stubGlobal('isSecureContext', false);

    await expect(camera.start('entry-reader', () => {})).rejects.toBe('insecure');
  });

  it('en un navegador sin cámara dice que no la soporta', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });

    await expect(camera.start('entry-reader', () => {})).rejects.toBe('unsupported');
  });

  it('apagarla sin haberla prendido no falla', async () => {
    await expect(camera.stop()).resolves.toBeUndefined();
  });

  it('traduce los errores de la biblioteca al problema que se le explica al operador', () => {
    const userMedia = (name: string) =>
      `Error getting userMedia, error = ${name}: algo pasó con la cámara`;

    expect(toCameraProblem(userMedia('NotAllowedError'))).toBe('denied');
    expect(toCameraProblem(userMedia('NotFoundError'))).toBe('missing');
    expect(toCameraProblem(userMedia('OverconstrainedError'))).toBe('missing');
    expect(toCameraProblem(userMedia('NotReadableError'))).toBe('busy');
    expect(toCameraProblem('Camera streaming not supported by the browser.')).toBe('unsupported');
    expect(toCameraProblem(new DOMException('Permission denied', 'NotAllowedError'))).toBe(
      'denied',
    );
    expect(toCameraProblem('otra cosa')).toBe('unknown');
  });
});
