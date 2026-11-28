import { Routes } from '@angular/router';
import { unsavedPlanGuard } from './units/plan-designer/unsaved-plan.guard';

/**
 * Los guards de rol están en la ruta padre `admin` de `app.routes.ts`. Ahí también se decide quién
 * ve qué: `amenities` y `resorts` son de la cuenta de Zolea y el resto, del administrador de un
 * balneario (`adminAreaGuard`).
 */
export const adminRoutes: Routes = [
  { path: '', loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard) },
  { path: 'resort', loadComponent: () => import('./resort/my-resort').then((m) => m.MyResort) },
  { path: 'units', loadComponent: () => import('./units/units').then((m) => m.Units) },
  {
    path: 'units/plan',
    loadComponent: () => import('./units/plan-designer/plan-designer').then((m) => m.PlanDesigner),
    canDeactivate: [unsavedPlanGuard],
  },
  {
    path: 'amenities',
    loadComponent: () => import('./amenities/amenities').then((m) => m.Amenities),
  },
  {
    path: 'resorts',
    loadComponent: () => import('./zolea-resorts/zolea-resorts').then((m) => m.ZoleaResorts),
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
  {
    path: 'clients',
    loadComponent: () => import('./clients/clients/clients').then((m) => m.Clients),
  },
  { path: 'walkin', loadComponent: () => import('./walkin/walkin').then((m) => m.WalkIn) },
];
