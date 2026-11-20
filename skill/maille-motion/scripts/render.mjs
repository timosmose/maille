#!/usr/bin/env node
// Frame-exact render of a Maille film page to MP4 (or one still PNG).
//
//   node render.mjs film.html --fps 30 --out film.mp4
//   node render.mjs film.html --still 4.2 --out still.png
//   node render.mjs film.html --from 5 --to 10 --out part.mp4
//   node render.mjs film.html --w 1920 --h 1080 --out wide.mp4
//
// The page must expose window.ready (a promise), window.seek(t), window.frame() (PNG data URL),
// window.DURATION and window.SIZE, as templates/film.html does. The page's folder is served over
// a local http server so images, fonts and maille.js load the same way they would online.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname, basename, extname, join, normalize, sep } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const page = args.find((a) => !a.startsWith('--') && /\.html?$/.test(a));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] != null && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
if (!page) { console.error('Usage: node render.mjs film.html [--fps 30] [--out film.mp4] [--still t] [--from s] [--to s] [--w px --h px]'); process.exit(1); }

const fps = Math.max(1, Math.min(120, +opt('fps', 30) || 30)), still = opt('still'), out = opt('out', still != null ? 'still.png' : 'film.mp4');
const root = dirname(resolve(page)), file = basename(page);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css', '.woff2': 'font/woff2' };

// Serves only the film's folder, only to this machine
const server = createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  const path = normalize(join(root, pathname));
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  let body;
  try { body = await readFile(path); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream' }).end(body);
}).listen(0, '127.0.0.1');
const port = server.address().port;

const size = (opt('w') ? `&w=${+opt('w')}` : '') + (opt('h') ? `&h=${+opt('h')}` : '');
// CHROME_PATH=/path/to/chrome uses an installed Chrome instead of Playwright's own Chromium
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const tab = await browser.newPage({ viewport: { width: 1280, height: 1280 } });
tab.on('pageerror', (e) => console.error('page error:', e.message));
tab.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('page:', m.text()); });
await tab.goto(`http://localhost:${port}/${file}?capture${size}`);
await tab.evaluate(() => window.ready);
const { duration, W, H } = await tab.evaluate(() => ({ duration: window.DURATION, W: window.SIZE[0], H: window.SIZE[1] }));

const grab = async (t) => Buffer.from((await tab.evaluate((tt) => { window.seek(tt); return window.frame(); }, t)).split(',')[1], 'base64');

if (still != null) {
  await writeFile(out, await grab(+still));
  console.log(`${out} at ${still} s (${W}×${H})`);
} else {
  const from = +opt('from', 0), to = +opt('to', duration), n = Math.round((to - from) * fps);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, ko) => {
    ff.on('error', (e) => ko(new Error(e.code === 'ENOENT' ? 'ffmpeg was not found: install it (brew install ffmpeg, apt install ffmpeg)' : e.message)));
    ff.on('close', (c) => (c === 0 ? ok() : ko(new Error('ffmpeg exited with ' + c))));
  });
  ff.stdin.on('error', () => {}); // reported by "close" above
  for (let i = 0; i < n; i++) {
    const png = await grab(from + i / fps);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % fps === 0) process.stdout.write(`\r${(i / fps).toFixed(0)} / ${((n - 1) / fps).toFixed(0)} s`);
  }
  ff.stdin.end();
  await done;
  console.log(`\n${out}: ${n} frames, ${W}×${H}, ${fps} fps`);
}
await browser.close();
server.close();
