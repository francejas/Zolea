import { Routes } from '@angular/router';
import { PlaceholderPage } from '../../core/placeholder-page';

/** Los guards de rol están en la ruta padre `admin` de `app.routes.ts`. */
export const adminRoutes: Routes = [
  { path: '', component: PlaceholderPage, data: { title: 'Panel' } },
  { path: 'resort', component: PlaceholderPage, data: { title: 'Mi balneario' } },
  { path: 'units', component: PlaceholderPage, data: { title: 'Unidades' } },
  { path: 'amenities', component: PlaceholderPage, data: { title: 'Catálogo de servicios' } },
  { path: 'bookings', component: PlaceholderPage, data: { title: 'Reservas' } },
  { path: 'bookings/:id', component: PlaceholderPage, data: { title: 'Detalle de reserva' } },
  { path: 'clients', component: PlaceholderPage, data: { title: 'Mis clientes' } },
  { path: 'walkin', component: PlaceholderPage, data: { title: 'Reserva en mostrador' } },
];
