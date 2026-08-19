// stub_check.js —— Node 桩执行真实 game.js：title→mission→弹层开关→banner队列→移动触控，0 错误才放行
const fs = require('fs');
const path = require('path');
const NL = String.fromCharCode(10);

const errors = [];
process.on('uncaughtException', e => { const m = 'uncaught: ' + (e && e.stack || e); errors.push(m); console.error('!! UNCAUGHT:', String(m).split(NL)[0]); });
process.on('unhandledRejection', e => { const m = 'unhandledRejection: ' + (e && e.stack || e); errors.push(m); console.error('!! UNHANDLED:', String(m).split(NL)[0]); });

// ---- Canvas 2D 桩 ----
function makeCtx() {
  const noop = () => {};
  return {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    shadowColor: '', shadowBlur: 0, lineCap: 'butt', lineJoin: 'miter',
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, lineDashOffset: 0,
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arc: noop, arcTo: noop, rect: noop, ellipse: noop, roundRect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, isPointInPath: () => false,
    fill: noop, stroke: noop, clip: noop, fillRect: noop, strokeRect: noop,
    clearRect: noop, fillText: noop, strokeText: noop, translate: noop, rotate: noop,
    scale: noop, transform: noop, setTransform: noop, resetTransform: noop,
    setLineDash: noop, getLineDash: () => [], drawImage: noop, putImageData: noop,
    createPattern: () => ({}),
    measureText: (t) => ({ width: (t ? String(t).length : 0) * 7 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) }),
  };
}

// ---- DOM 元素桩 ----
const elements = {};
function makeEl(id) {
  const handlers = {};
  const el = {
    id, width: 1280, height: 720, style: { setProperty(k, v) { this[k] = String(v); }, getPropertyValue(k) { return this[k]; }, removeProperty(k) { const v = this[k]; delete this[k]; return v; } }, dataset: {},
    textContent: '', innerHTML: '', value: '', checked: false, disabled: false,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); }, toggle(c, f) { const t = f === undefined ? !this._s.has(c) : f; t ? this._s.add(c) : this._s.delete(c); return t; },
    },
    getContext() { if (!this._ctx) { this._ctx = makeCtx(); this._ctx.canvas = this; } return this._ctx; },
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    removeEventListener(type, fn) { if (handlers[type]) handlers[type] = handlers[type].filter(f => f !== fn); },
    appendChild(c) { return c; }, removeChild() {}, remove() {}, setAttribute() {}, getAttribute() { return null; },
    focus() {}, blur() {}, click() { this.dispatchEvent('click', { type: 'click', preventDefault() {}, stopPropagation() {} }); },
    querySelector() { return makeEl(this.id + '_q'); }, querySelectorAll() { return []; },
    firstChild: null, parentNode: null, parentElement: null,
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height }; },
    dispatchEvent(type, evt) { (handlers[type] || []).forEach(fn => { try { fn.call(el, evt || { type, preventDefault() {}, stopPropagation() {} }); } catch (e) { errors.push('handler ' + this.id + '.' + type + ': ' + (e && e.stack || e)); } }); },
  };
  el.firstChild = el; el.parentNode = el; el.parentElement = el;
  return el;
}

// ---- 全局桩 ----
const rafQueue = [];
global.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
global.cancelAnimationFrame = () => {};
global.window = global;
global.devicePixelRatio = 1;
global.innerWidth = 1280; global.innerHeight = 720; global.scrollTo = function () {}; global.scrollX = 0; global.scrollY = 0; global.pageXOffset = 0; global.pageYOffset = 0;
Object.defineProperty(global, 'navigator', { value: { userAgent: 'node-stub', maxTouchPoints: 0, platform: 'Win32' }, configurable: true, writable: true });
global.addEventListener = function (type, fn) { (global._wh = global._wh || {})[type] = (global._wh[type] || []).concat(fn); };
global.removeEventListener = function () {};
global.localStorage = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, clear: () => { for (const k in m) delete m[k]; } }; })();
global.AudioContext = function () { return { currentTime: 0, state: 'running', destination: {}, createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }), createOscillator: () => ({ frequency: { value: 0, setValueAtTime() {} }, type: '', connect() {}, start() {}, stop() {} }), createBufferSource: () => ({ buffer: null, connect() {}, start() {}, stop() {} }), createAnalyser: () => ({ connect() {}, getByteFrequencyData() {} }), decodeAudioData: () => Promise.resolve({}), resume() { return Promise.resolve(); }, suspend() {}, close() {} }; };
global.webkitAudioContext = global.AudioContext;
global.Image = function () { this.width = 0; this.height = 0; this.onload = null; const self = this; Object.defineProperty(this, 'src', { set(v) { this._s = v; if (self.onload) setTimeout(() => self.onload(), 0); }, get() { return this._s; }, configurable: true }); };
// 虚拟时钟：每 tick 推进 dtMs，使游戏用 rAF 时间戳算出的 dt 真实有效（否则紧循环里 now-last≈0，世界不推进）
let VCLK = 0;
global.performance = { now: () => VCLK };

