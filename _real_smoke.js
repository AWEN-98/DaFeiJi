const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, 'playtest');
const PORT = 8125;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const mime = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith('/') || !path.extname(p)) p = path.join(p, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { const t = msg.text(); if (msg.type() === 'error' && !/404|favicon|Failed to load resource/i.test(t)) errors.push('CONSOLE: ' + t); });
  page.on('requestfailed', req => { if (!req.url().includes('favicon')) errors.push('REQUESTFAILED: ' + req.url() + ' ' + req.failure().errorText); });
  page.on('response', res => { if (res.status() === 404 && !res.url().includes('favicon')) errors.push('HTTP404: ' + res.url()); });
  await page.evaluateOnNewDocument(() => { window.__stub = {}; window.global = window; });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1500);
  await page.evaluate(() => { const b = document.getElementById('titleStart'); if (b) b.click(); });
  await sleep(800);
  await page.evaluate(() => { const b = document.getElementById('tutorialClose'); if (b) b.click(); });
  await sleep(2000);
  const broken = await page.evaluate(() => {
    let count = 0;
    document.querySelectorAll('img').forEach(img => { if (!img.complete || img.naturalWidth === 0) count++; });
    return count;
  });
  await page.screenshot({ path: path.join(__dirname, '.tmp_browser', 'real_smoke_portrait.png'), fullPage: false });
  await browser.close();
  server.close();
  if (broken) errors.push('brokenImgs=' + broken);
  if (errors.length) {
    console.error('SMOKE FAILED:');
    errors.forEach(e => console.error(e));
    process.exit(1);
  }
  console.log('SMOKE OK (portrait 390x844)');
})().catch(e => { console.error(e); process.exit(1); });
