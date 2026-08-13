const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(process.env.CODEX_NODE_MODULES + '/playwright');

(async () => {
  const root = path.resolve(__dirname, '../../..');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CODEX_BROWSER_EXE, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push('page: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push('console: ' + message.text()); });

  const gameUrl = pathToFileURL(path.join(root, 'index.html')).href;
  await page.goto(gameUrl + '?qa=base#qa-base', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(__dirname, 'base-ui-check.png'), fullPage: true });

  await page.goto(gameUrl + '?qa=arsenal#qa-arsenal', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'arsenal-ui-check.png'), fullPage: true });

  await page.goto(gameUrl + '?qa=runes#qa-runes', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'rune-ui-check.png'), fullPage: true });

  await page.goto(gameUrl + '?qa=deploy#qa-deploy', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(__dirname, 'deploy-ui-check.png'), fullPage: true });

  await page.goto(pathToFileURL(path.join(root, 'assets/v2/showcase.html')).href, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(1200);
  const failedImages = await page.locator('img').evaluateAll(images => images.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.getAttribute('src')));
  await page.screenshot({ path: path.join(__dirname, 'asset-showcase-check.png'), fullPage: true });
  await browser.close();

  if (errors.length || failedImages.length) {
    console.error(JSON.stringify({ errors, failedImages }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, screenshots: ['base-ui-check.png', 'arsenal-ui-check.png', 'rune-ui-check.png', 'deploy-ui-check.png', 'asset-showcase-check.png'], failedImages: 0 }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
