import { Routes } from '@angular/router';
import { PlaceholderPage } from '../../core/placeholder-page';

export const resortRoutes: Routes = [
  { path: '', component: PlaceholderPage, data: { title: 'Portada' } },
  { path: 'resorts/:id', component: PlaceholderPage, data: { title: 'Ficha de balneario' } },
];
