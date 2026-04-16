import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { join } from "path";
import { createInterface } from "readline";
import type { Logger } from "winston";
import type { PlaywrightCallbacks } from "../orchestrator/pipeline.mts";

// ── Public interface ────────────────────────────────────────────────

export interface BrowserHandle {

  readonly callbacks: PlaywrightCallbacks;
  saveSession(savePath: string): Promise<string>;
  close(): Promise<void>;
}

interface LaunchOptions {
  headless: boolean;
  logger: Logger;
  sessionPath?: string;
  userDataDir?: string;
}

// ── Bridge message types ────────────────────────────────────────────

interface BridgeResponse {
  id?: number;
  ready?: boolean;
  result?: string | null;
  error?: string;
}

// ── Main launcher ───────────────────────────────────────────────────

export async function launchBrowser(options: LaunchOptions): Promise<BrowserHandle> {

  const { headless, logger, sessionPath, userDataDir } = options;

  logger.info(`Launching browser bridge (headless: ${headless})...`);

  const bridgePath = join(import.meta.dir, "launch-server.cjs");
  const args = [bridgePath];
  if (headless) args.push("--headless");
  if (sessionPath) args.push(`--session=${sessionPath}`);
  if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);

  const proc: ChildProcess = spawn("node", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Collect stderr for diagnostics
  proc.stderr?.on("data", (chunk: Buffer) => {
    logger.warn(`[Browser bridge] ${chunk.toString().trim()}`);
  });

  // Set up line-based reader for responses
  const rl = createInterface({ input: proc.stdout! });
  const pending = new Map<number, {
    resolve: (value: string | null) => void;
    reject: (error: Error) => void;
  }>();
  let msgId = 0;

  rl.on("line", (line: string) => {
    let msg: BridgeResponse;
    try { msg = JSON.parse(line) as BridgeResponse; } catch { return; }

    if (msg.ready) {
      logger.info(`Browser bridge ready`);
      return;
    }

    if (msg.id === undefined) return;
    const handler = pending.get(msg.id);
    if (!handler) return;
    pending.delete(msg.id);

    if (msg.error) {
      handler.reject(new Error(msg.error));
    } else {
      handler.resolve(msg.result ?? null);
    }
  });

  // Wait for ready signal
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Browser bridge timed out")), 30_000);
    const checkReady = (line: string): void => {
      try {
        const msg = JSON.parse(line) as BridgeResponse;
        if (msg.ready) {
          clearTimeout(timeout);
          resolve();
        }
      } catch { /* ignore parse errors */ }
    };
    rl.on("line", checkReady);
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Browser bridge exited with code ${code}`));
    });
  });

  // ── RPC helper ──────────────────────────────────────────────────

  function send(method: string, params?: Record<string, unknown>): Promise<string | null> {
    const id = ++msgId;
    return new Promise<string | null>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ id, method, params }) + "\n";
      proc.stdin!.write(msg);
    });
  }

  // ── Callbacks ───────────────────────────────────────────────────

  const callbacks: PlaywrightCallbacks = {

    navigate: async (url: string): Promise<void> => {
      logger.info(`[Browser] Navigate: ${url}`);
      await send("navigate", { url });
    },

    snapshot: async (): Promise<string> => {
      logger.debug(`[Browser] Snapshot`);
      return (await send("snapshot")) ?? "";
    },

    screenshot: async (): Promise<string> => {
      logger.debug(`[Browser] Screenshot`);
      return (await send("screenshot")) ?? "";
    },

    openTab: async (url: string): Promise<void> => {
      logger.info(`[Browser] Open tab: ${url}`);
      await send("openTab", { url });
    },

    fill: async (ref: string, value: string): Promise<void> => {
      logger.debug(`[Browser] Fill ref=${ref}`);
      await send("fill", { ref, value });
    },

    click: async (ref: string): Promise<void> => {
      logger.debug(`[Browser] Click ref=${ref}`);
      await send("click", { ref });
    },

    fillSelector: async (selector: string, value: string): Promise<void> => {
      logger.debug(`[Browser] FillSelector: ${selector}`);
      await send("fillSelector", { selector, value });
    },

    clickSelector: async (selector: string): Promise<void> => {
      logger.debug(`[Browser] ClickSelector: ${selector}`);
      await send("clickSelector", { selector });
    },

    getCurrentUrl: async (): Promise<string> => {
      return (await send("getCurrentUrl")) ?? "";
    },

    runCommand: async (
      cmd: string,
      args: string[],
      cwd: string,
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
      logger.info(`[Shell] ${cmd} ${args.join(" ")}`, { cwd });
      try {
        const p = Bun.spawn([cmd, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(p.stdout).text(),
          new Response(p.stderr).text(),
          p.exited,
        ]);
        return { exitCode, stdout, stderr };
      } catch (error) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  return {
    callbacks,
    saveSession: async (savePath: string): Promise<string> => {
      logger.info(`Saving browser session to ${savePath}...`);
      return (await send("saveSession", { savePath })) ?? savePath;
    },
    close: async (): Promise<void> => {
      logger.info(`Closing browser...`);
      try {
        await send("close");
      } catch { /* bridge may already be gone */ }
      rl.close();
      proc.stdin?.end();
      proc.kill();
    },
  };
}
