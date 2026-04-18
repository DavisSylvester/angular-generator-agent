import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: `pm-body`,
  standalone: true,
  template: `<ng-content />`,
  styleUrl: `./panel-body.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: `pm-body` },
})
export class PanelBodyComponent {}
