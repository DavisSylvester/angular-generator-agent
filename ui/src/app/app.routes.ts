import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: `atoms`,
    loadComponent: () => import(`./atoms-preview/atoms-preview.component`).then((m) => m.AtomsPreviewComponent),
  },
  {
    path: ``,
    redirectTo: `atoms`,
    pathMatch: `full`,
  },
];
