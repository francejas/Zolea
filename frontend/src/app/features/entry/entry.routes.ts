import { Routes } from '@angular/router';
import { PlaceholderPage } from '../../core/placeholder-page';

/** Se monta en `/admin/validate`; los guards de rol están en la ruta padre `admin`. */
export const entryRoutes: Routes = [
  { path: '', component: PlaceholderPage, data: { title: 'Validar ingreso' } },
];
