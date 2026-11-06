import { Routes } from '@angular/router';
import { PlaceholderPage } from '../../core/placeholder-page';
import { authGuard } from '../../core/auth/auth.guard';
import { roleGuard } from '../../core/auth/role.guard';

export const authRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
  { path: 'register', component: PlaceholderPage, data: { title: 'Crear cuenta' } },
  {
    path: 'profile',
    canActivate: [authGuard, roleGuard('USER')],
    component: PlaceholderPage,
    data: { title: 'Mi cuenta' },
  },
];
