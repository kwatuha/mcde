/**
 * Puppeteer launch options for server/Docker environments where bundled Chrome
 * is not installed (ENOENT on ~/.cache/puppeteer/...).
 *
 * Prefer, in order:
 * - PUPPETEER_EXECUTABLE_PATH / CHROME_BIN / GOOGLE_CHROME_BIN
 * - Common system Chromium/Chrome paths (Alpine, Debian, etc.)
 */
const fs = require('fs');

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

const SYSTEM_CHROME_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
];

function resolveExecutablePath() {
  const ordered = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    ...SYSTEM_CHROME_CANDIDATES,
  ].filter(Boolean);

  const seen = new Set();
  for (const p of ordered) {
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      if (p && fs.existsSync(p)) {
        const st = fs.statSync(p);
        if (st.isFile() || st.isSymbolicLink()) return p;
      }
    } catch {
      /* continue */
    }
  }
  return undefined;
}

/** @param {Record<string, unknown>} [overrides] Merged into puppeteer.launch options. */
function getPuppeteerLaunchOptions(overrides = {}) {
  const { args: extraArgs = [], ...rest } = overrides;
  const executablePath = resolveExecutablePath();
  const opts = {
    headless: true,
    args: [...DEFAULT_ARGS, ...(Array.isArray(extraArgs) ? extraArgs : [])],
    ...rest,
  };
  if (executablePath) {
    opts.executablePath = executablePath;
  }
  return opts;
}

module.exports = { getPuppeteerLaunchOptions, resolveExecutablePath };
