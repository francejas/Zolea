import { Routes } from '@angular/router';
import { ResortList } from './resort-list/resort-list';
import { ResortDetail } from './resort-detail/resort-detail';

export const resortRoutes: Routes = [
  { path: '', component: ResortList },
  { path: 'resorts/:id', component: ResortDetail },
];
