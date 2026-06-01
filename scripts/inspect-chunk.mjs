import fs from 'node:fs';
import path from 'node:path';

const browser = path.join(process.cwd(), 'release/win-unpacked/resources/browser');
const chunk = fs.readdirSync(browser).find((f) => {
  const s = fs.readFileSync(path.join(browser, f), 'utf8');
  return s.includes('resolveStaticAssetUrl') && f.endsWith('.js');
});
const s = fs.readFileSync(path.join(browser, chunk), 'utf8');
const idx = s.indexOf('resolveStaticAssetUrl');
console.log('chunk', chunk);
console.log(s.slice(Math.max(0, idx - 120), idx + 280));
