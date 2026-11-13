import { Routes } from '@angular/router';
import { PlaceholderPage } from '../../core/placeholder-page';

/** Los guards de rol están en la ruta padre `admin` de `app.routes.ts`. */
export const adminRoutes: Routes = [
  { path: '', loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard) },
  { path: 'resort', component: PlaceholderPage, data: { title: 'Mi balneario' } },
  { path: 'units', loadComponent: () => import('./units/units').then((m) => m.Units) },
  {
    path: 'amenities',
    loadComponent: () => import('./amenities/amenities').then((m) => m.Amenities),
  },
  {
    path: 'bookings',
    loadComponent: () => import('./bookings/bookings/bookings').then((m) => m.Bookings),
  },
  {
    path: 'bookings/:id',
    loadComponent: () =>
      import('./bookings/booking-detail/booking-detail').then((m) => m.AdminBookingDetail),
  },
  { path: 'clients', component: PlaceholderPage, data: { title: 'Mis clientes' } },
  { path: 'walkin', component: PlaceholderPage, data: { title: 'Reserva en mostrador' } },
];
