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
    textContent: '', value: '', checked: false, disabled: false, children: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); }, toggle(c, f) { const t = f === undefined ? !this._s.has(c) : f; t ? this._s.add(c) : this._s.delete(c); return t; },
    },
    getContext() { if (!this._ctx) { this._ctx = makeCtx(); this._ctx.canvas = this; } return this._ctx; },
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    removeEventListener(type, fn) { if (handlers[type]) handlers[type] = handlers[type].filter(f => f !== fn); },
    appendChild(c) { this.children.push(c); c.parentNode = this; c.parentElement = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    remove() {}, setAttribute() {}, getAttribute() { return null; },
    focus() {}, blur() {}, click() { this.dispatchEvent('click', { type: 'click', preventDefault() {}, stopPropagation() {} }); },
    querySelector() { return makeEl(this.id + '_q'); }, querySelectorAll() { return []; },
    firstChild: null, parentNode: null, parentElement: null,
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height }; },
    dispatchEvent(type, evt) { (handlers[type] || []).forEach(fn => { try { fn.call(el, evt || { type, preventDefault() {}, stopPropagation() {} }); } catch (e) { errors.push('handler ' + this.id + '.' + type + ': ' + (e && e.stack || e)); } }); },
  };
  // innerHTML 语义对齐浏览器：赋值即清空已 append 的子节点（渲染函数常 innerHTML='' 后重建）
  let _html = '';
  Object.defineProperty(el, 'innerHTML', { get() { return _html; }, set(v) { _html = String(v); el.children.length = 0; } });
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

  // ============================================================
  // 11) v12.6 深度玩法重构专项（撤离锁死 / beacon+45s自毁 / 翻相0.35s免伤 / 狙击免伤 / 重盾反弹 / 自爆蜂 / 维度撕裂）
  // ============================================================
  console.log('---- v12.6 深度玩法重构专项 ----');
  try { api.startMission(); } catch (e) { errors.push('startMission(v12.6): ' + (e.stack || e)); }
  for (let i = 0; i < 10; i++) tick(16.7);
  api.cleanState();

  // 11a) 撤离锁死：初始全 sealed，且 200 帧内不自动开放（须击破领主才解锁）
  let eps = api.extractPoints();
  if (!eps || !eps.length) errors.push('v12.6: extractPoints 未初始化');
  else {
    const allSealed0 = eps.every(z => z.state === 'sealed');
    if (!allSealed0) errors.push('v12.6: 撤离点初始应全 sealed（锁死），实际 ' + eps.map(z => z.state).join(','));
    for (let i = 0; i < 200; i++) tick(16.7);
    const stillSealed = eps.every(z => z.state === 'sealed');
    if (!stillSealed) errors.push('v12.6: 撤离点不应自动开放（须击破领主），200帧后 ' + eps.map(z => z.state).join(','));
    console.log('[11a] 撤离锁死 OK：初始全 sealed，200帧后仍 sealed（无自动开放）');
  }

  // 11b) beacon + 45s 自毁倒计时：击破领主 → 全部撤离点 beacon/open + run.selfDestruct=45 + 倒计时递减
  api.cleanState();
  api.spawnBoss();
  api.killBoss();
  const eps2 = api.extractPoints();
  const allBeacon = eps2.every(z => (z.state === 'open' && z.beacon === true));
  if (!allBeacon) errors.push('v12.6: 击破领主后撤离点应全部 beacon+open，实际 ' + eps2.map(z => z.state + ':' + (z.beacon ? 'B' : '-')).join(','));
  if (!api.evacBeacon()) errors.push('v12.6: run.evacBeacon 应为 true');
  if (Math.abs(api.selfDestruct() - 45) > 0.001) errors.push('v12.6: 自毁倒计时应为 45s，实际 ' + api.selfDestruct());
  api.setPlayerHp(99999); // 防被围堵杂兵击杀 → scene 切换 → 倒计时停摆
  for (let i = 0; i < 120; i++) { api.clearBullets(); tick(16.7); } // 2s
  const sdAfter = api.selfDestruct();
  if (!(sdAfter < 45 && sdAfter > 42)) errors.push('v12.6: 自毁倒计时应递减（2s后约43s），实际 ' + sdAfter.toFixed(2));
  console.log('[11b] beacon+自毁 OK：全部 beacon/open，selfDestruct=' + sdAfter.toFixed(2) + 's（起始45）');

  // 11c) 翻相 0.35s 免伤（狙击/维度撕裂共用 player.iframe<=0 闸门）
  api.cleanState(); api.enemies().length = 0; api.setPlayerHp(99999);
  api.setIframe(0); // 清零残影无敌帧，确保翻相授予的 0.35s 可被确定性观测（翻相语义：授予≥0.35s，不覆盖更长既有无敌）
  api.flip(api.PHASE_GOLD());
  const ifr = api.iframe();
  if (!(ifr > 0.3 && ifr <= api.FLIP_IFRAME())) errors.push('v12.6: 翻相应置 iframe≈0.35，实际 ' + ifr);
  const g1 = api.hitscanGate(50);
  if (g1.applied) errors.push('v12.6: 翻相无敌帧内致命命中应被免疫（未掉血），实际 applied=' + g1.applied);
  api.setIframe(0);
  const g2 = api.hitscanGate(50);
  if (!g2.applied) errors.push('v12.6: iframe 归零后致命命中应生效（掉血），实际 applied=' + g2.applied);
  console.log('[11c] 翻相免伤 OK：iframe=' + ifr.toFixed(2) + ' 时免疫；归零后命中');

  // 11d) 相位狙击手·翻相 0.35s 免伤（真实 hitscan 贯穿光束路径）
  api.cleanState(); api.enemies().length = 0; api.setPlayerHp(99999);
  const sn = api.testSniperFlipImmunity();
  if (!sn.immuneWithFlip) errors.push('v12.6: 狙击手贯穿光束在翻相无敌帧内应被免疫，实际 immuneWithFlip=' + sn.immuneWithFlip);
  if (!sn.hitWithoutFlip) errors.push('v12.6: 狙击手贯穿光束在无敌帧外应命中掉血，实际 hitWithoutFlip=' + sn.hitWithoutFlip);
  console.log('[11d] 狙击翻相免伤 OK：iframe=' + sn.iframe0 + ' 时贯穿光束被免疫；清 iframe 后被命中');

  // 11e) 鎏金重盾巨舰·正面 120° 金盾反弹
  api.cleanState(); api.enemies().length = 0; api.setPlayerHp(99999);
  const br = api.testBastionReflect();
  if (!br.reflected) errors.push('v12.6: 鎏金重盾正面直射弹应被反弹(from→enemy)，实际 reflected=' + br.reflected);
  if (br.bastionTookDamage) errors.push('v12.6: 金盾反弹时巨舰不应掉血，实际 bastionTookDamage=' + br.bastionTookDamage);
  console.log('[11e] 重盾金盾反弹 OK：反射=' + br.reflected + ' 巨舰掉血=' + br.bastionTookDamage);

  // 11f) 自爆突进蜂·死亡爆炸（贴身 + 非无敌帧 → 应炸伤玩家）
  api.cleanState(); api.enemies().length = 0; api.setPlayerHp(99999);
  const kz = api.spawnArche('kamikaze', api.player().x + 20, api.player().y);
  kz.wake = 0;
  api.setIframe(0);
  kz.x = api.player().x + 20; kz.y = api.player().y;
  const hpK0 = api.player().hp;
  api.killEnemy(api.enemies().indexOf(kz));
  const hpK1 = api.player().hp;
  if (!(hpK1 < hpK0)) errors.push('v12.6: 自爆蜂贴身死亡应炸伤玩家（iframe=0时），实际 hpK0=' + hpK0 + ' hpK1=' + hpK1);
  console.log('[11f] 自爆蜂 OK：贴身死亡爆炸伤玩家 hp ' + hpK0.toFixed(0) + '→' + hpK1.toFixed(0));

  // 11g) Boss 半血维度撕裂：半血触发 charge→active，窗口结束 dimTearDone=true（翻相规避共用 iframe 闸门）
  api.cleanState(); api.enemies().length = 0; api.setPlayerHp(99999);
  api.spawnBoss();
  for (let i = 0; i < 90; i++) { api.tick(1); api.clearBullets(); } // 过出场 wake(1.2s)
  api.setBossHp(0.49); // 半血
  let sawDimTear = false;
  for (let i = 0; i < 60; i++) { api.tick(1); api.clearBullets(); if (api.bossDimTear()) sawDimTear = true; }
  if (!sawDimTear) errors.push('v12.6: Boss 半血应触发维度撕裂(dimTear=charge/active)，实际 ' + api.bossDimTear());
  for (let i = 0; i < 400; i++) { api.tick(1); api.clearBullets(); } // 过 charge(1.4)+active(4.5)
  if (!api.bossDimTearDone()) errors.push('v12.6: 维度撕裂 active 窗口后应收敛(dimTearDone=true)，实际 dimTear=' + api.bossDimTear() + ' done=' + api.bossDimTearDone());
  console.log('[11g] 维度撕裂 OK：半血触发 dimTear，窗口结束收敛 dimTearDone=' + api.bossDimTearDone());

  // 11h) 引力编织者·weaverRifts 拖拽机制（桌面大视口天然 onScreen）
  api.cleanState(); api.enemies().length = 0; api.setPlayerHp(99999); api.weaverRifts().length = 0;
  var wvr = api.spawnArche('weaver', api.player().x + 260, api.player().y); wvr.wake = 0;
  for (let i = 0; i < 20; i++) { wvr.weaverCd = 0; wvr.fireCd = 0; wvr.x = api.player().x + 260; wvr.y = api.player().y; api.tick(1); api.clearBullets(); }
  if (api.weaverRifts().length === 0) errors.push('v12.6: weaver 应生成 weaverRifts（拖拽机制），实际 0');
      else console.log('[11h] 引力编织者 OK：生成 weaverRifts=' + api.weaverRifts().length);

  // ============================================================
  // 12) v12.7 战斗平衡重构专项（伤害校准 / iframe上限 / 护甲70%上限 / 吸血ICD+上限 / 精英·重击阈值）
  // ============================================================
  console.log('---- v12.7 战斗平衡重构专项 ----');
  api.startMission(); for (let i = 0; i < 6; i++) tick(16.7); api.cleanState(); // 重置玩家(maxhp=100, 清掉 11h 的 99999 残留)
  // 12a 伤害校准：5×25 应进入残血/死亡（maxhp=100 → 第4发即致死）
  api.setPlayerHp(api.playerMaxhp());
  for (let i = 0; i < 5; i++) { api.setIframe(0); api.damagePlayer(25); }
  if (!(api.playerHp() <= 0.30 * api.playerMaxhp())) errors.push('v12.7: 12a 5×25 应残血/死亡, hp=' + api.playerHp() + '/' + api.playerMaxhp());
  else console.log('[12a] 伤害校准 OK：5×25 → hp=' + api.playerHp().toFixed(0) + '/' + api.playerMaxhp() + ' (≤30%)');
  // 12b iframe 上限：非翻相受击 ≤ 0.2s（翻相 0.35/dash 0.5/gale 0.1 经 Math.max 保留更长免伤）
  api.setPlayerHp(api.playerMaxhp()); api.setIframe(0); api.damagePlayer(25);
  if (!(api.iframe() <= 0.2 + 1e-6)) errors.push('v12.7: 12b 非翻相受击 iframe 应≤0.2, 实际=' + api.iframe());
  else console.log('[12b] iframe 上限 OK：受击 iframe=' + api.iframe().toFixed(3) + ' (≤0.2)');
  // 12c 护甲 70% 上限：dmgReduce=0.95 → 实受至少 30（减伤封顶 70%）
  api.setPlayerHp(api.playerMaxhp()); api.setDmgReduce(0.95); api.setIframe(0);
  let _hp0c = api.playerHp(); api.damagePlayer(100); let _taken = _hp0c - api.playerHp();
  if (!(_taken >= 30 - 1e-6)) errors.push('v12.7: 12c 减伤应封顶70%(至少受30), taken=' + _taken);
  else console.log('[12c] 护甲70%上限 OK：dmgReduce=0.95 → 实受=' + _taken.toFixed(1) + ' (≥30)');
  // 12d 吸血上限+ICD：单次回复≤造成伤害的 3%，且触发 0.2s 内置冷却
  api.setDmgReduce(0); api.setPlayerHp(api.playerMaxhp()); api.setLifesteal(0.5);
  let _r = api.testLifesteal(100);
  if (!(_r.heal <= 100 * 0.03 + 1e-6)) errors.push('v12.7: 12d 吸血单次应≤3%, heal=' + _r.heal);
  if (!(_r.lsCdAfter > 0)) errors.push('v12.7: 12d 吸血应有ICD, lsCdAfter=' + _r.lsCdAfter);
  console.log('[12d] 吸血上限+ICD OK：heal=' + _r.heal.toFixed(2) + ' (≤3), lsCdAfter=' + _r.lsCdAfter);
  // 12e 精英/重击阈值：EDMG_ELITE=72 / EDMG_HEAVY=120 掉血精确（设 maxhp=200 避免被 0 截断，单独校验每个阈值）
  api.setDmgReduce(0); api.setPlayerHp(200); api.setIframe(0);
  api.damagePlayer(72); let _d72 = 200 - api.playerHp();
  if (Math.abs(_d72 - 72) > 1e-6) errors.push('v12.7: 12e EDMG_ELITE(72) 掉血=' + _d72 + ' 应为72');
  api.setPlayerHp(200); api.setIframe(0);
  api.damagePlayer(120); let _d120 = 200 - api.playerHp();
  if (Math.abs(_d120 - 120) > 1e-6) errors.push('v12.7: 12e EDMG_HEAVY(120) 掉血=' + _d120 + ' 应为120');
  if (Math.abs(_d72 - 72) <= 1e-6 && Math.abs(_d120 - 120) <= 1e-6) console.log('[12e] 精英/重击阈值 OK：72→掉' + _d72 + ' / 120→掉' + _d120);

  // ============================================================
  // 13) v13 屏幕自适应 · DPR 高清化 + 逻辑坐标 + 丹药槽底部居中 + Safe Area
  // ============================================================
  console.log('---- v13 屏幕自适应专项 ----');
  // 13a resize 后 W/H = CSS 像素（逻辑坐标），canvas.width = CSS × DPR（物理像素）
  var _cssW = api.canvasCssW(), _cssH = api.canvasCssH();
  var _logW = api.logicalW(), _logH = api.logicalH();
  if (Math.abs(_logW - _cssW) > 1) errors.push('v13: 13a W 应=CSS像素, W=' + _logW + ' cssW=' + _cssW);
  if (Math.abs(_logH - _cssH) > 1) errors.push('v13: 13a H 应=CSS像素, H=' + _logH + ' cssH=' + _cssH);
  else console.log('[13a] 逻辑坐标=CSS像素 OK：W=' + _logW + ' H=' + _logH);
  // 13b canvas.width = floor(CSS × DPR)，DPR 封顶 3
  var _expectedCW = Math.floor(_cssW * api.dpr());
  if (api.canvasW() !== _expectedCW) errors.push('v13: 13b canvas.width 应=floor(cssW×DPR), cw=' + api.canvasW() + ' expected=' + _expectedCW + ' dpr=' + api.dpr());
  else console.log('[13b] canvas物理分辨率 OK：cw=' + api.canvasW() + ' = floor(' + _cssW + '×' + api.dpr() + ') DPR=' + api.dpr());
  if (api.dpr() > 3) errors.push('v13: 13b DPR 应封顶3, dpr=' + api.dpr());
  // 13c 丹药槽水平居中：bx = (W - totalW) / 2
  var _cc = api.consumablesCenter();
  var _expectedBx = (api.logicalW() - _cc.totalW) / 2;
  if (Math.abs(_cc.bx - _expectedBx) > 0.5) errors.push('v13: 13c 丹药槽 bx 应居中, bx=' + _cc.bx + ' expected=' + _expectedBx);
  else console.log('[13c] 丹药槽水平居中 OK：bx=' + _cc.bx.toFixed(1) + ' (W=' + api.logicalW() + ' totalW=' + _cc.totalW + ')');
  // 13d 丹药槽底部避开 Safe Area：by = H - size - (isMobile ? 24+SA.b : 16)
  var _sa = api.safeArea();
  if (_cc.by > api.logicalH() - _cc.size - _sa.b) errors.push('v13: 13d 丹药槽 by 应避开底部SA, by=' + _cc.by + ' H=' + api.logicalH() + ' size=' + _cc.size + ' SA.b=' + _sa.b);
  else console.log('[13d] 丹药槽避底SA OK：by=' + _cc.by + ' (H-size-SA.b=' + (api.logicalH() - _cc.size - _sa.b) + ')');

  // ============================================================
  // 14) v14 局内动态目标 + 局外永久成长 · 悬赏/科技树/层级推进/结算
  // ============================================================
  console.log('---- v14 动态目标+永久成长专项 ----');
  // 14a 动态悬赏：进图后 bounty 不为 null，有合法 id/desc/target>0/progress=0
  var _bty = api.bounty();
  if (!_bty) errors.push('v14: 14a 进图后 bounty 不应为 null');
  else {
    if (!_bty.id || !_bty.desc || !(_bty.target > 0) || _bty.progress !== 0)
      errors.push('v14: 14a bounty 字段异常 id=' + _bty.id + ' target=' + _bty.target + ' progress=' + _bty.progress);
    else console.log('[14a] 动态悬赏生成 OK：' + _bty.desc + ' (目标=' + _bty.target + ')');
  }
  // 14b 悬赏追踪：击杀敌人后 progress 应增加（killElite/killEmber 类型；确定性化：强制精英/余烬相，杜绝随机敌机不符的 flaky）
  var _btyId = _bty ? _bty.id : '';
  if (_btyId === 'killElite' || _btyId === 'killEmber') {
    var _prog0 = _bty.progress;
    // 确定目标：有敌机用敌机，否则现场生成一只；killElite 强制 elite，killEmber 强制余烬相
    var _enemies = api.enemies();
    var _target = (_enemies && _enemies.length > 0) ? _enemies[0] : api.spawnArche('ram', api.player().x + 100, api.player().y);
    _target.elite = (_btyId === 'killElite');
    if (_btyId === 'killEmber') api.player().phase = api.PHASE_EMBER();
    _target.wake = 0;
    var _ti = api.enemies().indexOf(_target);
    if (_ti >= 0) api.killEnemy(_ti);
    var _bty2 = api.bounty();
    if (_bty2 && _bty2.progress <= _prog0) errors.push('v14: 14b 悬赏追踪 progress 未增加 prog0=' + _prog0 + ' prog1=' + (_bty2 ? _bty2.progress : -1));
    else if (_bty2) console.log('[14b] 悬赏追踪 OK：progress ' + _prog0 + ' → ' + _bty2.progress);
  } else {
    console.log('[14b] 悬赏类型=' + _btyId + ' 跳过击杀追踪断言（非击杀类）');
  }
  // 14c 科技树购买：给足灵玉+碎屑后 buyTech 应成功，level 递增
  var _meta = api.meta();
  var _jadeBefore = _meta.currency, _oreBefore = _meta.ore || 0;
  // 注入足够资源
  _meta.currency = 99999; _meta.ore = 99999;
  var _buyR = api.buyTech('hp');
  if (!_buyR.ok) errors.push('v14: 14c buyTech(hp) 应成功(资源充足), reason=' + (_buyR.reason || '?'));
  else {
    var _techAfter = api.tech();
    if (_techAfter.hp !== 1) errors.push('v14: 14c buyTech 后 hp 等级应为1, 实际=' + _techAfter.hp);
    else console.log('[14c] 科技树购买 OK：hp Lv0→1, 花费 jade=' + _buyR.jadeSpent + ' ore=' + _buyR.oreSpent);
  }
  // 14d tierName 动态层级名称：≤2 用固定名（1=入门/2=进阶），>2 用"深渊 N"（B1 修复：口径与 tierTitle 统一，Tier3=深渊1层）
  var _tn1 = api.tierName(1), _tn2 = api.tierName(2), _tn3 = api.tierName(3), _tn4 = api.tierName(4), _tn7 = api.tierName(7);
  if (_tn1 !== '入门') errors.push('v14: 14d tierName(1) 应=入门, 实际=' + _tn1);
  else if (_tn2 !== '进阶') errors.push('v14: 14d tierName(2) 应=进阶, 实际=' + _tn2);
  else if (_tn3 !== '深渊 1') errors.push('v14: 14d tierName(3) 应=深渊 1, 实际=' + _tn3);
  else if (_tn4 !== '深渊 2') errors.push('v14: 14d tierName(4) 应=深渊 2, 实际=' + _tn4);
  else if (_tn7 !== '深渊 5') errors.push('v14: 14d tierName(7) 应=深渊 5, 实际=' + _tn7);
  else console.log('[14d] tierName 动态名称 OK（B1 口径统一）：1→' + _tn1 + ' / 2→' + _tn2 + ' / 3→' + _tn3 + ' / 4→' + _tn4 + ' / 7→' + _tn7);
  // 14e 模拟完成本局并结算：成功击杀 Boss + 撤离 → maxTier 推进 + bestLayer 更新 + ore 增加
  var _sim = api.simFinishRun('success', true);
  if (!_sim.ok) errors.push('v14: 14e simFinishRun 应成功');
  else {
    if (_sim.maxTierAfter <= _sim.maxTierBefore) errors.push('v14: 14e maxTier 应推进 ' + _sim.maxTierBefore + '→' + _sim.maxTierAfter);
    else if (_sim.bestLayerAfter < _sim.bestLayerBefore) errors.push('v14: 14e bestLayer 不应倒退');
    else if (_sim.oreAfter < _sim.oreBefore) errors.push('v14: 14e ore 不应减少(成功撤离)');
    else console.log('[14e] 局末结算 OK：maxTier ' + _sim.maxTierBefore + '→' + _sim.maxTierAfter + ' bestLayer ' + _sim.bestLayerBefore + '→' + _sim.bestLayerAfter + ' ore ' + _sim.oreBefore + '→' + _sim.oreAfter);
  }

  // ============================================================
  // 15) AssetManager 异步预加载门（桩内 Image 无 complete → 同步就绪；force/resolve 走 rAF 轮询放行路径）
  // ============================================================
  console.log('---- AssetManager 异步预加载门 ----');
  if (typeof api.assetReady !== 'function') errors.push('AM: assetReady 钩子缺失');
  else {
    var _at = api.assetTotal(), _al = api.assetLoaded();
    if (!(_at > 50)) errors.push('AM: 应注册 >50 张图片，实际 total=' + _at);
    if (!(_al === _at)) errors.push('AM: 桩安全路径应同步计满 loaded==total, loaded=' + _al + ' total=' + _at);
    if (!api.assetReady()) errors.push('AM: 桩环境 isReady 应为 true');
    else console.log('[15a] AssetManager 桩安全路径 OK：total=' + _at + ' loaded=' + _al + ' isReady=true');
  }
  // 加载门：强制一张未就绪图 → startMission 显示遮罩且不进入 mission；就绪后 rAF 轮询放行
  api.forceAssetPending();
  if (api.assetReady()) errors.push('AM: forceAssetPending 后 isReady 应为 false');
  api.startMission();
  if (api.scene() === 'mission') errors.push('AM: 未就绪时 startMission 不应直接进 mission');
  if (!api.loadMaskVisible()) errors.push('AM: 未就绪时应显示加载遮罩');
  api.resolveAssetPending();
  for (let i = 0; i < 5; i++) tick(16.7); // rAF 轮询 → isReady → doStartMission + 淡出
  if (api.scene() !== 'mission') errors.push('AM: 就绪后 rAF 轮询应放行进入 mission, scene=' + api.scene());
  console.log('[15b] 加载门 OK：pending → 遮罩显示 → resolve → rAF 放行 mission');

  // ============================================================
  // 16) 研究院/熔炼台 UI 交互链路（代码审计 + 内存 DOM 断言）
  // ============================================================
  console.log('---- 研究院/熔炼台 UI 交互链路 ----');
  function walk(el, fn) { (el.children || []).forEach(c => { fn(c); walk(c, fn); }); }
  function countByClass(el, cls) { let n = 0; walk(el, c => { const cn = String(c.className || ''); if (cn.indexOf(cls) >= 0) n++; }); return n; }
  // 16a 研究院卡片化：renderBase → renderResearch 应产出 2 区块标题 + 4 天梯 + 5 基础 = 11 节点
  try { api.renderBase(); } catch (e) { errors.push('lab: renderBase: ' + (e && e.stack || e)); }
  const _rl = document.getElementById('researchList');
  const _rlChildren = (_rl.children || []).length;
  if (_rlChildren < 9) errors.push('lab: renderResearch 后 researchList 应有 ≥9 子节点(2标题+4科技+5基础)，实际 ' + _rlChildren);
  const _techCardN = countByClass(_rl, 'research-card');
  if (_techCardN < 9) errors.push('lab: 应有 9 张 research-card(4天梯+5基础)，实际 ' + _techCardN);
  let _hasTechHeader = false;
  walk(_rl, c => { const _t = String(c.textContent || '') + ' ' + String(c.innerHTML || ''); if (_t.indexOf('天梯科技') >= 0) _hasTechHeader = true; });
  if (!_hasTechHeader) errors.push('lab: 应包含「天梯科技」区块标题');
  // 16b 科技卡可点击购买：给足资源 → 触发 canbuy 卡 onclick → meta.tech 等级提升
  var _m16 = api.meta(); _m16.currency = 99999; _m16.ore = 99999;
  try { api.renderBase(); } catch (e) { errors.push('lab: renderBase(富资源): ' + (e && e.stack || e)); }
  let _clickedTech = false, _techErr = null;
  walk(document.getElementById('researchList'), c => {
    if (_clickedTech) return;
    const cn = String(c.className || '');
    if (cn.indexOf('research-card') >= 0 && cn.indexOf('canbuy') >= 0 && typeof c.onclick === 'function') {
      try { c.onclick(); _clickedTech = true; } catch (e) { _techErr = e; }
    }
  });
  if (_techErr) errors.push('lab: canbuy 科技卡 onclick 抛错: ' + (_techErr && _techErr.stack || _techErr));
  if (!_clickedTech) errors.push('lab: 资源充足时应存在可点击(canbuy)的科技卡');
  else {
    var _tech16 = api.tech();
    if (!Object.keys(_tech16).some(k => _tech16[k] > 0)) errors.push('lab: 点击 canbuy 科技卡后应出现科技等级提升');
    else console.log('[16] 研究院卡片化链路 OK：' + _rlChildren + ' 节点 / ' + _techCardN + ' 卡 / 天梯科技标题 / canbuy 点击购买生效');
  }
  // 16c 熔炼台：renderForge 产出 3 个 fg-slot 且绑定 onclick；点击槽位 → forgeDrawer .open
  try { api.renderBase(); } catch (e) { errors.push('forge: renderBase: ' + (e && e.stack || e)); }
  const _fsEl = document.getElementById('forgeStage');
  let _slotN = 0, _slotClickable = false, _firstSlot = null;
  walk(_fsEl, c => {
    const cn = String(c.className || '');
    if (cn.indexOf('fg-slot') >= 0) { _slotN++; if (typeof c.onclick === 'function') _slotClickable = true; if (!_firstSlot) _firstSlot = c; }
  });
  if (_slotN < 3) errors.push('forge: forgeStage 应有 3 个 fg-slot，实际 ' + _slotN);
  if (!_slotClickable) errors.push('forge: fg-slot 应绑定 onclick(openForgeDrawer)');
  if (_firstSlot && typeof _firstSlot.onclick === 'function') {
    try { _firstSlot.onclick(); } catch (e) { errors.push('forge: 槽位 onclick: ' + (e && e.stack || e)); }
  }
  const _fd16 = document.getElementById('forgeDrawer');
  if (!_fd16 || !_fd16.classList.contains('open')) errors.push('forge: 点击 fg-slot 后 forgeDrawer 应 .open');
  else console.log('[16c] 熔炼台链路 OK：' + _slotN + ' 槽位 + 点击弹底抽 .open');

  // ============================================================
  // 17) HtmlAssets 双轨预加载器 + 启动级全局加载门（首次刷新基地资产不加载 · Boss 反馈修复）
  // ============================================================
  console.log('---- HtmlAssets 预加载器 + 启动加载门 ----');
  // 17a 桩安全路径：收集路径数>0、同步计满、isReady true、关键动态路径全覆盖
  if (typeof api.htmlAssetsReady !== 'function') errors.push('HA: htmlAssetsReady 钩子缺失');
  else {
    const _ht = api.htmlAssetTotal(), _hl = api.htmlAssetLoaded(), _hp = api.htmlAssetPaths();
    if (!(_ht > 0)) errors.push('HA: 应收集 >0 条 HTML UI 资产路径，实际 total=' + _ht);
    if (!(_hl === _ht)) errors.push('HA: 桩安全路径应同步计满 loaded==total, loaded=' + _hl + ' total=' + _ht);
    if (!api.htmlAssetsReady()) errors.push('HA: 桩环境 htmlAssetsReady 应为 true');
    // 应覆盖关键动态路径：机库槽位 / 武器图标 / 装备图标 / 研究院图标 / 机体立绘（含 ?v=5）
    const _hpSet = {};
    _hp.forEach(p => { _hpSet[p] = 1; });
    const _need = [
      'assets/v3/ui/cropped/slot_weapon_normal.png',
      'assets/v3/ui/cropped/slot_ammo_selected.png',
      'assets/v4/weapons/weapon_r4_c2.png',
      'assets/v4/gear/gear_core_purple.png',
      'assets/v3/ui/cropped/icon_22.png',
      'assets/v3/ui/portrait/acft_qingfalcon.png?v=5'
    ];
    const _miss = _need.filter(p => !_hpSet[p]);
    if (_miss.length) errors.push('HA: 关键路径缺失 ' + _miss.join(','));
    else console.log('[17a] HtmlAssets 桩安全路径 OK：total=' + _ht + ' loaded=' + _hl + ' isReady=true 关键路径覆盖 ' + _need.length + '/' + _need.length);
  }
  // 17b 启动加载门：未就绪时不显示 base（遮罩显示、base 隐藏）→ 就绪后 rAF 轮询放行显示 base
  api.forceHtmlAssetPending();
  if (api.htmlAssetsReady()) errors.push('HA: forceHtmlAssetPending 后 htmlAssetsReady 应为 false');
  api.enterBase();
  if (api.baseVisible()) errors.push('HA: 未就绪时启动门不应显示 base');
  if (!api.loadMaskVisible()) errors.push('HA: 未就绪时应显示加载遮罩');
  api.resolveHtmlAssetPending();
  for (let i = 0; i < 5; i++) tick(16.7); // rAF 轮询 → isReady → 淡出遮罩 + showScene('base')
  if (!api.baseVisible()) errors.push('HA: 就绪后 rAF 轮询应放行显示 base, display=' + document.getElementById('base').style.display);
  console.log('[17b] 启动加载门 OK：pending → 遮罩显示+base隐藏 → resolve → rAF 放行 base');

  // ============================================================
  // 18) v15 深渊异变·词缀系统（确定性分配 / 收益函数 / newRun 匹配 / 出击面板 / 局内生效守卫）
  // ============================================================
  console.log('---- v15 深渊异变·词缀系统 ----');
  // 18a 词缀确定性：tier1/2→[] tier3→['frenzy'] tier5→2条 tier7→3条 tier9+→4条，内容=池序前 N 个 key
  var _18aCases = [[1, 0], [2, 0], [3, 1], [4, 1], [5, 2], [6, 2], [7, 3], [8, 3], [9, 4], [10, 4], [12, 4]];
  _18aCases.forEach(function (pair) {
    var _t = pair[0], _exp = pair[1];
    var _aff = api.tierAffixes(_t);
    if (!Array.isArray(_aff) || _aff.length !== _exp) errors.push('18a: tierAffixes(' + _t + ') 应 ' + _exp + ' 条，实际 ' + (_aff ? _aff.length : 'null'));
    if (_aff && _exp > 0) {
      var _pool = api.affixPool();
      for (var _pi = 0; _pi < _exp; _pi++) if (_aff[_pi] !== _pool[_pi].key) errors.push('18a: tierAffixes(' + _t + ')[' + _pi + '] 应=' + _pool[_pi].key + '，实际 ' + _aff[_pi]);
    }
  });
  if (api.tierAffixes(3).join(',') !== 'frenzy') errors.push('18a: tier3 应= [frenzy]，实际 ' + api.tierAffixes(3).join(','));
  if (api.tierAffixes(5).join(',') !== 'frenzy,volatile_all') errors.push('18a: tier5 应= [frenzy,volatile_all]，实际 ' + api.tierAffixes(5).join(','));
  if (api.tierAffixes(7).length !== 3) errors.push('18a: tier7 应 3 条词缀，实际 ' + api.tierAffixes(7).length);
  else console.log('[18a] 词缀确定性 OK：tier1/2→0条 tier3→frenzy tier5→frenzy,volatile_all tier7→3条 tier9+→4条');
  // 18b tierDropBonus / tierOreBonus 数值
  if (Math.abs(api.tierDropBonus(1) - 0) > 1e-9) errors.push('18b: tierDropBonus(1) 应=0，实际 ' + api.tierDropBonus(1));
  if (Math.abs(api.tierDropBonus(5) - 0.16) > 1e-9) errors.push('18b: tierDropBonus(5) 应=0.16，实际 ' + api.tierDropBonus(5));
  if (Math.abs(api.tierDropBonus(10) - 0.35) > 1e-9) errors.push('18b: tierDropBonus(10) 应=0.35(cap)，实际 ' + api.tierDropBonus(10));
  if (api.tierDropBonus(20) !== 0.35) errors.push('18b: tierDropBonus(20) 应封顶 0.35，实际 ' + api.tierDropBonus(20));
  if (Math.abs(api.tierOreBonus(1) - 1) > 1e-9) errors.push('18b: tierOreBonus(1) 应=1，实际 ' + api.tierOreBonus(1));
  if (Math.abs(api.tierOreBonus(5) - 3) > 1e-9) errors.push('18b: tierOreBonus(5) 应=3，实际 ' + api.tierOreBonus(5));
  else console.log('[18b] 收益函数 OK：drop t1=0 t5=0.16 t10=0.35cap | ore t1=1 t5=3');
  // 18c newRun 后 run.affixes 与 tier 匹配（tier7 应含 3 词缀）
  api.meta().maxTier = 7;
  api.setSelectedTier(7);
  api.startMission(); for (var _i18 = 0; _i18 < 5; _i18++) tick(16.7);
  var _aff18 = api.runAffixes();
  if (!_aff18 || _aff18.join(',') !== 'frenzy,volatile_all,tide_fast') errors.push('18c: tier7 局 run.affixes 应=[frenzy,volatile_all,tide_fast]，实际 ' + (_aff18 ? _aff18.join(',') : 'null'));
  else console.log('[18c] newRun 词缀匹配 OK：tier7 → ' + _aff18.join(','));
  // 18d renderBase 出击面板：tier5 含词缀 pill + 收益率 + tierTitle；tier1 无异变
  api.setSelectedTier(5);
  try { api.renderBase(); } catch (e) { errors.push('18d: renderBase: ' + (e && e.stack || e)); }
  var _tr18 = document.getElementById('tierRow').innerHTML || '';
  if (_tr18.indexOf('affix-pill') < 0) errors.push('18d: tier5 出击面板应含 affix-pill class');
  if (_tr18.indexOf('极速') < 0 || _tr18.indexOf('自爆') < 0) errors.push('18d: tier5 面板应含「极速」「自爆」词缀名');
  if (_tr18.indexOf('装备品质 +16%') < 0) errors.push('18d: tier5 面板应显示「装备品质 +16%」');
  if (_tr18.indexOf('灵矿产出 ×3.0') < 0) errors.push('18d: tier5 面板应显示「灵矿产出 ×3.0」');
  if (api.tierTitle(1) !== 'Tier 1【入门·潜入】') errors.push('18d: tierTitle(1) 应= Tier 1【入门·潜入】，实际 ' + api.tierTitle(1));
  if (api.tierTitle(3) !== 'Tier 3【深渊 1 层】') errors.push('18d: tierTitle(3) 应= Tier 3【深渊 1 层】，实际 ' + api.tierTitle(3));
  if (api.tierTitle(4) !== 'Tier 4【深渊 2 层】') errors.push('18d: tierTitle(4) 应= Tier 4【深渊 2 层】，实际 ' + api.tierTitle(4));
  api.setSelectedTier(1); api.renderBase();
  var _tr18b = document.getElementById('tierRow').innerHTML || '';
  if (_tr18b.indexOf('affix-none') < 0 || _tr18b.indexOf('无异变') < 0) errors.push('18d: tier1 面板应显示「无异变」');
  else console.log('[18d] 出击面板 OK：tier5 词缀 pill(极速/自爆)+收益率+tierTitle；tier1 无异变');
  // 18e 局内生效守卫：tide_fast 下 phaseTimer 初始 = PHASE_GOLD_DUR×0.6；frenzy 下敌追击位移比 ≈1.2
  api.setSelectedTier(7);
  api.startMission(); // 不在 tick 前额外推进，直接断言 newRun 初始 phaseTimer
  var _pt18 = api.phaseTimerVal(), _gd18 = api.phaseGoldDur();
  if (Math.abs(_pt18 - _gd18 * 0.6) > 0.001) errors.push('18e: tide_fast 下 phaseTimer 初始应=' + (_gd18 * 0.6).toFixed(2) + '(PHASE_GOLD_DUR×0.6)，实际 ' + _pt18.toFixed(2));
  else console.log('[18e] tide_fast OK：tier7 局 phaseTimer=' + _pt18.toFixed(1) + ' = ' + _gd18 + '×0.6');
  function _frenzyDisp18(tier) {
    api.setSelectedTier(tier);
    api.startMission(); for (var _f = 0; _f < 5; _f++) tick(16.7);
    api.cleanState();
    api.enemies().length = 0; api.obstacles().length = 0; api.gravityRifts().length = 0; api.weaverRifts().length = 0;
    api.player().x = 1000; api.player().y = 500; api.player().vx = 0; api.player().vy = 0;
    var _psm = api.phaseSpeedMulVal(); // 四幕移速系数：qi 幕=0.82（须归一化，否则比值失真）
    var _e = api.spawnArche('shoot', 1700, 500);
    _e.wake = 0; _e.alert = 2; _e.chargeState = 0; _e.vx = 0; _e.vy = 0; _e.alarmIgnored = true; // 防脱战衰减，确保全程追击
    var _sx = _e.x, _sy = _e.y;
    for (var _g = 0; _g < 30; _g++) { api.clearBullets(); api.tick(1); }
    return { disp: Math.hypot(_e.x - _sx, _e.y - _sy), psm: _psm, base: 52 + _e.tier * 6 }; // shoot baseSpeed = 52 + tier*6
  }
  var _r18_7 = _frenzyDisp18(3), _r18_5 = _frenzyDisp18(1); // tier3 含极速 vs tier1 无词缀（tier5 也含极速，不可作对照）
  var _n18_7 = _r18_7.disp / (_r18_7.base * _r18_7.psm), _n18_5 = _r18_5.disp / (_r18_5.base * _r18_5.psm);
  var _r18 = _n18_7 / _n18_5;
  if (!(_r18 > 1.05 && _r18 < 1.35)) errors.push('18e: frenzy 追击位移比(归一)应≈1.2，实际 ' + _r18.toFixed(3) + ' (d3=' + _r18_7.disp.toFixed(1) + ' psm3=' + _r18_7.psm.toFixed(2) + ' d1=' + _r18_5.disp.toFixed(1) + ' psm1=' + _r18_5.psm.toFixed(2) + ')');
  else console.log('[18e] frenzy OK：归一位移比=' + _r18.toFixed(3) + ' ≈1.2（tier3 含极速 vs tier1 无异变）');

  // ============================================================
  // 19) v15.1 审计修复回归（#366：S1 双重入账 / S2 阵亡锁死 / A1 裂隙自毁冻结 / B2 张力条分母 / C1 裂隙悬赏）
  // ============================================================
  console.log('---- v15.1 审计修复回归 ----');
  // 19a S1：拾取 ore 只累加 run.oreCollected，不写 meta.ore（双重入账修复）
  api.meta().runs = 5; api.meta().ore = 100; api.meta().currency = 500; // 非首局 + 固定资源基线
  api.startMission(); for (var _i19 = 0; _i19 < 5; _i19++) tick(16.7); api.cleanState();
  api.enemies().length = 0; api.obstacles().length = 0; api.loot().length = 0; api.weaverRifts().length = 0; api.gravityRifts().length = 0;
  var _ore0 = api.meta().ore, _oc0 = api.run().oreCollected || 0;
  api.loot().push({ x: api.player().x + 8, y: api.player().y, type: 'ore', amount: 20, vx: 0, vy: 0, life: 20, age: 0 });
  for (var _i19b = 0; _i19b < 12; _i19b++) tick(16.7); // 自动磁吸拾取
  var _ore1 = api.meta().ore, _oc1 = api.run().oreCollected || 0;
  if (_ore1 !== _ore0) errors.push('19a(S1): 拾取 ore 不应写 meta.ore（双重入账），ore ' + _ore0 + '→' + _ore1);
  else if (!(_oc1 >= _oc0 + 20)) errors.push('19a(S1): 拾取 ore 应累加 run.oreCollected +20，实际 +' + (_oc1 - _oc0));
  else console.log('[19a] S1 拾取路径 OK：meta.ore 不变(' + _ore1 + ')，run.oreCollected +' + (_oc1 - _oc0));
  // 19b S1 结算：death 只入 15% 采集量（修复前 115%）
  api.finishRun('death');
  var _oreAfter = api.meta().ore;
  if (_oreAfter !== _ore0 + Math.floor(_oc1 * 0.15)) errors.push('19b(S1): 阵亡结算 ore 应=采集×15%（+' + Math.floor(_oc1 * 0.15) + '），实际 +' + (_oreAfter - _ore0));
  else console.log('[19b] S1 结算入账 OK：death → meta.ore +' + (_oreAfter - _ore0) + '（=20×15%）');
  // 19c S2：ext1 不破坏阵亡 15% 保底（death=0.15 / abandon=0.45 / success=1.0）
  api.meta().research = api.meta().research || {}; api.meta().research.ext1 = true;
  api.startMission(); for (var _i19c = 0; _i19c < 5; _i19c++) tick(16.7); api.cleanState();
  if (Math.abs(api.lootKeepRate('death') - 0.15) > 1e-9) errors.push('19c(S2): death keep 应=0.15（ext1 不叠加），实际 ' + api.lootKeepRate('death'));
  else if (Math.abs(api.lootKeepRate('abandon') - 0.45) > 1e-9) errors.push('19c(S2): abandon keep 应=0.45（0.3+ext1 0.15），实际 ' + api.lootKeepRate('abandon'));
  else if (Math.abs(api.lootKeepRate('success') - 1) > 1e-9) errors.push('19c(S2): success keep 应=1.0，实际 ' + api.lootKeepRate('success'));
  else console.log('[19c] S2 阵亡锁死 OK：death=' + api.lootKeepRate('death') + ' abandon=' + api.lootKeepRate('abandon') + ' success=' + api.lootKeepRate('success'));
  // 19d A1：杀 Boss 后 selfDestruct=45 → 进裂隙冻结为 0 → 出裂隙恢复 45
  api.cleanState(); api.enemies().length = 0; api.setPlayerHp(99999);
  api.spawnBoss(); api.killBoss();
  if (Math.abs(api.selfDestruct() - 45) > 0.001) errors.push('19d(A1): 前置 selfDestruct 应=45，实际 ' + api.selfDestruct());
  api.enterRift();
  if (api.selfDestruct() !== 0) errors.push('19d(A1): 进裂隙 selfDestruct 应冻结为 0，实际 ' + api.selfDestruct());
  else if (Math.abs(api.riftSdFrozen() - 45) > 0.001) errors.push('19d(A1): 冻结值 _riftSdFrozen 应=45，实际 ' + api.riftSdFrozen());
  api.exitRift();
  if (Math.abs(api.selfDestruct() - 45) > 0.001) errors.push('19d(A1): 出裂隙 selfDestruct 应恢复 45，实际 ' + api.selfDestruct());
  else console.log('[19d] A1 裂隙自毁冻结 OK：进裂隙=0(冻结45) → 出裂隙恢复 45');
  // 19d2 A1 三路径恢复：阵亡弹回（dieInRift）与强制离开（forceExitRift）
  api.spawnBoss(); api.killBoss(); api.enterRift(); api.dieInRift();
  if (Math.abs(api.selfDestruct() - 45) > 0.001) errors.push('19d2(A1): dieInRift 后 selfDestruct 应恢复 45，实际 ' + api.selfDestruct());
  api.spawnBoss(); api.killBoss(); api.enterRift(); api.forceExitRift();
  if (Math.abs(api.selfDestruct() - 45) > 0.001) errors.push('19d2(A1): forceExitRift 后 selfDestruct 应恢复 45，实际 ' + api.selfDestruct());
  else console.log('[19d2] A1 三路径恢复 OK：dieInRift/forceExitRift 均恢复 45');
  // 19e B2：tide_fast 下 phaseDurNow 应=PHASE_GOLD_DUR×0.6（张力条分母随实际周期）
  api.setSelectedTier(7); // tier7 含 tide_fast
  api.startMission();
  var _pd = api.phaseDurNow(), _gd = api.phaseGoldDur();
  if (Math.abs(_pd - _gd * 0.6) > 0.001) errors.push('19e(B2): tide_fast 下 phaseDurNow 应=' + (_gd * 0.6).toFixed(2) + '，实际 ' + _pd.toFixed(2));
  else console.log('[19e] B2 张力条分母 OK：tide_fast phaseDurNow=' + _pd.toFixed(1) + '（=PHASE_GOLD_DUR×0.6）');
  // 19f C1：裂隙内完成悬赏 → 宝箱入 riftLoot（不落地面丢失），出裂隙并入 run.loot
  api.startMission(); for (var _i19e = 0; _i19e < 5; _i19e++) tick(16.7); api.cleanState();
  api.enemies().length = 0; api.setPlayerHp(99999); api.loot().length = 0;
  api.enterRift(); api.loot().length = 0;
  api.generateBounty();
  api.bounty().progress = api.bounty().target - 1;
  var _rlBefore = api.riftLoot().length;
  api.bountyProgress(api.bounty().track, 1); // 触发 completeBounty（inRift 分支）
  var _rlAfter = api.riftLoot().length, _ground = api.loot().length;
  if (_ground > 0) errors.push('19f(C1): 裂隙内完成悬赏不应掉地面 loot，地面=' + _ground);
  else if (!(_rlAfter > _rlBefore)) errors.push('19f(C1): 裂隙内完成悬赏宝箱应入 riftLoot，riftLoot ' + _rlBefore + '→' + _rlAfter);
  api.exitRift();
  if (api.run().loot.length === 0) errors.push('19f(C1): 出裂隙后 run.loot 应并入裂隙宝箱');
  else console.log('[19f] C1 裂隙悬赏 OK：地面 loot=0，riftLoot ' + _rlBefore + '→' + _rlAfter + '，出裂隙并入 run.loot=' + api.run().loot.length);

  // ============================================================
  // 20) #381 Boss 反馈 6 项修复 · 桌面桩确定性回归
  // ============================================================
  console.log('---- #381 Boss 反馈回归[桌面] ----');
  // 20a ② 磁锁秘库开门距离门：远距(>150px)不弹，靠近(<150px)才弹（E 键/update 共用 VAULT_PROMPT_R）
  api.startMission(); for (var _i20 = 0; _i20 < 5; _i20++) tick(16.7); api.cleanState();
  api.enemies().length = 0; api.setPlayerHp(99999);
  api.forceVault(api.player().x + 500, api.player().y); // 距玩家 500px（远离）
  api.tick(1);
  if (api.vaultState().prompt) errors.push('20a(#381-②): 远离秘库(500px)不应弹 vaultPrompt');
  api.movePlayer(api.player().x + 480, api.player().y); // 移到距秘库 20px
  api.tick(1);
  if (!api.vaultState().prompt) errors.push('20a(#381-②): 靠近秘库(<150px)应弹 vaultPrompt');
  else console.log('[20a] 秘库距离门 OK：远距不弹 → 靠近弹');
  if (api.vaultState().prompt) { api.closeVaultPrompt(false); api.cleanState(); }
  // 20b ⑤ 相位柱 3→5 根：newRun 后 phasePillars.length 应为 5，亲和交替（金/余烬）
  api.startMission(); for (var _i20b = 0; _i20b < 5; _i20b++) tick(16.7); api.cleanState();
  var _pill = api.phasePillars();
  if (!_pill || _pill.length !== 5) errors.push('20b(#381-⑤): 相位柱应 5 根，实际 ' + (_pill ? _pill.length : 'null'));
  else {
    var _aff = _pill.map(function (p) { return p.affinity; }).join(',');
    var _gold = _pill.filter(function (p) { return p.affinity === api.PHASE_GOLD(); }).length;
    var _ember = _pill.filter(function (p) { return p.affinity === api.PHASE_EMBER(); }).length;
    if (_gold !== 3 || _ember !== 2) errors.push('20b(#381-⑤): 相位柱金/余烬应为 3/2，实际 ' + _gold + '/' + _ember + '（' + _aff + '）');
    else console.log('[20b] 相位柱 5 根 OK：金/余烬=' + _gold + '/' + _ember + '（' + _aff + '）');
  }
  // 20c ① 周期刷怪：spawnTimer 应随时间递减并到期触发刷怪（清空敌人后等待 >1 周期，enemies 回升）
  api.cleanState(); api.enemies().length = 0; api.setPlayerHp(99999);
  api.obstacles().length = 0; api.gravityRifts().length = 0; api.weaverRifts().length = 0;
  api.player().x = 1600; api.player().y = 1100;
  var _st0 = api.spawnTimerState();
  if (!(_st0.t > 0)) errors.push('20c(#381-①): 初始 spawnTimer 应 >0（开局倒计时），实际 ' + _st0.t);
  // 前进 8s（qi 幕间隔 6s → 至少触发 1 次），清掉每帧可能刷出的怪前先记录是否有生成
  var _spawned = 0;
  for (var _i20c = 0; _i20c < 8 * 60; _i20c++) { api.tick(1); _spawned += api.enemies().length; if (api.enemies().length > 0) api.enemies().length = 0; }
  var _st1 = api.spawnTimerState();
  if (_spawned === 0) errors.push('20c(#381-①): 8s 内应至少刷出 1 波敌人（spawnTimer 周期生效），实际 0');
  else if (!(_st1.t >= 0 && _st1.t < _st0.t)) errors.push('20c(#381-①): spawnTimer 应递减（' + _st0.t + '→' + _st1.t + '）');
  else console.log('[20c] 周期刷怪 OK：8s 内刷出 ' + _spawned + ' 只敌人（spawnTimer ' + _st0.t.toFixed(2) + '→' + _st1.t.toFixed(2) + '）');
  api.cleanState();

  // ============================================================
  // 21) #396 Boss 反馈：结算面板压缩（一屏显示）+ 暂停按钮等宽（不被内容撑开）
  // ============================================================
  console.log('---- #396 结算面板压缩 + 暂停按钮等宽 ----');
  // 21a 确定性结算输入：击杀20/BOSS击破/6件战利品(含遗物)/新层解锁/羁绊火3阶 → showResult 断言核心行
  api.startMission(); for (let i = 0; i < 5; i++) tick(16.7); api.cleanState();
  const _loot21 = [
    { rarity: 'orange', name: '焰龙吐息', relicMods: null },
    { rarity: 'purple', name: '紫绶仙衣', relicMods: null },
    { rarity: 'purple', name: '紫绶仙衣', relicMods: null },
    { rarity: 'blue', name: '碧波镜', relicMods: null },
    { rarity: 'green', name: '青藤符', relicMods: null },
    { rarity: 'orange', name: '星髓之印', relicMods: ['x'] }
  ];
  const _run21 = api.run(); _run21.kills = 20; _run21.killedBoss = true; _run21.loot = _loot21;
  const _meta21 = api.meta(); _meta21.bestLayer = 5; _meta21.maxTier = 6; _meta21.arsenal = [1, 2, 3]; _meta21.currency = 88; _meta21.ore = 20;
  api.addElem('火', 3); // 保证「本局羁绊」行存在
  if (typeof api.showResult !== 'function') errors.push('#396: stub api 未暴露 showResult 钩子');
  else {
    api.showResult('success', 4, 2, 626, true, 205);
    const _rb21 = document.getElementById('resultBody');
    const _h21 = _rb21.innerHTML || '';
    const _need21 = ['结局', '本局收获', '层级', '本局战利品', '本局羁绊', '当前库存'];
    _need21.forEach(k => { if (_h21.indexOf(k) < 0) errors.push('#396: 结算面板缺少核心行「' + k + '」'); });
    const _cards21 = (_h21.match(/class="stat-card/g) || []).length;
    if (_cards21 < 5 || _cards21 > 7) errors.push('#396: 结算面板 stat-card 应 5-7 行，实际 ' + _cards21 + ' 行');
    if (_h21.indexOf('回基地') < 0) errors.push('#396: 结算面板应保留引导文案（回基地…）');
    // 800px 视口高度预算（模拟布局：stat-card≈40px + 其余块≈22px + 引导/按钮≈64px，应 ≤700px）
    const _divs21 = (_h21.match(/<div/g) || []).length;
    const _est21 = _cards21 * 40 + (_divs21 - _cards21) * 22 + 64;
    if (_est21 > 700) errors.push('#396: 结算面板预估高度 ' + _est21 + 'px 超出 800px 视口预算（≤700）');
    else console.log('[#396] 结算压缩 OK：stat-card=' + _cards21 + ' 行 / 预估高=' + _est21 + 'px / 核心行+引导齐全');
  }
  // 21b 暂停按钮等宽：静态 CSS 断言（桩无布局引擎）——所有 .pause-actions .btn-sprite 规则必须 flex: 0 0 固定basis
  const _css396 = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');
  const _pauseRules = (_css396.match(/\.pause-actions \.btn-sprite\s*\{[^}]*\}/g) || []);
  let _stretch396 = false;
  _pauseRules.forEach(r => { if (/\bflex:\s*1\s+1\b/.test(r)) _stretch396 = true; });
  if (_pauseRules.length === 0) errors.push('#396: 未找到 .pause-actions .btn-sprite 规则');
  else if (_stretch396) errors.push('#396: 暂停按钮存在 flex: 1 1（grow/shrink 会拉伸成不等宽），应全改 0 0 固定basis');
  else {
    const _hasHalf396 = _pauseRules.some(r => /\bflex:\s*0\s+0\s+calc\(50%\s*-\s*4px\)/.test(r));
    const _hasFull396 = _pauseRules.some(r => /\bflex:\s*0\s+0\s+100%/.test(r));
    if (!_hasHalf396) errors.push('#396: 桌面/矮视口暂停按钮应 flex: 0 0 calc(50% - 8px) 等宽两列');
    if (!_hasFull396) errors.push('#396: 移动端暂停按钮单列应 flex: 0 0 100%');
    else console.log('[#396] 暂停按钮等宽 CSS 断言 OK：' + _pauseRules.length + ' 处规则均 0 0 固定basis（含 50% 两列 + 100% 单列）');
  }
  api.cleanState();

  // 10) NaN / 无限扫描：玩家与全部敌人坐标/速度/状态必须为有限数值
  scanNaN();
} catch (e) {
  errors.push('FLOW: ' + (e && e.stack || e));
}

scanNaN();
summary();
process.exit(errors.length ? 1 : 0);
