import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PanelBodyComponent, PanelComponent, PanelHeaderComponent } from '../../panel';
import { ChipComponent } from '../../atoms/chip/chip.component';

interface Alarm {

  readonly id: string;
  readonly name: string;
  readonly dueDate: string;
  readonly desc: string;
  readonly tags: ReadonlyArray<{ text: string; selected?: boolean; tone?: 'default' | 'warn' | 'crit' | 'accent' | 'muted' }>;
}

@Component({
  selector: `pm-alarm-list`,
  standalone: true,
  imports: [PanelComponent, PanelHeaderComponent, PanelBodyComponent, ChipComponent],
  templateUrl: `./alarm-list.component.html`,
  styleUrl: `./alarm-list.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlarmListComponent {

  public readonly alarms: readonly Alarm[] = [
    {
      id: `42953`,
      name: `MAIN_BEARING_TEMP`,
      dueDate: `2023-12-28`,
      desc: `The main bearing temperature of the unit has exceeded the upper limit of the recommended range of operational standards. These elevated temperatures may be due to a heated application, a recently greased bearing, oil level issues or early stages of bearing failure.`,
      tags: [
        { text: `EVC — MC1`, tone: `default` }, { text: `CTA — MC1`, selected: true, tone: `accent` }, { text: `ERR — MC1`, tone: `warn` }, { text: `EVC — MC1`, tone: `default` },
        { text: `AXH — MC1`, tone: `default` }, { text: `OBX — MC1`, selected: true, tone: `accent` }, { text: `EVC — MC1`, tone: `default` }, { text: `DCX — MC1`, tone: `default` },
        { text: `ERR — MC1`, tone: `warn` }, { text: `EVC — MC1`, tone: `default` }, { text: `ERR — MC1`, tone: `warn` }, { text: `AXH — MC1`, tone: `default` },
      ],
    },
    {
      id: `42969`,
      name: `HYDR_PUMP_AERATION`,
      dueDate: `2024-01-28`,
      desc: `Possible signs of aeration has been detected in the hydraulic system. Operating the system when air is present may result in the pump being unable to reach the pressures required to operate the system. Check for (1) defective seals allowing air into the pump inlet line, (2) damaged inlet hoses and connections.`,
      tags: [
        { text: `OBX — MC1`, tone: `default` }, { text: `EVC — MC1`, tone: `default` }, { text: `ERR — MC1`, tone: `warn` }, { text: `OBX — MC1`, tone: `default` },
        { text: `AXH — MC1`, tone: `default` }, { text: `ERR — MC1`, tone: `warn` }, { text: `ERR — MC1`, tone: `warn` }, { text: `CTA — MC1`, selected: true, tone: `accent` },
        { text: `DCX — MC1`, tone: `default` }, { text: `EVC — MC1`, tone: `default` }, { text: `CTA — MC1`, selected: true, tone: `accent` }, { text: `OBX — MC1`, tone: `default` },
      ],
    },
    {
      id: `42959`,
      name: `MAIN_BEARING_VIBR`,
      dueDate: `2024-01-28`,
      desc: `Increase in bearing vibration has been detected. Check vibration analysis in monitoring system. Possible root causes: (1)`,
      tags: [
        { text: `CTA — MC1`, selected: true, tone: `accent` }, { text: `EVC — MC1`, tone: `default` }, { text: `EVC — MC1`, tone: `default` }, { text: `ERR — MC1`, tone: `warn` },
        { text: `OBX — MC1`, tone: `default` }, { text: `OBX — MC1`, tone: `default` }, { text: `DCX — MC1`, tone: `default` }, { text: `ERR — MC1`, tone: `warn` },
        { text: `EVC — MC1`, tone: `default` }, { text: `AXH — MC1`, tone: `default` }, { text: `CTA — MC1`, selected: true, tone: `accent` }, { text: `MC1`, tone: `default` },
      ],
    },
  ];
}
