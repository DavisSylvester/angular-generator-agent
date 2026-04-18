import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: `pm-header`,
  standalone: true,
  template: `<ng-content />`,
  styleUrl: `./panel-header.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: `pm-header` },
})
export class PanelHeaderComponent {}
