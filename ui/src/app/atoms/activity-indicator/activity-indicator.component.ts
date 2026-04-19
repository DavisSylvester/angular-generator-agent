// KB §1 — docs/knowledge-bases/panel-model-fidelity-corrections.md
// This atom replaces AccentRule for fractional-state footers.
// Do NOT collapse back to a single bar.
import { ChangeDetectionStrategy, Component, computed, HostBinding, input } from '@angular/core';
import type { PanelStatus } from '../../panel/types';

interface Seg {

  readonly on: boolean;
}

@Component({
  selector: `pm-indicator`,
  standalone: true,
  templateUrl: `./activity-indicator.component.html`,
  styleUrl: `./activity-indicator.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityIndicatorComponent {

  public readonly total = input<number>(4);
  public readonly active = input<number>(0);
  public readonly status = input<PanelStatus>(`idle`);
  public readonly segmentWidth = input<string>(`var(--sp-4)`);
  public readonly segmentHeight = input<string>(`var(--sp-1)`);
  public readonly segmentGap = input<string>(`var(--sp-1)`);

  @HostBinding(`class`)
  public get hostClasses(): string {

    return `pm-indicator pm-indicator--${this.status()}`;
  }

  @HostBinding(`attr.aria-label`)
  public get hostAriaLabel(): string {

    return `${this.active()} of ${this.total()}`;
  }

  @HostBinding(`style.--pm-indicator-seg-w`)
  public get segWidthVar(): string {

    return this.segmentWidth();
  }

  @HostBinding(`style.--pm-indicator-seg-h`)
  public get segHeightVar(): string {

    return this.segmentHeight();
  }

  @HostBinding(`style.--pm-indicator-seg-gap`)
  public get segGapVar(): string {

    return this.segmentGap();
  }

  public readonly segments = computed<ReadonlyArray<Seg>>(() => {
    const total = Math.max(0, Math.floor(this.total()));
    const active = Math.max(0, Math.min(total, Math.floor(this.active())));
    return Array.from({ length: total }, (_, i) => ({ on: i < active }));
  });
}
