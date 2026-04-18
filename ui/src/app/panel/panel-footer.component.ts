import { ChangeDetectionStrategy, Component, HostBinding, input } from '@angular/core';

@Component({
  selector: `pm-footer`,
  standalone: true,
  templateUrl: `./panel-footer.component.html`,
  styleUrl: `./panel-footer.component.scss`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: `pm-footer` },
})
export class PanelFooterComponent {

  public readonly accent = input<boolean>(false);

  @HostBinding(`class.pm-footer--accent`)
  public get accentClass(): boolean {

    return this.accent();
  }
}
