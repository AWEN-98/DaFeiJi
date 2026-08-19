// stub_mobile.js —— 移动端·竖屏专项桩：在 iPhone 竖屏环境下执行真实 game.js，
// 验证双摇杆（Twin-Stick）改造：左摇杆移动 + 右摇杆瞄准/开火一体、废除硬性自动锁敌、
// 阻尼转向、点按盲射、死区判定、松手定角，以及多点触控（Multi-touch）事件捕获无死锁 / 无报错 / 无 NaN。
const fs = require('fs');
const path = require('path');
const NL = String.fromCharCode(10);
const errors = [];
process.on('uncaughtException', e => { errors.push('uncaught: ' + (e && e.stack || e)); });
process.on('unhandledRejection', e => { errors.push('unhandledRejection: ' + (e && e.stack || e)); });

function makeCtx() {
  const noop = () => {};
  return {
    canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    arcTo: noop, rect: noop, ellipse: noop, roundRect: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, stroke: noop, clip: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop, translate: noop, rotate: noop, scale: noop, transform: noop,
    setTransform: noop, resetTransform: noop, setLineDash: noop, getLineDash: () => [],
    drawImage: noop, measureText: t => ({ width: (t ? String(t).length : 0) * 7 }),
    createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) }),
  };
}
const elements = {};
function makeEl(id) {
  const handlers = {};
  const el = {
    id, width: 390, height: 844, style: { setProperty(k, v) { this[k] = String(v); }, getPropertyValue(k) { return this[k]; }, removeProperty(k) { const v = this[k]; delete this[k]; return v; } }, dataset: {},
    textContent: '', innerHTML: '', value: '', checked: false, disabled: false,
    classList: { _s: new Set(), add(...c){c.forEach(x=>this._s.add(x));}, remove(...c){c.forEach(x=>this._s.delete(x));}, contains(c){return this._s.has(c);}, toggle(c,f){const t=f===undefined?!this._s.has(c):f;t?this._s.add(c):this._s.delete(c);return t;} },
    getContext(){ if(!this._ctx){this._ctx=makeCtx();this._ctx.canvas=this;} return this._ctx; },
    addEventListener(t,fn){ (handlers[t]=handlers[t]||[]).push(fn); },
    removeEventListener(){}, appendChild(c){return c;}, removeChild(){}, remove(){}, setAttribute(){}, getAttribute(){return null;},
    focus(){}, blur(){}, click(){ this.dispatchEvent('click',{type:'click',preventDefault(){},stopPropagation(){}}); },
    querySelector(){return makeEl(id+'_q');}, querySelectorAll(){return [];},
    firstChild:null, parentNode:null, parentElement:null,
    getBoundingClientRect(){return {left:0,top:0,width:this.width,height:this.height,right:this.width,bottom:this.height};},
    dispatchEvent(t,evt){ (handlers[t]||[]).forEach(fn=>{try{fn.call(el,evt||{type:t,preventDefault(){},stopPropagation(){}});}catch(e){errors.push('handler '+id+'.'+t+': '+(e&&e.stack||e));}}); const on=this['on'+t]; if(typeof on==='function'){try{on.call(el,evt||{type:t,preventDefault(){},stopPropagation(){}});}catch(e){errors.push('on'+t+' '+id+': '+(e&&e.stack||e));}} },
  };
  el.firstChild=el; el.parentNode=el; el.parentElement=el;
  return el;
}

