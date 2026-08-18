// stub_los.js —— Node 桩校验锚点簇 PCG 地图生成 + 视线遮挡(Line of Sight) 战术联动，0 错误才放行
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
const elements = {};
function makeEl(id) {
  const handlers = {};
  const el = {
    id, width: 1280, height: 720, style: {}, dataset: {},
    textContent: '', innerHTML: '', value: '', checked: false, disabled: false,
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, contains(c) { return this._s.has(c); }, toggle(c, f) { const t = f === undefined ? !this._s.has(c) : f; t ? this._s.add(c) : this._s.delete(c); return t; } },
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
global.__stub = { api: {} };

const code = fs.readFileSync(path.resolve(__dirname, 'game.js'), 'utf8');
try { (0, eval)(code); } catch (e) { errors.push('load: ' + (e && e.stack || e)); }

function tick(dtMs) { VCLK += (dtMs || 16.7); const q = rafQueue.splice(0); q.forEach(cb => { try { cb(VCLK); } catch (e) { errors.push('raf: ' + (e && e.stack || e)); } }); }
function numOK(v) { return typeof v === 'number' && isFinite(v); }
function rectGap(a, b) {
  const ax1 = a.x - a.hw, ay1 = a.y - a.hh, ax2 = a.x + a.hw, ay2 = a.y + a.hh;
  const bx1 = b.x - b.hw, by1 = b.y - b.hh, bx2 = b.x + b.hw, by2 = b.y + b.hh;
  const dx = Math.max(ax1 - bx2, bx1 - ax2);
  const dy = Math.max(ay1 - by2, by1 - ay2);
  if (dx < 0 && dy < 0) return -1;
  if (dx < 0) return dy;
  if (dy < 0) return dx;
  return Math.hypot(dx, dy);
}

const api = global.__stub.api;
console.log('api keys:', Object.keys(api).join(','));

try {
  api.startMission();
  for (let i = 0; i < 20; i++) tick(16.7);

  const obstacles = api.obstacles();
  const rooftops = api.buildingRooftops();
  const buildings = obstacles.filter(o => o.type === 'wall' && o.building);
  const towers = obstacles.filter(o => o.type === 'wall' && o.helipad);
  const rocks = obstacles.filter(o => o.type === 'rock'); // 碎石散点应被废除
  const rifts = obstacles.filter(o => o.type === 'rift');

  console.log('obstacles total:', obstacles.length, '| buildings(wall+building):', buildings.length, '| towers(helipad):', towers.length, '| rifts:', rifts.length, '| rocks(scattered):', rocks.length, '| rooftops:', rooftops.length);

  // 1) 锚点簇：主塔楼数量应落在 5~7
  if (towers.length < 5) errors.push('ANCHOR FAILED: towers=' + towers.length + ' (expected >=5)');
  if (towers.length > 7) errors.push('ANCHOR FAILED: towers=' + towers.length + ' (expected <=7)');

  // 2) 碎石散点应被废除（不再生成 rock 类型障碍）
  if (rocks.length > 0) errors.push('ROCKS NOT ABOLISHED: ' + rocks.length + ' scattered rocks remain');

  // 3) 楼顶停机坪锚点应存在（供宝箱/封印柱锚定）
  if (rooftops.length < 5) errors.push('ROOFTOP FAILED: buildingRooftops=' + rooftops.length + ' (expected >=5)');

  // 4) 空中主干道 Skyways：任意两主塔楼包围盒最小间隙应 >= 150（目标 220~280）
  let minGap = Infinity;
  for (let i = 0; i < towers.length; i++) for (let j = i + 1; j < towers.length; j++) { const g = rectGap(towers[i], towers[j]); if (g < minGap) minGap = g; }
  console.log('min skyway gap between towers:', minGap === Infinity ? 'n/a' : minGap.toFixed(1));
  if (minGap !== Infinity && minGap < 150) errors.push('SKYWAY FAILED: min gap=' + minGap.toFixed(1) + ' (<150, 战机易卡墙)');

  // 5) checkLineOfSight 单元校验（插入已知墙体后判定）
  api.forceWall(400, 400, 50, 50);           // 墙 x∈[350,450], y∈[350,450]
  const losCross = api.checkLineOfSight(300, 400, 500, 400);   // 水平穿过墙体 → 应 false
  const losMiss = api.checkLineOfSight(300, 400, 300, 600);    // 竖直线 x=300，不穿墙 → 应 true
  const losMiss2 = api.checkLineOfSight(100, 100, 100, 200);   // 远离墙 → 应 true
  console.log('LOS cross(应false):', losCross, '| LOS miss(应true):', losMiss, '| LOS miss2(应true):', losMiss2);
  if (losCross !== false) errors.push('LOS FAILED: segment crossing wall should be blocked');
  if (losMiss !== true) errors.push('LOS FAILED: vertical segment clear of wall should be visible');
  if (losMiss2 !== true) errors.push('LOS FAILED: distant segment should be visible');

  // 6) 狙击手视线阻断：墙体挡在狙击手与玩家之间 → sniperCharge 应保持 0（激光切断）
  const p = api.player();
  const sn = api.spawnSniper();
  api.forceWall((p.x + sn.x) / 2, (p.y + sn.y) / 2, 60, 60);
  for (let i = 0; i < 40; i++) tick(16.7);
  console.log('sniper LOS-blocked charge (应≈0):', sn.sniperCharge.toFixed(3), '| sniper alert:', sn.alert);
  if (!(sn.sniperCharge < 0.5)) errors.push('SNIPER LOS FAILED: charge=' + sn.sniperCharge.toFixed(3) + ' (LOS blocked → should stay ~0)');
  if (sn.alert !== 2) errors.push('SNIPER LOS FAILED: alert lost (expected 2)');

  // 7) 长跑 + NaN 扫描（楼宇碰撞解算管线 + LOS 全敌调用无报错/无 NaN）
  for (let i = 0; i < 300; i++) tick(16.7);
  if (!numOK(p.x) || !numOK(p.y) || !numOK(p.hp)) errors.push('NaN player: x=' + p.x + ' y=' + p.y + ' hp=' + p.hp);
  const es = api.enemies();
  for (let i = 0; i < es.length; i++) { const e = es[i]; ['x', 'y', 'hp', 'alert', 'sniperCharge'].forEach(k => { if (!numOK(e[k])) errors.push('NaN enemies[' + i + '].' + k + '=' + e[k] + ' arche=' + (e.arche || '?')); }); }

  // 8) 渲染若干帧（drawObstacles 2.5D 投影 / 窗格 / 楼顶 H 标路径无报错）
  for (let i = 0; i < 30; i++) { api.renderFrame(); tick(16.7); }
} catch (e) {
  errors.push('FLOW: ' + (e && e.stack || e));
}

console.log('----');
console.log('total errors:', errors.length);
errors.slice(0, 12).forEach(e => console.log('ERR>', String(e).split(NL).slice(0, 3).join(' | ')));
process.exit(errors.length ? 1 : 0);
