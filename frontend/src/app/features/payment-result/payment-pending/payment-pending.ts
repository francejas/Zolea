import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideClock } from '@lucide/angular';
import { readPendingBooking } from '../pending-booking';

/**
 * Pago pendiente (`/payment/pending`, llega sin id): el pago está en proceso y los QR aparecen
 * cuando se acredite. No pide nada al backend. La reserva se busca con el id que guardó Reservar
 * y, si no está, se manda a Mis reservas.
 */
@Component({
  selector: 'app-payment-pending',
  imports: [RouterLink, LucideClock],
  templateUrl: './payment-pending.html',
  styleUrl: '../payment-result.scss',
})
export class PaymentPending {
  /** El id de la reserva, o `null` si no se guardó (otra pestaña, otro navegador). */
  protected readonly bookingId = readPendingBooking();
}
