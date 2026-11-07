import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
import { roleGuard } from '../../core/auth/role.guard';
import { PlaceholderPage } from '../../core/placeholder-page';

/** Todo lo de esta feature es del cliente */
export const bookingsRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, roleGuard('USER')],
    children: [
      { path: 'dashboard', component: PlaceholderPage, data: { title: 'Inicio' } },
      { path: 'book/:resortId', loadComponent: () => import('./book/book').then((m) => m.Book) },
      { path: 'my-bookings', component: PlaceholderPage, data: { title: 'Mis reservas' } },
      {
        path: 'bookings/:id',
        loadComponent: () => import('./booking-detail/booking-detail').then((m) => m.BookingDetail),
      },
      { path: 'payment/success', component: PlaceholderPage, data: { title: 'Pago confirmado' } },
      { path: 'payment/pending', component: PlaceholderPage, data: { title: 'Pago pendiente' } },
      { path: 'payment/failure', component: PlaceholderPage, data: { title: 'Pago rechazado' } },
    ],
  },
];
