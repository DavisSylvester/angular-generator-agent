import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: `pm-tag`,
  standalone: true,
  template: `<ng-content />`,
  styleUrl: `./tag.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: `pm-tag` },
})
export class TagComponent {}
