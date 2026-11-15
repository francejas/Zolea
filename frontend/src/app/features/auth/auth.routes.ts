import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
import { roleGuard } from '../../core/auth/role.guard';

export const authRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./register/register').then((m) => m.Register),
  },
  {
    path: 'profile',
    canActivate: [authGuard, roleGuard('USER')],
    loadComponent: () => import('../profile/profile').then((m) => m.Profile),
  },
];
