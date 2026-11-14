import { Component, computed, ElementRef, inject, input, ViewEncapsulation } from '@angular/core';
import { LucideDownload } from '@lucide/angular';
import { QRCodeComponent } from 'angularx-qrcode';
import { Booking, GuestSummary } from '../../core/api/booking.models';
import { ZBtn } from '../z-btn/z-btn';
import { bookingNumber, dayRange, formatDni, unitLabel } from '../utils/format';

/**
 * La entrada de una persona: el QR que se muestra en la puerta, con su nombre, la unidad y los días.
 * La usan el Detalle de la reserva y la Vuelta del pago. Lo que se proyecta adentro va al pie, al
 * lado de «Descargar»: ahí el Detalle pone el paso de una entrada a otra.
 */
@Component({
  selector: 'app-guest-qr',
  imports: [LucideDownload, QRCodeComponent, ZBtn],
  templateUrl: './guest-qr.html',
  styleUrl: './guest-qr.scss',
  // El SVG del QR lo dibuja el componente de la librería: con el encapsulado de siempre, la regla
  // de .z-ticket__qr no lo alcanzaría. Las clases llevan el prefijo z-, así que no chocan.
  encapsulation: ViewEncapsulation.None,
})
export class GuestQr {
  private host: HTMLElement = inject(ElementRef).nativeElement;

  guest = input.required<GuestSummary>();
  booking = input.required<Booking>();

  protected unit = computed(() =>
    unitLabel(this.booking().rentalUnitType, this.booking().rentalUnitIdentifier),
  );
  protected days = computed(() => dayRange(this.booking().startDate, this.booking().endDate));
  protected number = computed(() => bookingNumber(this.booking().id));
  protected dni = computed(() => {
    const dni = this.guest().dni;
    return dni ? formatDni(dni) : null;
  });

  // La librería pide los colores en hexadecimal. Salen de los tokens: tinta sobre espuma, como pide
  // el sistema de diseño. Sin tokens cargados (en las pruebas) quedan los de la librería.
  protected readonly ink = tokenColor('--color-ink', '#000000ff');
  protected readonly foam = tokenColor('--color-foam', '#ffffffff');

  /** Guarda la entrada como imagen: el QR, el nombre, la unidad y los días, como la pide el diseño. */
  protected async download(): Promise<void> {
    const svg = this.host.querySelector('.z-ticket__qr svg');
    if (!svg) return;

    const source = new XMLSerializer().serializeToString(svg);
    const qr = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`);

    const width = 360;
    const height = 470;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(scale, scale);

    context.fillStyle = this.foam;
    context.fillRect(0, 0, width, height);
    context.drawImage(qr, 50, 32, 260, 260);

    context.textAlign = 'center';
    context.fillStyle = this.ink;
    fitText(
      context,
      this.guest().fullName,
      '400 28px "Young Serif", Georgia, serif',
      width / 2,
      340,
    );
    context.font = '600 16px "Hanken Grotesk", system-ui, sans-serif';
    context.fillText(`${this.unit()} · ${this.days()}`, width / 2, 378);
    context.fillStyle = tokenColor('--color-ink-soft', this.ink);
    fitText(
      context,
      `${this.booking().resortName} · Reserva ${this.number()}`,
      '400 14px "Hanken Grotesk", system-ui, sans-serif',
      width / 2,
      410,
    );

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `entrada-${slug(this.guest().fullName)}.png`;
    link.click();
  }
}

function tokenColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** Escribe el texto centrado y, si no entra en el ancho, achica la letra hasta que entre. */
function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
  x: number,
  y: number,
): void {
  const maxWidth = x * 2 - 40;
  let size = Number(font.match(/(\d+)px/)![1]);
  context.font = font;
  while (context.measureText(text).width > maxWidth && size > 12) {
    size -= 1;
    context.font = font.replace(/\d+px/, `${size}px`);
  }
  context.fillText(text, x, y);
}

/** «Valentina García» → «valentina-garcia», para el nombre del archivo. */
function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
