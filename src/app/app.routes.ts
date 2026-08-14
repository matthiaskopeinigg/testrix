import { Routes } from '@angular/router';

import { ShellLayoutComponent } from './features/shell/layout/shell-layout.component';
import { HomeComponent } from './features/shell/pages/home/home.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellLayoutComponent,
    children: [
      {

        path: '',

        pathMatch: 'full',
        redirectTo: 'home',

      },

      {
        path: 'home',
        component: HomeComponent,
      },


    ],


  },


];
