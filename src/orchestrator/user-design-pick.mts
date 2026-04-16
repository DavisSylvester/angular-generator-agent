import type { Logger } from 'winston';
import type { StitchDesign } from '../types/index.mts';

/**
 * Playwright tab callbacks the caller wires up to MCP tools.
 */
export interface DesignPickPlaywrightCallbacks {
  /** Open a new browser tab and navigate to a URL. */
  openTab(url: string): Promise<void>;
  /** Take a screenshot of the current tab. */
  screenshot(): Promise<string>;
}

/**
 * Opens each Stitch design in its own browser tab within a single
 * browser instance, then prompts the user to pick exactly one.
 *
 * Flow:
 *   1. Open each design's preview URL in a new tab (5 tabs total)
 *   2. Log the tab list so the user knows which tab is which design
 *   3. Display a numbered selection prompt in the console
 *   4. Read the user's choice from stdin
 *   5. Return the selected StitchDesign
 */
export async function pickUserDesign(
  designs: readonly StitchDesign[],
  logger: Logger,
  pw: DesignPickPlaywrightCallbacks,
): Promise<StitchDesign> {
  logger.info(`\n========== Design Selection ==========`);
  logger.info(`Opening ${designs.length} designs in browser tabs...\n`);

  // Open each design in its own tab
  for (let i = 0; i < designs.length; i++) {
    const design = designs[i];
    if (!design) continue;

    try {
      await pw.openTab(design.previewUrl);
      logger.info(`  Tab ${i + 1}: ${design.name}`);
      logger.info(`         ${design.previewUrl}`);
    } catch (error) {
      logger.warn(`  Could not open tab for design ${i + 1}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info(``);
  logger.info(`All ${designs.length} designs are now open in separate browser tabs.`);
  logger.info(`Switch between tabs to review each design.\n`);

  // Display selection prompt
  logger.info(`─────────────────────────────────────────`);
  logger.info(`Pick ONE design to build:\n`);

  for (let i = 0; i < designs.length; i++) {
    const design = designs[i];
    if (!design) continue;
    logger.info(`  [${i + 1}] ${design.name}`);
    logger.info(`      ${design.description}\n`);
  }

  // Read user input from stdin
  const selectedIndex = await promptUserChoice(designs.length);
  const selected = designs[selectedIndex];

  if (!selected) {
    throw new Error(`Invalid design selection index: ${selectedIndex}`);
  }

  logger.info(`\n✓ Selected: ${selected.name} (${selected.id})\n`);
  return selected;
}

/**
 * Prompt the user to enter a number via stdin.
 * Repeats until a valid choice is made.
 */
async function promptUserChoice(maxChoice: number): Promise<number> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  return new Promise<number>((resolve) => {
    const ask = (): void => {
      stdout.write(`Enter your choice (1-${maxChoice}): `);
    };

    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
    stdin.resume();
    stdin.setEncoding(`utf-8`);

    const onData = (data: string): void => {
      const trimmed = data.toString().trim();
      const num = parseInt(trimmed, 10);

      if (Number.isNaN(num) || num < 1 || num > maxChoice) {
        stdout.write(`Invalid choice "${trimmed}". Please enter a number between 1 and ${maxChoice}.\n`);
        ask();
        return;
      }

      stdin.removeListener(`data`, onData);
      stdin.pause();
      if (stdin.isTTY && typeof wasRaw === `boolean`) {
        stdin.setRawMode(wasRaw);
      }

      resolve(num - 1); // Convert to 0-based index
    };

    stdin.on(`data`, onData);
    ask();
  });
}
