import { ChangeDetectionStrategy, Component, HostBinding, input } from '@angular/core';

type Tone = 'default' | 'accent' | 'warn' | 'crit' | 'muted';

@Component({
  selector: `pm-chip`,
  standalone: true,
  template: `<ng-content />`,
  styleUrl: `./chip.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChipComponent {

  public readonly tone = input<Tone>(`default`);
  public readonly selected = input<boolean>(false);

  @HostBinding(`class`)
  public get hostClasses(): string {

    return `pm-chip pm-chip--${this.tone()}${this.selected() ? ` pm-chip--selected` : ``}`;
  }
}