global.document = {
  getElementById(id) { return elements[id] || (elements[id] = makeEl(id)); },
  createElement(tag) { const e = makeEl('_' + tag + '_' + Math.random().toString(36).slice(2, 6)); if (tag === 'canvas') { e.width = 1280; e.height = 720; } return e; },
  querySelector() { return null; }, querySelectorAll() { return []; },
  addEventListener(type, fn) { (global._wh = global._wh || {})[type] = (global._wh[type] || []).concat(fn); },
  removeEventListener() {},
  body: Object.assign(makeEl('body'), {}), documentElement: { style: {} },
  hidden: false, visibilityState: 'visible',
};

// ---- STUB 钩子 ----
global.__stub = { api: {} };

// ---- 执行真实 game.js ----
const code = fs.readFileSync(path.resolve(__dirname, 'game.js'), 'utf8');
try { (0, eval)(code); } catch (e) { errors.push('load: ' + (e && e.stack || e)); }

// ---- 帧驱动 ----
function tick(dtMs) {
  VCLK += (dtMs || 16.7);
  const q = rafQueue.splice(0);
  q.forEach(cb => { try { cb(VCLK); } catch (e) { errors.push('raf: ' + (e && e.stack || e)); } });
}
function key(type, k) {
  const evt = { type, key: k, preventDefault() {}, stopPropagation() {}, repeat: false };
  (global._wh[type] || []).forEach(fn => { try { fn.call(global, evt); } catch (e) { errors.push('key ' + type + ' ' + k + ': ' + (e && e.stack || e)); } });
}
function touch(id, type, x, y) {
  if (!elements[id]) elements[id] = makeEl(id);
  elements[id].dispatchEvent(type, { type, changedTouches: [{ identifier: 7, clientX: x, clientY: y, pageX: x, pageY: y }], touches: [], preventDefault() {}, stopPropagation() {} });
}
function numOK(v) { return typeof v === 'number' && isFinite(v); }
function scanNaN() {
  const p = api.player && api.player();
  if (p) ['x','y','vx','vy','hp','maxhp','dashT','dashDX','dashDY','dashCd','iframe'].forEach(k => { if (!numOK(p[k])) errors.push('NaN player.' + k + '=' + p[k]); });
  const es = api.enemies ? api.enemies() : [];
  for (let i = 0; i < es.length; i++) { const e = es[i]; ['x','y','vx','vy','hp','maxhp','chargeState','chargeT','chargeDist'].forEach(k => { if (!numOK(e[k])) errors.push('NaN enemies[' + i + '].' + k + '=' + e[k] + ' arche=' + (e.arche || '?')); }); }
  const ls = api.loot ? api.loot() : [];
  for (let i = 0; i < ls.length; i++) { const it = ls[i]; ['x','y','vx','vy'].forEach(k => { if (!numOK(it[k])) errors.push('NaN loot[' + i + '].' + k + '=' + it[k]); }); }
}
function summary() {
  console.log('----');
  console.log('total errors:', errors.length);
  errors.slice(0, 10).forEach(e => console.log('ERR>', String(e).split(NL).slice(0, 3).join(' | ')));
}

const api = global.__stub.api;
console.log('api keys:', Object.keys(api).join(','));

