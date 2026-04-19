import { ChangeDetectionStrategy, Component, computed, HostBinding, input } from '@angular/core';
import type { PanelStatus } from '../../panel/types';

@Component({
  selector: `pm-bar`,
  standalone: true,
  templateUrl: `./progress-bar.component.html`,
  styleUrl: `./progress-bar.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressBarComponent {

  public readonly value = input.required<number>();
  public readonly max = input<number>(100);
  public readonly color = input<PanelStatus>(`idle`);

  @HostBinding(`class`)
  public get hostClasses(): string {

    return `pm-bar pm-bar--${this.color()}`;
  }

  public readonly percent = computed<number>(() => {
    const m = Math.max(1, this.max());
    return Math.max(0, Math.min(100, (this.value() / m) * 100));
  });
}
