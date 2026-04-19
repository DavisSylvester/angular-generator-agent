import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: `pm-app-header`,
  standalone: true,
  templateUrl: `./app-header.component.html`,
  styleUrl: `./app-header.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeaderComponent {}
