import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
import { roleGuard } from '../../core/auth/role.guard';

/** Todo lo de esta feature es del cliente */
export const bookingsRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, roleGuard('USER')],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard').then((m) => m.ClientDashboard),
      },
      { path: 'book/:resortId', loadComponent: () => import('./book/book').then((m) => m.Book) },
      {
        path: 'my-bookings',
        loadComponent: () => import('./my-bookings/my-bookings').then((m) => m.MyBookings),
      },
      {
        path: 'bookings/:id',
        loadComponent: () => import('./booking-detail/booking-detail').then((m) => m.BookingDetail),
      },
      {
        path: 'payment/success',
        loadComponent: () =>
          import('../payment-result/payment-success/payment-success').then((m) => m.PaymentSuccess),
      },
      {
        path: 'payment/pending',
        loadComponent: () =>
          import('../payment-result/payment-pending/payment-pending').then((m) => m.PaymentPending),
      },
      {
        path: 'payment/failure',
        loadComponent: () =>
          import('../payment-result/payment-failure/payment-failure').then((m) => m.PaymentFailure),
      },
    ],
  },
];
