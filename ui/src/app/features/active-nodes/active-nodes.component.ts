import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PanelBodyComponent, PanelComponent, PanelFooterComponent, PanelHeaderComponent } from '../../panel';
import { KvRowComponent } from '../../atoms/kv-row/kv-row.component';
import { ChipComponent } from '../../atoms/chip/chip.component';

type CellState = 'empty' | 'active' | 'alarm';

@Component({
  selector: `pm-active-nodes`,
  standalone: true,
  imports: [PanelComponent, PanelHeaderComponent, PanelBodyComponent, PanelFooterComponent, KvRowComponent, ChipComponent],
  templateUrl: `./active-nodes.component.html`,
  styleUrl: `./active-nodes.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveNodesComponent {

  public readonly cells: readonly CellState[] = this.buildCells();

  public readonly filters = [
    { label: `RESET`, active: false },
    { label: `LOW_SEV`, active: false },
    { label: `MED_SEV`, active: false },
    { label: `HIGH_SEV`, active: true },
  ];

  private buildCells(): readonly CellState[] {
    const n = 10 * 22;
    const result: CellState[] = new Array(n).fill(`empty`) as CellState[];
    // sprinkle some active dots and a few alarms
    for (let i = 0; i < n; i++) {
      if ((i * 7 + 3) % 11 === 0) result[i] = `active`;
      if ([23, 42, 67, 88, 112, 134, 156].includes(i)) result[i] = `alarm`;
    }
    return result;
  }
}
