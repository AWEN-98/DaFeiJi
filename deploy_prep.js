const fs = require('fs');
const path = require('path');
const re = require('path');

const S = 'D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype';
const D = 'D:/WorkBuddy Stido/2026-08-12-12-58-18/playtest';

fs.mkdirSync(D, { recursive: true });

// 1. 复制运行必需的脚本（与 index.html 同目录）
for (const f of ['index.html', 'audio-data.js', 'game.js']) {
  fs.copyFileSync(path.join(S, f), path.join(D, f));
}

// 2. 从副本 game.js 中删除调试钩子（发版前清理）
const gf = path.join(D, 'game.js');
let s = fs.readFileSync(gf, 'utf8');
const start = s.indexOf('// ---------- 浏览器冒烟只读钩子');
const endMarker = '  // ---------- 移动端启动遮罩';
const endIdx = s.indexOf(endMarker);
if (start >= 0 && endIdx > 0) {
  s = s.slice(0, start) + s.slice(endIdx);
  fs.writeFileSync(gf, s);
  console.log('STUB 钩子已删除');
} else {
  console.log('STUB 标记未找到，跳过');
}

// 3. 提取游戏真实引用的资产路径（覆盖所有前缀变量拼接），只打包被引用的，剔除无用文件
const js = fs.readFileSync(path.join(S, 'game.js'), 'utf8');
const html = fs.readFileSync(path.join(S, 'index.html'), 'utf8');

// 动态扫描所有「var AX = 'assets/...'」前缀变量（A1/A2/A3/A4... 不漏）
const prefixVars = {}; // 变量名 -> 前缀路径
for (const m of js.matchAll(/var\s+(A\d|[A-Z]\d)\s*=\s*['"]([^'"]+)['"]/g)) {
  prefixVars[m[1]] = m[2];
}

const refs = new Set();
// JS 直接字符串
for (const m of js.matchAll(/['"](assets\/[^'"]+\.(?:png|jpg|svg|json))['"]/g)) refs.add(m[1]);
// JS: 任意前缀变量 + 'xxx' 拼接
for (const [v, pre] of Object.entries(prefixVars)) {
  const reConcat = new RegExp(v + "\\s*\\+\\s*['\"]([^'\"]+)['\"]", 'g');
  for (const m of js.matchAll(reConcat)) refs.add(pre + m[1]);
}
// HTML 引用
for (const m of html.matchAll(/assets\/[^\"'') ]+\.(?:png|jpg|svg|json)/g)) refs.add(m[0]);

console.log('扫描到前缀变量:', Object.keys(prefixVars).join(','), ' 提取引用资产:', refs.size);

// 4. 安全增量复制被引用的资产（不清空、不删任何文件，已存在则跳过）
const targetAssets = path.join(D, 'assets');
let copied = 0, skipped = 0, missing = 0;
for (const rel of refs) {
  const src = path.join(S, rel);
  const dst = path.join(D, rel);
  if (fs.existsSync(src) && fs.statSync(src).isFile()) {
    if (fs.existsSync(dst)) { skipped++; continue; } // 已存在，不覆盖不删除
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
  } else {
    missing++;
    if (missing <= 20) console.log('  [引用但缺失]', rel);
  }
}
console.log('被引用资产: 新增复制', copied, ' 已存在跳过', skipped, ' 缺失(代码引用但磁盘无)', missing);

// 4b. 兜底复制资产目录：大量路径为 JS 动态拼接（如 'assets/v4/weapons/weapon_r'+r+'_c'+c+'.png'、
//     'assets/v2/items/icons/'+k+'.png'、'assets/v2/vfx/sprites/vfx_*.png'），静态正则无法捕获。
//     直接整目录兜底复制 v1~v4（增量、不删、已存在跳过），彻底消除线上 404。
const uiFallbackDirs = ['assets/v1', 'assets/v2', 'assets/v3', 'assets/v4'];
for (const relDir of uiFallbackDirs) {
  const srcDir = path.join(S, relDir);
  const dstDir = path.join(D, relDir);
  if (!fs.existsSync(srcDir)) continue;
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true, recursive: true })) {
    if (e.isDirectory()) continue;
    const full = path.join(e.parentPath, e.name);
    const rel = path.relative(S, full);
    const src = path.join(S, rel);
    const dst = path.join(D, rel);
    if (fs.existsSync(dst)) { skipped++; continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
  }
}
console.log('兜底复制后: 新增复制', copied, ' 已存在跳过', skipped);

// 5. 校验关键文件存在
for (const f of ['index.html', 'game.js', 'audio-data.js']) {
  const p = path.join(D, f);
  console.log(f, fs.existsSync(p) ? 'OK ' + fs.statSync(p).size + 'B' : 'MISSING');
}
// 6. 输出 assets 体积
function dirSize(d) {
  let t = 0;
  if (!fs.existsSync(d)) return 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) t += dirSize(p);
    else t += fs.statSync(p).size;
  }
  return t;
}
const sz = dirSize(targetAssets);
console.log('playtest/assets 体积: ' + (sz / 1024 / 1024).toFixed(1) + ' MB  文件数: ' + (function count(d){let n=0;if(!fs.existsSync(d))return 0;for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())n+=count(p);else n++;}return n;})(targetAssets));
console.log('DONE');
