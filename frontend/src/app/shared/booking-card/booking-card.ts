import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideCalendarDays,
  LucidePencil,
  LucideStar,
  LucideTent,
  LucideUmbrella,
} from '@lucide/angular';
import { Booking } from '../../core/api/booking.models';
import type { BookingCardNotice } from './booking-payment-notice';
import { ZAlert } from '../z-alert/z-alert';
import { ZBtn } from '../z-btn/z-btn';

@Component({
  selector: 'app-booking-card',
  imports: [
    RouterLink,
    LucideCalendarDays,
    LucidePencil,
    LucideStar,
    LucideTent,
    LucideUmbrella,
    ZAlert,
    ZBtn,
  ],
  templateUrl: './booking-card.html',
  styleUrl: './booking-card.scss',
})
export class BookingCard {
  booking = input.required<Booking>();
  status = input.required<{ label: string; modifier: string }>();
  unit = input.required<string>();
  days = input.required<string>();
  total = input.required<string>();
  heading = input<'h2' | 'h3'>('h2');
  today = input(false);
  notice = input<BookingCardNotice | null>(null);
  refund = input<string | null>(null);
  paymentError = input<string | null>(null);
  rebook = input(false);
  canReview = input(false);
  reviewed = input<string | null>(null);
  /** Ya la calificó: puede cambiar las estrellas o el comentario. */
  canEditReview = input(false);
  detailsLabel = input('Ver reserva');
  paying = input(false);
  paymentDisabled = input(false);

  pay = output<void>();
  review = output<void>();
  editReview = output<void>();
}
