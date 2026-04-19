import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppHeaderComponent } from '../app-header/app-header.component';
import { TagComponent } from '../../atoms/tag/tag.component';
import { AlarmStatsComponent } from '../../features/alarm-stats/alarm-stats.component';
import { RuntimeMetricsComponent } from '../../features/runtime-metrics/runtime-metrics.component';
import { HealthMonitorComponent } from '../../features/health-monitor/health-monitor.component';
import { ActiveNodesComponent } from '../../features/active-nodes/active-nodes.component';
import { AlarmListComponent } from '../../features/alarm-list/alarm-list.component';
import { ModelRenderComponent } from '../../features/model-render/model-render.component';

@Component({
  selector: `pm-dashboard-page`,
  standalone: true,
  imports: [
    AppHeaderComponent,
    TagComponent,
    AlarmStatsComponent,
    RuntimeMetricsComponent,
    HealthMonitorComponent,
    ActiveNodesComponent,
    AlarmListComponent,
    ModelRenderComponent,
  ],
  templateUrl: `./dashboard-page.component.html`,
  styleUrl: `./dashboard-page.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {}