try {
  // 1) title 帧
  for (let i = 0; i < 30; i++) tick(16.7);

  // 2) 进 mission + 180 帧
  try { api.startMission(); } catch (e) { errors.push('startMission: ' + (e.stack || e)); }
  for (let i = 0; i < 180; i++) tick(16.7);
  console.log('scene:', api.scene(), '| runPhase:', api.runPhase(), '| paused:', api.paused());

  // 3) banner 队列：两条不同通知共存 + 同文本去重
  // 先用全新 mission 清场（避免前面 180 帧战斗引入的 buff 弹层/死亡导致 update 停摆、横幅冻结）
  try { api.startMission(); } catch (e) { errors.push('startMission(3): ' + (e.stack || e)); }
  for (let i = 0; i < 10; i++) tick(16.7);
  api.setBanner('第一条通知', 1.2, '#C9A24B');
  api.setBanner('第二条通知', 1.0);
  api.setBanner('第一条通知', 0.8); // 去重：应刷新而非新增
  const q = api.bannerQ();
  const firstCount = q.filter(b => b.text === '第一条通知').length;
  if (firstCount !== 1) errors.push('dedup FAILED: 第一条通知 appears ' + firstCount + ' times (expected 1)');
  const hasBoth = q.some(b => b.text === '第一条通知') && q.some(b => b.text === '第二条通知');
  if (!hasBoth) errors.push('bannerQ missing a test banner');
  console.log('bannerQ (after dedup):', q.map(b => b.text).join(' / '), '| 第一条 count =', firstCount);
  // 横幅过期窗口：排除“随机升级弹出 buff 选择层→paused→update 停摆→横幅冻结”的偶发干扰（与 merge/pause flaky 同源）
  let _expired = false;
  for (let k = 0; k < 16 && !_expired; k++) {
    for (let i = 0; i < 20; i++) tick(16.7); // 0.33s
    if (api.paused() || api.overlaysOpen()) { if (api.cleanState) api.cleanState(); continue; }
    const _a = api.bannerQ();
    if (!_a.some(b => b.text === '第一条通知' || b.text === '第二条通知')) _expired = true;
  }
  const after = api.bannerQ();
  if (after.some(b => b.text === '第一条通知' || b.text === '第二条通知')) errors.push('test banners did not expire');
  else console.log('test banners expired OK; leftover game banners =', after.length);
  for (let i = 0; i < 60; i++) tick(16.7);

  // 清场：随机模拟可能已弹出 buff/裂隙/秘库等弹层并使 paused=true，强制回到纯净 mission 态，
  // 避免确定性开关断言被随机游戏事件污染（flaky 修复）
  if (api.cleanState) api.cleanState();
  for (let i = 0; i < 5; i++) tick(16.7);
  if (api.paused() || api.overlaysOpen()) errors.push('cleanState FAILED: still paused/overlay after clean');

  // 4) 键盘输入：m 开/关合成弹层、p 暂停/恢复、f 翻相（各自独立、互不污染）
  // 4a) 'm' 键开/关合成弹层（直接检查 mergeOverlay 显示态，避免被其他弹层污染）
  key('keydown', 'm'); key('keyup', 'm');
  if (document.getElementById('mergeOverlay').style.display !== 'flex') errors.push("'m' key should OPEN merge overlay");
  for (let i = 0; i < 5; i++) tick(16.7);
  key('keydown', 'm'); key('keyup', 'm');
  if (document.getElementById('mergeOverlay').style.display === 'flex') errors.push("'m' key should CLOSE merge overlay");
  for (let i = 0; i < 5; i++) tick(16.7);
  // 4b) 'p' 键暂停 / 恢复（含暂停期间 else 清 keys 路径）
  key('keydown', 'p'); key('keyup', 'p');
  if (!api.paused()) errors.push("'p' key should PAUSE");
  for (let i = 0; i < 20; i++) tick(16.7);
  key('keydown', 'p'); key('keyup', 'p');
  if (api.paused()) errors.push("'p' key should RESUME");
  for (let i = 0; i < 20; i++) tick(16.7);
  // 4c) 'f' 翻相（不影响暂停/弹层）
  key('keydown', 'f'); key('keyup', 'f');
  for (let i = 0; i < 5; i++) tick(16.7);

  // 5) api.toggleMerge 开/关合成弹层 + 帧渲染（此时弹层已关闭，状态干净）
  if (api.cleanState) api.cleanState();
  api.toggleMerge();
  if (document.getElementById('mergeOverlay').style.display !== 'flex') errors.push('api.toggleMerge should OPEN overlay');
  for (let i = 0; i < 10; i++) tick(16.7);
  api.renderFrame();
  api.toggleMerge();
  if (document.getElementById('mergeOverlay').style.display === 'flex') errors.push('api.toggleMerge should CLOSE overlay');
  for (let i = 0; i < 30; i++) tick(16.7);

  // 6) 移动端按钮触控（touchstart/touchend 全按钮扫一遍）
  ['dashBtn', 'consBtn', 'ultBtn', 'pauseBtnMobile', 'phaseBtn', 'mergeBtn', 'pickupBtn', 'backpackBtn'].forEach(id => {
    touch(id, 'touchstart', 60, 60); touch(id, 'touchend', 60, 60);
    for (let i = 0; i < 3; i++) tick(16.7);
  });

  // 6b) 右摇杆「瞄准+开火一体」接线（桌面桩 isMobile=false，仍验证 touchstart/touchend 对 aimJoy.active 的置位/复位；持续开火链路由 stub_mobile 断言）
  if (api.cleanState) api.cleanState();
  touch('right-stick-container', 'touchstart', 60, 60);
  if (api.rightStickActiveState() !== true) errors.push('right-stick touchstart should set aimJoy.active=true');
  touch('right-stick-container', 'touchend', 60, 60);
  if (api.rightStickActiveState() !== false) errors.push('right-stick touchend should reset aimJoy.active=false');
  console.log('right-stick wiring OK (active toggle true→false)');

  // 6c) 熔炼台底抽链路（2026-08-19）：点圆盘热区 → 底抽弹开 → 投料 2 件激活合成钮 / 1 件禁用
  try { api.openForgeDrawer(0); } catch (e) { errors.push('openForgeDrawer: ' + (e.stack || e)); }
  const fdEl = document.getElementById('forgeDrawer');
  if (!fdEl || !fdEl.classList.contains('open')) errors.push('forge drawer should be .open after openForgeDrawer');
  api.fillForgeSlot(0, '__t1');
  api.fillForgeSlot(1, '__t2');
  if (api.forgeSelCount() !== 2) errors.push('forgeSel should hold 2 after two fills (got ' + api.forgeSelCount() + ')');
  if (api.forgeCraftDisabled() !== false) errors.push('forgeCraft should be ENABLED with 2 materials');
  api.fillForgeSlot(0, '__t1'); // 已选 → 取消 → 剩 1 件
  if (api.forgeSelCount() !== 1) errors.push('forgeSel should drop to 1 after toggle-off (got ' + api.forgeSelCount() + ')');
  if (api.forgeCraftDisabled() !== true) errors.push('forgeCraft should be DISABLED with <2 materials');
  try { api.closeForgeDrawer(); } catch (e) { errors.push('closeForgeDrawer: ' + (e.stack || e)); }
  if (fdEl && fdEl.classList.contains('open')) errors.push('forge drawer should close after closeForgeDrawer');
  console.log('forge drawer chain OK: open → fill×2 enable craft → toggle-off disable → close');

  // 7) canvas 触摸（弹层关闭态）+ 玩家受损到低血 vignette 路径
  touch('gameCanvas', 'touchstart', 100, 300);
  for (let i = 0; i < 30; i++) tick(16.7);
  try { api.damagePlayer(999); } catch (e) { errors.push('damage: ' + (e.stack || e)); }
  for (let i = 0; i < 30; i++) tick(16.7);

  // 8) 长跑 300 帧兜底
  for (let i = 0; i < 300; i++) tick(16.7);

  // 9) 冲刺（闪避）路径：按住方向 + shift 触发 dash，跑若干帧后扫描 NaN（验证 ease-out 爬升无瞬移/无 NaN）
  key('keydown', 'd'); key('keydown', 'w'); key('keydown', 'shift');
  for (let i = 0; i < 40; i++) tick(16.7);
  key('keyup', 'shift');
  for (let i = 0; i < 60; i++) tick(16.7); // 覆盖 dashT(DASH_DUR=0.62s≈37帧) 全过程 + 收尾阻尼滑行
  key('keyup', 'd'); key('keyup', 'w');
  for (let i = 0; i < 30; i++) tick(16.7);

  // 10) NaN / 无限扫描：玩家与全部敌人坐标/速度/状态必须为有限数值
  scanNaN();
} catch (e) {
  errors.push('FLOW: ' + (e && e.stack || e));
}

scanNaN();
summary();
process.exit(errors.length ? 1 : 0);