const rafQueue = [];
global.requestAnimationFrame = cb => { rafQueue.push(cb); return rafQueue.length; };
global.cancelAnimationFrame = () => {};
global.window = global;
global.scrollTo = function () {};
global.devicePixelRatio = 3;
global.innerWidth = 390; global.innerHeight = 844;          // iPhone 竖屏
global.ontouchstart = function () {};                         // 标记为触摸设备
Object.defineProperty(global, 'navigator', { value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', maxTouchPoints: 5, platform: 'iPhone' }, configurable: true, writable: true });
global.addEventListener = function (t, fn) { (global._wh = global._wh || {})[t] = (global._wh[t] || []).concat(fn); };
global.removeEventListener = function () {};
global.localStorage = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, clear() {} }; })();
global.AudioContext = function () { return { currentTime: 0, state: 'running', destination: {}, createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }), createOscillator: () => ({ frequency: { value: 0, setValueAtTime() {} }, type: '', connect() {}, start() {}, stop() {} }), createBufferSource: () => ({ buffer: null, connect() {}, start() {}, stop() {} }), createAnalyser: () => ({ connect() {}, getByteFrequencyData() {} }), decodeAudioData: () => Promise.resolve({}), resume() { return Promise.resolve(); }, suspend() {}, close() {} }; };
global.webkitAudioContext = global.AudioContext;
global.Image = function () { this.width = 0; this.height = 0; this.onload = null; const self = this; Object.defineProperty(this, 'src', { set(v){this._s=v;if(self.onload)setTimeout(()=>self.onload(),0);}, get(){return this._s;}, configurable: true }); };
let VCLK = 0;
global.performance = { now: () => VCLK };
global.document = {
  getElementById(id){ return elements[id] || (elements[id] = makeEl(id)); },
  createElement(tag){ const e = makeEl('_'+tag+'_'+Math.random().toString(36).slice(2,6)); if(tag==='canvas'){e.width=390;e.height=844;} return e; },
  querySelector(){return null;}, querySelectorAll(){return [];},
  addEventListener(t,fn){ (global._wh=global._wh||{})[t]=(global._wh[t]||[]).concat(fn); },
  removeEventListener(){},
  body: makeEl('body'), documentElement: { style: {} },
  hidden: false, visibilityState: 'visible',
};
global.__stub = { api: {} };

const code = fs.readFileSync(path.resolve(__dirname, 'game.js'), 'utf8');
try { (0, eval)(code); } catch (e) { errors.push('load: ' + (e && e.stack || e)); }

function tick(dtMs){ VCLK += (dtMs||16.7); const q = rafQueue.splice(0); q.forEach(cb=>{try{cb(VCLK);}catch(e){errors.push('raf: '+(e&&e.stack||e));}}); }
// 单指 DOM 按钮触控（identifier 无关）
function touch(id,type,x,y){ if(!elements[id]) elements[id]=makeEl(id); elements[id].dispatchEvent(type,{type,changedTouches:[{identifier:7,clientX:x,clientY:y,pageX:x,pageY:y}],touches:[],preventDefault(){},stopPropagation(){}}); }
// 多点触控（真实双摇杆）：pts = [{id, x, y}, ...]，以真实 canvas id 'game' 派发，changedTouches/touches 同步
function mtouch(type, pts){ if(!elements['game']) elements['game']=makeEl('game'); const ct = pts.map(p=>({identifier:p.id, clientX:p.x, clientY:p.y, pageX:p.x, pageY:p.y})); elements['game'].dispatchEvent(type,{type,changedTouches:ct,touches:ct,preventDefault(){},stopPropagation(){}}); }
// 右摇杆（瞄准+开火一体）：派发到右下角静态 #right-stick-container 元素（坐标相对摇杆中心 330,784）
function mtouchStick(type, pts){
  if(!elements['right-stick-container']) elements['right-stick-container']=makeEl('right-stick-container');
  const el = elements['right-stick-container'];
  if(!el._rsRect){ el.getBoundingClientRect = () => ({ left:270, top:724, width:120, height:120, right:390, bottom:844 }); el._rsRect = true; }
  const ct = pts.map(p=>({identifier:p.id, clientX:p.x, clientY:p.y, pageX:p.x, pageY:p.y}));
  el.dispatchEvent(type,{type,changedTouches:ct,touches:ct,preventDefault(){},stopPropagation(){}});
}

const api = global.__stub.api;
if (!api || !api.isMobile) { errors.push('STUB api 未就绪（移动端路径未建立）'); }
else if (!api.isMobile()) { errors.push('isMobile 应为 true（竖屏手机环境），实际 false'); }

function summary(){ console.log('----'); console.log('total errors:', errors.length); errors.slice(0,12).forEach(e=>console.log('ERR>', String(e).split(NL).slice(0,3).join(' | '))); }

