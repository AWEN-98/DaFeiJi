// 真实浏览器冒烟验证脚本（不入 git，.tmp_browser/ 被 .gitignore 排除后手动加）
// 驱动本机 Chrome 打开游戏页面：收集控制台错误 + 模拟点击 + 截图 + 报告
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8123/index.html';
const OUT = 'D:\\WorkBuddy Stido\\2026-08-12-12-58-18\\.tmp_browser';

const report = [];
const errors = [];
const consoleMsgs = [];
const failedImgs = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});

try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.type();
    const txt = `[${t}] ${m.text()}`;
    consoleMsgs.push(txt);
    if (t === 'error' || t === 'warning') report.push('CONSOLE_' + txt);
  });
  page.on('pageerror', (e) => {
    errors.push('PAGEERROR: ' + e.message + '\n' + e.stack);
    report.push('PAGEERROR: ' + e.message);
  });
  page.on('requestfailed', (r) => {
    report.push('REQFAIL: ' + r.url() + ' ' + r.failure()?.errorText);
  });

  // 拦截响应，记录 404/5xx
  page.on('response', (r) => {
    const s = r.status();
    if (s >= 400) report.push(`HTTP_${s}: ${r.url()}`);
  });

  report.push('=== STEP 1: open page ===');
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: OUT + '\\01_after_load.png' });

  // 检查场景状态
  const s1 = await page.evaluate(() => {
    const get = (id) => {
      const el = document.getElementById(id);
      return el ? { display: el.style.display, exists: true } : { exists: false };
    };
    return {
      title: get('title'),
      base: get('base'),
      enterOverlay: get('enterOverlay'),
      loadMask: get('loadMask'),
      titleStartVisible: !!document.getElementById('titleStart'),
      imgCount: document.querySelectorAll('img').length,
      brokenImgs: Array.from(document.querySelectorAll('img')).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
      pendingImgs: Array.from(document.querySelectorAll('img')).filter((i) => !i.complete).map((i) => i.src),
    };
  });
  report.push('STATE_AFTER_LOAD: ' + JSON.stringify(s1, null, 2));

  // 如果有 loadMask 还在显示，等它消失
  report.push('=== STEP 2: wait for loadMask fade ===');
  for (let i = 0; i < 30; i++) {
    const lm = await page.evaluate(() => {
      const m = document.getElementById('loadMask');
      return m ? { display: m.style.display, opacity: m.style.opacity } : { exists: false };
    });
    if (!lm.exists || lm.display === 'none') {
      report.push(`loadMask gone at iter ${i}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await page.screenshot({ path: OUT + '\\02_after_loadmask.png' });

  // 点 "点击进入" 按钮
  report.push('=== STEP 3: click titleStart ===');
  const ts1 = await page.evaluate(() => {
    const b = document.getElementById('titleStart');
    if (!b) return { found: false };
    b.click();
    return { found: true, text: b.textContent };
  });
  report.push('titleStart: ' + JSON.stringify(ts1));
  await new Promise((r) => setTimeout(r, 500));

  // 等待进入基地
  for (let i = 0; i < 30; i++) {
    const baseShown = await page.evaluate(() => {
      const b = document.getElementById('base');
      return b && b.style.display === 'flex';
    });
    if (baseShown) {
      report.push(`base shown at iter ${i}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 3000)); // 等基地内容渲染
  await page.screenshot({ path: OUT + '\\03_after_click.png', fullPage: false });

  // 详细状态：基地 DOM + 图片加载 + 加载门状态
  const s2 = await page.evaluate(() => {
    const base = document.getElementById('base');
    const loadMask = document.getElementById('loadMask');
    const allImgs = Array.from(document.querySelectorAll('img'));
    return {
      baseDisplay: base ? base.style.display : 'NULL',
      baseTab: document.querySelector('.tab.on')?.dataset?.tab || document.querySelector('.tab')?.dataset?.tab,
      loadMaskDisplay: loadMask ? loadMask.style.display : 'NULL',
      loadMaskOpacity: loadMask ? loadMask.style.opacity : 'NULL',
      totalImgs: allImgs.length,
      completeImgs: allImgs.filter((i) => i.complete).length,
      brokenImgs: allImgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.substring(i.src.lastIndexOf('/') + 1)),
      pendingImgs: allImgs.filter((i) => !i.complete).map((i) => i.src.substring(i.src.lastIndexOf('/') + 1)),
      // 尝试访问全局 AssetManager/HtmlAssets（如果游戏暴露了）
      debugHooks: {
        hasAssetManager: typeof window.AssetManager !== 'undefined' || typeof globalThis.AssetManager !== 'undefined',
        hasHtmlAssets: typeof window.HtmlAssets !== 'undefined' || typeof globalThis.HtmlAssets !== 'undefined',
        hasStub: !!window.__stub,
      },
      // 基地内可见的 tab 内容（机库/研究院/军械库等的卡片数量）
      hangarSlots: document.querySelectorAll('#tab-hangar .eq-slot, #hangarEquip .eq-slot').length,
      hangarImgs: Array.from(document.querySelectorAll('#tab-hangar img, #hangarEquip img')).map((i) => ({
        src: i.src.substring(i.src.lastIndexOf('/') + 1),
        complete: i.complete,
        naturalWidth: i.naturalWidth,
      })).slice(0, 10),
      researchCards: document.querySelectorAll('.research-card').length,
      researchImgs: Array.from(document.querySelectorAll('#tab-lab img, #researchList img')).map((i) => ({
        src: i.src.substring(i.src.lastIndexOf('/') + 1),
        complete: i.complete,
        naturalWidth: i.naturalWidth,
      })).slice(0, 10),
    };
  });
  report.push('STATE_AFTER_CLICK: ' + JSON.stringify(s2, null, 2));

  // 切换到研究院 tab 看科技卡
  report.push('=== STEP 4: click lab tab ===');
  await page.evaluate(() => {
    const t = document.querySelector('.tab[data-tab="lab"]');
    if (t) t.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: OUT + '\\04_lab_tab.png' });
  const s3 = await page.evaluate(() => ({
    labOn: document.getElementById('tab-lab')?.classList?.contains('on'),
    researchCards: document.querySelectorAll('.research-card').length,
    cardStates: Array.from(document.querySelectorAll('.research-card')).map((c) => ({
      cls: c.className,
      text: (c.textContent || '').substring(0, 50),
    })).slice(0, 8),
    iconImgs: Array.from(document.querySelectorAll('#tab-lab .research-card .rc-icon img')).map((i) => ({
      src: i.src.substring(i.src.lastIndexOf('/') + 1),
      complete: i.complete,
      naturalWidth: i.naturalWidth,
    })),
  }));
  report.push('LAB_TAB: ' + JSON.stringify(s3, null, 2));

  // 切到机库
  await page.evaluate(() => { const t = document.querySelector('.tab[data-tab="hangar"]'); if (t) t.click(); });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: OUT + '\\05_hangar_tab.png' });

  // 切到军械库
  await page.evaluate(() => { const t = document.querySelector('.tab[data-tab="arsenal"]'); if (t) t.click(); });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: OUT + '\\06_arsenal_tab.png' });

  // 切到熔炼台
  await page.evaluate(() => { const t = document.querySelector('.tab[data-tab="forge"]'); if (t) t.click(); });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: OUT + '\\07_forge_tab.png' });
  const s4 = await page.evaluate(() => ({
    forgeOn: document.getElementById('tab-forge')?.classList?.contains('on'),
    fgSlots: document.querySelectorAll('.fg-slot').length,
    forgeImgs: Array.from(document.querySelectorAll('#tab-forge img, #tab-forge .fg-slot')).length,
  }));
  report.push('FORGE_TAB: ' + JSON.stringify(s4));
} catch (e) {
  report.push('FATAL: ' + e.message + '\n' + e.stack);
} finally {
  await browser.close();
}

const out = {
  consoleMsgs,
  pageErrors: errors,
  failedRequests: report.filter((r) => r.startsWith('REQFAIL') || r.startsWith('HTTP_')),
  stateReport: report,
};
fs.writeFileSync(OUT + '\\verify_report.json', JSON.stringify(out, null, 2));
console.log('===REPORT===');
console.log(report.join('\n'));
console.log('===CONSOLE MSGS (' + consoleMsgs.length + ')===');
console.log(consoleMsgs.slice(-30).join('\n'));
console.log('===PAGE ERRORS (' + errors.length + ')===');
console.log(errors.join('\n---\n'));
console.log('Screenshots saved to ' + OUT);
