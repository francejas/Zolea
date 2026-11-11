import {
  Component,
  computed,
  ElementRef,
  input,
  model,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { occupiedDays, parseIsoDate, toIsoDate, todayIso } from '../utils/days';

type Field = 'from' | 'to';

interface CalendarDay {
  iso: string;
  day: number;
  past: boolean;
  today: boolean;
  start: boolean;
  end: boolean;
  inRange: boolean;
  /** «viernes 15 de enero de 2027», para el lector de pantalla. */
  label: string;
}

const WEEKDAYS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];

const shortDate = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const longDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long' });

let nextId = 0;

/**
 * El selector de fechas de entrada y salida, como en Zolea-docs/diseno (Rango de fechas). Los dos
 * extremos se cobran: del 15 al 17 son tres días, y el resumen lo dice. La semana empieza el lunes,
 * los días pasados no se eligen y elegir la entrada pasa solo a la salida.
 *
 * Las fechas son `YYYY-MM-DD`. Se enlazan con `[(from)]` y `[(to)]`.
 */
@Component({
  selector: 'z-date-range',
  imports: [LucideChevronLeft, LucideChevronRight],
  templateUrl: './z-date-range.html',
  styleUrl: './z-date-range.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'z-date-range', '(keydown.escape)': 'close()' },
})
export class ZDateRange {
  /** La entrada, o null si todavía no se eligió. */
  from = model<string | null>(null);
  /** La salida, o null si todavía no se eligió. */
  to = model<string | null>(null);
  /** El primer día que se puede elegir: por defecto, hoy. */
  min = input<string>(todayIso());
  /** Si muestra debajo cuántos días son y que se cobran los dos extremos. */
  summary = input(true);

  protected readonly id = `z-range-${nextId++}`;
  protected readonly weekdays = WEEKDAYS;
  protected readonly open = signal<Field | null>(null);

  private readonly view = signal<{ year: number; month: number } | null>(null);
  private readonly fromButton = viewChild<ElementRef<HTMLButtonElement>>('fromButton');
  private readonly toButton = viewChild<ElementRef<HTMLButtonElement>>('toButton');

  /** El mes que se está mirando: el que se abrió, o el de la entrada, o el de hoy. */
  private readonly shown = computed(() => {
    const view = this.view();
    if (view) return view;
    const base = parseIsoDate(this.from() ?? this.min());
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  protected readonly fromLabel = computed(() => this.fieldLabel(this.from()));
  protected readonly toLabel = computed(() => this.fieldLabel(this.to()));
  protected readonly monthLabel = computed(() => {
    const { year, month } = this.shown();
    return `${monthName.format(new Date(year, month, 1))} ${year}`;
  });

  /** Los huecos antes del día 1: la semana empieza el lunes. */
  protected readonly leadingBlanks = computed(() => {
    const { year, month } = this.shown();
    return Array.from({ length: (new Date(year, month, 1).getDay() + 6) % 7 });
  });

  protected readonly days = computed<CalendarDay[]>(() => {
    const { year, month } = this.shown();
    const from = this.from();
    const to = this.to();
    const min = this.min();
    const today = todayIso();
    const count = new Date(year, month + 1, 0).getDate();

    return Array.from({ length: count }, (_, index) => {
      const date = new Date(year, month, index + 1);
      const iso = toIsoDate(date);
      return {
        iso,
        day: index + 1,
        past: iso < min,
        today: iso === today,
        start: iso === from,
        end: iso === to,
        inRange: from !== null && to !== null && iso > from && iso < to,
        label: fullDate.format(date),
      };
    });
  });

  protected readonly canGoBack = computed(() => {
    const { year, month } = this.shown();
    const first = parseIsoDate(this.min());
    return year > first.getFullYear() || (year === first.getFullYear() && month > first.getMonth());
  });

  protected readonly nights = computed(() => {
    const from = this.from();
    const to = this.to();
    return from && to ? occupiedDays(from, to) : 0;
  });

  /** «3 días» y la aclaración de que se cobran la entrada y la salida. */
  protected readonly summaryTitle = computed(() =>
    this.nights() === 1 ? '1 día' : `${this.nights()} días`,
  );
  protected readonly summaryText = computed(() => {
    const from = this.from();
    const to = this.to();
    if (!from || !to) return '';
    if (from === to) {
      return `Entrás y te vas el ${longDate.format(parseIsoDate(from))}: se cobra ese día.`;
    }
    return `Entrás el ${longDate.format(parseIsoDate(from))} y te vas el ${longDate.format(parseIsoDate(to))}: se cobran los dos.`;
  });

  /** Abre el calendario para ese campo; tocar el que ya está abierto lo cierra. */
  protected toggle(field: Field): void {
    if (this.open() === field) {
      this.open.set(null);
      return;
    }
    this.open.set(field);
    this.view.set(null);
  }

  protected close(): void {
    const field = this.open();
    if (field === null) return;
    this.open.set(null);
    this.focusField(field);
  }

  protected shiftMonth(by: number): void {
    const { year, month } = this.shown();
    const next = new Date(year, month + by, 1);
    this.view.set({ year: next.getFullYear(), month: next.getMonth() });
  }

  /**
   * Elegir la entrada pasa solo a la salida. Elegir una salida anterior a la entrada empieza de
   * nuevo desde esa fecha. Elegir la salida cierra el calendario.
   */
  protected pick(day: CalendarDay): void {
    if (day.past) return;

    const from = this.from();
    if (this.open() === 'from' || from === null || day.iso < from) {
      this.from.set(day.iso);
      const to = this.to();
      if (to !== null && to < day.iso) this.to.set(null);
      this.open.set('to');
      this.view.set(null);
      return;
    }

    this.to.set(day.iso);
    this.open.set(null);
    this.focusField('to');
  }

  private fieldLabel(iso: string | null): string {
    return iso === null ? 'Elegí fecha' : shortDate.format(parseIsoDate(iso)).replace(/[.,]/g, '');
  }

  private focusField(field: Field): void {
    queueMicrotask(() =>
      (field === 'from' ? this.fromButton() : this.toButton())?.nativeElement.focus(),
    );
  }
}
