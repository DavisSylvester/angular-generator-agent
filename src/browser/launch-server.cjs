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

// ── Frame-aware target resolution ───────────────────────────────────
//
// Some sites (like Google Stitch) render their entire UI inside an iframe.
// When the page-level snapshot only shows an iframe, we need to target the
// frame content for snapshot/fill/click operations.

async function getSnapshotTarget() {
  // Check if the page-level snapshot is just an iframe shell
  const pageSnap = await activePage.ariaSnapshot();
  if (pageSnap.includes("iframe") && pageSnap.split("\n").filter(l => l.trim()).length <= 3) {
    // Page is an iframe shell — find the content frame
    const frames = activePage.frames();
    for (const frame of frames) {
      if (frame === activePage.mainFrame()) continue;
      try {
        const frameSnap = await frame.ariaSnapshot();
        if (frameSnap && frameSnap.trim().length > 0) {
          return { snap: frameSnap, frame };
        }
      } catch { /* frame may not be ready */ }
    }
  }
  return { snap: pageSnap, frame: null };
}

/** @type {import("playwright").Frame | null} */
let activeFrame = null;

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

  // Use the iframe frame if we detected one during the last snapshot
  const target = activeFrame || activePage;
  const ariaRole = roleMap[entry.role.toLowerCase()] || entry.role.toLowerCase();
  if (entry.name) {
    return target.getByRole(ariaRole, { name: entry.name });
  }
  return target.getByRole(ariaRole);
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
    const { snap: raw, frame } = await getSnapshotTarget();
    activeFrame = frame; // Store so fill/click target the right frame
    if (frame) {
      process.stderr.write("[bridge] Snapshot: using iframe content frame\n");
    }
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

  // Frame-aware selector commands — try iframe first, then main page.
  // Used for sites like Google Stitch where the UI lives in an iframe.

  async fillSelector({ selector, value }) {
    const iframe = activePage.frameLocator("iframe").first();

    async function fillElement(loc) {
      // contenteditable divs (like TipTap/ProseMirror) need click + type instead of fill
      const editable = await loc.first().getAttribute("contenteditable").catch(() => null);
      if (editable === "true") {
        await loc.first().click();
        await loc.first().selectText().catch(() => {});
        await loc.first().pressSequentially(value, { delay: 5 });
      } else {
        await loc.first().fill(value);
      }
    }

    try {
      const loc = iframe.locator(selector);
      if (await loc.count() > 0) {
        await fillElement(loc);
        process.stderr.write("[bridge] fillSelector: filled in iframe (" + selector + ")\n");
        return null;
      }
    } catch { /* iframe locator failed */ }
    const loc = activePage.locator(selector);
    await fillElement(loc);
    process.stderr.write("[bridge] fillSelector: filled in main page (" + selector + ")\n");
    return null;
  },

  async clickSelector({ selector }) {
    const iframe = activePage.frameLocator("iframe").first();
    try {
      const loc = iframe.locator(selector);
      if (await loc.count() > 0) {
        await loc.first().click();
        process.stderr.write("[bridge] clickSelector: clicked in iframe\n");
        return null;
      }
    } catch { /* iframe locator failed */ }
    await activePage.locator(selector).first().click();
    process.stderr.write("[bridge] clickSelector: clicked in main page\n");
    return null;
  },

  // Evaluate JS inside the iframe to get DOM info ariaSnapshot can't reach
  async frameEval({ js }) {
    const frames = activePage.frames();
    for (const frame of frames) {
      if (frame === activePage.mainFrame()) continue;
      try {
        const result = await frame.evaluate(new Function("return (" + js + ")()"));
        return result;
      } catch { /* frame may be cross-origin or not ready */ }
    }
    // Fallback to main page
    return await activePage.evaluate(new Function("return (" + js + ")()"));
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
