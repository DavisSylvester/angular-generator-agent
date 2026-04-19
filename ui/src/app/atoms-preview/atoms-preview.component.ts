import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PanelBodyComponent, PanelComponent, PanelHeaderComponent } from '../panel';
import { StatComponent } from '../atoms/stat/stat.component';
import { ActivityIndicatorComponent } from '../atoms/activity-indicator/activity-indicator.component';

@Component({
  selector: `pm-atoms-preview`,
  standalone: true,
  imports: [
    PanelComponent,
    PanelHeaderComponent,
    PanelBodyComponent,
    StatComponent,
    ActivityIndicatorComponent,
  ],
  templateUrl: `./atoms-preview.component.html`,
  styleUrl: `./atoms-preview.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtomsPreviewComponent {}
