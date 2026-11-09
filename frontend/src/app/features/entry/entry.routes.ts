import { Routes } from '@angular/router';

/** Se monta en `/admin/validate`; los guards de rol están en la ruta padre `admin`. */
export const entryRoutes: Routes = [
  { path: '', loadComponent: () => import('./validate/validate').then((m) => m.Validate) },
];
