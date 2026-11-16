import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideCalendarX, LucideClock, LucideHouse, LucideInfo } from '@lucide/angular';

/** Un tramo de la política: hasta cuándo se cancela y cuánto se reintegra. */
interface RefundStep {
  when: string;
  detail: string;
  percent: string;
  tone: 'full' | 'half' | 'none';
}

/**
 * La política de cancelación, a la que lleva el pie de página. Repite con palabras la regla del
 * backend (`Booking.refundFor`): la confirmada se reintegra entera hasta dos días antes de la
 * entrada, la mitad el día anterior y desde la entrada ya no se cancela; la pendiente se cancela sin
 * cargo, y si cancela el balneario se reintegra todo. Si la regla cambia allá, cambia acá.
 */
@Component({
  selector: 'app-cancellation-policy',
  imports: [RouterLink, LucideCalendarX, LucideClock, LucideHouse, LucideInfo],
  templateUrl: './cancellation-policy.html',
  styleUrl: './cancellation-policy.scss',
})
export class CancellationPolicy {
  protected readonly steps: readonly RefundStep[] = [
    {
      when: 'Hasta 2 días antes de la entrada',
      detail: 'Cancelás con tiempo: te devolvemos todo lo que pagaste.',
      percent: '100 %',
      tone: 'full',
    },
    {
      when: 'El día anterior a la entrada',
      detail: 'Te devolvemos la mitad del total pagado.',
      percent: '50 %',
      tone: 'half',
    },
    {
      when: 'Desde el día de entrada',
      detail: 'La estadía ya empezó: la reserva no se puede cancelar.',
      percent: 'Sin reintegro',
      tone: 'none',
    },
  ];
}
