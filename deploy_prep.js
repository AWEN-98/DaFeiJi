const fs = require('fs');
const path = require('path');

const S = 'D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype';
const D = 'D:/WorkBuddy Stido/2026-08-12-12-58-18/playtest';

fs.mkdirSync(D, { recursive: true });

// 1. 复制运行必需的脚本（与 index.html 同目录）
for (const f of ['index.html', 'audio-data.js', 'game.js']) {
  fs.copyFileSync(path.join(S, f), path.join(D, f));
}

// 2. 从副本 game.js 中删除调试钩子（发版前清理：浏览器只读钩子 window.__v15run + Node 桩 global.__stub.api，均不影响浏览器运行，但保持干净）
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

// 3. 递归复制 assets 资源目录
fs.cpSync(path.join(S, 'assets'), path.join(D, 'assets'), { recursive: true });
console.log('assets 已复制');

// 4. 校验关键文件存在
for (const f of ['index.html', 'game.js', 'audio-data.js']) {
  const p = path.join(D, f);
  console.log(f, fs.existsSync(p) ? 'OK ' + fs.statSync(p).size + 'B' : 'MISSING');
}
console.log('DONE');
