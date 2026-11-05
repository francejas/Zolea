import { Routes } from '@angular/router';
import { PlaceholderPage } from '../../core/placeholder-page';
import { ResortList } from './resort-list/resort-list';

export const resortRoutes: Routes = [
  { path: '', component: ResortList },
  { path: 'resorts/:id', component: PlaceholderPage, data: { title: 'Ficha de balneario' } },
];
