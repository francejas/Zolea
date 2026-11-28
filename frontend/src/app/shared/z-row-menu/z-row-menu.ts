import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
  viewChildren,
  ViewEncapsulation,
} from '@angular/core';
import { LucideEllipsis } from '@lucide/angular';

/** Una acción del menú de una fila. `danger` la pinta como destructiva. */
export interface RowAction {
  label: string;
  run: () => void;
  danger?: boolean;
}

let nextId = 0;

/**
 * El menú de acciones de una fila en el celular (GH-79): un botón de 44 px con tres puntos que
 * despliega las acciones. Cerrado, las acciones no están en la página. Elegir una cierra el menú y
 * deja el foco en el botón, así una confirmación que se abra vuelve ahí al cerrarse. Escape, un
 * clic afuera o salir con Tab también lo cierran.
 */
@Component({
  selector: 'z-row-menu',
  imports: [LucideEllipsis],
  styleUrl: './z-row-menu.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'z-row-menu',
    '(keydown.escape)': 'onEscape()',
    '(focusout)': 'onFocusOut($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <button
      #trigger
      class="z-row-menu__trigger"
      type="button"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? listId : null"
      (click)="toggle()"
    >
      <svg lucideEllipsis class="z-icon" aria-hidden="true"></svg>
    </button>

    @if (open()) {
      <ul class="z-row-menu__list" [id]="listId">
        @for (action of actions(); track action.label) {
          <li>
            <button
              #item
              class="z-row-menu__item"
              type="button"
              [class.z-row-menu__item--danger]="action.danger"
              (click)="choose(action)"
            >
              {{ action.label }}
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class ZRowMenu {
  /** El nombre del botón, con la fila: «Acciones de Sombrilla A-01». */
  label = input.required<string>();
  actions = input.required<RowAction[]>();

  protected readonly open = signal(false);
  protected readonly listId = `z-row-menu-${nextId++}`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly items = viewChildren<ElementRef<HTMLButtonElement>>('item');

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    afterNextRender(() => this.items()[0]?.nativeElement.focus(), { injector: this.injector });
  }

  protected choose(action: RowAction): void {
    this.open.set(false);
    this.trigger().nativeElement.focus();
    action.run();
  }

  protected onEscape(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger().nativeElement.focus();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.host.nativeElement.contains(next)) this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
