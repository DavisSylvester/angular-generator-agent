import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PanelBodyComponent, PanelComponent, PanelFooterComponent, PanelHeaderComponent } from '../../panel';
import { KvRowComponent } from '../../atoms/kv-row/kv-row.component';
import { ChipComponent } from '../../atoms/chip/chip.component';

@Component({
  selector: `pm-model-render`,
  standalone: true,
  imports: [PanelComponent, PanelHeaderComponent, PanelBodyComponent, PanelFooterComponent, KvRowComponent, ChipComponent],
  templateUrl: `./model-render.component.html`,
  styleUrl: `./model-render.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelRenderComponent {

  public readonly points = Array.from({ length: 120 }, (_, i) => {
    const angle = (i / 120) * Math.PI * 6;
    const r = 35 + Math.sin(i * 0.3) * 18;
    return {
      cx: 50 + Math.cos(angle) * (r / 100) * 40,
      cy: 50 + Math.sin(angle) * (r / 100) * 40,
    };
  });
}
