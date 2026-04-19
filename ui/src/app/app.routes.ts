import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: `atoms`,
    loadComponent: () => import(`./atoms-preview/atoms-preview.component`).then((m) => m.AtomsPreviewComponent),
  },
  {
    path: `dashboard`,
    loadComponent: () => import(`./layout/dashboard-page/dashboard-page.component`).then((m) => m.DashboardPageComponent),
  },
  {
    path: ``,
    redirectTo: `dashboard`,
    pathMatch: `full`,
  },
];
