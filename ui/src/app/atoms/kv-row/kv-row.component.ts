import { ChangeDetectionStrategy, Component, HostBinding, input } from '@angular/core';

type Emphasis = 'normal' | 'warn' | 'crit' | 'accent';

@Component({
  selector: `pm-kv`,
  standalone: true,
  templateUrl: `./kv-row.component.html`,
  styleUrl: `./kv-row.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvRowComponent {

  public readonly k = input.required<string>();
  public readonly v = input.required<string | number>();
  public readonly unit = input<string | undefined>(undefined);
  public readonly emphasis = input<Emphasis>(`normal`);

  @HostBinding(`class`)
  public get hostClasses(): string {

    return `pm-kv pm-kv--${this.emphasis()}`;
  }
}
