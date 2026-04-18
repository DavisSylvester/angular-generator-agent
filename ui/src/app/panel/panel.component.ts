import { ChangeDetectionStrategy, Component, computed, HostBinding, input } from '@angular/core';
import type { PanelDensity, PanelStatus, PanelVariant } from './types';

@Component({
  selector: `pm-panel`,
  standalone: true,
  templateUrl: `./panel.component.html`,
  styleUrl: `./panel.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: `pm-panel`,
  },
})
export class PanelComponent {

  public readonly status = input<PanelStatus>(`idle`);
  public readonly label = input<string | undefined>(undefined);
  public readonly variant = input<PanelVariant>(`default`);
  public readonly density = input<PanelDensity>(`comfortable`);
  public readonly ariaLabelledBy = input<string | undefined>(undefined);
  public readonly visualId = input<string | undefined>(undefined);

  @HostBinding(`class`)
  public get hostClasses(): string {

    return [
      `pm-panel`,
      `pm-panel--status-${this.status()}`,
      `pm-panel--variant-${this.variant()}`,
      `pm-panel--density-${this.density()}`,
    ].join(` `);
  }

  @HostBinding(`attr.role`)
  public get hostRole(): string | null {

    return this.ariaLabelledBy() ? `region` : null;
  }

  @HostBinding(`attr.aria-labelledby`)
  public get hostAriaLabelledBy(): string | null {

    return this.ariaLabelledBy() ?? null;
  }

  @HostBinding(`attr.aria-live`)
  public get hostAriaLive(): string | null {

    return this.status() === `live` ? `polite` : null;
  }

  @HostBinding(`attr.data-visual-id`)
  public get hostDataVisualId(): string | null {

    return this.visualId() ?? null;
  }

  public readonly showLabel = computed<boolean>(() => Boolean(this.label()) && this.variant() !== `borderless`);
  public readonly showFrame = computed<boolean>(() => this.variant() !== `borderless`);
}
