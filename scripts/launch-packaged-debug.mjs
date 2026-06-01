/**
 * Launch packaged Testrix and inspect brand logo loading in the renderer.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'release', 'win-unpacked', 'Testrix.exe');

const child = spawn(exe, ['--remote-debugging-port=9222'], {
  detached: true,
  stdio: 'ignore',
});

child.unref();
console.log('Launched', exe, 'pid', child.pid);
console.log('Open chrome://inspect or wait 8s for manual check');
