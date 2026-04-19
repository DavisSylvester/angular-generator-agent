import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PanelBodyComponent, PanelComponent, PanelHeaderComponent } from '../../panel';
import { KvRowComponent } from '../../atoms/kv-row/kv-row.component';
import { ProgressBarComponent } from '../../atoms/progress-bar/progress-bar.component';

interface Kv {

  readonly k: string;
  readonly v: string | number;
  readonly unit?: string;
  readonly emphasis?: 'normal' | 'warn' | 'crit' | 'accent';
}

@Component({
  selector: `pm-runtime-metrics`,
  standalone: true,
  imports: [PanelComponent, PanelHeaderComponent, PanelBodyComponent, KvRowComponent, ProgressBarComponent],
  templateUrl: `./runtime-metrics.component.html`,
  styleUrl: `./runtime-metrics.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuntimeMetricsComponent {

  public readonly colA: readonly Kv[] = [
    { k: `CORE_TEMP_AVG`, v: 162.56, unit: `°F` },
    { k: `CORE_THRE_AVG`, v: 35.85, unit: `%` },
    { k: `CORE_LOAD_MAX`, v: 80.46, unit: `%` },
    { k: `CACHE_LAT`, v: 51, unit: `ms` },
    { k: `DRAM_LAT`, v: 51, unit: `ms` },
    { k: `WATER_PUMP_SP`, v: 765.83, unit: `rpm` },
    { k: `YAW_AXIS_DEG`, v: 14.88, unit: `°c` },
    { k: `YAW_AXIS_VEL`, v: 59.27, unit: `deg/s` },
    { k: `CURR_OUTPUT`, v: 111.19, unit: `w`, emphasis: `warn` },
    { k: `MAX_OUTPUT`, v: 13931, unit: `w` },
  ];

  public readonly colB: readonly Kv[] = [
    { k: `TOTAL_THREADS`, v: 32, unit: `—` },
    { k: `FREQ_GOVERNOR`, v: `conservative`, unit: `—` },
    { k: `OUTPUT_RANGE`, v: 1181.2, unit: `mw`, emphasis: `accent` },
    { k: `STEAM_PRESSURE`, v: 74.43, unit: `bar`, emphasis: `warn` },
    { k: `STEAM_TEMP`, v: 250.72, unit: `°c` },
    { k: `TURBINE_SPEED`, v: 6538.55, unit: `rpm` },
    { k: `TURBINE_VIBR`, v: 46.1, unit: `hz` },
    { k: `TURBINE_HOTSPOT`, v: 85.6, unit: `°c` },
    { k: `MAIN_BEARING_TEMP`, v: 81.4, unit: `°c`, emphasis: `warn` },
    { k: `TOTAL_PWR`, v: 13931, unit: `mWh` },
    { k: `UPTIME`, v: 1, unit: `days` },
  ];
}
