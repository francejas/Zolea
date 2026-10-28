import { Routes } from '@angular/router';
import { AdminLayout } from './layout/admin-layout/admin-layout';
import { SiteLayout } from './layout/site-layout/site-layout';

/**
 * Las dos rutas padre, cada una con su estructura de página: el panel del administrador y el sitio,
 * para el público y el cliente. Las rutas hijas y los guards los pone la 8.4 (ZOL-124).
 */
export const routes: Routes = [
  { path: 'admin', component: AdminLayout, children: [] },
  { path: '', component: SiteLayout, children: [] },
];