try {
  // 1) 标题帧
  for (let i=0;i<30;i++) tick(16.7);
  // 2) 进 mission（竖屏 → autoFire 默认关闭；data-orient 应为 portrait）
  api.startMission();
  // 触发一次 resize，确保 checkOrientation 把 data-orient 标记为 portrait
  (global._wh['resize']||[]).forEach(fn=>{try{fn.call(global,{preventDefault(){},stopPropagation(){}});}catch(e){errors.push('resize: '+(e&&e.stack||e));}});
  if (api.orient() !== 'portrait') errors.push('orient 应为 portrait，实际 ' + api.orient());
  if (api.autoFire() !== false) errors.push('竖屏 twin-stick 下 autoFire 应默认关闭（右摇杆负责开火），实际 ' + api.autoFire());
  // 3) 竖屏渲染 + 战斗帧（drawHUD 走 P=true 分支）
  for (let i=0;i<120;i++) tick(16.7);
  api.renderFrame();
  // 4) 移动端触控：左摇杆（左半屏 canvas）+ 次级键（绝技/闪避/丹药/暂停/翻相/合成/背包/拾取）
  api.cleanState();
  mtouch('touchstart', [{id:1, x:80, y:600}]);     // 左半屏 → 虚拟摇杆（移动）
  mtouch('touchmove', [{id:1, x:110, y:560}]);
  const btns = ['ultBtn','dashBtn','consBtn','pauseBtnMobile','phaseBtn','mergeBtn','backpackBtn','pickupBtn'];
  btns.forEach(b=>{ touch(b,'touchstart',10,10); touch(b,'touchend',10,10); });
  // 右摇杆（双摇杆·瞄准+开火一体）按住持续开火：touchstart 激活 → 持续开火 → touchend 复位
  if (api.cleanState) api.cleanState();
  for (let i=0;i<3;i++) tick(16.7);
  mtouchStick('touchstart', [{id:2, x:330, y:784}]);
  if (api.rightStickActiveState && api.rightStickActiveState() !== true) errors.push('右摇杆 touchstart 应置 aimJoy.active=true');
  for (let i=0;i<10;i++) tick(16.7);
  if (api.firedT && !(api.firedT() > 0)) errors.push('右摇杆按住应触发开火（firedT=' + (api.firedT ? api.firedT() : 'n/a') + '）');
  mtouchStick('touchend', [{id:2, x:330, y:784}]);
  if (api.rightStickActiveState && api.rightStickActiveState() !== false) errors.push('右摇杆 touchend 应复位 active=false');
  mtouch('touchend', [{id:1, x:110, y:560}]);
  for (let i=0;i<60;i++) tick(16.7);
  api.renderFrame();
  // 5) 暂停浮层自动开火开关 接线（按钮存在即可，验证可切换，不强制默认态）
  if (!elements['pauseAutoFire']) errors.push('pauseAutoFire 按钮未在 DOM 注册');
  else { const before = api.autoFire(); elements['pauseAutoFire'].dispatchEvent('click',{type:'click',preventDefault(){},stopPropagation(){}}); if (api.autoFire() === before) errors.push('暂停内“自动开火”开关应可切换，实际不变 ' + api.autoFire()); }

  console.log('竖屏校验：orient=' + api.orient() + ' | autoFire(default)=' + 'false(双摇杆接管) | 触控+渲染 OK');

  // ============================================================
  // 6) 双摇杆 Twin-Stick 多点触控专项（真实 canvas 'game' 事件）
  // ============================================================
  // (a) 双指同时按下：左摇杆(移动, touchId=1) + 右摇杆(瞄准+开火, touchId=2)，各自独立追踪 → 多点触控并行无死锁
  api.cleanState();
  api.enemies().length = 0;            // 确定性：移除敌人，排除辅助瞄准干扰
  api.player().ang = 0;                // 已知朝向（朝右）
  mtouch('touchstart', [{id:1, x:80, y:600}]);
  mtouchStick('touchstart', [{id:2, x:330, y:784}]);
  let js = api.joyState(), as = api.aimJoyState();
  if (!js.active) errors.push('双摇杆：左摇杆未激活（touchId 1）');
  if (!as.active) errors.push('双摇杆：右摇杆未激活（touchId 2）');
  if (js.active && as.active) console.log('双指同按：左摇杆 active 右摇杆 active → 多点触控并行、无死锁');

  // (b) 右摇杆拖动越过死区(>0.2) → 持续开火（firedT>0）+ 瞄准线
  mtouchStick('touchmove', [{id:2, x:330+45, y:784}]);   // dx=45, maxR=45 → mag=1.0 > 0.2
  as = api.aimJoyState();
  if (as.mag <= 0.2) errors.push('右摇杆拖拽后 mag 应 > 死区0.2，实际 ' + as.mag);
  tick(16.7);
  if (api.firedT() <= 0) errors.push('右摇杆越死区应触发持续开火（firedT>0），实际 ' + api.firedT());
  console.log('右摇杆越死区：mag=' + as.mag.toFixed(3) + ' firedT=' + api.firedT().toFixed(3) + ' → 瞄准+开火一体 OK');

  // (c) 死区判定：右摇杆轻拨（mag<=0.2）→ 不触发“本轮 NEW 开火”（firedT 仅随旧窗口衰减，此处只校验 mag 口径）
  mtouchStick('touchmove', [{id:2, x:330+8, y:784}]);     // dx=8, maxR=45 → mag ≈ 0.178 < 0.2
  as = api.aimJoyState();
  if (as.mag > 0.2) errors.push('死区用例 mag 计算异常，应 <=0.2，实际 ' + as.mag);
  console.log('死区轻拨：mag=' + as.mag.toFixed(3) + '（<=0.2 不触发持续开火）');

  // (d) 点按保底（盲射）：落指右摇杆后极短拖拽/未拖过死区即松手（tapT<0.22 且 mag<=deadzone）→ aimTapFire 触发
  api.enemies().length = 0;
  mtouchStick('touchend', [{id:2, x:330+8, y:784}]);      // 结束上一段右摇杆（已越死区，非 tap）
  mtouchStick('touchstart', [{id:2, x:330, y:784}]);      // 重新落指
  mtouchStick('touchend', [{id:2, x:330, y:784}]);        // 立即松手（未拖过死区、tapT≈0）→ tap-fire
  const tap = api.aimTapFireState();
  tick(16.7);
  if (!tap) errors.push('点按保底：轻点右摇杆应产生 aimTapFire，实际 false');
  if (api.firedT() <= 0) errors.push('点按保底：盲射应产生开火（firedT>0），实际 ' + api.firedT());
  console.log('点按盲射：aimTapFire=' + tap + ' firedT=' + api.firedT().toFixed(3) + ' → 盲射保底 OK');

  // (e) 松手定角（推即朝向 / 松即定角）：拖出瞄准方向后松手，facing 锁定在松手瞬间的角度、不再继续转动
  api.cleanState(); api.enemies().length = 0; api.player().ang = 1.234;
  mtouchStick('touchstart', [{id:2, x:330, y:784}]);
  mtouchStick('touchmove', [{id:2, x:330+45, y:784+45}]);   // dx=dy → 目标角 ≈ 0.785（右下）
  for (let i = 0; i < 80; i++) tick(16.7);                  // 阻尼收敛到目标角
  const angRelease = api.playerAng();                       // 松手前已逼近目标角
  if (Math.abs(angRelease - 0.785) > 0.15) errors.push('拖拽应使机头转向拖动方向(≈0.785)，实际 ' + angRelease.toFixed(4));
  mtouchStick('touchend', [{id:2, x:330+45, y:784+45}]);
  mtouch('touchend', [{id:1, x:80, y:600}]);                // 兜底释放左摇杆（若存在）
  for (let i = 0; i < 30; i++) tick(16.7);                  // 松手后多帧
  if (Math.abs(api.playerAng() - angRelease) > 1e-3) errors.push('松手后 facing 应锁定不变（松即定角），实际 ' + api.playerAng().toFixed(4) + '（松手时 ' + angRelease.toFixed(4) + '）');
  console.log('松手定角：release 后 ang=' + api.playerAng().toFixed(4) + ' 锁定稳定（松手时 ' + angRelease.toFixed(4) + '）→ 推即朝向/松即定角 OK');

  // (f) 多点触控收尾：双指按下 → 各自拖动 → 依次松手 → touchcancel 健壮性复位 → 无死锁/无 NaN
  api.cleanState();
  mtouch('touchstart', [{id:1, x:80, y:600}]);
  mtouchStick('touchstart', [{id:2, x:330, y:784}]);
  mtouch('touchmove', [{id:1, x:80+30, y:600}]);
  mtouchStick('touchmove', [{id:2, x:330+45, y:784}]);
  mtouch('touchend', [{id:1, x:80+30, y:600}]);
  mtouchStick('touchend', [{id:2, x:330+45, y:784}]);
  mtouch('touchcancel', []);                          // 健壮性：cancel 应安全复位，不抛错
  tick(16.7);
  const p = api.player();
  if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.ang)) errors.push('多点触控后 player 状态出现 NaN/Inf');
  if (api.joyState().active || api.aimJoyState().active) errors.push('所有触摸结束后摇杆应复位（active=false）');
  console.log('收尾：双摇杆均复位 active=false，player 有限值 → 无死锁/无 NaN');

  // (g) 倒退减速机制校验（移动端双摇杆：朝向=右摇杆，移动=左摇杆）
  // 修复前 curSpeed×0.6 只作用于装饰尾焰，常规移动误用 topSpeed(1.8×) → 倒退减速名存实亡 + 巡航过快。
  // 现常规移动用 curSpeed；当玩家朝某方向瞄准(右摇杆)却反向移动(左摇杆)即触发倒退减速。
  // 双摇杆架构下“机身正向”= 瞄准方向（右摇杆），故必须两边同时驱动才能测到该惩罚。
  api.cleanState();
  api.obstacles().length = 0; api.enemies().length = 0;
  api.player().x = 800; api.player().y = 550; api.player().ang = 0; api.player().vx = 0; api.player().vy = 0;
  // 前向：右摇杆朝右(瞄准=0) + 左摇杆朝右(同向移动) → facingDot=+1 全速
  mtouch('touchstart', [{id:1, x:80, y:600}]);
  mtouchStick('touchstart', [{id:2, x:330, y:784}]);
  mtouch('touchmove', [{id:1, x:140, y:600}]);
  mtouchStick('touchmove', [{id:2, x:380, y:784}]);
  for (let i=0;i<60;i++){ api.obstacles().length=0; api.enemies().length=0; api.tick(1); }
  const fwd = Math.hypot(api.player().vx, api.player().vy);
  mtouch('touchend', [{id:1, x:140, y:600}]);
  mtouchStick('touchend', [{id:2, x:380, y:784}]);
  // 后向：右摇杆朝右(瞄准=0) + 左摇杆朝左(反向移动) → facingDot=-1 触发 ×0.6
  api.cleanState();
  api.obstacles().length = 0; api.enemies().length = 0;
  api.player().x = 800; api.player().y = 550; api.player().ang = 0; api.player().vx = 0; api.player().vy = 0;
  mtouch('touchstart', [{id:1, x:80, y:600}]);
  mtouchStick('touchstart', [{id:2, x:330, y:784}]);
  mtouch('touchmove', [{id:1, x:20, y:600}]);
  mtouchStick('touchmove', [{id:2, x:380, y:784}]);
  for (let i=0;i<60;i++){ api.obstacles().length=0; api.enemies().length=0; api.tick(1); }
  const rev = Math.hypot(api.player().vx, api.player().vy);
  mtouch('touchend', [{id:1, x:20, y:600}]);
  mtouchStick('touchend', [{id:2, x:380, y:784}]);
  if (!(fwd > 30)) errors.push('倒退减速用例：前向速度应>30，实际 ' + fwd.toFixed(1));
  if (fwd > 0 && !(rev < fwd * 0.8)) errors.push('倒退减速失效：瞄准前向却反向移动应≈前向×0.6，实际 fwd=' + fwd.toFixed(1) + ' rev=' + rev.toFixed(1) + ' 比值=' + (rev/fwd).toFixed(2));
  console.log('倒退减速(双摇杆)：前向=' + fwd.toFixed(1) + ' 瞄准前向+反向移动=' + rev.toFixed(1) + ' 比值=' + (fwd>0?(rev/fwd).toFixed(2):'NaN') + '（应≈0.60）→ 减速机制已恢复');

} catch (e) { errors.push('run: ' + (e && e.stack || e)); }

summary();
process.exit(errors.length ? 1 : 0);
