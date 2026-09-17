import fs from 'node:fs';

const from = process.argv[2];
const to = process.argv[3];
if (!from || !to) {
  process.exit(1);
}
fs.cpSync(from, to, { recursive: true });
