import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PanelBodyComponent, PanelComponent, PanelFooterComponent, PanelHeaderComponent } from '../panel';
import { StatComponent } from '../atoms/stat/stat.component';

@Component({
  selector: `pm-atoms-preview`,
  standalone: true,
  imports: [PanelComponent, PanelHeaderComponent, PanelBodyComponent, PanelFooterComponent, StatComponent],
  templateUrl: `./atoms-preview.component.html`,
  styleUrl: `./atoms-preview.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtomsPreviewComponent {}
