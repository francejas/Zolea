import { Routes } from '@angular/router';
import { adminAreaGuard } from './core/auth/admin-area.guard';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { AdminLayout } from './layout/admin-layout/admin-layout';
import { SiteLayout } from './layout/site-layout/site-layout';

/**
 * Las dos rutas padre, cada una con su estructura de página: el panel del administrador y el sitio,
 * para el público y el cliente. Cada feature tiene su archivo de rutas, cargado recién cuando se
 * entra.
 */
export const routes: Routes = [
  // El panel del administrador: los guards del rol van en el padre y cubren todo lo de adentro.
  // `adminAreaGuard` reparte las pantallas: el catálogo es de la cuenta de Zolea y el resto, de
  // cada balneario.
  {
    path: 'admin',
    component: AdminLayout,
    canActivate: [authGuard, roleGuard('ADMIN')],
    canActivateChild: [adminAreaGuard],
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
  // El sitio, público y del cliente. Los guards del cliente van en cada feature, porque acá se
  // mezclan con las rutas públicas.
  {
    path: '',
    component: SiteLayout,
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
      {
        path: 'cancellation-policy',
        loadComponent: () =>
          import('./features/policies/cancellation-policy').then((m) => m.CancellationPolicy),
      },
      // Lo que no es ninguna de las anteriores: la página 404.
      {
        path: '**',
        loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
