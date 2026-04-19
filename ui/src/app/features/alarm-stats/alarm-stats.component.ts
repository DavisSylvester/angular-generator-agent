import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PanelBodyComponent, PanelComponent, PanelHeaderComponent } from '../../panel';
import { StatComponent } from '../../atoms/stat/stat.component';
import { ActivityIndicatorComponent } from '../../atoms/activity-indicator/activity-indicator.component';

@Component({
  selector: `pm-alarm-stats`,
  standalone: true,
  imports: [PanelComponent, PanelHeaderComponent, PanelBodyComponent, StatComponent, ActivityIndicatorComponent],
  templateUrl: `./alarm-stats.component.html`,
  styleUrl: `./alarm-stats.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlarmStatsComponent {}
