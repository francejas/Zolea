import { Component, computed, input, linkedSignal } from '@angular/core';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';

/** Lo que tiene que correrse el dedo, en píxeles, para pasar de foto. */
const SWIPE_MIN = 40;

/**
 * Las fotos de un balneario, de a una (GH-67). Se pasan con las flechas, con los puntos de abajo,
 * deslizando el dedo o con las flechas del teclado sobre la foto, y siempre dice cuál es
 * («Foto 2 de 6»). Del final vuelve a la primera, y de la primera a la última.
 *
 * Con una sola foto no hay nada que pasar: se ve la foto, sin controles. Sin fotos no dibuja nada;
 * la pantalla decide qué mostrar en su lugar.
 *
 * La proporción la pone quien lo usa, con `--z-carousel-ratio` (por defecto, 16 / 10).
 */
@Component({
  selector: 'z-carousel',
  imports: [LucideChevronLeft, LucideChevronRight],
  templateUrl: './z-carousel.html',
  styleUrl: './z-carousel.scss',
})
export class ZCarousel {
  /** Las direcciones de las fotos, en orden. */
  readonly photos = input.required<readonly string[]>();
  /** Qué fotos son, para el lector de pantalla: «Fotos de Arena Dorada». */
  readonly label = input.required<string>();

  /** La foto que se ve. Vuelve a la primera si cambian las fotos. */
  protected readonly index = linkedSignal({ source: this.photos, computation: () => 0 });
  protected readonly count = computed(() => this.photos().length);
  protected readonly position = computed(() => `Foto ${this.index() + 1} de ${this.count()}`);

  /** Dónde apoyó el dedo, mientras desliza. */
  private swipeStart: number | null = null;

  protected go(index: number): void {
    const count = this.count();
    if (count === 0) return;
    this.index.set((index + count) % count);
  }

  protected previous(): void {
    this.go(this.index() - 1);
  }

  protected next(): void {
    this.go(this.index() + 1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const moves: Record<string, () => void> = {
      ArrowLeft: () => this.previous(),
      ArrowRight: () => this.next(),
      Home: () => this.go(0),
      End: () => this.go(this.count() - 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
  }

  // Solo el dedo o el lápiz: con el mouse, arrastrar no es la forma de pasar, y un clic no tiene
  // que convertirse en un deslizamiento.
  protected onPointerDown(event: PointerEvent): void {
    this.swipeStart = event.pointerType === 'mouse' ? null : event.clientX;
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.swipeStart === null) return;
    const distance = event.clientX - this.swipeStart;
    this.swipeStart = null;
    if (Math.abs(distance) < SWIPE_MIN) return;
    if (distance < 0) this.next();
    else this.previous();
  }

  protected onPointerCancel(): void {
    this.swipeStart = null;
  }
}
