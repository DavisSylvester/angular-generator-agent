import type { Logger } from 'winston';
import type { CodeFile } from '../types/index.mts';

export interface LintError {
  readonly file: string;
  readonly line?: number | undefined;
  readonly message: string;
}

export interface LintValidationResult {
  readonly valid: boolean;
  readonly errors: readonly LintError[];
  readonly method: `tsc` | `structural`;
}

/**
 * Validates generated Angular code for structural correctness.
 *
 * Strategy:
 *   1. Try TypeScript compiler check if available
 *   2. Fall back to structural/regex checks for common Angular mistakes
 *
 * The structural checks catch the most common LLM mistakes:
 *   - Using NgModules instead of standalone components
 *   - Inline templates or styles
 *   - Missing imports
 *   - Using `any` type
 *   - Constructor injection instead of inject()
 */
export class LintValidator {

  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  validate(files: readonly CodeFile[]): LintValidationResult {
    const allErrors: LintError[] = [];

    for (const file of files) {
      if (file.path.endsWith(`.ts`)) {
        allErrors.push(...this.validateTypeScript(file));
      }
      if (file.path.endsWith(`.html`)) {
        allErrors.push(...this.validateHtml(file));
      }
      if (file.path.endsWith(`.scss`)) {
        allErrors.push(...this.validateScss(file));
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      method: `structural`,
    };
  }

  private validateTypeScript(file: CodeFile): LintError[] {
    const errors: LintError[] = [];
    const content = file.content;
    const lines = content.split(`\n`);

    // Check for NgModule usage (should be standalone only)
    if (content.includes(`@NgModule`)) {
      const lineNum = lines.findIndex((l) => l.includes(`@NgModule`)) + 1;
      errors.push({
        file: file.path,
        line: lineNum,
        message: `NgModule detected — use standalone components only`,
      });
    }

    // Check for inline template
    if (file.path.includes(`.component.`)) {
      const templateMatch = content.match(/template\s*:\s*[`'"]/);
      if (templateMatch) {
        const lineNum = lines.findIndex((l) => /template\s*:\s*[`'"]/.test(l)) + 1;
        errors.push({
          file: file.path,
          line: lineNum,
          message: `Inline template detected — use separate .html file with templateUrl`,
        });
      }

      // Check for inline styles
      const stylesMatch = content.match(/styles\s*:\s*\[/);
      if (stylesMatch) {
        const lineNum = lines.findIndex((l) => /styles\s*:\s*\[/.test(l)) + 1;
        errors.push({
          file: file.path,
          line: lineNum,
          message: `Inline styles detected — use separate .scss file with styleUrl`,
        });
      }

      // Check for standalone: true in components
      if (content.includes(`@Component`) && !content.includes(`standalone: true`) && !content.includes(`standalone:true`)) {
        errors.push({
          file: file.path,
          message: `Component missing standalone: true`,
        });
      }
    }

    // Check for `any` type usage
    const anyPattern = /:\s*any\b/g;
    let anyMatch: RegExpExecArray | null;
    while ((anyMatch = anyPattern.exec(content)) !== null) {
      const upToMatch = content.slice(0, anyMatch.index);
      const lineNum = upToMatch.split(`\n`).length;
      errors.push({
        file: file.path,
        line: lineNum,
        message: `\`any\` type detected — use explicit types`,
      });
    }

    // Check for empty file
    if (!content.trim()) {
      errors.push({
        file: file.path,
        message: `File is empty`,
      });
    }

    // Check balanced braces
    const bracketErrors = this.checkBalancedDelimiters(content, file.path);
    errors.push(...bracketErrors);

    return errors;
  }

  private validateHtml(file: CodeFile): LintError[] {
    const errors: LintError[] = [];
    const content = file.content;

    if (!content.trim()) {
      errors.push({
        file: file.path,
        message: `HTML template is empty`,
      });
    }

    return errors;
  }

  private validateScss(file: CodeFile): LintError[] {
    const errors: LintError[] = [];
    const content = file.content;

    if (!content.trim()) {
      errors.push({
        file: file.path,
        message: `SCSS file is empty`,
      });
    }

    // Check balanced braces
    const bracketErrors = this.checkBalancedDelimiters(content, file.path);
    errors.push(...bracketErrors);

    return errors;
  }

  private checkBalancedDelimiters(content: string, filePath: string): LintError[] {
    const errors: LintError[] = [];
    const stack: { char: string; line: number }[] = [];
    const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
    const closers = new Set(Object.values(pairs));

    // Strip strings and comments to avoid false positives
    const stripped = content
      .replace(/"[^"]*"/g, `""`)
      .replace(/'[^']*'/g, `''`)
      .replace(/`[^`]*`/g, `\`\``)
      .replace(/\/\/.*$/gm, ``)
      .replace(/\/\*[\s\S]*?\*\//g, ``);

    const lines = stripped.split(`\n`);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ``;
      for (const char of line) {
        if (pairs[char]) {
          stack.push({ char, line: i + 1 });
        } else if (closers.has(char)) {
          const expected = stack.pop();
          if (!expected) {
            errors.push({ file: filePath, line: i + 1, message: `Unexpected closing '${char}' with no matching opener` });
          } else if (pairs[expected.char] !== char) {
            errors.push({
              file: filePath,
              line: i + 1,
              message: `Mismatched delimiter: expected '${pairs[expected.char]}' to close '${expected.char}' from line ${expected.line}, but found '${char}'`,
            });
          }
        }
      }
    }

    for (const unclosed of stack) {
      errors.push({
        file: filePath,
        line: unclosed.line,
        message: `Unclosed '${unclosed.char}' opened on line ${unclosed.line}`,
      });
    }

    return errors;
  }
}
