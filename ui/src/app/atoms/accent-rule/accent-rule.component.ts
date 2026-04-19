import { ChangeDetectionStrategy, Component, HostBinding, input } from '@angular/core';
import type { PanelStatus } from '../../panel/types';

type Variant = 'solid' | 'gradient';

@Component({
  selector: `pm-rule`,
  standalone: true,
  template: ``,
  styleUrl: `./accent-rule.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccentRuleComponent {

  public readonly color = input<PanelStatus>(`idle`);
  public readonly variant = input<Variant>(`solid`);

  @HostBinding(`class`)
  public get hostClasses(): string {

    return `pm-rule pm-rule--${this.color()} pm-rule--${this.variant()}`;
  }
}
