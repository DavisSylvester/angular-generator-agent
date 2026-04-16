import { describe, expect, it } from 'bun:test';
import { createLogger, transports } from 'winston';
import { LintValidator } from '../src/verification/lint-validator.mts';
import type { CodeFile } from '../src/types/index.mts';

const silentLogger = createLogger({ silent: true, transports: [new transports.Console()] });

function makeFile(path: string, content: string): CodeFile {
  return { path, content, fileType: `component-ts` };
}

describe(`LintValidator`, () => {
  const validator = new LintValidator(silentLogger);

  it(`should pass valid standalone component`, () => {
    const file = makeFile(`src/app/dashboard.component.ts`, `
import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {}
`.trim());

    const result = validator.validate([file]);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it(`should detect NgModule usage`, () => {
    const file = makeFile(`src/app/app.module.ts`, `
@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule],
})
export class AppModule {}
`.trim());

    const result = validator.validate([file]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes(`NgModule`))).toBe(true);
  });

  it(`should detect inline template`, () => {
    const file = makeFile(`src/app/widget.component.ts`, `
@Component({
  selector: 'app-widget',
  standalone: true,
  template: \`<div>inline</div>\`,
})
export class WidgetComponent {}
`.trim());

    const result = validator.validate([file]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes(`Inline template`))).toBe(true);
  });

  it(`should detect inline styles`, () => {
    const file = makeFile(`src/app/card.component.ts`, `
@Component({
  selector: 'app-card',
  standalone: true,
  templateUrl: './card.component.html',
  styles: [\`:host { display: block; }\`],
})
export class CardComponent {}
`.trim());

    const result = validator.validate([file]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes(`Inline styles`))).toBe(true);
  });

  it(`should detect any type usage`, () => {
    const file = makeFile(`src/app/data.service.ts`, `
export class DataService {
  getData(): any {
    return {};
  }
}
`.trim());

    const result = validator.validate([file]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes(`any`))).toBe(true);
  });

  it(`should detect missing standalone: true`, () => {
    const file = makeFile(`src/app/missing.component.ts`, `
@Component({
  selector: 'app-missing',
  templateUrl: './missing.component.html',
})
export class MissingComponent {}
`.trim());

    const result = validator.validate([file]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes(`standalone: true`))).toBe(true);
  });

  it(`should detect unbalanced braces`, () => {
    const file = makeFile(`src/app/broken.component.ts`, `
export class BrokenComponent {
  doSomething() {
    if (true) {
      return;
  }
`.trim());

    const result = validator.validate([file]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes(`Unclosed`))).toBe(true);
  });

  it(`should detect empty HTML template`, () => {
    const file = makeFile(`src/app/empty.component.html`, ``);

    const result = validator.validate([file]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes(`empty`))).toBe(true);
  });

  it(`should pass valid SCSS`, () => {
    const file = makeFile(`src/app/styles.scss`, `
:host {
  display: block;
  color: var(--primary-color);
}
`.trim());

    const result = validator.validate([file]);
    expect(result.valid).toBe(true);
  });

  it(`should detect unbalanced braces in SCSS`, () => {
    const file = makeFile(`src/app/broken.scss`, `
:host {
  display: block;
  .inner {
    color: red;
`.trim());

    const result = validator.validate([file]);
    expect(result.valid).toBe(false);
  });
});
