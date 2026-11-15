import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideCalendarDays, LucideStar, LucideTent, LucideUmbrella } from '@lucide/angular';
import { Booking } from '../../core/api/booking.models';
import { ZAlert } from '../z-alert/z-alert';
import { ZBtn } from '../z-btn/z-btn';

export interface BookingCardNotice {
  variant: 'success' | 'warning';
  title: string;
  text: string;
}

@Component({
  selector: 'app-booking-card',
  imports: [RouterLink, LucideCalendarDays, LucideStar, LucideTent, LucideUmbrella, ZAlert, ZBtn],
  templateUrl: './booking-card.html',
  styleUrl: './booking-card.scss',
})
export class BookingCard {
  booking = input.required<Booking>();
  status = input.required<{ label: string; modifier: string }>();
  unit = input.required<string>();
  days = input.required<string>();
  total = input.required<string>();
  today = input(false);
  notice = input<BookingCardNotice | null>(null);
  refund = input<string | null>(null);
  paymentError = input<string | null>(null);
  rebook = input(false);
  canReview = input(false);
  reviewed = input<string | null>(null);
  detailsLabel = input('Ver reserva');
  paying = input(false);
  paymentDisabled = input(false);

  pay = output<void>();
  review = output<void>();
}
