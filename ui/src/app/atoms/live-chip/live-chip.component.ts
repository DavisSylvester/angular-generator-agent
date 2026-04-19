import { ChangeDetectionStrategy, Component, HostBinding, input } from '@angular/core';

type LiveState = 'live' | 'stale' | 'offline';

@Component({
  selector: `pm-live`,
  standalone: true,
  templateUrl: `./live-chip.component.html`,
  styleUrl: `./live-chip.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveChipComponent {

  public readonly state = input<LiveState>(`live`);
  public readonly label = input<string>(`LIVE FEED`);

  @HostBinding(`class`)
  public get hostClasses(): string {

    return `pm-live pm-live--${this.state()}`;
  }
}
