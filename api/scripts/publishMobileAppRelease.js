#!/usr/bin/env node
/**
 * Publish Machakos Collector APK to this server's database + uploads folder.
 *
 * Usage:
 *   node api/scripts/publishMobileAppRelease.js --version 1.0.0 --apk path/to/app-release.apk
 *   node api/scripts/publishMobileAppRelease.js --version 1.0.1 --apk ... --notes "Bug fixes"
 */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { publishReleaseFromFile } = require('../services/mobileAppReleaseService');

function parseArgs(argv) {
  const out = { version: '', apk: '', notes: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version' && argv[i + 1]) {
      out.version = argv[i + 1];
      i += 1;
    } else if (arg === '--apk' && argv[i + 1]) {
      out.apk = argv[i + 1];
      i += 1;
    } else if ((arg === '--notes' || arg === '--release-notes') && argv[i + 1]) {
      out.notes = argv[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv);
  if (args.help || !args.version || !args.apk) {
    console.log(`Usage: node api/scripts/publishMobileAppRelease.js --version 1.0.0 --apk path/to/app-release.apk [--notes "What's new"]`);
    process.exit(args.help ? 0 : 1);
  }

  try {
    const release = await publishReleaseFromFile({
      sourceApkPath: args.apk,
      version: args.version,
      releaseNotes: args.notes || null,
      originalFileName: `machakos-collector-${args.version}.apk`,
    });
    console.log(JSON.stringify({ ok: true, release }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Publish failed:', err.message || err);
    process.exit(1);
  }
})();
