const fs = require('fs');
const path = require('path');
const srcDir = 'D:/WorkBuddy Stido/2026-08-12-12-58-18/playtest';
const dstDir = 'D:/WorkBuddy Stido/2026-08-12-12-58-18/_ghpages_build';

// 核心运行文件必须始终覆盖（否则发版后线上仍是旧 JS/HTML，导致"改了但没生效"）
const FORCE = new Set(['index.html', 'game.js', 'audio-data.js']);
let copied = 0, skipped = 0, forced = 0, err = 0;
for (const e of fs.readdirSync(srcDir, { withFileTypes: true, recursive: true })) {
  if (e.isDirectory()) continue;
  const src = path.join(e.parentPath, e.name);
  const rel = path.relative(srcDir, src);
  const dst = path.join(dstDir, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst) && !FORCE.has(e.name)) { skipped++; continue; }
  try { fs.copyFileSync(src, dst); if (FORCE.has(e.name)) forced++; else copied++; }
  catch (ex) { err++; console.error('ERR', rel, ex.message); }
}
console.log('同步完成: 核心覆盖', forced, '新增', copied, '已存在跳过', skipped, '错误', err);
