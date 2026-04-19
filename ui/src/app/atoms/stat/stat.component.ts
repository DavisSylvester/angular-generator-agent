// KB §1 — docs/knowledge-bases/panel-model-fidelity-corrections.md
// Stat supports a two-part left/right label pair aligned under the numeral
// and denominator. Do NOT re-introduce a single centered `label` as the sole
// labelling mechanism for ratio stats.
import { ChangeDetectionStrategy, Component, computed, HostBinding, input } from '@angular/core';
import type { PanelStatus } from '../../panel/types';

@Component({
  selector: `pm-stat`,
  standalone: true,
  templateUrl: `./stat.component.html`,
  styleUrl: `./stat.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatComponent {

  public readonly value = input.required<number>();
  public readonly denominator = input<number | undefined>(undefined);
  public readonly unit = input<string | undefined>(undefined);
  public readonly label = input<string | undefined>(undefined);
  public readonly labelLeft = input<string | undefined>(undefined);
  public readonly labelRight = input<string | undefined>(undefined);
  public readonly status = input<PanelStatus>(`idle`);

  @HostBinding(`class`)
  public get hostClasses(): string {

    return `pm-stat pm-stat--${this.status()}`;
  }

  @HostBinding(`attr.aria-label`)
  public get hostAriaLabel(): string {

    const unit = this.unit() ? ` ${this.unit()}` : ``;
    const denom = this.denominator() !== undefined ? ` of ${this.denominator()}` : ``;
    const left = this.labelLeft() ? ` (${this.labelLeft()})` : ``;
    const right = this.labelRight() ? ` / ${this.labelRight()}` : ``;
    const single = this.label() ? ` (${this.label()})` : ``;
    return `${this.value()}${unit}${denom}${left}${right}${single}`;
  }

  public readonly formattedValue = computed<string>(() => String(this.value()));
  public readonly formattedDenominator = computed<string | null>(() => {
    const d = this.denominator();
    return d === undefined ? null : String(d);
  });
  public readonly hasSplitLabel = computed<boolean>(() => Boolean(this.labelLeft() ?? this.labelRight()));
}
