import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PanelBodyComponent, PanelComponent, PanelHeaderComponent } from '../../panel';
import { LiveChipComponent } from '../../atoms/live-chip/live-chip.component';

@Component({
  selector: `pm-health-monitor`,
  standalone: true,
  imports: [PanelComponent, PanelHeaderComponent, PanelBodyComponent, LiveChipComponent],
  templateUrl: `./health-monitor.component.html`,
  styleUrl: `./health-monitor.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthMonitorComponent {

  public readonly path = `M0,140 L20,130 L40,135 L60,120 L80,100 L100,90 L120,80 L140,70 L160,60 L180,65 L200,55 L220,50 L240,60 L260,55 L280,50 L300,58 L320,55 L340,60`;
}
