/**
 * Runs a command with `CSC_IDENTITY_AUTO_DISCOVERY=false` (local unsigned Windows builds).
 * Replaces cross-env when node_modules bin links are broken.
 */
import { spawnSync } from 'node:child_process';

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

const command = process.argv.slice(2).join(' ').trim();
if (!command) {
  console.error('[no-code-sign-discovery] usage: node scripts/no-code-sign-discovery.mjs <command...>');
  process.exit(1);
}

const result = spawnSync(command, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
