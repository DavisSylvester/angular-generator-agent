// Node.js browser bridge — launched as a child process by Bun.
// Receives JSON commands on stdin, executes Playwright actions, returns results on stdout.
//
// Protocol: one JSON object per line (newline-delimited JSON)
// Request:  {"id":1,"method":"navigate","params":{"url":"https://..."}}
// Response: {"id":1,"result":"..."} or {"id":1,"error":"message"}

const { chromium } = require("playwright");
const readline = require("readline");

const headless = process.argv.includes("--headless");

/** @type {import("playwright").BrowserContext} */
let context;
/** @type {import("playwright").Page} */
let activePage;
/** @type {import("playwright").Browser} */
let browser;

/** @type {Map<string, {role: string, name: string}>} */
const refMap = new Map();

// ── Snapshot transformer (same logic as the .mts version) ───────────

const INTERACTIVE_ROLES = new Set([
  "textbox", "textarea", "button", "radio", "checkbox",
  "combobox", "slider", "link", "menuitem", "tab",
  "option", "searchbox", "spinbutton", "switch",
]);

function transformSnapshot(raw) {
  refMap.clear();
  const lines = raw.split("\n");
  const result = [];
  let counter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    if (/^\s*-\s*\/url:/.test(line)) continue;

    const roleMatch = /^(\s*-\s*)(\w+)(.*)$/.exec(line);
    if (!roleMatch) { result.push(line); continue; }

    const indent = roleMatch[1] || "";
    const role = roleMatch[2] || "";
    let rest = (roleMatch[3] || "").replace(/:$/, "");

    const nameMatch = /^\s+"([^"]*)"(.*)$/.exec(rest);
    const name = nameMatch ? nameMatch[1] || "" : "";
    const attrs = nameMatch ? (nameMatch[2] || "").trim() : rest.trim();

    let refStr = "";
    if (INTERACTIVE_ROLES.has(role.toLowerCase())) {
      const ref = "e" + counter++;
      refStr = " [ref=" + ref + "]";
      refMap.set(ref, { role, name });
    }

    let urlStr = "";
    if (role.toLowerCase() === "link") {
      const nextLine = lines[i + 1] || "";
      const urlMatch = /^\s*-\s*\/url:\s*(.+)$/.exec(nextLine);
      if (urlMatch) urlStr = " url: " + (urlMatch[1] || "").trim();
    }

    let t = indent + role;
    if (name) t += ' "' + name + '"';
    if (attrs) t += " " + attrs;
    t += refStr + urlStr;
    result.push(t);
  }

  return result.join("\n");
}

// ── Resolve ref to locator ──────────────────────────────────────────

function resolveRef(ref) {
  const entry = refMap.get(ref);
  if (!entry) throw new Error('Unknown ref "' + ref + '"');

  const roleMap = {
    textbox: "textbox", textarea: "textbox", searchbox: "searchbox",
    button: "button", radio: "radio", checkbox: "checkbox",
    combobox: "combobox", slider: "slider", link: "link",
    menuitem: "menuitem", tab: "tab", option: "option",
  };

  const ariaRole = roleMap[entry.role.toLowerCase()] || entry.role.toLowerCase();
  if (entry.name) {
    return activePage.getByRole(ariaRole, { name: entry.name });
  }
  return activePage.getByRole(ariaRole);
}

// ── Command handlers ────────────────────────────────────────────────

const handlers = {
  async navigate({ url }) {
    try {
      await activePage.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    } catch {
      await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }
    return null;
  },

  async snapshot() {
    const raw = await activePage.ariaSnapshot();
    return transformSnapshot(raw);
  },

  async screenshot() {
    const buffer = await activePage.screenshot({ fullPage: true });
    return buffer.toString("base64");
  },

  async openTab({ url }) {
    const newPage = await context.newPage();
    try {
      await newPage.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    } catch {
      await newPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }
    activePage = newPage;
    return null;
  },

  async fill({ ref, value }) {
    const locator = resolveRef(ref);
    await locator.fill(value);
    return null;
  },

  async click({ ref }) {
    const locator = resolveRef(ref);
    await locator.click();
    return null;
  },

  async close() {
    await context.close();
    await browser.close();
    return null;
  },
};

// ── Main ────────────────────────────────────────────────────────────

(async () => {
  browser = await chromium.launch({
    headless,
    channel: "chrome",
    timeout: 30000,
    args: ["--disable-gpu", "--disable-dev-shm-usage"],
  });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  activePage = await context.newPage();

  // Signal ready
  process.stdout.write(JSON.stringify({ ready: true }) + "\n");

  const rl = readline.createInterface({ input: process.stdin });

  rl.on("line", async (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    const handler = handlers[msg.method];
    if (!handler) {
      process.stdout.write(JSON.stringify({ id: msg.id, error: "unknown method: " + msg.method }) + "\n");
      return;
    }

    try {
      const result = await handler(msg.params || {});
      process.stdout.write(JSON.stringify({ id: msg.id, result }) + "\n");
    } catch (err) {
      process.stdout.write(JSON.stringify({ id: msg.id, error: err.message }) + "\n");
    }

    if (msg.method === "close") {
      process.exit(0);
    }
  });
})().catch((err) => {
  process.stderr.write("Bridge fatal: " + err.message + "\n");
  process.exit(1);
});
