import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { PlaceholderPage } from './core/placeholder-page';

/**
 * Las dos rutas padre, cada una con su estructura de página: el panel del administrador y el sitio,
 * para el público y el cliente. Las rutas hijas y los guards los pone la 8.4 (ZOL-124).
 */
export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('ADMIN')],
    children: [
      {
        path: 'validate',
        loadChildren: () => import('./features/entry/entry.routes').then((m) => m.entryRoutes),
      },
      {
        path: '',
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
      },
    ],
  },
  // El sitio, público y del cliente. La 8.7 le pone la barra superior.
  // Los guards del cliente van en cada feature, porque acá se mezclan con las rutas públicas.
  {
    path: '',
    children: [
      {
        path: '',
        loadChildren: () => import('./features/resorts/resorts.routes').then((m) => m.resortRoutes),
      },
      {
        path: '',
        loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
      },
      {
        path: '',
        loadChildren: () =>
          import('./features/bookings/bookings.routes').then((m) => m.bookingsRoutes),
      },
      { path: '**', component: PlaceholderPage, data: { title: 'No encontramos esta página' } },
    ],
  },
];
