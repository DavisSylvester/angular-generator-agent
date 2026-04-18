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
  public readonly status = input<PanelStatus>(`idle`);

  @HostBinding(`class`)
  public get hostClasses(): string {

    return `pm-stat pm-stat--${this.status()}`;
  }

  @HostBinding(`attr.aria-label`)
  public get hostAriaLabel(): string {

    const unit = this.unit() ? ` ${this.unit()}` : ``;
    const denom = this.denominator() !== undefined ? ` of ${this.denominator()}` : ``;
    const label = this.label() ? ` (${this.label()})` : ``;
    return `${this.value()}${unit}${denom}${label}`;
  }

  public readonly formattedValue = computed<string>(() => this.formatNumber(this.value()));
  public readonly formattedDenominator = computed<string | null>(() => {
    const d = this.denominator();
    return d === undefined ? null : this.formatNumber(d);
  });

  private formatNumber(n: number): string {

    return Number.isInteger(n) ? n.toString() : n.toString();
  }
}
