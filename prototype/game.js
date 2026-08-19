'use strict';
/* 空域撤离 - 浏览器 MVP v10 (新敌人原型+精英修饰词)
   打飞机 + 搜刮 + 合成 + 肉鸽 + Boss + 搜打撤
   v10 新增：3种敌人(狙击手/护盾兵/蜂群) / 精英修饰词(爆裂/适应/狂暴) /
   v9 军械库扩容：19种子类型分支(后缀决定) / 105个独立命名(4槽×5稀有度) /
   4套套装(机制质变) / 3件传说武器(独特被动) / 28条词条(减伤/格挡/冲刺CD等) /
   交叉联动(套装不可合成/宝库房3%传说/机动核心撤离加速/暴击标记连锁) */
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0;             // 逻辑坐标（CSS 像素），所有绘制/碰撞/相机运算统一用此
  var DPR = 1;                  // devicePixelRatio 高清放大倍率（resize 时重算，封顶 3 防过载）
  var WORLD_W = 3200, WORLD_H = 2200; // 世界尺寸（比屏幕大，靠相机滚动浏览）
  var cam = { x: 0, y: 0 };           // 相机左上角（世界坐标）
  function resize() {
    // 优先使用 visualViewport（更准确地反映实际可见区域，排除浏览器栏）
    var vv = window.visualViewport;
    var cssW, cssH;
    if (vv) {
      cssW = Math.max(320, Math.floor(vv.width));
      cssH = Math.max(240, Math.floor(vv.height));
    } else {
      cssW = Math.max(320, window.innerWidth);
      cssH = Math.max(240, window.innerHeight);
    }
    // devicePixelRatio 高清化：canvas 物理分辨率 = CSS 像素 × DPR，文字/粒子不发糊
    DPR = Math.min(window.devicePixelRatio || 1, 3); // 封顶 3 防极端设备（如 iPad 3x+）绘制负担过重
    canvas.width = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    canvas.style.width = cssW + 'px';   // CSS 显示尺寸保持 CSS 像素（不拉伸）
    canvas.style.height = cssH + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // 逻辑坐标→物理像素映射：所有 draw 调用以 CSS 像素为基准，DPR 自动放大
    W = cssW; H = cssH;              // 全局逻辑坐标用 CSS 像素（视野扩展式：宽屏看到更多世界，不拉伸）
    updateSafeArea();
  }
  // 2026-08-18：resize 时重算 isMobile（很多设备初次检测时视口还没稳定）
  window.addEventListener('resize', function () { resize(); recomputeMobile(); checkOrientation(); showMobileControls(); hideBrowserBars(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () { resize(); recomputeMobile(); showMobileControls(); });
    window.visualViewport.addEventListener('scroll', resize);
  }
  window.addEventListener('orientationchange', function () { setTimeout(function () { recomputeMobile(); checkOrientation(); showMobileControls(); hideBrowserBars(); }, 100); });
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b + 1)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 6.2831853; while (d < -Math.PI) d += 6.2831853; return d; }
  function roundRectPath(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  var COL = {
    bg: '#0D0F12', grid: 'rgba(201,162,75,0.06)', player: '#C9A24B', playerEdge: '#0A2E26',
    bulletP: '#E8DCC4', enemy: '#C94F4F', enemyEdge: '#3D1515', bulletE: '#E8907C',
    extract: '#7FB069', gold: '#C9A24B', node: '#C9A24B', elite: '#D9B64A',
    ink: '#0E1424', paper: '#F4EFE6', jade: '#7FB069', iron: '#7A8794', sha: '#B03A3A'
  };
  var RAR = ['white', 'green', 'blue', 'purple', 'orange'];
  var RARNAME = { white: '普通', green: '精良', blue: '稀有', purple: '史诗', orange: '传说' };
  var RARCOL = { white: '#D8D6CE', green: '#4E9A7E', blue: '#4E8FC7', purple: '#8A6FB8', orange: '#D98A3D' };
  var RARVAL = [10, 25, 60, 140, 320];
  var TIERNAME = ['入门', '进阶', '深渊'];
  function tierName(t) { return t <= 2 ? (TIERNAME[t - 1] || ('第' + t + '层')) : ('深渊 ' + (t - 2)); } // B1 修复：深渊层数口径统一为 tierTitle（Tier3=深渊1层，Tier4=深渊2层…）；t≤2 固定名 1=入门/2=进阶
  // 八卦五行：巽(风) · 震(雷) · 坎(水) · 离(火) · 坤(土)
  var ELEMCOL = { '火': '#C94F3E', '水': '#4E8FC7', '雷': '#D9B64A', '风': '#37C2C9', '土': '#B07D45' };
  var TRIGRAM = { '风': '巽', '雷': '震', '水': '坎', '火': '离', '土': '坤' };

  // ---------- 打击感 & 特效基础设施（美术圣经 visual-feel-vfx.md §2/§6）----------
  var BULLET_COL = { player: '#E8DCC4', enemy: '#E8907C', boss: '#D96A7E', buff: '#FFE9A8' };
  // 2026-08-18：敌人 AI 调试开关（"怪物失去攻击欲望/不射击" 专项审计用）。默认关闭，最终必须保持 false。
  var DBG_ENEMY_AI = false;

  // 粒子对象池：512 硬上限，环形回收最老，杜绝每帧 new / push / splice
  var POOL = 512;
  var particles = new Array(POOL);
  for (var _pi = 0; _pi < POOL; _pi++) particles[_pi] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#fff', r: 2, ring: false, r0: 0, rmax: 0, len: 0 };
  var pCur = 0;
  var playerGhosts = [];          // 冲刺残影池（高速移动/冲刺时拖出的渐隐幻影）
  function resetParticles() { for (var i = 0; i < POOL; i++) particles[i].alive = false; pCur = 0; }
  function spawnParticle(o) {
    var p = particles[pCur]; pCur = (pCur + 1) % POOL;
    p.alive = true; p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = o.life; p.maxLife = o.life; p.color = o.color; p.r = o.r || 2;
    p.ring = !!o.ring; p.rmax = o.rmax || 0; p.r0 = o.r0 || (o.r || 2); p.len = o.len || 0;
  }

  // 飘字对象池
  var FPOOL = 96;
  var floaters = new Array(FPOOL);
  for (var _fi = 0; _fi < FPOOL; _fi++) floaters[_fi] = { alive: false, x: 0, y: 0, text: '', color: '#fff', life: 0, maxLife: 0, style: 'normal', vy: -22 };
  var fCur = 0;
  function resetFloaters() { for (var i = 0; i < FPOOL; i++) floaters[i].alive = false; fCur = 0; }

  // 屏幕抖动：k(t)=mag*exp(-t/tau)，叠加取 max 不累加
  // 极简抖动：事件触发→覆盖→快速衰减；小抖节流防持续，随机短促不飘，不打扰移动跟手
  // 抖动：极简模型（你点赞的"最开始"手感）。指数衰减 + 60ms 节流，
  // 关键门控 `mag>=mag||t<=0` 保证：一次没衰减完，小抖不触发 → 绝不续命成持续抖/卡顿感。
  var shake = { mag: 0, t: 0, dur: 0, tau: 0.05, cd: 0 };
  function addShake(mag, dur, tau, force) {
    dur = dur / 1000; tau = tau / 1000;
    if (!force && shake.cd > 0) return;                 // 小抖节流：高频事件不叠成"持续抖"
    if (mag >= shake.mag || shake.t <= 0) {              // 仅接受更大或空闲的抖动；小抖不会压掉/续命大抖
      shake.mag = mag; shake.dur = dur; shake.tau = tau; shake.t = dur;
    }
    if (!force) shake.cd = 0.06;                         // 小抖之间至少隔 60ms
  }

  // 命中顿帧：freeze>0 时 loop 冻结世界（含粒子/飘字），硬上限 220ms
  var freeze = 0;
  function addFreeze(ms) { if (freeze <= 0) freeze = Math.min(ms / 1000, 0.18); }
  // 命中顿帧（打击感三件套·Hitstop）：普通命中/暴击微暂停 2~3 帧；带冷却避免连射叠成慢动作
  var hitstopT = 0, hitstopCd = 0;
  function addHitstop(ms) { if (hitstopCd > 0) return; hitstopT = Math.min(0.05, ms / 1000); hitstopCd = HITSTOP_CD; }

  // 全屏色调偏移（Boss 阶段切换 / 暴击微白闪）
  var tint = { a: 0, col: '#fff', max: 0, rate: 1 };
  function addTint(col, a) { tint.col = col; tint.max = a; tint.rate = a / 0.3; tint.a = a; }

  // Boss 出场暗角计时
  var bossVig = 0;

  // 可访问性开关：一键关闭所有辉光精灵与拖尾（键 G），关闭后仅靠形状/动效传达信息
  var glowOn = true;

  // 枪口闪光（预渲染辉光精灵，禁用逐发 shadowBlur）
  var muzzle = { life: 0, x: 0, y: 0, ang: 0 };

  // 预渲染径向辉光精灵缓存
  var glowCache = {};
  function getGlow(col) {
    if (glowCache[col]) return glowCache[col];
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'); var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 32, 0, 7); g.fill(); glowCache[col] = c; return c;
  }
  function spawnRing(x, y, col, rmax) { spawnParticle({ x: x, y: y, vx: 0, vy: 0, life: 0.12, color: col, r: 2, ring: true, rmax: rmax, r0: 6 }); }

  // ---------- 元进度 ----------
  function defaultMeta() {
    return { currency: 0, ore: 0, unlocked: { a: true, b: false, c: false }, runs: 0, bestKills: 0,
      maxTier: 1, bossCleared: false, seenTutorial: false, bestLayer: 1,
      up: { hp: 0, dmg: 0, speed: 0, shield: 0, pickup: 0 },
      tech: { hp: 0, dmg: 0, flip: 0, bag: 0 }, // 研究院天梯（多级永久升级）
      arsenal: [], equipped: { weapon: null, armor: null, core: null, ammo: null },
      research: {}, bondBest: {}, codex: { loot: {}, enemies: {} } };
  }
  function checkUnlocks() {
    ['b', 'c'].forEach(function (id) {
      var a = AIRCRAFT[id];
      if (meta.currency >= a.unlockCost && meta.maxTier >= (a.requireTier || 1)) meta.unlocked[id] = true;
    });
  }
  function loadMeta() {
    try { var s = localStorage.getItem('kongyu_meta'); if (s) { var m = Object.assign(defaultMeta(), JSON.parse(s)); m.up = Object.assign({ hp: 0, dmg: 0, speed: 0, shield: 0, pickup: 0 }, m.up || {}); m.unlocked = Object.assign({ a: true, b: false, c: false }, m.unlocked || {}); m.equipped = Object.assign({ weapon: null, armor: null, core: null, ammo: null }, m.equipped || {}); m.tech = Object.assign({ hp: 0, dmg: 0, flip: 0, bag: 0 }, m.tech || {}); if (!m.arsenal) m.arsenal = []; if (!m.research) m.research = {}; if (!m.bondBest) m.bondBest = {}; if (!m.codex) m.codex = { loot: {}, enemies: {} }; if (!m.bestLayer) m.bestLayer = m.maxTier || 1; return m; } } catch (e) {}
    return defaultMeta();
  }
  function saveMeta() { try { localStorage.setItem('kongyu_meta', JSON.stringify(meta)); } catch (e) {} }
  var meta = loadMeta();

  // ========== 音效（Kenney CC0 真实音效素材，零版权风险）==========
  // 素材来源：Kenney.nl（CC0 1.0 免费可商用），文件位于 prototype/audio/
  var AudioSys = (function () {
    var ctx = null, master = null, dryGain = null, reverbGain = null, convolver = null, muted = false, shootLast = 0, audios = {};
    function initCtx() {
      if (ctx) return;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
        dryGain = ctx.createGain(); dryGain.gain.value = 0.85; dryGain.connect(master);
        // 电影感混响：程序化生成 1.2s 大厅 IR（指数衰减噪声）
        convolver = ctx.createConvolver();
        var rate = ctx.sampleRate, len = Math.floor(rate * 1.2);
        var ir = ctx.createBuffer(2, len, rate);
        for (var ch = 0; ch < 2; ch++) {
          var d = ir.getChannelData(ch);
          var prev = 0;
          for (var i = 0; i < len; i++) {
            var ns = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
            prev = prev * 0.72 + ns * 0.28; // 一阶低通：削掉高频沙沙，混响变"暖"
            d[i] = prev;
          }
        }
        convolver.buffer = ir;
        reverbGain = ctx.createGain(); reverbGain.gain.value = 0.24; reverbGain.connect(master);
        convolver.connect(reverbGain);
      } catch (e) { ctx = null; }
    }
    function send(node) { // 双路输出：直通（dry）+ 大厅混响（wet）
      if (ctx) { node.connect(dryGain); node.connect(convolver); }
    }
    function tone(freq, dur, type, vol, opts) {
      opts = opts || {};
      if (!ctx || muted) return;
      var t0 = ctx.currentTime + (opts.when || 0);
      var o = ctx.createOscillator(); o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol || 0.12, t0 + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      var node = o;
      if (opts.lp) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; o.connect(f); node = f; }
      node.connect(g); send(g);
      o.start(t0); o.stop(t0 + dur + 0.12);
    }
    function noise(dur, vol, lp, when) {
      if (!ctx || muted) return;
      var t0 = ctx.currentTime + (when || 0);
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 1500;
      var g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.15, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); send(g);
      src.start(t0); src.stop(t0 + dur + 0.12);
    }
    // Kenney CC0 文件（仅合成做不出的：胜利旋律 / UI 点击）
    var FILES = { extract: ['jingles_HIT00.ogg'], ui: ['click1.ogg'] };
    function el(path) {
      if (!audios[path]) {
        var uri = (typeof AUDIO_DATA !== 'undefined' && AUDIO_DATA[path]) ? AUDIO_DATA[path] : ('audio/' + path);
        var a = new Audio(uri); a.volume = 0.7; audios[path] = a;
      }
      return audios[path];
    }
    function playFile(key) {
      if (muted) return;
      initCtx();
      var list = FILES[key]; if (!list) return;
      var a = el(list[randi(0, list.length - 1)]);
      try { a.currentTime = 0; var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
    }
    var sfx = {
      shoot: function () { var n = performance.now(); if (n - shootLast < 80) return; shootLast = n; tone(650 + Math.random() * 120, 0.07, 'triangle', 0.1, { slideTo: 300 }); noise(0.02, 0.05, 3600); },
      hit: function () { noise(0.04, 0.08, 2000); tone(260, 0.05, 'sine', 0.07, { slideTo: 120 }); },
      crit: function () { tone(950, 0.08, 'triangle', 0.11, { slideTo: 420 }); noise(0.03, 0.06, 4200); },
      explode: function () { tone(110, 0.5, 'sine', 0.24, { slideTo: 30 }); noise(0.4, 0.18, 500); noise(0.07, 0.08, 2600); },
      enemyDie: function () { tone(420, 0.14, 'triangle', 0.09, { slideTo: 140 }); noise(0.07, 0.06, 1800); },
      eliteDie: function () { tone(180, 0.42, 'sine', 0.18, { slideTo: 50 }); noise(0.3, 0.14, 800); tone(360, 0.18, 'triangle', 0.07, { slideTo: 160 }); },
      chestOpen: function () { tone(392, 0.09, 'sine', 0.1); tone(494, 0.09, 'sine', 0.1, { when: 0.07 }); tone(587, 0.09, 'sine', 0.1, { when: 0.14 }); tone(784, 0.16, 'sine', 0.11, { when: 0.21 }); },
      pickup: function (rarity) { var idx = RAR.indexOf(rarity); if (idx < 0) idx = 0; var f = 440 + idx * 95; tone(f, 0.09, 'sine', 0.08); tone(f * 1.5, 0.11, 'sine', 0.06, { when: 0.05 }); },
      runePick: function () { tone(523, 0.12, 'triangle', 0.11); tone(659, 0.13, 'triangle', 0.11, { when: 0.1 }); tone(784, 0.24, 'triangle', 0.1, { when: 0.2 }); },
      merge: function () { tone(494, 0.12, 'triangle', 0.11); tone(622, 0.13, 'triangle', 0.11, { when: 0.1 }); tone(740, 0.24, 'triangle', 0.1, { when: 0.2 }); },
      bossRoar: function () { tone(70, 1.1, 'sawtooth', 0.16, { slideTo: 35, lp: 200 }); noise(0.7, 0.12, 320); tone(45, 1.1, 'sine', 0.12, { slideTo: 26 }); },
      bossPhase: function () { tone(200, 0.45, 'sine', 0.13, { slideTo: 65 }); noise(0.3, 0.1, 420); },
      bossDie: function () { tone(100, 1.2, 'sine', 0.24, { slideTo: 26 }); noise(1.0, 0.2, 400); tone(55, 1.1, 'triangle', 0.1, { slideTo: 25, lp: 280 }); },
      alarm: function () { // v12.6：光柱警报——双音交错急促警报
        tone(880, 0.18, 'square', 0.1, { slideTo: 660 }); noise(0.12, 0.1, 1600);
        tone(660, 0.18, 'square', 0.1, { slideTo: 880, when: 0.2 }); noise(0.12, 0.1, 1600, 0.2);
      },
      playerHit: function () { tone(200, 0.16, 'square', 0.1, { slideTo: 85, lp: 1200 }); noise(0.08, 0.08, 1100); },
      playerDie: function () { tone(300, 0.8, 'sawtooth', 0.12, { slideTo: 45, lp: 600 }); noise(0.55, 0.13, 460); },
      dash: function () {
        // 冲刺"嗖"：噪声 + 带通扫频（380→4400Hz），空气被划开的感觉
        if (!ctx || muted) return;
        var t0 = ctx.currentTime, dur = 0.16;
        var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        var src = ctx.createBufferSource(); src.buffer = buf;
        var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
        f.frequency.setValueAtTime(380, t0);
        f.frequency.exponentialRampToValueAtTime(4400, t0 + dur);
        var g = ctx.createGain(); g.gain.setValueAtTime(0.13, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        src.connect(f); f.connect(g); send(g);
        src.start(t0); src.stop(t0 + dur + 0.03);
      },
      extract: function () {
        // 柔和上行琶音：C-E-G-C，正弦波，渐弱，不刺耳
        tone(523, 0.18, 'sine', 0.08);
        tone(659, 0.18, 'sine', 0.07, { when: 0.12 });
        tone(784, 0.22, 'sine', 0.07, { when: 0.24 });
        tone(1047, 0.40, 'sine', 0.06, { when: 0.36 });
      },
      bomb: function () { tone(120, 0.5, 'sine', 0.2, { slideTo: 30 }); noise(0.42, 0.16, 550); },
      shield: function () { tone(400, 0.22, 'sine', 0.1, { slideTo: 800 }); },
      heal: function () { tone(380, 0.2, 'sine', 0.09, { slideTo: 720 }); tone(570, 0.24, 'sine', 0.06, { slideTo: 1000, when: 0.08 }); },
      slow: function () { tone(500, 0.45, 'sine', 0.08, { slideTo: 120 }); },
      stolen: function () { tone(300, 0.18, 'sawtooth', 0.11, { slideTo: 480, lp: 2200 }); tone(480, 0.22, 'sawtooth', 0.09, { slideTo: 300, lp: 2000, when: 0.14 }); },
      // 相位翻转 sting（§7.11）：余烬=低频轰鸣 + 下行刺音（狂暴感）；鎏金=清亮上行（安全）
      phaseFlip: function (toEmber) {
        if (toEmber) {
          tone(190, 0.5, 'sawtooth', 0.16, { slideTo: 70, lp: 300 });
          noise(0.4, 0.14, 420);
          tone(90, 0.5, 'sine', 0.14, { slideTo: 40 });
        } else {
          tone(440, 0.18, 'triangle', 0.12, { slideTo: 660 });
          tone(660, 0.22, 'sine', 0.1, { when: 0.1, slideTo: 880 });
        }
      },
      denied: function () { tone(180, 0.12, 'square', 0.08, { slideTo: 110, lp: 900 }); },
      ui: function () { playFile('ui'); },
      // 互动物触发反馈音（§P1 统一系统）：不同音高区分四类触发
      pillar: function () {
        // 金属铿：高频方波叩击 + 短噪声 → 机械锁扣
        tone(880, 0.10, 'square', 0.10, { slideTo: 560, lp: 3200 });
        tone(1320, 0.08, 'sine', 0.06, { slideTo: 760 });
        noise(0.03, 0.05, 5200);
      },
      vault: function () {
        // 厚重：低频轰鸣 + 闷响 → 巨门开启
        tone(120, 0.55, 'sine', 0.22, { slideTo: 45 });
        tone(70, 0.6, 'triangle', 0.14, { slideTo: 35 });
        noise(0.35, 0.16, 420);
      },
      rift: function () {
        // 低频漩涡：上扫正弦 + 下扫锯齿 → 吞噬口旋转
        tone(60, 0.7, 'sine', 0.13, { slideTo: 220 });
        tone(120, 0.7, 'sawtooth', 0.10, { slideTo: 50, lp: 320 });
        noise(0.5, 0.10, 280);
      }
    };
    function unlock() {
      initCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      for (var p in audios) {
        try { var a = audios[p]; var pr = a.play(); if (pr && pr.then) pr.then(function () { this.pause(); this.currentTime = 0; }.bind(a)).catch(function () {}); } catch (e) {}
      }
    }
    function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.85; for (var p in audios) { audios[p].volume = m ? 0 : 0.7; } }
    function isMuted() { return muted; }
    return { unlock: unlock, sfx: sfx, setMuted: setMuted, isMuted: isMuted };
  })();

  // ========== 元进度·装备系统（A 入库装备 / B 熔炼台 / C 研究院+图鉴）==========
  // 战利品不再融化成单一货币，而是变成跨局「法器」资产，可装备实改数值
  var SLOTS = ['weapon', 'armor', 'core', 'ammo'];
  var SLOTNAME = { weapon: '武器', armor: '护甲', core: '核心', ammo: '弹药' };
  var SLOTCOL = { weapon: '#FF7A59', armor: '#5AA9FF', core: '#B27BFF', ammo: '#7FB069' };
  function pickSlot() { return SLOTS[randi(0, 3)]; }
  var artSeq = 0;
  function rollMods(slot, rarity) {
    var idx = RAR.indexOf(rarity);
    var s = AFFIX_SCALE[idx] || 1.0;
    var pool = AFFIX_POOL[slot] || AFFIX_POOL.weapon;
    var count = Math.min(AFFIX_COUNT[rarity] || 2, pool.length);
    // 随机抽取 count 条不重复词缀
    var avail = pool.slice();
    var m = {};
    var primaryMod = null; // 记录第一条词条，用于前缀命名
    for (var i = 0; i < count; i++) {
      var pick = randi(0, avail.length - 1);
      var aff = avail.splice(pick, 1)[0];
      // 数值在 [min, max] 区间随机，再乘稀有度缩放
      var val = aff.min + Math.random() * (aff.max - aff.min);
      val = val * s;
      // 整数/小数处理
      if (aff.mod === 'fireRate' || aff.mod === 'regen' || aff.mod === 'shieldRegen' ||
          aff.mod === 'critChance' || aff.mod === 'dodgeChance' || aff.mod === 'lifesteal') {
        val = +val.toFixed(2);
      } else {
        val = Math.round(val);
      }
      // 同名词条取大值（如 core 可同时抽 pierce 和 burn）
      if (m[aff.mod] !== undefined) {
        m[aff.mod] = Math.max(m[aff.mod], val);
      } else {
        m[aff.mod] = val;
      }
      if (i === 0) primaryMod = aff.mod;
    }
    m._prefix = primaryMod; // 存主词条 key 供命名用
    return m;
  }
  function makeArtifact(slot, rarity, name, fixedMods) {
    // 优先用按槽位的命名池，回退到通用池
    var pool = (SLOT_NAMES[slot] && SLOT_NAMES[slot][rarity]) || LOOT_NAMES[rarity] || LOOT_NAMES.white;
    var nm = name || pool[randi(0, pool.length - 1)];
    var mods = fixedMods || rollMods(slot, rarity);
    // 检测子类型
    var sub = detectSubtype(nm, slot);
    // 如果有 _prefix 且名字没有前缀，加上前缀
    if (mods._prefix && !fixedMods && nm.indexOf('·') < 0) {
      var pfx = PREFIX_BY_MOD[mods._prefix] || '';
      if (pfx) nm = pfx + '·' + nm;
    }
    delete mods._prefix; // 命名后清除标记
    var art = { id: 'art' + (Date.now().toString(36)) + (artSeq++).toString(36), slot: slot, rarity: rarity, name: nm, mods: mods };
    if (sub) { art.subtype = sub; art.subBonus = SUBTYPE_PARAMS[sub] || {}; }
    // 检测是否套装件
    var setKey = NAME_TO_SET[nm];
    if (setKey) { art.setKey = setKey; }
    return art;
  }
  function applyArtifactMods(m, alsoHp) {
    if (!m) return;
    if (m.dmg) player.dmg += m.dmg;
    if (m.maxhp) { player.maxhp += m.maxhp; if (alsoHp !== false) player.hp += m.maxhp; } // #BP2：重算时 alsoHp=false，避免换装回血
    if (m.maxshield) player.maxshield += m.maxshield;
    if (m.regen) player.regen += m.regen;
    if (m.fireRate) player.fireRate += m.fireRate;
    if (m.critChance) player.critChance = Math.min(0.8, player.critChance + m.critChance);
    if (m.bulletSpeed) player.bulletSpeed += m.bulletSpeed;
    if (m.speed) player.speed += m.speed;
    if (m.dodgeChance) player.dodgeChance = Math.min(0.6, player.dodgeChance + m.dodgeChance);
    if (m.pierce) player.pierce += m.pierce;
    if (m.burn) player.burn = Math.max(player.burn, m.burn);
    if (m.pellets) player.pellets = Math.min(9, player.pellets + m.pellets);
    if (m.explode) player.explode = Math.max(player.explode, m.explode);
    // v8 新增词条
    if (m.lifesteal) player.lifesteal = (player.lifesteal || 0) + m.lifesteal;
    if (m.chain) player.chain = (player.chain || 0) + m.chain;
    if (m.homing) player.homing = true;
    if (m.thorns) player.thorns = (player.thorns || 0) + m.thorns;
    if (m.shieldRegen) player.shieldRegen = (player.shieldRegen || 0) + m.shieldRegen;
    // v9 新增词条（设计文档 2.1-2.5）
    if (m.critMult) player.critMult += m.critMult;
    if (m.dmgReduce) player.dmgReduce = Math.min(0.4, (player.dmgReduce || 0) + m.dmgReduce);
    if (m.blockChance) player.blockChance = (player.blockChance || 0) + m.blockChance;
    if (m.dashCdReduce) player.dashCdReduce = (player.dashCdReduce || 0) + m.dashCdReduce;
    if (m.jadeBonus) player.jadeBonus = (player.jadeBonus || 0) + m.jadeBonus;
    if (m.dropBonus) player.dropBonus = (player.dropBonus || 0) + m.dropBonus;
  }
  // 应用子类型基础属性（#BP2：safe=true 时跳过「hp=maxhp」回血副作用，供 recomputeRunStats 安全重算）
  function applySubtypeBonus(art, safe) {
    var b = art.subBonus; if (!b) return;
    var s = art.subtype;
    // 武器子类型
    if (s === 'ballistic') { player.dmg = Math.round(player.dmg * (b.dmgMult || 1)); player.bulletSpeed = Math.round(player.bulletSpeed * (b.bulletSpeedMult || 1)); }
    else if (s === 'spread') { player.pellets = Math.min(9, player.pellets + (b.pellets || 0)); player.spreadAngle = b.spreadAngle; player.falloff = b.falloff; }
    else if (s === 'homing') { player.homing = true; player.homingTurnRate = b.turnRate; player.dmg = Math.round(player.dmg * (b.dmgMult || 1)); }
    else if (s === 'splash') { player.explode = Math.max(player.explode, b.explodeR); player.splashRatio = b.splashRatio; }
    else if (s === 'chain') { player.chain = (player.chain || 0) + (b.chainJump || 0); player.chainDecay = b.chainDecay; player.chainRange = b.chainRange; }
    // 护甲子类型
    else if (s === 'heavy') { player.maxhp = Math.round(player.maxhp * (b.hpMult || 1)); if (!safe) player.hp = player.maxhp; player.speed = Math.round(player.speed * (1 - (b.speedPenalty || 0))); }
    else if (s === 'light') { player.maxhp = Math.round(player.maxhp * (b.hpMult || 1)); if (!safe) player.hp = player.maxhp; player.dodgeChance = Math.min(0.6, player.dodgeChance + (b.dodgeBonus || 0)); }
    else if (s === 'regen') { player.maxhp = Math.round(player.maxhp * (b.hpMult || 1)); if (!safe) player.hp = player.maxhp; player.regen *= (b.regenMult || 1); }
    else if (s === 'shield') { player.maxhp = Math.round(player.maxhp * (b.hpMult || 1)); if (!safe) player.hp = player.maxhp; player.maxshield = Math.round(player.maxshield * (b.shieldMult || 1)); player.shieldBreakIframe = b.breakIframe; }
    // 核心子类型
    else if (s === 'mobility') { player.speed += (b.speedBonus || 0); player.dashCdReduce = (player.dashCdReduce || 0) + (b.dashCdReduce || 0); }
    else if (s === 'crit') { player.critChance = Math.min(0.85, player.critChance + (b.critBonus || 0)); player.critMult += (b.critMultBonus || 0); }
    else if (s === 'element') { player.elemBoost = (player.elemBoost || 0) + (b.elemBoost || 0); }
    else if (s === 'support') { player.pickR += (b.pickBonus || 0); player.jadeBonus = (player.jadeBonus || 0) + (b.jadeBonus || 0); player.dropBonus = (player.dropBonus || 0) + (b.dropBonus || 0); }
    else if (s === 'thorns') { player.thorns = (player.thorns || 0) + Math.round(player.maxhp * (b.thornsRatio || 0)); player.maxhp += (b.hpBonus || 0); if (!safe) player.hp += (b.hpBonus || 0); }
    // 弹药子类型
    else if (s === 'pierce') { player.pierce += (b.pierceBonus || 0); }
    else if (s === 'spread_a') { player.pellets = Math.min(9, player.pellets + (b.pelletsBonus || 0)); player.spreadAngle = (player.spreadAngle || 0) + (b.spreadBonus || 0); }
    else if (s === 'explosive') { player.explode = Math.max(player.explode, b.explodeR); player.splashRatio = b.splashRatio; }
    else if (s === 'homing_a') { player.homing = true; player.homingTurnRate = b.turnRate; }
    else if (s === 'vampire') { player.lifesteal = (player.lifesteal || 0) + (b.lifestealBonus || 0); }
  }
  // 检测已装备的套装件数，应用套装效果
  function applySetBonuses(equippedArts) {
    var setCounts = {}; // setKey → count
    for (var i = 0; i < equippedArts.length; i++) {
      var a = equippedArts[i];
      if (a.setKey) { setCounts[a.setKey] = (setCounts[a.setKey] || 0) + 1; }
    }
    var activeSets = {};
    for (var sk in setCounts) {
      var setDef = SET_ITEMS[sk]; if (!setDef) continue;
      var cnt = setCounts[sk];
      var bonus = null;
      if (cnt >= 4 && setDef.bonus4) bonus = setDef.bonus4;
      else if (cnt >= 3 && setDef.bonus3) bonus = setDef.bonus3;
      else if (cnt >= 2 && setDef.bonus2) bonus = setDef.bonus2;
      if (bonus) {
        activeSets[sk] = { name: setDef.name, count: cnt, bonus: bonus };
        // 应用套装效果到 player
        if (bonus.markOnCrit) player.setMarkCrit = true;
        if (bonus.standStillDmgReduce) player.setStandStillReduce = bonus.standStillDmgReduce;
        if (bonus.standStillSlowAura) { player.setStandStillAura = bonus.standStillSlowAura; player.setStandStillSlow = bonus.standStillSlowFactor; player.setStandStillTime = bonus.standStillTime; }
        if (bonus.dashTrail) player.setDashTrail = true;
        if (bonus.dashProjectiles) player.setDashProj = bonus.dashProjectiles;
        if (bonus.dashIframeBonus) player.setDashIframeBonus = bonus.dashIframeBonus;
        if (bonus.elemReactionBonus) player.setElemBonus = (player.setElemBonus || 0) + bonus.elemReactionBonus;
        if (bonus.mergeGuaranteed2) player.setMergeGuaranteed2 = true;
        if (bonus.bondReqReduce) player.setBondReduce = bonus.bondReqReduce;
      }
    }
    return activeSets;
  }
  // 出击时把已装备法器 + 子类型 + 套装 + 研究院被动叠加到 player
  function applyEquipped() {
    var equippedArts = [];
    for (var si = 0; si < SLOTS.length; si++) {
      var id = meta.equipped[SLOTS[si]]; if (!id) continue;
      var art = null; for (var i = 0; i < meta.arsenal.length; i++) if (meta.arsenal[i].id === id) { art = meta.arsenal[i]; break; }
      if (art) { applyArtifactMods(art.mods); equippedArts.push(art); }
    }
    // 子类型基础属性（在词条之后叠加，确保倍率基于最终值）
    for (var j = 0; j < equippedArts.length; j++) { applySubtypeBonus(equippedArts[j]); }
    // 套装效果
    player.activeSets = applySetBonuses(equippedArts);
    // 传说武器被动检测
    player.legendaryPassive = null;
    for (var k = 0; k < equippedArts.length; k++) {
      if (equippedArts[k].isLegendaryWeapon && equippedArts[k].legendaryPassive) {
        player.legendaryPassive = equippedArts[k].legendaryPassive;
        break;
      }
    }
    // 研究/符文倍率统一走 player.atkMult，不再直接乘 player.dmg
    player.atkMult = 1;
    if (meta.research.dmg1) player.atkMult *= 1.1;
    if (meta.research.crit1) player.critChance = Math.min(0.85, player.critChance + 0.05);
    if (meta.research.hp1) { player.maxhp = Math.round(player.maxhp * 1.15); player.hp = player.maxhp; }
    if (meta.research.mag1) player.pickR += 36;
    if (meta.research.ext1) player.extractBonus = 0.15;
    // 研究院天梯（多级永久升级）
    var t = meta.tech || {};
    if (t.hp) { player.maxhp = Math.round(player.maxhp * (1 + 0.05 * t.hp)); player.hp = player.maxhp; }
    if (t.dmg) player.atkMult *= (1 + 0.05 * t.dmg);
    // flip: 翻相恢复加速（降低 CORE_REGEN 等效秒数）—— 在 update 中读取 meta.tech.flip
    // bag: 背包扩容 —— 在 pushToLoot 中读取 meta.tech.bag
  }
  // 结算：战利品按 outcome 比例入库为法器（研究院撤离研究可加成）
  // S2 修复：ext1「撤离多带出 15% 法器」仅成功/弃局生效；阵亡保底 15% 不被研究加成破坏（避免 0.15+0.15=0.30 翻倍锁死）
  function lootKeepRate(outcome) {
    var base = outcome === 'success' ? 1 : outcome === 'abandon' ? 0.3 : 0.15;
    return outcome === 'death' ? base : Math.min(1, base + (player.extractBonus || 0));
  }
  function bankLoot(outcome) {
    var keep = lootKeepRate(outcome);
    var kept = 0;
    for (var i = 0; i < run.loot.length; i++) {
      var it = run.loot[i];
      // 裂隙内所得：成功 100% 保留，失败（阵亡/弃局）按 50% 保底（呼应「搏命有底」）
      var kp = it.rift ? (outcome === 'success' ? 1 : 0.5) : keep;
      if (Math.random() > kp) continue;
      // Boss 遗物/传说武器使用固定词条，普通战利品随机词条
      if (it.relicMods) {
        var art = makeArtifact(it.slot || pickSlot(), it.rarity, it.name, it.relicMods);
        if (it.isLegendaryWeapon) { art.isLegendaryWeapon = true; art.legendaryPassive = it.legendaryPassive; if (it.subtype) { art.subtype = it.subtype; art.subBonus = SUBTYPE_PARAMS[it.subtype] || {}; } }
        meta.arsenal.push(art);
      } else {
        meta.arsenal.push(makeArtifact(it.slot || pickSlot(), it.rarity, it.name));
      }
      kept++;
    }
    run.loot.forEach(function (it) { meta.codex.loot[it.rarity] = (meta.codex.loot[it.rarity] || 0) + 1; });
    return kept;
  }
  var RESEARCH = [
    { key: 'dmg1', name: '锋锐研究', desc: '全伤害 +10%', cost: 450, reqTier: 1 },
    { key: 'crit1', name: '会心研究', desc: '暴击率 +5%', cost: 450, reqTier: 1 },
    { key: 'hp1', name: '体魄研究', desc: '最大HP +15%', cost: 550, reqTier: 1 },
    { key: 'mag1', name: '磁吸研究', desc: '拾取范围 +36', cost: 350, reqTier: 1 },
    { key: 'ext1', name: '撤离研究', desc: '撤离多带出 15% 法器', cost: 650, reqTier: 2 }
  ];
  // === 研究院天梯（多级永久升级 · 消耗灵玉+灵矿碎屑）===
  var TECH_TREE = [
    { key: 'hp', name: '天工机体', desc: '生命上限 +5%/级', max: 10, costJade: function (l) { return 200 + l * 120; }, costOre: function (l) { return 15 + l * 8; } },
    { key: 'dmg', name: '聚灵核心', desc: '主武器伤害 +5%/级', max: 10, costJade: function (l) { return 220 + l * 130; }, costOre: function (l) { return 18 + l * 9; } },
    { key: 'flip', name: '太极灵韵', desc: '翻相恢复 -0.3s/级', max: 5, costJade: function (l) { return 300 + l * 180; }, costOre: function (l) { return 25 + l * 12; } },
    { key: 'bag', name: '乾坤纳戒', desc: '局内背包 +1 格/级', max: 3, costJade: function (l) { return 400 + l * 250; }, costOre: function (l) { return 30 + l * 15; } }
  ];

  // === 局内动态悬赏（Dynamic Bounty）===
  var BOUNTY_TYPES = [
    { id: 'killElite', desc: '击破 {n} 处精英敌机', target: function () { return 2 + Math.floor(run.tier * 0.5); }, track: 'eliteKill' },
    { id: 'killEmber', desc: '余烬相击杀 {n} 名敌机', target: function () { return 6 + run.tier; }, track: 'emberKill' },
    { id: 'collectOre', desc: '搜集 {n} 个灵矿碎屑', target: function () { return 5 + run.tier * 2; }, track: 'orePickup' },
    { id: 'breakRift', desc: '以引力裂隙撕裂 {n} 名敌机', target: function () { return 3; }, track: 'riftTear' },
    { id: 'collectNodes', desc: '采集 {n} 个灵韵节点', target: function () { return 3 + run.tier; }, track: 'nodeCollect' }
  ];
  var bounty = null; // 当局悬赏对象 {type, desc, target, progress, completed}
  function generateBounty() {
    var bt = BOUNTY_TYPES[randi(0, BOUNTY_TYPES.length - 1)];
    var n = bt.target();
    bounty = { id: bt.id, desc: bt.desc.replace('{n}', n), target: n, progress: 0, completed: false, track: bt.track };
  }
  function bountyProgress(trackKey, amount) {
    if (!bounty || bounty.completed || bounty.track !== trackKey) return;
    bounty.progress = Math.min(bounty.target, bounty.progress + (amount || 1));
    if (bounty.progress >= bounty.target) completeBounty();
  }
  function completeBounty() {
    if (!bounty || bounty.completed) return;
    bounty.completed = true;
    // 奖励：天工宝箱（高品质法器掉落）+ 暴击/移速加成
    // C1 修复：裂隙内完成悬赏 → 宝箱直接入裂隙背包（离场自动并入 run.loot），灵玉/碎屑直接入账（裂隙地面 loot 离场会丢失）
    var dropRar = Math.random() < 0.3 ? 'purple' : 'blue';
    if (inRift) {
      if (budgetArtifact(dropRar)) pushToLoot(riftLoot, { rarity: dropRar, name: pickName(dropRar), slot: pickSlot(), rift: true }, player.x, player.y, run.loot.length);
      else { meta.currency += 50; floatText(player.x, player.y - 26, '+50 灵玉（预算耗尽折算）', '#C9A24B'); }
      meta.currency += 30 + run.tier * 10;
      floatText(player.x, player.y - 40, '+' + (30 + run.tier * 10) + ' 灵玉', '#C9A24B');
      var _oreAmt = Math.max(1, Math.round((3 + run.tier) * tierOreBonus(run.tier)));
      run.oreCollected = (run.oreCollected || 0) + _oreAmt;
      floatText(player.x, player.y - 54, '+' + _oreAmt + ' 灵矿碎屑（结算入账）', '#8FB0C8');
    } else {
      if (budgetArtifact(dropRar)) dropLoot(player.x + rand(-40, 40), player.y + rand(-40, 40), dropRar, 'artifact');
      else dropLoot(player.x, player.y, 'blue', 'jade', null, { amount: 50 });
      dropLoot(player.x, player.y, 'blue', 'jade', null, { amount: 30 + run.tier * 10 });
      dropOre(player.x, player.y, 3 + run.tier);
    }
    // 即时增益：暴击+8%、移速+15%，持续整局
    player.critChance = Math.min(0.85, player.critChance + 0.08);
    player.speed += 15;
    player.bountyBuff = true;
    burst(player.x, player.y, '#FFE9A8', 30, { ring: true, ringR: 80, r0: 10 });
    spawnRing(player.x, player.y, '#FFE9A8', 100);
    setBanner('★ 悬赏达成！天工宝箱 + 暴击/移速增益', 2.4);
    AudioSys.sfx.eliteDie();
    addShake(3, 200, 80);
  }

  // pellets: 基础弹片数; homing: 是否天生追踪; spread: 散射角
  var AIRCRAFT = {
    a: { id: 'a', name: '青隼', desc: '突击·直射', hp: 100, speed: 235, fireRate: 4.5, dmg: 11, bulletSpeed: 520, color: COL.player, unlockCost: 0, pellets: 1, homing: false, spread: 0 },
    b: { id: 'b', name: '玄龟', desc: '重装·散射', hp: 165, speed: 180, fireRate: 3.8, dmg: 13, bulletSpeed: 470, color: '#7EAD9A', unlockCost: 700, requireTier: 1, pellets: 3, homing: false, spread: 0.26 },
    c: { id: 'c', name: '赤鸾', desc: '游侠·高速追踪', hp: 72, speed: 275, fireRate: 6.5, dmg: 10, bulletSpeed: 600, color: '#D08A9A', unlockCost: 1600, requireTier: 2, pellets: 1, homing: true, spread: 0 }
  };
  var UPGRADES = [
    { key: 'hp', name: '生命强化', desc: '+22 最大HP/级', max: 6, cost: function (l) { return 210 * (l + 1); } },
    { key: 'dmg', name: '伤害强化', desc: '+3 伤害/级', max: 6, cost: function (l) { return 220 * (l + 1); } },
    { key: 'speed', name: '移速强化', desc: '+14 速度/级', max: 5, cost: function (l) { return 190 * (l + 1); } },
    { key: 'shield', name: '护盾强化', desc: '+14 护盾上限/级', max: 5, cost: function (l) { return 210 * (l + 1); } },
    { key: 'pickup', name: '拾取强化', desc: '+15% 拾取范围/级', max: 3, cost: function (l) { return 170 * (l + 1); } }
  ];
  // 机体剪影（SVG，基地机库大图卡用）
  var SHIP_SVG = {
    a: '<svg viewBox="0 0 110 60"><path d="M55 2 L104 52 L74 40 L55 58 L36 40 L6 52 Z" fill="currentColor" opacity="0.92"/><path d="M55 2 L74 40 L55 58 L36 40 Z" fill="#0A2E26" opacity="0.38"/></svg>',
    b: '<svg viewBox="0 0 110 60"><path d="M55 4 L102 42 Q55 60 8 42 Z" fill="currentColor" opacity="0.92"/><rect x="46" y="10" width="18" height="32" rx="5" fill="#0A2E26" opacity="0.38"/></svg>',
    c: '<svg viewBox="0 0 110 60"><path d="M55 2 L100 36 L86 48 L55 32 L24 48 L10 36 Z" fill="currentColor" opacity="0.92"/><path d="M55 2 L86 48 L55 32 L24 48 Z" fill="#0A2E26" opacity="0.38"/></svg>'
  };
  // 军械库槽位图标（SVG）
  var SLOT_SVG = {
    weapon: '<svg viewBox="0 0 20 20"><path d="M2 14 L10 6 L18 14 L14 18 L10 12 L6 18 Z" fill="' + SLOTCOL.weapon + '"/></svg>',
    armor: '<svg viewBox="0 0 20 20"><path d="M10 2 L17 5 V11 Q17 16 10 19 Q3 16 3 11 V5 Z" fill="' + SLOTCOL.armor + '"/></svg>',
    core: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="' + SLOTCOL.core + '"/><circle cx="10" cy="10" r="3" fill="#0A2E26" opacity="0.5"/></svg>',
    ammo: '<svg viewBox="0 0 20 20"><rect x="4" y="7" width="12" height="6" rx="3" fill="' + SLOTCOL.ammo + '"/><rect x="8" y="3" width="4" height="4" fill="' + SLOTCOL.ammo + '" opacity="0.6"/></svg>'
  };

  // ---------- 符文系统（5系 28 枚；替代原9种通用强化）----------
  // elem: 风/雷/水/火/土（八卦五行）；apply 直接改写 player 属性（带上限）
  var RUNES = [
    // 火（进攻/灼烧）
    { name: '烈焰符·火', elem: '火', desc: '伤害+22%', apply: function () { player.atkMult *= 1.22; } },
    { name: '爆裂符·火', elem: '火', desc: '子弹命中产生小爆炸', apply: function () { player.explode = 48; } },
    { name: '灼烧符·火', elem: '火', desc: '命中附加灼烧', apply: function () { player.burn = 9; } },
    { name: '焚天符·火', elem: '火', desc: '暴击率+18%', apply: function () { player.critChance = Math.min(0.7, player.critChance + 0.18); } },
    { name: '散射符·火', elem: '火', desc: '弹片+2', apply: function () { player.pellets = Math.min(9, player.pellets + 2); } },
    { name: '赤焰核·火', elem: '火', desc: '伤害+12%·弹速+12%', apply: function () { player.atkMult *= 1.12; player.bulletSpeed *= 1.12; } },
    // 水（控制/防御）
    { name: '玄冰符·水', elem: '水', desc: '护盾+45', apply: function () { player.maxshield += 45; player.shield = player.maxshield; } },
    { name: '回春符·水', elem: '水', desc: '护盾再生+6', apply: function () { player.regen += 6; } },
    { name: '反震符·水', elem: '水', desc: '受弹幕12%反弹', apply: function () { player.reflect = Math.min(0.6, player.reflect + 0.12); } },
    { name: '分流符·水', elem: '水', desc: '弹片+1', apply: function () { player.pellets = Math.min(9, player.pellets + 1); } },
    { name: '援护符·水', elem: '水', desc: '召唤自动炮台', apply: function () { player.drones = Math.min(4, player.drones + 1); } },
    { name: '玄甲符·水', elem: '水', desc: '护盾+30·再生+2', apply: function () { player.maxshield += 30; player.shield = player.maxshield; player.regen += 2; } },
    // 雷（速射/连锁）
    { name: '疾雷符·雷', elem: '雷', desc: '射速+25%', apply: function () { player.fireRate = Math.min(15, player.fireRate * 1.25); } },
    { name: '弹速符·雷', elem: '雷', desc: '弹速+30%', apply: function () { player.bulletSpeed *= 1.3; } },
    { name: '连锁符·雷', elem: '雷', desc: '命中连锁+1目标', apply: function () { player.chain = Math.min(5, player.chain + 1); } },
    { name: '贯日符·雷', elem: '雷', desc: '穿透+1', apply: function () { player.pierce = Math.min(9, player.pierce + 1); } },
    { name: '聚能符·雷', elem: '雷', desc: '暴击率+12%', apply: function () { player.critChance = Math.min(0.7, player.critChance + 0.12); } },
    // 风（机动/特效）
    { name: '追风符·风', elem: '风', desc: '移速+15%', apply: function () { player.speed = Math.min(620, player.speed * 1.15); } },
    { name: '御风符·风', elem: '风', desc: '子弹追踪', apply: function () { player.homing = true; } },
    { name: '时缓符·风', elem: '风', desc: '周围敌人减速', apply: function () { player.slowAuraR = 140; player.slowFactor = 0.6; } },
    { name: '幻影符·风', elem: '风', desc: '闪避率+15%', apply: function () { player.dodgeChance = Math.min(0.6, player.dodgeChance + 0.15); } },
    { name: '磁力符·风', elem: '风', desc: '战利品聚拢·靠近更易手动拾取', apply: function () { player.magnet = true; } },
    { name: '罡风符·风', elem: '风', desc: '移速+10%·闪避+10%', apply: function () { player.speed = Math.min(620, player.speed * 1.1); player.dodgeChance = Math.min(0.6, player.dodgeChance + 0.1); } },
    // 土（坤·防御/地脉）
    { name: '厚土符·土', elem: '土', desc: '最大HP+40', apply: function () { player.maxhp += 40; player.hp += 40; } },
    { name: '磐石符·土', elem: '土', desc: '护盾+35', apply: function () { player.maxshield += 35; player.shield = player.maxshield; } },
    { name: '裂地符·土', elem: '土', desc: '穿透+2', apply: function () { player.pierce = Math.min(9, player.pierce + 2); } },
    { name: '流沙符·土', elem: '土', desc: '弹片+2', apply: function () { player.pellets = Math.min(9, player.pellets + 2); } },
    { name: '灵壤符·土', elem: '土', desc: '暴击+10%·吸血4%', apply: function () { player.critChance = Math.min(0.7, player.critChance + 0.10); player.lifesteal = Math.min(0.4, player.lifesteal + 0.04); } }
  ];

  // ---------- 羁绊系统（金铲铲式：系别阶梯 + 交叉羁绊）----------
  // 每系按持有枚数解锁 2/3/4 阶，每层给该系专属、递增的质变效果；交叉羁绊需多系达标
  var BOND_TIERS = {
    '火': [
      { need: 1, key: 'fire1', name: '余烬', desc: '伤害 +5%', dmgMul: 1.05, apply: function () {} },
      { need: 2, key: 'fire2', name: '灼烧', desc: '命中附加灼烧', dmgMul: 1, apply: function () { if (!player.burn) player.burn = 9; } },
      { need: 3, key: 'fire3', name: '烈焰', desc: '伤害 +18%', dmgMul: 1.18, apply: function () {} },
      { need: 4, key: 'fire4', name: '焚尽', desc: '击杀引发范围爆炸', dmgMul: 1, apply: function () { player.killExplode = 64; } }
    ],
    '水': [
      { need: 1, key: 'water1', name: '涓流', desc: '伤害 +5%', dmgMul: 1.05, apply: function () {} },
      { need: 2, key: 'water2', name: '回春', desc: '护盾再生 +6', dmgMul: 1, apply: function () { player.regen += 6; } },
      { need: 3, key: 'water3', name: '反震', desc: '受弹 12% 反弹', dmgMul: 1, apply: function () { player.reflect = Math.min(0.6, player.reflect + 0.12); } },
      { need: 4, key: 'water4', name: '冰封', desc: '受击 25% 冻结敌人', dmgMul: 1, apply: function () { player.freezeChance = 0.25; } }
    ],
    '雷': [
      { need: 1, key: 'thun1', name: '微鸣', desc: '伤害 +5%', dmgMul: 1.05, apply: function () {} },
      { need: 2, key: 'thun2', name: '连锁', desc: '命中连锁 +1', dmgMul: 1, apply: function () { player.chain = Math.min(5, player.chain + 1); } },
      { need: 3, key: 'thun3', name: '疾雷', desc: '射速 +22%', dmgMul: 1, apply: function () { player.fireRate = Math.min(15, player.fireRate * 1.22); } },
      { need: 4, key: 'thun4', name: '天罚', desc: '每 6 秒一道全屏闪电', dmgMul: 1, apply: function () { player.skyStrike = 1; player.skyCd = 6; player.skyT = 6; } }
    ],
    '风': [
      { need: 1, key: 'wind1', name: '轻息', desc: '伤害 +5%', dmgMul: 1.05, apply: function () {} },
      { need: 2, key: 'wind2', name: '追风', desc: '移速 +12%', dmgMul: 1, apply: function () { player.speed = Math.min(620, player.speed * 1.12); } },
      { need: 3, key: 'wind3', name: '幻影', desc: '闪避 +15%', dmgMul: 1, apply: function () { player.dodgeChance = Math.min(0.6, player.dodgeChance + 0.15); } },
      { need: 4, key: 'wind4', name: '御风', desc: '脱战 2 秒进入极速', dmgMul: 1, apply: function () { player.gale = true; } }
    ],
    '土': [
      { need: 1, key: 'tu1', name: '尘', desc: '伤害 +5%', dmgMul: 1.05, apply: function () {} },
      { need: 2, key: 'tu2', name: '厚土', desc: '最大HP +30', dmgMul: 1, apply: function () { player.maxhp += 30; player.hp += 30; } },
      { need: 3, key: 'tu3', name: '息壤', desc: '护盾再生 +5', dmgMul: 1, apply: function () { player.regen += 5; } },
      { need: 4, key: 'tu4', name: '山岳', desc: '受击触发范围震击', dmgMul: 1, apply: function () { player.guardShock = 110; } }
    ]
  };
  var CROSS_BONDS = [
    { key: 'overload', need: { '火': 3, '雷': 3 }, name: '过载', desc: '暴击引发连锁闪电', apply: function () { player.overload = 1; } },
    { key: 'galefield', need: { '水': 3, '风': 3 }, name: '疾风领域', desc: '常驻减速光环', apply: function () { player.slowAuraR = Math.max(player.slowAuraR, 150); player.slowFactor = Math.min(player.slowFactor, 0.6); } },
    { key: 'undying', need: { '土': 4, '水': 2 }, name: '厚德', desc: '护盾清零回复 30% 血', apply: function () { player.undying = true; } }
  ];
  // 阶梯效果在解锁时一次性施加（elements 只增不减）；伤害乘子由 elemResonance 实时累乘
  function recalcBonds() {
    if (!player.bondTiers) player.bondTiers = {};
    for (var el in BOND_TIERS) {
      var cnt = player.elements[el] || 0, ladder = BOND_TIERS[el];
      for (var t = 0; t < ladder.length; t++) {
        var tier = ladder[t];
        if (cnt >= tier.need && !player.bondTiers[tier.key]) {
          player.bondTiers[tier.key] = true; tier.apply();
          if ((meta.bondBest[el] || 0) < tier.need) meta.bondBest[el] = tier.need;
          setBanner('羁绊·' + el + tier.need + '阶「' + tier.name + '」', 1.4);
          AudioSys.sfx.runePick();
        }
      }
    }
    for (var c = 0; c < CROSS_BONDS.length; c++) {
      var cb = CROSS_BONDS[c], ok = true;
      for (var k in cb.need) if ((player.elements[k] || 0) < cb.need[k]) ok = false;
      if (ok && !player.bondTiers[cb.key]) { player.bondTiers[cb.key] = true; cb.apply(); setBanner('交叉羁绊「' + cb.name + '」', 1.6); AudioSys.sfx.runePick(); }
    }
    // 流派觉醒（v10 构筑 payoff）：单局内某系首次满 4 阶 → 永久 +15% 攻击 + 绝技充满 + 回血 25%
    for (var elv in BOND_TIERS) {
      var topTier = BOND_TIERS[elv][BOND_TIERS[elv].length - 1];
      if ((player.elements[elv] || 0) >= topTier.need && player.bondTiers[topTier.key] && !player.evolved[elv]) {
        player.evolved[elv] = true;
        player.atkMult = (player.atkMult || 1) * (1 + EVOLVE_ATK);
        player.hp = Math.min(player.maxhp, player.hp + Math.round(player.maxhp * EVOLVE_HEAL));
        player.ultCharge = ULT_MAX;
        setBanner('★ ' + elv + '系流派觉醒！攻击 +15% · 绝技充满 · 回血 25%', 3.2, ELEMCOL[elv]);
        addFreeze(140); addShake(4, 240, 100); burst(player.x, player.y, ELEMCOL[elv], 30, { ring: true, ringR: 150 });
        AudioSys.sfx.levelUp && AudioSys.sfx.levelUp();
      }
    }
  }
  function elemResonance() {
    var m = 1;
    for (var el in BOND_TIERS) { var cnt = player.elements[el] || 0, ladder = BOND_TIERS[el]; for (var t = 0; t < ladder.length; t++) if (cnt >= ladder[t].need && player.bondTiers[ladder[t].key]) m *= ladder[t].dmgMul; }
    return m;
  }
  function bondSummary() {
    var arr = [];
    for (var el in BOND_TIERS) { var cnt = player.elements[el] || 0; if (cnt > 0) { var mx = 0; BOND_TIERS[el].forEach(function (t) { if (player.bondTiers[t.key]) mx = t.need; }); arr.push(el + cnt + (mx ? '(' + mx + '阶)' : '')); } }
    return arr;
  }

  // ---------- 元素反应（原神式：子弹带元素·敌人挂附着·异元素触发反应）----------
  // 与羁绊联动：反应伤害随两系羁绊阶数放大 —— 同时解决"羁绊等级不够"与"合成后攻击特效没变化"
  var AURA_DUR = 5;
  var vfxLines = [];           // 临时电弧/风线（世界坐标，render 内绘制）
  var reactHintShown = false;
  var REACTIONS = {
    '水+火': { name: '蒸发', col: '#EAF2FF', mul: 2.2, fx: 'vapor' },
    '火+雷': { name: '超载', col: '#E08A3C', mul: 1.5, fx: 'overload' },
    '水+雷': { name: '感电', col: '#6FC0FF', mul: 1.0, fx: 'electro' },
    '风+火': { name: '扩散', col: '#7FD1B6', mul: 0.9, fx: 'swirl' },
    '风+水': { name: '扩散', col: '#7FD1B6', mul: 0.9, fx: 'swirl' },
    '风+雷': { name: '扩散', col: '#7FD1B6', mul: 0.9, fx: 'swirl' },
    '风+土': { name: '扩散', col: '#7FD1B6', mul: 0.9, fx: 'swirl' },
    '火+土': { name: '焦土', col: '#C8743A', mul: 1.2, fx: 'magma' },
    '水+土': { name: '泥沼', col: '#7A6A4A', mul: 1.1, fx: 'mud' },
    '雷+土': { name: '引雷', col: '#C9A24A', mul: 1.6, fx: 'lodestone' }
  };
  function reactKey(a, b) { return [a, b].sort().join('+'); }
  function elemTier(el) { var mx = 0, L = BOND_TIERS[el]; if (L) L.forEach(function (t) { if (player.bondTiers[t.key]) mx = Math.max(mx, t.need); }); return mx; }
  function pickOwnedElem() { var arr = []; for (var e in player.elements) { var c = player.elements[e]; for (var i = 0; i < c; i++) arr.push(e); } return arr.length ? arr[randi(0, arr.length - 1)] : null; }
  function addVfxLine(x1, y1, x2, y2, col, life) { vfxLines.push({ x1: x1, y1: y1, x2: x2, y2: y2, col: col, life: life || 0.2, max: life || 0.2 }); }
  function nearestOther(e) { var best = null, bd = Infinity; for (var i = 0; i < enemies.length; i++) { var o = enemies[i]; if (o === e || o.wake > 0) continue; var d = dist2(e.x, e.y, o.x, o.y); if (d < bd) { bd = d; best = o; } } return best; }
  function enemyKnock(e, force) { var a = Math.atan2(e.y - player.y, e.x - player.x); e.knockx = Math.cos(a) * force; e.knocky = Math.sin(a) * force; e.knockT = 0.16; }
  // 处理一次命中：更新附着 / 触发反应（只扣血，死亡由 reapDead 统一回收，避免循环中 splice）
  function handleElement(en, atkElem, dmg0) {
    if (!atkElem) return;
    if (en.aura && en.aura !== atkElem) {
      var R = REACTIONS[reactKey(en.aura, atkElem)];
      if (R) {
        var rd = dmg0 * R.mul * (1 + 0.18 * (elemTier(en.aura) + elemTier(atkElem)));
        en.hp -= rd;
        triggerReactionFX(en, R, rd, en.aura, atkElem);
        en.aura = null; en.auraT = 0;
        return;
      }
      en.aura = atkElem; en.auraT = AURA_DUR;
    } else { en.aura = atkElem; en.auraT = AURA_DUR; }
  }
  function triggerReactionFX(en, R, rd, a, b) {
    burst(en.x, en.y, R.col, 14, { smin: 80, smax: 300, lmin: 0.25, lmax: 0.6, ring: true, ringR: 48 });
    spawnRing(en.x, en.y, R.col, 32);
    floatText(en.x, en.y - en.r - 18, R.name + '!', R.col, 'crit');
    addTint(R.col, 0.08);
    if (!reactHintShown) { reactHintShown = true; showTip('元素反应！不同元素命中已附着的敌人会触发 <b>' + R.name + '</b> 等强效（蒸发 / 感电 / 超载 / 扩散…）', 5.5); }
    if (R.fx === 'vapor') { addShake(2, 120, 80); enemyKnock(en, 220); }
    else if (R.fx === 'overload') { addShake(4, 200, 120); explodeAt(en.x, en.y, 80, rd * 0.7); enemyKnock(en, 260); }
    else if (R.fx === 'electro') { en.electroT = 2.6; en.electroCd = 0; en.electroDmg = rd * 0.35; addShake(2, 120, 90); }
    else if (R.fx === 'swirl') {
      addShake(1.5, 100, 70);
      var spreadEl = (a === '风') ? b : a;
      for (var i = 0; i < enemies.length; i++) { var o = enemies[i]; if (o !== en && dist2(o.x, o.y, en.x, en.y) < 150 * 150) { o.aura = spreadEl; o.auraT = AURA_DUR; o.hp -= rd * 0.6; o.flash = 0.08; o.hitT = 0.1; o.hitMag = 1.6; addVfxLine(en.x, en.y, o.x, o.y, R.col, 0.22); } }
    }
    else if (R.fx === 'magma') { en.burn = Math.max(en.burn || 0, rd * 0.6); en.burnT = 4.5; addShake(2, 140, 90); }
    else if (R.fx === 'mud') { en.drownT = Math.max(en.drownT || 0, 3); en.drownDps = Math.max(en.drownDps || 0, rd * 0.4); addShake(1.5, 100, 70); }
    else if (R.fx === 'lodestone') {
      en.electroT = Math.max(en.electroT || 0, 2.6); en.electroCd = 0; en.electroDmg = Math.max(en.electroDmg || 0, rd * 0.5); addShake(3, 160, 110);
      var lo = nearestOther(en); if (lo) { lo.hp -= rd * 0.5; lo.flash = 0.08; lo.hitT = 0.1; lo.hitMag = 1.8; addVfxLine(en.x, en.y, lo.x, lo.y, R.col, 0.24); }
    }
  }
  function reapDead() {
    for (var i = enemies.length - 1; i >= 0; i--) { var e = enemies[i]; if (e.hp <= 0 && !e.dead) onEnemyDeath(e); }
  }

  // ---------- 命名池（4槽位 × 5稀有度 = 105个独立名字，后缀暗示子类型）----------
  var SLOT_NAMES = {
    weapon: {
      white:  ['锈铁刃', '残羽刺', '符纸弩', '骨渣铳', '锈铁散珠', '残羽弧'],
      green:  ['青羽刃', '铜符弩', '石胆散珠', '露珠弧', '藤条刺', '铜符铳'],
      blue:   ['玄铁刃', '雷纹弩', '风铃散珠', '玉髓裂', '玄铁弧', '水精铳'],
      purple: ['梼杌裂刃', '赤焰核弩', '幽蓝晶散珠', '摄魂珠弧', '梼杌链刺', '赤焰核铳'],
      orange: ['穷奇牙刃', '烛龙睛弩', '九婴泪散珠', '太初灵玉裂', '穷奇牙链弧', '烛龙睛铳']
    },
    armor: {
      white:  ['兽皮甲', '残羽袍', '锈铁盾', '骨渣环', '符纸璧'],
      green:  ['藤甲', '青羽袍', '铜符盾', '露珠环', '石胆璧'],
      blue:   ['玄铁甲', '风铃袍', '水精盾', '雷纹环', '玉髓璧'],
      purple: ['梼杌鳞甲', '幽蓝晶袍', '摄魂珠盾', '赤焰核环', '梼杌鳞璧'],
      orange: ['穷奇牙铠', '烛龙睛袍', '九婴泪盾', '太初灵玉环', '穷奇牙璧']
    },
    core: {
      white:  ['锈铁核', '残羽睛', '符纸灵', '兽牙玉', '石胆刺'],
      green:  ['铜符核', '青羽睛', '露珠灵', '藤甲玉', '石胆甲'],
      blue:   ['雷纹核', '风铃睛', '水精灵', '玉髓玉', '玄铁刺'],
      purple: ['赤焰核·离火', '幽蓝晶·坎水', '摄魂珠·震雷', '梼杌鳞·巽风', '梼杌鳞·坤土'],
      orange: ['太初灵玉核', '烛龙睛·暴', '穷奇牙灵·离火', '九婴泪玉', '穷奇牙刺']
    },
    ammo: {
      white:  ['锈铁矢', '骨渣散珠', '符纸弹', '残羽追', '兽牙噬丸'],
      green:  ['铜符矢', '青羽散珠', '露珠弹', '藤条追', '石胆噬丸'],
      blue:   ['玄铁矢', '雷纹散珠', '水精弹', '风铃追', '玉髓噬丸'],
      purple: ['梼杌鳞穿甲矢', '赤焰核散珠', '幽蓝晶裂弹', '摄魂珠追', '梼杌鳞噬丸'],
      orange: ['穷奇牙穿甲矢', '烛龙睛散珠', '九婴泪裂弹', '太初灵玉追', '穷奇牙噬丸']
    }
  };
  // 旧 API 兼容：按稀有度从全槽位池中随机取名
  var LOOT_NAMES = {};
  ['white','green','blue','purple','orange'].forEach(function(r){
    LOOT_NAMES[r] = []; SLOTS.forEach(function(sl){ (SLOT_NAMES[sl][r]||[]).forEach(function(n){ LOOT_NAMES[r].push(n); }); });
  });

  // ---------- 子类型系统（后缀→子类型映射）----------
  var SUBTYPE_SUFFIX = {
    // 武器：刃/刺=弹道, 散珠/散射=扩散, 追/驭=追踪, 裂/爆=范围, 链/弧=链锁
    '刃': 'ballistic', '刺': 'ballistic',
    '散珠': 'spread', '散射': 'spread',
    '追': 'homing', '驭': 'homing',
    '裂': 'splash', '爆': 'splash',
    '链': 'chain', '弧': 'chain',
    // 护甲：甲/铠=重甲, 袍/衣=轻甲, 璧/符=回复, 盾/环=护盾
    '甲': 'heavy', '铠': 'heavy',
    '袍': 'light', '衣': 'light',
    '璧': 'regen', '符': 'regen',
    '盾': 'shield', '环': 'shield',
    // 核心：核/引擎=机动, 睛/眼=暴击, 灵/魄=元素, 玉/珠=辅助, 刺=反伤
    '核': 'mobility', '引擎': 'mobility',
    '睛': 'crit', '眼': 'crit',
    '灵': 'element', '魄': 'element',
    '玉': 'support', '珠': 'support',
    // 弹药：矢/镝=穿甲, 散=散弹, 裂/爆=爆裂, 追=追踪, 噬/血=吸血
    '矢': 'pierce', '镝': 'pierce',
    '弹': 'explosive',
    '噬丸': 'vampire', '血': 'vampire'
  };
  var SUBTYPE_NAME = {
    ballistic:'弹道', spread:'扩散', homing:'追踪', splash:'范围', chain:'链锁',
    heavy:'重甲', light:'轻甲', regen:'回复', shield:'护盾',
    mobility:'机动', crit:'暴击', element:'元素', support:'辅助', thorns:'反伤',
    pierce:'穿甲', spread_a:'散弹', explosive:'爆裂', homing_a:'追踪', vampire:'吸血'
  };
  // 子类型基础参数（makeArtifact 时写入 artifact.subtype + artifact.subBonus）
  var SUBTYPE_PARAMS = {
    // 武器
    ballistic: { dmgMult: 1.5, bulletSpeedMult: 1.2 },
    spread:    { pellets: 3, spreadAngle: 0.35, falloff: 0.5 },
    homing:    { turnRate: 4, dmgMult: 0.7 },
    splash:    { explodeR: 60, splashRatio: 0.6 },
    chain:     { chainJump: 3, chainDecay: 0.3, chainRange: 140 },
    // 护甲
    heavy:     { hpMult: 1.5, speedPenalty: 0.1 },
    light:     { dodgeBonus: 0.15, hpMult: 0.8 },
    regen:     { regenMult: 2.0, hpMult: 1.0 },
    shield:    { shieldMult: 2.0, breakIframe: 0.5, hpMult: 0.7 },
    // 核心
    mobility:  { speedBonus: 15, dashCdReduce: 0.2 },
    crit:      { critBonus: 0.08, critMultBonus: 0.5 },
    element:   { elemBoost: 0.3 },
    support:   { pickBonus: 20, jadeBonus: 0.08, dropBonus: 0.03 },
    thorns:    { thornsRatio: 0.12, hpBonus: 30 },
    // 弹药
    pierce:    { pierceBonus: 2 },
    spread_a:  { pelletsBonus: 2, spreadBonus: 0.1 },
    explosive: { explodeR: 50, splashRatio: 0.5 },
    homing_a:  { turnRate: 3 },
    vampire:   { lifestealBonus: 0.05 }
  };
  function detectSubtype(name, slot) {
    // 按后缀长度倒序匹配（先匹配2字后缀如"散珠"，再匹配1字后缀如"刃"）
    var keys = Object.keys(SUBTYPE_SUFFIX).sort(function(a,b){ return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      if (name.endsWith(keys[i])) {
        var st = SUBTYPE_SUFFIX[keys[i]];
        // 弹药"散珠"→spread_a, "追"→homing_a（和武器同名但不同参数）
        if (slot === 'ammo' && st === 'spread') st = 'spread_a';
        if (slot === 'ammo' && st === 'homing') st = 'homing_a';
        return st;
      }
    }
    return null;
  }

  // ---------- 套装定义（4套，机制质变）----------
  var SET_ITEMS = {
    shanhai_hunter: {
      name: '山海猎兽人', slots: ['weapon', 'ammo'], rarity: 'orange',
      pieces: { weapon: '穷奇牙刃', ammo: '穷奇牙穿甲矢' },
      bonus2: { markOnCrit: true, markDmgBonus: 0.25, markDuration: 5, markChain: true }
    },
    xuangui_sea: {
      name: '玄龟镇海', slots: ['armor', 'core', 'ammo'], rarity: 'purple',
      pieces: { armor: '梼杌鳞甲', core: '梼杌鳞·坤土', ammo: '梼杌鳞噬丸' },
      bonus2: { standStillDmgReduce: 0.10, standStillThorns: 0.5 },
      bonus3: { standStillDmgReduce: 0.20, standStillThornsMult: 2.0, standStillSlowAura: 120, standStillSlowFactor: 0.3, standStillTime: 1.5 }
    },
    windthunder: {
      name: '风雷双行', slots: ['weapon', 'core'], rarity: 'orange',
      pieces: { weapon: '烛龙睛弩', core: '雷纹核' },
      bonus2: { dashTrail: true, dashTrailDmg: 0.3, dashTrailDuration: 2, dashProjectiles: 3, dashProjDmg: 0.5, dashIframeBonus: 0.1 }
    },
    taichu: {
      name: '太初灵蕴', slots: ['weapon', 'armor', 'core', 'ammo'], rarity: 'orange',
      pieces: { weapon: '太初灵玉裂', armor: '太初灵玉环', core: '太初灵玉核', ammo: '太初灵玉追' },
      bonus2: { elemReactionBonus: 0.2 },
      bonus3: { elemReactionBonus: 0.35, mergeExtraAffix: true },
      bonus4: { elemReactionBonus: 0.5, bondReqReduce: 1, mergeGuaranteed2: true }
    }
  };
  // 快速查找：装备名 → 所属套装key
  var NAME_TO_SET = {};
  Object.keys(SET_ITEMS).forEach(function(sk){
    var s = SET_ITEMS[sk];
    Object.keys(s.pieces).forEach(function(slot){ NAME_TO_SET[s.pieces[slot]] = sk; });
  });

  // ---------- 独立传说武器（3件，独特被动）----------
  var LEGENDARY_WEAPONS = {
    '烛龙睛·天罚铳': {
      slot: 'weapon', subtype: 'chain', rarity: 'orange',
      mods: { dmg: 8, critChance: 0.12, chain: 3 },
      passive: 'zhulong_wrath', // 每6秒全屏闪电×1.2
      passiveDesc: '烛龙昼眠：每6秒蓄满一次烛龙之怒，下次攻击释放全屏闪电'
    },
    '九婴泪·万毒散珠': {
      slot: 'weapon', subtype: 'spread', rarity: 'orange',
      mods: { pellets: 2, dmg: 5, lifesteal: 0.05 },
      passive: 'jiuying_poison', // 命中施加毒：3秒每秒2%最大HP真伤，可叠3层，毒杀传染
      passiveDesc: '九婴之毒：弹丸命中施加九婴毒，每秒2%最大HP真伤，可叠3层，毒杀传染'
    },
    '梼杌鳞·不灭璧': {
      slot: 'armor', subtype: 'heavy', rarity: 'orange',
      mods: { maxhp: 60, thorns: 6 },
      passive: 'taowu_immortal', // HP<30%时每秒回5%最大HP至50%，每局1次
      passiveDesc: '梼杌不灭：HP低于30%时每秒回复5%最大HP至50%，每局1次'
    }
  };
  // Boss → 首杀掉落传说武器
  var BOSS_LEGENDARY = {
    taowu: '梼杌鳞·不灭璧',
    qiongqi: '九婴泪·万毒散珠',
    taotie: '饕餮炉·吞天炮',
    hundun: '混沌瞳·终焉眼'
  };

  // ---------- Boss 专属遗物（保底掉1件，强力独有词条）----------
  var BOSS_RELICS = {
    taowu: [
      { name: '梼杌封印·磐石', slot: 'armor', rarity: 'orange', mods: { maxhp: 45, maxshield: 30, regen: 4.0, thorns: 12 } },
      { name: '梼杌封印·地裂', slot: 'weapon', rarity: 'orange', mods: { dmg: 9, fireRate: 1.8, explode: 60, bulletSpeed: 60 } },
      { name: '梼杌封印·铁壁', slot: 'core', rarity: 'orange', mods: { speed: 20, dodgeChance: 0.08, maxhp: 30, shieldRegen: 3.0 } }
    ],
    qiongqi: [
      { name: '穷奇掠食·噬血', slot: 'weapon', rarity: 'orange', mods: { dmg: 12, lifesteal: 0.15, critChance: 0.12, fireRate: 2.2 } },
      { name: '穷奇掠食·疾风', slot: 'core', rarity: 'orange', mods: { speed: 35, dodgeChance: 0.12, pierce: 2, chain: 2 } },
      { name: '穷奇掠食·暴掠', slot: 'ammo', rarity: 'orange', mods: { pellets: 2, explode: 50, homing: 1, bulletSpeed: 80 } }
    ],
    taotie: [
      { name: '饕餮熔炉·噬弹', slot: 'weapon', rarity: 'orange', mods: { dmg: 14, explode: 70, fireRate: 1.6, pierce: 2 } },
      { name: '饕餮熔炉·烬甲', slot: 'armor', rarity: 'orange', mods: { maxhp: 40, thorns: 18, regen: 3.5, burn: 8 } },
      { name: '饕餮熔炉·吞核', slot: 'core', rarity: 'orange', mods: { maxhp: 25, shieldRegen: 4.0, lifesteal: 0.10, dmg: 6 } }
    ],
    hundun: [
      { name: '混沌终焉·螺旋', slot: 'weapon', rarity: 'orange', mods: { dmg: 10, fireRate: 2.6, bulletSpeed: 100, chain: 3 } },
      { name: '混沌终焉·虚空', slot: 'core', rarity: 'orange', mods: { dodgeChance: 0.15, speed: 25, critChance: 0.10, homing: 1 } },
      { name: '混沌终焉·甲胄', slot: 'armor', rarity: 'orange', mods: { maxshield: 40, shieldRegen: 5.0, maxhp: 20, speed: 15 } }
    ]
  };

  // ---------- 词缀池（rollMods 从中按稀有度抽取 N 条，数值随机）----------
  // 每条: { key, mod, min, max, fmt, label }
  // min/max 按 rarity 缩放系数 s
  var AFFIX_POOL = {
    weapon: [
      { mod: 'dmg',        min: 2,   max: 5,   label: '伤害' },
      { mod: 'fireRate',   min: 0.3, max: 0.9, label: '射速' },
      { mod: 'critChance', min: 0.02,max: 0.08,label: '暴击' },
      { mod: 'bulletSpeed',min: 20,  max: 50,  label: '弹速' },
      { mod: 'lifesteal',  min: 0.03,max: 0.12,label: '吸血' },
      { mod: 'pierce',     min: 1,   max: 2,   label: '穿透' },
      { mod: 'burn',       min: 4,   max: 10,  label: '灼烧' },
      { mod: 'chain',      min: 1,   max: 2,   label: '连锁' },
      { mod: 'explode',    min: 20,  max: 50,  label: '爆裂' }
    ],
    armor: [
      { mod: 'maxhp',      min: 8,   max: 25,  label: 'HP' },
      { mod: 'maxshield',  min: 6,   max: 18,  label: '护盾' },
      { mod: 'regen',      min: 0.8, max: 2.5, label: '回盾' },
      { mod: 'dodgeChance',min: 0.02,max: 0.07,label: '闪避' },
      { mod: 'thorns',     min: 4,   max: 12,  label: '反伤' },
      { mod: 'shieldRegen',min: 1.0, max: 3.0, label: '护盾恢复' },
      { mod: 'speed',      min: 5,   max: 14,  label: '移速' }
    ],
    core: [
      { mod: 'speed',      min: 6,   max: 18,  label: '移速' },
      { mod: 'dodgeChance',min: 0.02,max: 0.07,label: '闪避' },
      { mod: 'pierce',     min: 1,   max: 2,   label: '穿透' },
      { mod: 'burn',       min: 4,   max: 10,  label: '灼烧' },
      { mod: 'chain',      min: 1,   max: 2,   label: '连锁' },
      { mod: 'homing',     min: 1,   max: 1,   label: '追踪' },
      { mod: 'maxhp',      min: 6,   max: 18,  label: 'HP' },
      { mod: 'critChance', min: 0.02,max: 0.06,label: '暴击' }
    ],
    ammo: [
      { mod: 'pellets',    min: 1,   max: 2,   label: '弹片' },
      { mod: 'pierce',     min: 1,   max: 2,   label: '穿透' },
      { mod: 'explode',    min: 25,  max: 55,  label: '爆裂' },
      { mod: 'homing',     min: 1,   max: 1,   label: '追踪' },
      { mod: 'burn',       min: 4,   max: 10,  label: '灼烧' },
      { mod: 'chain',      min: 1,   max: 2,   label: '连锁' },
      { mod: 'bulletSpeed',min: 20,  max: 50,  label: '弹速' },
      { mod: 'lifesteal',  min: 0.03,max: 0.08,label: '吸血' }
    ]
  };
  // 每个稀有度抽几条词缀
  var AFFIX_COUNT = { white: 1, green: 2, blue: 2, purple: 3, orange: 4 };
  // 稀有度缩放系数
  var AFFIX_SCALE = [0.4, 0.7, 1.0, 1.4, 1.9];
  // 前缀池（按主属性选前缀，让物品有"性格"）
  var PREFIX_BY_MOD = {
    dmg: '狂暴', fireRate: '迅捷', critChance: '致命', bulletSpeed: '疾射',
    lifesteal: '噬血', pierce: '贯穿', burn: '焚天', chain: '雷链',
    explode: '裂地', maxhp: '磐石', maxshield: '铁壁', regen: '回春',
    dodgeChance: '幻影', thorns: '荆棘', shieldRegen: '复苏', speed: '疾风',
    homing: '追魂', pellets: '散射'
  };

  // ---------- 丹药（消耗品）----------
  var CONSUMABLES = {
    bomb:  { key: 'bomb', name: '震爆弹', glyph: '炸', desc: '清屏弹幕+全场伤害' },
    shield:{ key: 'shield', name: '玄冰盾', glyph: '盾', desc: '护盾全满+无敌' },
    heal:  { key: 'heal', name: '回元丹', glyph: '丹', desc: '回复40%生命' },
    slow:  { key: 'slow', name: '凝时符', glyph: '时', desc: '敌人减速3秒' }
  };

  // ---------- 美术资产（ChatGPT 生成 neon-shanhai-cel-shaded，透明 PNG）----------
  // 来源：Documents/ChatGPT/打打飞机/.../prototype/assets/（v1 玩法精灵 + v2 UI 图标）
  // 加载失败/未就绪时自动回退到下方原有几何绘制（资产 README 既定方案）。
  var QING_ATK_FPS = 16;
  var QING_ATK_DUR = 8 / QING_ATK_FPS; // 青隼攻击动画一轮时长，第3帧左、第6帧右开火
  var CHI_ATK_FPS = 14;
  var CHI_ATK_DUR = 8 / CHI_ATK_FPS; // 赤鸾攻击动画一轮，第4帧发射追踪羽矛
  var IMG = {};
  // ---------- 异步图片预加载管理器（AssetManager）----------
  // 保留 loadImg(key,path) 签名不变（约 80 处调用点不动）；内部统一走 AssetManager.load：
  // onload/onerror 均推进就绪计数（坏图也计数，避免卡死）；isReady() 兜底扫描 im.complete（缓存命中）。
  var AssetManager = {
    total: 0, loaded: 0, done: false,
    _imgs: [],
    load: function (key, path) {
      this.total++;
      var im = new Image();
      IMG[key] = im;
      var self = this;
      var mark = function () { self.loaded++; if (self.loaded >= self.total) self.done = true; };
      // 桩安全路径：Node 桩的 Image 无 complete 属性（无真实解码），同步计为就绪，避免加载门永久 pending
      if (!('complete' in im)) { mark(); return im; }
      this._imgs.push(im);
      im.onload = mark;
      im.onerror = mark; // 坏图也计数（避免坏图永久卡死加载门）
      im.src = path;
      return im;
    },
    isReady: function () {
      if (this.done || this.total === 0) return true;
      // 全部 im.complete（缓存命中时 onload 可能不再触发，同步兜底）
      var all = true;
      for (var i = 0; i < this._imgs.length; i++) {
        var im = this._imgs[i];
        if (!im || !im.complete) { all = false; break; }
      }
      if (all) { this.done = true; return true; }
      return false;
    },
    waitForAll: function (cb) {
      if (this.isReady()) { if (cb) cb(); return; }
      var t0 = performance.now();
      var self = this;
      var poll = function () {
        if (self.isReady()) { if (cb) cb(); return; }
        if (performance.now() - t0 > 3000) { self.done = true; if (cb) cb(); return; } // 3s 超时兜底：坏图也放行
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }
  };
  function loadImg(key, path) { return AssetManager.load(key, path); }
  // ---------- HTML UI 资产预加载器（双轨：canvas 资产 + html 资产）----------
  // 基地（机库/军械库/熔炼台/研究院/图鉴）的图片均为 HTML <img>/CSS background-image，
  // 不在 Canvas AssetManager 管理内。此预加载器收集动态生成的 img 引用路径并用
  // new Image() 预热浏览器缓存：首次刷新进基地不再闪空白/破图（Boss 反馈修复）。
  // 桩安全：Node 桩的 Image 无 complete 属性 → 同步计满（不阻塞启动加载门）。
  var STATIC_HTML_UI_ASSETS = [
    // —— index.html 静态引用（2026-08-19 grep 提取，保留 ?v= 版本串以命中同一缓存键）——
    'assets/icons/rarity_badges.png',
    'assets/v3/ui/cropped/btn_primary_disabled.png', 'assets/v3/ui/cropped/btn_primary_hover.png', 'assets/v3/ui/cropped/btn_primary_normal.png', 'assets/v3/ui/cropped/btn_primary_pressed.png',
    'assets/v3/ui/cropped/btn_secondary_disabled.png', 'assets/v3/ui/cropped/btn_secondary_hover.png', 'assets/v3/ui/cropped/btn_secondary_normal.png', 'assets/v3/ui/cropped/btn_secondary_pressed.png',
    'assets/v3/ui/cropped/btn_utility_disabled.png', 'assets/v3/ui/cropped/btn_utility_hover.png', 'assets/v3/ui/cropped/btn_utility_normal.png', 'assets/v3/ui/cropped/btn_utility_pressed.png',
    'assets/v3/ui/cropped/icon_00.png', 'assets/v3/ui/cropped/icon_01.png', 'assets/v3/ui/cropped/icon_02.png', 'assets/v3/ui/cropped/icon_03.png',
    'assets/v3/ui/cropped/icon_10.png', 'assets/v3/ui/cropped/icon_11.png', 'assets/v3/ui/cropped/icon_12.png', 'assets/v3/ui/cropped/icon_13.png',
    'assets/v3/ui/cropped/icon_20.png', 'assets/v3/ui/cropped/icon_21.png', 'assets/v3/ui/cropped/icon_22.png', 'assets/v3/ui/cropped/icon_23.png',
    'assets/v3/ui/cropped/icon_30.png', 'assets/v3/ui/cropped/icon_31.png', 'assets/v3/ui/cropped/icon_32.png', 'assets/v3/ui/cropped/icon_33.png',
    'assets/v3/ui/cropped/rarity_common_corner.png', 'assets/v3/ui/cropped/rarity_common_ring.png',
    'assets/v3/ui/cropped/rarity_epic_corner.png', 'assets/v3/ui/cropped/rarity_epic_ring.png',
    'assets/v3/ui/cropped/rarity_legendary_corner.png', 'assets/v3/ui/cropped/rarity_legendary_ring.png',
    'assets/v3/ui/cropped/rarity_rare_corner.png', 'assets/v3/ui/cropped/rarity_rare_ring.png',
    'assets/v3/ui/cropped/rarity_uncommon_corner.png', 'assets/v3/ui/cropped/rarity_uncommon_ring.png',
    'assets/v3/ui/cropped/slot_ammo_hover.png', 'assets/v3/ui/cropped/slot_ammo_normal.png', 'assets/v3/ui/cropped/slot_ammo_selected.png',
    'assets/v3/ui/cropped/slot_armor_hover.png', 'assets/v3/ui/cropped/slot_armor_normal.png', 'assets/v3/ui/cropped/slot_armor_selected.png',
    'assets/v3/ui/cropped/slot_core_hover.png', 'assets/v3/ui/cropped/slot_core_normal.png', 'assets/v3/ui/cropped/slot_core_selected.png',
    'assets/v3/ui/cropped/slot_weapon_hover.png', 'assets/v3/ui/cropped/slot_weapon_normal.png', 'assets/v3/ui/cropped/slot_weapon_selected.png',
    'assets/v3/ui/cropped/tab_arsenal_disabled.png', 'assets/v3/ui/cropped/tab_arsenal_hover.png', 'assets/v3/ui/cropped/tab_arsenal_normal.png', 'assets/v3/ui/cropped/tab_arsenal_selected.png',
    'assets/v3/ui/cropped/tab_codex_disabled.png', 'assets/v3/ui/cropped/tab_codex_hover.png', 'assets/v3/ui/cropped/tab_codex_normal.png', 'assets/v3/ui/cropped/tab_codex_selected.png',
    'assets/v3/ui/cropped/tab_forge_disabled.png', 'assets/v3/ui/cropped/tab_forge_hover.png', 'assets/v3/ui/cropped/tab_forge_normal.png', 'assets/v3/ui/cropped/tab_forge_selected.png',
    'assets/v3/ui/cropped/tab_hangar_disabled.png', 'assets/v3/ui/cropped/tab_hangar_hover.png', 'assets/v3/ui/cropped/tab_hangar_normal.png', 'assets/v3/ui/cropped/tab_hangar_selected.png',
    'assets/v3/ui/cropped/tab_lab_disabled.png', 'assets/v3/ui/cropped/tab_lab_hover.png', 'assets/v3/ui/cropped/tab_lab_normal.png', 'assets/v3/ui/cropped/tab_lab_selected.png',
    'assets/v3/ui/special/ui_base_frame.png?v=1019b', 'assets/v3/ui/special/ui_base_frame.png?v=1019c',
    'assets/v3/ui/special/ui_codex_book.png?v=1019b', 'assets/v3/ui/special/ui_forge_table.png', 'assets/v3/ui/special/ui_lab_scroll.png?v=1019b',
    'assets/v4/ui/buttons/btn_sheet.png?v=1018a', 'assets/v4/ui/rarity/rarity_trim_sheet.png'
  ];
  function collectHtmlUiAssets() {
    var set = {}, out = [];
    function add(p) { if (!p || set[p]) return; set[p] = 1; out.push(p); }
    // (a) index.html 静态清单（含 ?v= 版本串）
    STATIC_HTML_UI_ASSETS.forEach(add);
    // (b) 机库槽位背景 4 槽 × normal/selected（hover 态已含于静态清单）
    ['weapon', 'armor', 'core', 'ammo'].forEach(function (s) {
      ['normal', 'selected'].forEach(function (st) { add('assets/v3/ui/cropped/slot_' + s + '_' + st + '.png'); });
    });
    // (c) 机库机体立绘（?v=5 与 renderHangarAircraft 渲染串一致）
    ['acft_qingfalcon', 'acft_xuanwu', 'acft_chilan'].forEach(function (p) { add('assets/v3/ui/portrait/' + p + '.png?v=5'); });
    // (d) 武器图标 5 品质(行) × 3 列（weaponIconHtml 的 r/c 命名）
    for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) add('assets/v4/weapons/weapon_r' + r + '_c' + c + '.png');
    // (e) 装备图标 3 槽 × 5 品质（gearIconHtml 的 slot_rarity 命名；weapon 槽走 weaponIconHtml 用 weapon_r*c*.png，gear_weapon_* 不存在故排除）
    ['armor', 'core', 'ammo'].forEach(function (s) {
      ['white', 'green', 'blue', 'purple', 'orange'].forEach(function (q) { add('assets/v4/gear/gear_' + s + '_' + q + '.png'); });
    });
    // (f) 研究院/图鉴/商店图标全集 + 兜底 icon_32（RES_ICONS/TECH_ICONS/CODEX_CATS/ICON）
    ['icon_00', 'icon_01', 'icon_02', 'icon_03', 'icon_10', 'icon_11', 'icon_12', 'icon_13', 'icon_20', 'icon_21', 'icon_22', 'icon_23', 'icon_30', 'icon_31', 'icon_32', 'icon_33'].forEach(function (ic) { add('assets/v3/ui/cropped/' + ic + '.png'); });
    // (g) 商店卡背景（renderBase 动态使用 card_shop_*）
    ['card_shop_normal', 'card_shop_locked', 'card_shop_selected'].forEach(function (p) { add('assets/v3/ui/cropped/' + p + '.png'); });
    // (h) 运行时补充（空守卫，桩环境 querySelectorAll 返回 [] 不抛错）：
    //    DOM 中已存在的 assets <img>（取原始属性值，避免浏览器把 src 解析成绝对路径）
    try {
      var imgs = document.querySelectorAll ? document.querySelectorAll('img[src^="assets/"]') : [];
      for (var i = 0; i < (imgs && imgs.length || 0); i++) {
        var s0 = imgs[i] && imgs[i].getAttribute ? imgs[i].getAttribute('src') : null;
        if (!s0 && imgs[i]) s0 = imgs[i].src;
        if (s0) add(s0);
      }
    } catch (e) {}
    //    样式表 url(assets/...)（跨域/未就绪时 cssRules 不可读 → 跳过；容错解析相对或绝对 URL）
    try {
      if (document.styleSheets) {
        for (var si = 0; si < document.styleSheets.length; si++) {
          var rules = [];
          try { rules = document.styleSheets[si].cssRules || document.styleSheets[si].rules || []; } catch (e2) { rules = []; }
          for (var ri = 0; ri < rules.length; ri++) {
            var txt = rules[ri] && rules[ri].cssText;
            if (!txt) continue;
            var mrx = /url\((['"]?)([^)'"]+\.(?:png|jpg|webp)(?:\?[^)'"]*)?)\1\)/g, mm;
            while ((mm = mrx.exec(txt)) !== null) {
              var u = mm[2], qi = u.indexOf('assets/');
              if (qi < 0) continue;
              var rel = u.slice(qi), qm = u.match(/\?[^)'"]*$/);
              if (qm) rel = u.slice(qi, u.indexOf('?', qi)) + qm[0];
              add(rel);
            }
          }
        }
      }
    } catch (e3) {}
    return out;
  }
  var HtmlAssets = {
    total: 0, loaded: 0, done: false,
    paths: [], _imgs: [],
    preload: function () {
      var self = this;
      this.paths = collectHtmlUiAssets();
      this.total = this.paths.length;
      for (var i = 0; i < this.paths.length; i++) {
        (function (p) {
          var im = new Image();
          var mark = function () { self.loaded++; if (self.loaded >= self.total) self.done = true; };
          // 桩安全路径：Node 桩的 Image 无 complete 属性（无真实解码）→ 同步计满，避免加载门永久 pending
          if (!('complete' in im)) { mark(); return; }
          self._imgs.push(im);
          im.onload = mark;
          im.onerror = mark; // 坏图/404 也计数（避免坏图永久卡死加载门）
          im.src = p;
        })(this.paths[i]);
      }
    },
    isReady: function () {
      if (this.done || this.total === 0) return true;
      var all = true;
      for (var i = 0; i < this._imgs.length; i++) {
        var im = this._imgs[i];
        if (!im || !im.complete) { all = false; break; }
      }
      if (all) { this.done = true; return true; }
      return false;
    }
  };
  // 居中绘制精灵；angle 弧度；返回是否成功（未就绪返回 false 让调用方回退）
  function blit(key, x, y, w, h, angle) {
    var im = IMG[key];
    if (!im || !im.complete || im.naturalWidth === 0) return false;
    ctx.save(); ctx.translate(x, y); if (angle) ctx.rotate(angle);
    ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); return true;
  }
  // 从精灵图集中绘制指定帧（cols x rows 网格，frame 从 0 开始）
  function blitSheet(key, x, y, w, h, angle, cols, rows, frame) {
    var im = IMG[key];
    if (!im || !im.complete || im.naturalWidth === 0) return false;
    var fw = im.width / cols, fh = im.height / rows;
    var sx = (frame % cols) * fw, sy = Math.floor(frame / cols) * fh;
    ctx.save(); ctx.translate(x, y); if (angle) ctx.rotate(angle);
    ctx.drawImage(im, sx, sy, fw, fh, -w / 2, -h / 2, w, h);
    ctx.restore(); return true;
  }
  // 覆盖缩放绘制精灵（object-fit: cover），不拉伸；调用方负责裁剪区域
  function blitCover(key, cx, cy, w, h) {
    var im = IMG[key];
    if (!im || !im.complete || im.naturalWidth === 0) return false;
    var sw = im.naturalWidth, sh = im.naturalHeight;
    var scale = Math.max(w / sw, h / sh);
    var dw = sw * scale, dh = sh * scale;
    ctx.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
    return true;
  }
  var A1 = 'assets/v1/sprites/';
  loadImg('ply_a', A1 + 'player/ply_cruiser_a.png');
  loadImg('ply_a_sheet', 'assets/v3/player/qingfalcon_idle_sheet.png');
  loadImg('ply_a_move_sheet', 'assets/v3/player/qingfalcon_move_sheet.png');
  loadImg('ply_a_dash_sheet', 'assets/v3/player/qingfalcon_dash_sheet.png');
  loadImg('ply_a_attack_sheet', 'assets/v3/player/qingfalcon_attack_sheet.png');
  loadImg('ply_b', A1 + 'player/ply_guardian_b.png');
  loadImg('ply_b_sheet', 'assets/v3/player/xuanwu_idle_sheet.png');
  loadImg('ply_b_boost_sheet', 'assets/v3/player/xuanwu_boost_sheet.png');
  loadImg('ply_b_dash_sheet', 'assets/v3/player/xuanwu_dash_sheet.png');
  loadImg('ply_b_attack_sheet', 'assets/v3/player/xuanwu_attack_sheet.png');
  loadImg('ply_c', A1 + 'player/ply_dancer_c.png');
  loadImg('ply_c_sheet', 'assets/v3/player/chilan_idle_sheet.png');
  loadImg('ply_c_boost_sheet', 'assets/v3/player/fan_dancer_boost_sheet.png');
  loadImg('ply_c_move_sheet', 'assets/v3/player/chilan_move_sheet.png');
  loadImg('ply_c_dash_sheet', 'assets/v3/player/chilan_dash_sheet.png');
  loadImg('ply_c_attack_sheet', 'assets/v3/player/chilan_attack_sheet.png');
  loadImg('enm_ram', A1 + 'enemy/enm_ram.png');
  loadImg('enm_shoot', A1 + 'enemy/enm_shooter.png');
  loadImg('enm_turret', A1 + 'enemy/enm_turret.png');
  loadImg('enm_gunship', A1 + 'enemy/enm_gunship.png');
  loadImg('enm_heal', A1 + 'enemy/enm_healer.png');
  loadImg('enm_split', A1 + 'enemy/enm_splitter.png');
  loadImg('enm_looter', A1 + 'enemy/enm_looter.png');
  loadImg('enm_elite', A1 + 'enemy/enm_elite.png');
  // v10 新增敌人：从现有资产中挑选最合适的直接落盘使用
  loadImg('enm_sniper', A1 + 'enemy/enm_sniper.png');      // 源：enm_lantern_imp（漂浮灯笼精 → 幽灵狙击手气质）
  loadImg('enm_shielder', A1 + 'enemy/enm_shielder.png');  // 源：enm_golden_mask（金鬼面 → 厚重护盾兵）
  loadImg('enm_swarm', A1 + 'enemy/enm_swarm.png');        // 源：enm_paper_effigy（小纸人 → 蜂群数量感）
  loadImg('boss_taowu', 'assets/v4/bosses/boss_taowu.png');
  loadImg('boss_qiongqi', 'assets/v4/bosses/boss_qiongqi.png');
  loadImg('boss_taotie', 'assets/v4/bosses/boss_taotie.png');
  loadImg('boss_hundun', 'assets/v4/bosses/boss_hundun.png');
  loadImg('chest_common', A1 + 'environment/loot_common_chest.png');
  loadImg('chest_vault', A1 + 'environment/loot_vault_chest.png');
  // 互动物真精灵（相位柱 terminal / 磁锁秘库 vault_door）—— 见 drawPhaseObjects
  loadImg('terminal_active', A1 + 'environment/obj_terminal_active.png');
  loadImg('terminal_idle', A1 + 'environment/obj_terminal_idle.png');
  loadImg('vault_door', A1 + 'environment/env_vault_door.png');
  // 地图障碍真精灵（岩石残垣 / 掩体块）—— 见 drawObstacles
  loadImg('env_ruin_barrier', A1 + 'environment/env_ruin_barrier.png');
  loadImg('env_cover_block', A1 + 'environment/env_cover_block.png');
  // 法阵：封印宝箱 / 撤离点共用（金/青）
  loadImg('seal_circle_gold', 'assets/v4/vfx/seal_circle_gold.png');
  loadImg('seal_circle_teal', 'assets/v4/vfx/seal_circle_teal.png');
  loadImg('bul_player', A1 + 'effects/prj_player.png');
  loadImg('bul_enemy', A1 + 'effects/prj_enemy.png');
  loadImg('bul_boss', A1 + 'effects/prj_boss.png');
  loadImg('bul_buff', A1 + 'effects/prj_buff.png');
  loadImg('loot_common', A1 + 'effects/loot_common_pickup.png');
  loadImg('loot_rare', A1 + 'effects/loot_rare_pickup.png');
  // 武器等级图标（5行稀有度 × 3列武器类型），供战斗掉落物使用
  for (var wr = 0; wr < 5; wr++) for (var wc = 0; wc < 3; wc++) loadImg('wpn_r' + wr + '_c' + wc, 'assets/v4/weapons/weapon_r' + wr + '_c' + wc + '.png');
  // 护甲·核心·弹药等级图标（5行稀有度 × 3列装备类型），供战斗掉落物与军械库槽位使用
  var GEAR_SLOT = ['armor', 'core', 'ammo'];
  for (var gr = 0; gr < 5; gr++) for (var gc = 0; gc < 3; gc++) loadImg('gear_' + GEAR_SLOT[gc] + '_' + RAR[gr], 'assets/v4/gear/gear_' + GEAR_SLOT[gc] + '_' + RAR[gr] + '.png');
  var A2 = 'assets/v2/items/icons/';
  loadImg('con_bomb', A2 + 'con_bomb.png');
  loadImg('con_heal', A2 + 'con_heal.png');
  loadImg('con_shield', A2 + 'con_shield.png');
  loadImg('con_slow', A2 + 'con_slow.png');
  var A3 = 'assets/v3/vfx/';
  // loadImg('vfx_hit_spark', A3 + 'vfx_hit_spark.png');   // 旧资产未抠干净，先禁用
  // loadImg('vfx_crit_flash', A3 + 'vfx_crit_flash.png'); // 旧资产未抠干净，先禁用
  // loadImg('vfx_buff_aura', A3 + 'vfx_buff_aura.png');   // 旧资产未抠干净，先禁用
  // loadImg('vfx_frost', A3 + 'vfx_frost.png');           // 旧资产未抠干净，先禁用
  // loadImg('vfx_explosion_smoke', A3 + 'vfx_explosion_smoke.png'); // 旧资产未抠干净，先禁用
  loadImg('vfx_explosion_sheet', A3 + 'vfx_explosion_sheet.png');
  // loadImg('vfx_enemy_death', A3 + 'vfx_enemy_death.png'); // 旧资产未抠干净，先禁用
  // 青隼专属 VFX：枪口闪光、羽形子弹、命中星芒
  loadImg('vfx_muzzle_flash_sheet', A3 + 'vfx_muzzle_flash_sheet.png');
  loadImg('bul_player_sheet', A3 + 'bul_player_sheet.png');
  loadImg('vfx_hit_star_sheet', A3 + 'vfx_hit_star_sheet.png');
  // 玄武专属 VFX 与重型弹丸：枪口闪光、重型弹丸、命中震波
  loadImg('vfx_xuanwu_muzzle_flash_sheet', A3 + 'vfx_xuanwu_muzzle_flash_sheet.png');
  loadImg('bul_xuanwu_sheet', A3 + 'bul_xuanwu_sheet.png');
  loadImg('vfx_xuanwu_hit_shock_sheet', A3 + 'vfx_xuanwu_hit_shock_sheet.png');
  // 赤鸾专属 VFX 与追踪羽矛：枪口闪光、追踪羽矛弹丸、羽焰命中特效
  loadImg('vfx_chilan_muzzle_sheet', A3 + 'vfx_chilan_muzzle_sheet.png');
  loadImg('bul_chilan_sheet', A3 + 'bul_chilan_sheet.png');
  loadImg('vfx_chilan_hit_sheet', A3 + 'vfx_chilan_hit_sheet.png');
  // 五行元素弹道拖尾与命中特效（8 帧精灵表 4x2，绿幕已抠→透明 PNG）
  loadImg('trail_fire', A3 + 'trail_fire_transparent.png');
  loadImg('trail_water', A3 + 'trail_water_transparent.png');
  loadImg('trail_thunder', A3 + 'trail_thunder_transparent.png');
  loadImg('trail_wind', A3 + 'trail_wind_transparent.png');
  loadImg('trail_earth', A3 + 'trail_earth_transparent.png');
  loadImg('hit_fire', A3 + 'hit_fire_transparent.png');
  loadImg('hit_water', A3 + 'hit_water_transparent.png');
  loadImg('hit_thunder', A3 + 'hit_thunder_transparent.png');
  loadImg('hit_wind', A3 + 'hit_wind_transparent.png');
  loadImg('hit_earth', A3 + 'hit_earth_transparent.png');
  var ELEM_VFX = {
    '火': { trail: 'trail_fire', hit: 'hit_fire' },
    '水': { trail: 'trail_water', hit: 'hit_water' },
    '雷': { trail: 'trail_thunder', hit: 'hit_thunder' },
    '风': { trail: 'trail_wind', hit: 'hit_wind' },
    '土': { trail: 'trail_earth', hit: 'hit_earth' }
  };
  // VFX 精灵系统：原创厚涂资产（山海志怪·写实·鎏金·无霓虹），lighter 叠加 + 淡出 + 出场放大
  // 支持单图 VFX 或逐帧精灵表动画：sheet = { cols, rows, fps }
  var vfxSprites = [];
  function spawnVfx(key, x, y, size, life, rot, vspin, sheet) {
    if (vfxSprites.length > 220) return;
    vfxSprites.push({ key: key, x: x, y: y, size: size, rot: rot || 0, spin: (vspin == null ? (Math.random() - 0.5) * 2.4 : vspin), life: life || 0.4, max: life || 0.4, sheet: sheet || null, age: 0 });
  }
  function updateVfx(dt) {
    // 冲刺残影寿命推进与回收
    for (var gi = 0; gi < playerGhosts.length; gi++) playerGhosts[gi].t += dt;
    for (var gi2 = playerGhosts.length - 1; gi2 >= 0; gi2--) { if (playerGhosts[gi2].t >= playerGhosts[gi2].life) playerGhosts.splice(gi2, 1); }
    for (var i = vfxSprites.length - 1; i >= 0; i--) { var s = vfxSprites[i]; s.life -= dt; s.age += dt; s.rot += s.spin * dt; if (s.life <= 0) vfxSprites.splice(i, 1); }
  }
  function spawnElementHit(elem, x, y, scale) {
    if (!elem || !ELEM_VFX[elem]) return;
    var key = ELEM_VFX[elem].hit;
    var sz = 54 * (scale || 1);
    spawnVfx(key, x, y, sz, 0.5, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 16 });
  }
  function drawVfxSprites() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; // 加法叠加：暗底不显、亮部发光，frost 真透明同理
    for (var i = 0; i < vfxSprites.length; i++) {
      var s = vfxSprites[i]; var t = s.life / s.max; var im = IMG[s.key];
      if (!im || !im.complete || im.naturalWidth === 0) continue;
      var sz = s.size * (0.7 + (1 - t) * 0.6);
      ctx.globalAlpha = Math.min(1, t * 1.7);
      if (s.sheet) {
        var totalFrames = s.sheet.cols * s.sheet.rows;
        var frame = Math.min(totalFrames - 1, Math.floor(s.age * s.sheet.fps));
        blitSheet(s.key, s.x, s.y, sz, sz, s.rot, s.sheet.cols, s.sheet.rows, frame);
      } else {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.drawImage(im, -sz / 2, -sz / 2, sz, sz); ctx.restore();
      }
    }
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  var PSIZE = { a: 50, b: 56, c: 60 };
  var ESIZE = { ram: 42, shoot: 42, turret: 60, gunship: 60, heal: 46, split: 40, looter: 42, sniper: 44, shielder: 48, swarm: 26 };
  // 游戏内实体（机体 / 怪物 / 战利品 / 掉落物）渲染放大倍率。统一调这一值即可整体缩放，碰撞半径不受影响。
  var ICON_SCALE = 1.8;
  function enemySprite(e) {
    if (e.arche === 'turret') return 'enm_turret';
    if (e.arche === 'gunship') return 'enm_gunship';
    if (e.arche === 'heal') return 'enm_heal';
    if (e.arche === 'split') return 'enm_split';
    if (e.arche === 'looter') return 'enm_looter';
    if (e.arche === 'shoot') return 'enm_shoot';
    if (e.arche === 'sniper') return 'enm_sniper';
    if (e.arche === 'shielder') return 'enm_shielder';
    if (e.arche === 'swarm') return 'enm_swarm';
    return 'enm_ram';
  }
  function bulletSprite(b) {
    if (b.kind === 'boss') return 'bul_boss';
    if (b.kind === 'crit') return 'bul_buff';
    if (b.from === 'player') return 'bul_player';
    return 'bul_enemy';
  }

  // ---------- 输入 ----------
  var keys = {}; var mouse = { x: W / 2, y: H / 2, down: false };
  window.addEventListener('keydown', function (e) {
    AudioSys.unlock();
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'n') { AudioSys.setMuted(!AudioSys.isMuted()); setBanner('声音 ' + (AudioSys.isMuted() ? '已静音' : '已开启') + '（按 N 切换）', 1.4); return; }
    if (scene === 'mission') {
      // #381-③ 裂隙出口改回"走到指定出口传送门"：移除 Esc/Q/B 裂隙内强制离场。
      // 仅保留隐藏防死锁快捷键 Ctrl+Q（不宣传）：极端卡死时玩家可自救脱离（安全阀，见 updateRift 60s 自动兜底）
      if (inRift && !riftPrompt && !paused && e.ctrlKey && e.key.toLowerCase() === 'q') { forceExitRift(); e.preventDefault(); return; }
      // v12b 拾取列表打开时：拦截所有按键，专用于列表导航/选择（游戏不暂停）
      if (pickupOpen) {
        var _nn = getNearLoot().length;
        if (e.key === 'ArrowUp') { pickupSel = Math.max(0, pickupSel - 1); e.preventDefault(); return; }
        if (e.key === 'ArrowDown') { pickupSel = Math.min(_nn - 1, pickupSel + 1); e.preventDefault(); return; }
        if (e.key === 'Enter' || e.key === ' ') { pickupSelected(pickupSel); e.preventDefault(); return; }
        if (/^[1-9]$/.test(e.key)) { pickupSelected(parseInt(e.key, 10) - 1); e.preventDefault(); return; }
        if (e.key === 'Escape') { pickupOpen = false; return; }
        return;
      }
      if (riftPrompt) {
        if (e.key === '1' || e.key === 'Enter') { commitRift(true); return; }
        if (e.key === '2' || e.key === 'Escape') { commitRift(false); return; }
      }
      if (vaultPrompt) {
        if (e.key === '1' || e.key === 'Enter') { vaultFeed(); return; }
        if (e.key === '2') { vaultJade(); return; }
        if (e.key === 'Escape') { closeVaultPrompt(false); return; }
      }
      if (e.key.toLowerCase() === 'e') {
        // #381-② 秘库开门同样受距离约束（仅靠近 <150px 才可弹），杜绝全图任意位置按 E 触发
        if (secretVault && !secretVault.opened && !vaultPrompt && !paused && !overlaysOpen() && Math.hypot(player.x - secretVault.x, player.y - secretVault.y) < VAULT_PROMPT_R) openVaultPrompt();
        else if (!paused && !overlaysOpen()) forcePickupNearest(); // #197 E 键：附近无可开秘库时，强制捡取最近掉落物（无视筛选）
      }
      if (e.key === '1') chooseBuff(0);
      if (e.key === '2') chooseBuff(1);
      if (e.key === '3') chooseBuff(2);
      if (e.key.toLowerCase() === 'm') toggleMerge();
      if (e.key.toLowerCase() === 'l') togglePickupFilter();
      if (e.key === 'Tab') { if (scene === 'mission') { e.preventDefault(); toggleBackpack(); } return; } // #BP2：Tab 同 B 开关背包（PC 便捷键位）
      if (e.key.toLowerCase() === 'b') toggleBackpack();
      if (e.key.toLowerCase() === 'q') useConsumable();
      if (e.key.toLowerCase() === 'g') { glowOn = !glowOn; setBanner('辉光/拖尾 ' + (glowOn ? '开启' : '关闭'), 1.2); }
      if (e.key.toLowerCase() === 'f') { togglePickupList(); return; } // v12b：拾取列表开关（吃鸡式展开附近物品）
      if (e.key.toLowerCase() === 'r') tryActiveFlip(); // 相位赌注：献祭核心翻转相位（鎏金↔余烬），原 F 让位拾取列表
      if (e.key.toLowerCase() === 'j') castUlt(); // 灵潮绝技：流派大招（充能满后释放）
      // #197/#198 Esc 关闭新浮层（背包/筛选），再走通用暂停逻辑
      if (e.key === 'Escape') {
        if (document.getElementById('mergeOverlay').style.display === 'flex') { toggleMerge(); return; } // #M6 修复：Esc 可关合成台
        if (document.getElementById('backpackOverlay').style.display === 'flex') { toggleBackpack(); return; }
        if (document.getElementById('pickupFilterOverlay').style.display === 'flex') { togglePickupFilter(); return; }
      }
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') { if (overlaysOpen()) return; togglePause(); }
    }
  });
  function overlaysOpen() { return document.getElementById('buffOverlay').style.display === 'flex' || document.getElementById('mergeOverlay').style.display === 'flex' || document.getElementById('pickupFilterOverlay').style.display === 'flex' || document.getElementById('backpackOverlay').style.display === 'flex'; }
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  canvas.addEventListener('mousemove', function (e) { var r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.addEventListener('mousedown', function (e) {
    AudioSys.unlock();
    if (scene === 'mission' && !paused && !overlaysOpen()) {
      var rr = canvas.getBoundingClientRect();
      var mx = e.clientX - rr.left, my = e.clientY - rr.top;
      if (pickupOpen) {
        for (var _pri = 0; _pri < pickupRects.length; _pri++) {
          var _prr = pickupRects[_pri];
          if (mx >= _prr.x && mx <= _prr.x + _prr.w && my >= _prr.y && my <= _prr.y + _prr.h) { pickupSelected(_pri); return; }
        }
        return; // 列表打开时点击空白处不触发地面拾取/丢弃
      }
      // #197 点击地面掉落物：无视筛选强制捡起该件（手动覆盖一次性）
      var wmx = mx + cam.x, wmy = my + cam.y;
      for (var li = loot.length - 1; li >= 0; li--) {
        var dl = loot[li];
        if (dl.rarity && dl.type !== 'xp' && dist2(wmx, wmy, dl.x, dl.y) < 22 * 22) { forcePickupIndex(li); return; }
      }
      for (var bi = 0; bi < bpSlotRects.length; bi++) {
        var s = bpSlotRects[bi];
        if (s.idx < run.loot.length && mx >= s.x && mx <= s.x + s.w && my >= s.y && my <= s.y + s.h) {
          var d = run.loot.splice(s.idx, 1)[0];
          floatText(player.x, player.y - 30, '丢弃「' + d.name + '」', '#C94F4F'); burst(player.x, player.y, '#C94F4F', 6);
          return;
        }
      }
    }
    mouse.down = true;
  });
  window.addEventListener('mouseup', function () { mouse.down = false; });

  // ---------- 移动端检测 & 虚拟操控 ----------
  // 2026-08-18 修复：原检测要求 touch **且** 小屏/UA 同时满足，太严——很多设备会"误判成桌面"导致控件消失。
  // 改为 OR：触屏/移动 UA/小视口 任一命中即视为移动端；并在 resize/orientationchange 时重算
  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || (navigator.msMaxTouchPoints || 0) > 0 || window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var _isMobileUA = /Mobi|Android|iPhone|iPad|iPod|Mobile|Tablet|PlayBook|Silk|MIUI|EMUI|HarmonyOS/i.test(navigator.userAgent);
  function _computeMobile() {
    return isTouch || _isMobileUA || Math.min(window.innerWidth, window.innerHeight) < 800;
  }
  var isMobile = _computeMobile();
  // #381-⑥ 竖屏单摇杆：竖屏判定（窄长屏）。竖屏下禁用左半屏移动摇杆，右下主摇杆兼作移动+开火
  function portraitNow() { return isMobile && window.innerHeight > window.innerWidth; }
  // 2026-08-18 移动端判定半径同步缩小（机体绘制已 ×0.5）：弹幕/接触判定用 PHB，机身碰撞用 player.r
  var PHB = isMobile ? 7 : 13;
  function recomputeMobile() { isMobile = _computeMobile(); PHB = isMobile ? 7 : 13; }
  // 安全区（刘海/手势条）：Canvas 无法直接读 env()，用探针元素解析为像素，贯穿所有 HUD 绘制
  var SA = { t: 0, r: 0, b: 0, l: 0 };
  function updateSafeArea() {
    try {
      var p = document.getElementById('saProbe');
      if (!p) { p = document.createElement('div'); p.id = 'saProbe'; p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;padding:0;padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);opacity:0;pointer-events:none;'; document.body.appendChild(p); }
      var cs = getComputedStyle(p);
      SA.t = parseFloat(cs.paddingTop) || 0; SA.r = parseFloat(cs.paddingRight) || 0;
      SA.b = parseFloat(cs.paddingBottom) || 0; SA.l = parseFloat(cs.paddingLeft) || 0;
    } catch (e) {}
  }
  updateSafeArea();
  // 虚拟摇杆状态
  var joy = { active: false, touchId: null, baseX: 0, baseY: 0, dx: 0, dy: 0, mag: 0 };
  // 右摇杆（瞄准+开火一体）：朝向绝对由右摇杆矢量主导，松手保朝向
  var aimJoy = { active: false, touchId: null, baseX: 0, baseY: 0, dx: 0, dy: 0, mag: 0, tapT: 0 };
  var aimTapFire = false; // 右摇杆点按保底发射（消耗一次）
  // 双摇杆手感参数
  var AIM_DEADZONE = 0.2;                       // 右摇杆死区：拉过才触发瞄准开火
  var TURN_TAU = 0.028;                        // 转向阻尼时间常数：响应 < 0.08s（推摇杆即朝向，松手即定角）
  var AIM_ASSIST_CONE = 15 * Math.PI / 180;    // 15° 扇形辅助瞄准微吸附
  var AIM_ASSIST_RANGE = 600;                  // 辅助瞄准生效距离
  var dashBtnPressed = false;
  var consBtnPressed = false;
  // DOM 引用
  var mcEl = document.getElementById('mobileControls');
  var joyBaseEl = document.getElementById('joyBase');
  var joyKnobEl = document.getElementById('joyKnob');
  var aimJoyBaseEl = document.getElementById('right-stick-container');
  var aimJoyKnobEl = document.getElementById('right-stick-knob');
  var dashBtnEl = document.getElementById('dashBtn');
  var consBtnEl = document.getElementById('consBtn');

  function showMobileControls() {
    if (!mcEl) return;
    // 2026-08-18 修复：增加保底——若触屏+小视口，即便 isMobile 因故为 false 也强制显示（绝不能让用户进 mission 却没按钮）
    var _fallback = isTouch && Math.min(window.innerWidth, window.innerHeight) < 800;
    var show = (isMobile || _fallback) && scene === 'mission' && !paused && !overlaysOpen();
    mcEl.className = show ? 'on' : '';
    // 场景隔离：写入 body[data-scene]，供 CSS 保底规则只在 mission 场景显示战斗控件，
    // 基地/标题/结算页即使 JS 未及也不残留战斗轮盘。
    document.body.setAttribute('data-scene', scene || '');
    if (!show) { joy.active = false; joy.dx = 0; joy.dy = 0; joy.mag = 0; hideJoystick(); aimJoy.active = false; aimJoy.dx = 0; aimJoy.dy = 0; aimJoy.mag = 0; aimJoy.tapT = 0; hideAimJoystick(); aimTapFire = false; }
  }
  function showJoystick(x, y) {
    if (!joyBaseEl) return;
    joyBaseEl.style.left = (x - 65) + 'px';
    joyBaseEl.style.top = (y - 65) + 'px';
    joyBaseEl.className = 'joy-base on';
  }
  function hideJoystick() { if (joyBaseEl) joyBaseEl.className = 'joy-base'; }
  function updateJoystickKnob(dx, dy) {
    if (!joyKnobEl) return;
    joyKnobEl.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
  }
  function showAimJoystick() {
    if (!aimJoyBaseEl) return;
    aimJoyBaseEl.classList.add('on');
  }
  function hideAimJoystick() { if (aimJoyBaseEl) aimJoyBaseEl.classList.remove('on'); }
  function updateAimJoystickKnob(dx, dy) {
    if (!aimJoyKnobEl) return;
    aimJoyKnobEl.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
  }
  function updateMobileBtnStates() {
    if (!isMobile || scene !== 'mission') return;
    if (dashBtnEl) { if (player && player.dashCd > 0) dashBtnEl.classList.add('cd'); else dashBtnEl.classList.remove('cd'); }
    if (consBtnEl && player) {
      var has = false;
      for (var i = 0; i < 3; i++) if (player.consumables && player.consumables[i]) { has = true; break; }
      consBtnEl.classList.toggle('empty', !has);
    }
    if (phaseBtnEl) { if (scene === 'mission' && !paused && phaseCore < CORE_PER_FLIP) phaseBtnEl.classList.add('cd'); else phaseBtnEl.classList.remove('cd'); }
    if (mergeBtnEl) { if (!run || !run.loot || run.loot.length === 0) mergeBtnEl.classList.add('empty'); else mergeBtnEl.classList.remove('empty'); mergeBtnEl.classList.toggle('hint', !!(run && run.loot && hasMergeable())); }
    if (ultBtnEl) { var _ur = player && player.ultCharge >= ULT_MAX; ultBtnEl.classList.toggle('cd', !_ur); ultBtnEl.classList.toggle('ready', !!_ur); if (player) ultBtnEl.style.setProperty('--cdDeg', Math.max(0, 100 - Math.min(100, player.ultCharge / ULT_MAX * 100)) + '%'); }
    if (backpackBtnEl) { if (!run || !run.loot || run.loot.length === 0) backpackBtnEl.classList.add('empty'); else backpackBtnEl.classList.remove('empty'); }
    var _pb = document.getElementById('pickupBtn');
    if (_pb) { var _pn = getNearLoot().length; _pb.classList.toggle('on', !!pickupOpen); _pb.classList.toggle('empty', _pn === 0); _pb.classList.toggle('glow', _pn > 0 && !pickupOpen); }
  }

  // Canvas 触摸 → 左半屏虚拟摇杆（动态出现）
  canvas.addEventListener('touchstart', function (e) {
    AudioSys.unlock();
    if (!isMobile || paused || overlaysOpen()) return; // 暂停/弹层开启时拦截：底层不再响应触摸
    if (pickupOpen) {
      var _r0 = canvas.getBoundingClientRect();
      var _hit = false;
      for (var _ti = 0; _ti < e.changedTouches.length; _ti++) {
        var _tt = e.changedTouches[_ti];
        var _tx = _tt.clientX - _r0.left, _ty = _tt.clientY - _r0.top;
        for (var _pj = 0; _pj < pickupRects.length; _pj++) {
          var _prect = pickupRects[_pj];
          if (_tx >= _prect.x && _tx <= _prect.x + _prect.w && _ty >= _prect.y && _ty <= _prect.y + _prect.h) { pickupSelected(_pj); _hit = true; }
        }
      }
      if (_hit) e.preventDefault();
      return; // 列表打开时屏蔽摇杆/移动，专用于点选
    }
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var r = canvas.getBoundingClientRect();
      var x = t.clientX - r.left, y = t.clientY - r.top;
      // v12：触屏点按战利品 → 手动拾取（不再自动吸）
      var _wmx = x + cam.x, _wmy = y + cam.y, _tapped = false;
      for (var _li = loot.length - 1; _li >= 0; _li--) {
        var _dl = loot[_li];
        if (_dl.rarity && _dl.type !== 'xp' && dist2(_wmx, _wmy, _dl.x, _dl.y) < 26 * 26) { forcePickupIndex(_li); _tapped = true; break; }
      }
      if (_tapped) continue;
      // 双摇杆：左半屏→左摇杆(移动)；右半屏→右摇杆(瞄准+开火)；各自追踪 touchId，支持多点触控同时操作
      // #381-⑥ 竖屏单摇杆：竖屏下左半屏不再生成移动摇杆（移动整合到右下主摇杆，拖拽=移动+开火）
      if (x < W * 0.45 && !joy.active && !portraitNow()) {
        joy.active = true; joy.touchId = t.identifier;
        joy.baseX = x; joy.baseY = y;
        joy.dx = 0; joy.dy = 0; joy.mag = 0;
        showJoystick(x, y);
      } // 右摇杆改为右下角静态 #right-stick-container 独立接收触摸，画布右半屏不再生成浮动瞄准摇杆
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (!isMobile) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var r = canvas.getBoundingClientRect();
      var x = t.clientX - r.left, y = t.clientY - r.top;
      if (t.identifier === joy.touchId) {
        var dx = x - joy.baseX, dy = y - joy.baseY;
        var dist = Math.hypot(dx, dy);
        var maxR = 55;
        if (dist > maxR) { dx = dx / dist * maxR; dy = dy / dist * maxR; dist = maxR; }
        joy.dx = dx / maxR; joy.dy = dy / maxR; joy.mag = dist / maxR;
        updateJoystickKnob(dx, dy);
      } // 右摇杆移动由 #right-stick-container 自身 touchmove 处理
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    if (!isMobile) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var _id = e.changedTouches[i].identifier;
      if (_id === joy.touchId) {
        joy.active = false; joy.touchId = null;
        joy.dx = 0; joy.dy = 0; joy.mag = 0;
        hideJoystick();
      } // 右摇杆松手/复位由 #right-stick-container 自身 touchend/touchcancel 处理（含点按盲射保底）
    }
  }, { passive: true });
  canvas.addEventListener('touchcancel', function () {
    if (!isMobile) return;
    joy.active = false; joy.touchId = null;
    joy.dx = 0; joy.dy = 0; joy.mag = 0; hideJoystick();
  }, { passive: true });

  // 火力已并入右摇杆（瞄准+开火一体）：不再有独立开火按钮（右键半屏 aimJoy 触控逻辑）
  // 冲刺按钮
  if (dashBtnEl) {
    dashBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !paused && !pickupOpen) { dashBtnPressed = true; this.classList.add('on'); } }, { passive: false });
    dashBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
  }
  // 丹药按钮
  if (consBtnEl) {
    consBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !paused && !pickupOpen) { consBtnPressed = true; this.classList.add('on'); } }, { passive: false });
    consBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
  }
  // 暂停按钮（移动端）
  var pauseBtnMobile = document.getElementById('pauseBtnMobile');
  if (pauseBtnMobile) {
    pauseBtnMobile.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !overlaysOpen()) togglePause(); }, { passive: false });
    pauseBtnMobile.addEventListener('click', function () { if (scene === 'mission' && !overlaysOpen()) togglePause(); });
  }
  // 移动端补全（点3）：相位翻转 F + 熔炼合成 M 按钮
  var phaseBtnEl = document.getElementById('phaseBtn');
  if (phaseBtnEl) {
    phaseBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !paused && !overlaysOpen() && !pickupOpen) { tryActiveFlip(); this.classList.add('on'); } }, { passive: false });
    phaseBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
    phaseBtnEl.addEventListener('click', function () { if (scene === 'mission' && !paused && !overlaysOpen()) tryActiveFlip(); });
  }
  var mergeBtnEl = document.getElementById('mergeBtn');
  if (mergeBtnEl) {
    mergeBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !paused && !pickupOpen) { toggleMerge(); this.classList.add('on'); } }, { passive: false });
    mergeBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
    mergeBtnEl.addEventListener('click', function () { if (scene === 'mission' && !paused) toggleMerge(); });
  }
  // 灵潮绝技按钮（移动端，v10）
  var ultBtnEl = document.getElementById('ultBtn');
  if (ultBtnEl) {
    ultBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !paused && !overlaysOpen() && !pickupOpen) { castUlt(); this.classList.add('on'); } }, { passive: false });
    ultBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
    ultBtnEl.addEventListener('click', function () { if (scene === 'mission' && !paused && !overlaysOpen()) castUlt(); });
  }
  // 右侧「双摇杆·瞄准开火一体」静态摇杆：拖拽即瞄准+持续开火；点按/未拖拽吸附最近敌机或保持朝向开火；松手停火+滑块弹回中心
  var rsEl = document.getElementById('right-stick-container');
  var rsKnobEl = document.getElementById('right-stick-knob');
  function rsCenter() {
    if (!rsEl) return { x: 0, y: 0 };
    var _r = rsEl.getBoundingClientRect();
    return { x: _r.left + _r.width / 2, y: _r.top + _r.height / 2 };
  }
  if (rsEl) {
    rsEl.addEventListener('touchstart', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (scene !== 'mission' || paused || overlaysOpen() || pickupOpen) return;
      var t = e.changedTouches[0]; if (!t) return;
      aimJoy.active = true; aimJoy.touchId = t.identifier;
      aimJoy.dx = 0; aimJoy.dy = 0; aimJoy.mag = 0; aimJoy.tapT = 0;
      rsEl.classList.add('on');
      updateAimJoystickKnob(0, 0);
    }, { passive: false });
    rsEl.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (!aimJoy.active) return;
      var t = null;
      for (var i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === aimJoy.touchId) { t = e.changedTouches[i]; break; } }
      if (!t) return;
      var c = rsCenter();
      var dx = t.clientX - c.x, dy = t.clientY - c.y;
      var dist = Math.hypot(dx, dy);
      var maxR = 45;
      if (dist > maxR) { dx = dx / dist * maxR; dy = dy / dist * maxR; dist = maxR; }
      aimJoy.dx = dx / maxR; aimJoy.dy = dy / maxR; aimJoy.mag = dist / maxR;
      updateAimJoystickKnob(dx, dy);
    }, { passive: false });
    var rsEnd = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (aimJoy.active && aimJoy.mag <= AIM_DEADZONE && aimJoy.tapT < 0.22) {
        // 点按/未拖过死区保底盲射：吸附最近敌机，否则沿用当前朝向
        var _ne = null, _nd = AIM_ASSIST_RANGE * AIM_ASSIST_RANGE;
        for (var _k = 0; _k < enemies.length; _k++) { var _d = dist2(enemies[_k].x, enemies[_k].y, player.x, player.y); if (_d < _nd) { _nd = _d; _ne = enemies[_k]; } }
        if (boss && dist2(boss.x, boss.y, player.x, player.y) < AIM_ASSIST_RANGE * AIM_ASSIST_RANGE) { var _db = dist2(boss.x, boss.y, player.x, player.y); if (_db < _nd) { _nd = _db; _ne = boss; } }
        if (_ne) player.ang = Math.atan2(_ne.y - player.y, _ne.x - player.x);
        aimTapFire = true;
      }
      aimJoy.active = false; aimJoy.touchId = null;
      aimJoy.dx = 0; aimJoy.dy = 0; aimJoy.mag = 0; aimJoy.tapT = 0;
      rsEl.classList.remove('on');
      updateAimJoystickKnob(0, 0);
    };
    rsEl.addEventListener('touchend', rsEnd, { passive: false });
    rsEl.addEventListener('touchcancel', rsEnd, { passive: false });
  }
  // #197 拾取筛选按钮（移动端）
  var pickupFilterBtnEl = document.getElementById('pickupFilterBtn');
  if (pickupFilterBtnEl) {
    pickupFilterBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !paused) { togglePickupFilter(); this.classList.add('on'); } }, { passive: false });
    pickupFilterBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
    pickupFilterBtnEl.addEventListener('click', function () { if (scene === 'mission' && !paused) togglePickupFilter(); });
  }
  // #198 背包按钮（移动端）
  var backpackBtnEl = document.getElementById('backpackBtn');
  if (backpackBtnEl) {
    backpackBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !paused && !pickupOpen) { toggleBackpack(); this.classList.add('on'); } }, { passive: false });
    backpackBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
    backpackBtnEl.addEventListener('click', function () { if (scene === 'mission' && !paused) toggleBackpack(); });
  }
  // v12b 拾取列表按钮（移动端）
  var pickupBtnEl = document.getElementById('pickupBtn');
  if (pickupBtnEl) {
    pickupBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !paused && !overlaysOpen()) { togglePickupList(); this.classList.add('on'); } }, { passive: false });
    pickupBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
    pickupBtnEl.addEventListener('click', function () { if (scene === 'mission' && !paused && !overlaysOpen()) togglePickupList(); });
  }
  // 多指操作健壮性：所有触控按钮补 touchcancel 复位，避免手指滑出导致按钮“卡住”
  ['dashBtn', 'consBtn', 'ultBtn', 'phaseBtn', 'mergeBtn', 'pickupBtn', 'backpackBtn', 'pauseBtnMobile'].forEach(function (bid) {
    var el = document.getElementById(bid); if (!el) return;
    el.addEventListener('touchcancel', function () {
      this.classList.remove('on');
      if (bid === 'dashBtn') dashBtnPressed = false;
      if (bid === 'consBtn') consBtnPressed = false;
    }, { passive: false });
  });

  // 沉浸模式（仅收浏览器地址栏）—— 2026-08-18 按 Boss 要求去掉自动全屏（requestFullscreen）
  // 也不强制横屏：横/竖屏均支持，由 checkOrientation 自适应布局；wantLandscape 入参保留但无副作用
  function enterImmersive(wantLandscape) {
    // iOS Safari 地址栏隐藏 trick：临时允许滚动 → 滚一像素 → 恢复锁定
    hideBrowserBars();
    // 延迟再收一次 + 重算尺寸，等视口稳定
    setTimeout(function () { hideBrowserBars(); resize(); }, 300);
    setTimeout(function () { hideBrowserBars(); resize(); }, 600);
  }

  function hideBrowserBars() {
    // 临时解除 overflow hidden，滚到顶+1px 触发地址栏收起，然后恢复
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    window.scrollTo(0, 1);
    setTimeout(function () {
      window.scrollTo(0, 0);
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      resize();
    }, 50);
  }

  // 兼容旧调用
  function tryLandscape() { enterImmersive(true); }
  function checkOrientation() {
    if (!isMobile) { document.body.dataset.orient = 'desktop'; return; }
    var portrait = window.innerHeight > window.innerWidth;
    // 横屏/竖屏双支持：仅打标记，由 CSS + drawHUD 自适应，不再封锁竖屏
    document.body.dataset.orient = portrait ? 'portrait' : 'landscape';
    var rp = document.getElementById('rotatePrompt');
    if (rp) {
      // 非阻塞软提示：仅标题页 + 竖屏 + 未手动关闭时显示；游戏中从不遮挡
      var showHint = portrait && scene === 'title' && !rotHintDismissed;
      rp.style.display = showHint ? 'flex' : 'none';
    }
  }
  // orientationchange 已在上面统一处理（line ~35），避免重复
  // 从后台切回前台时重新隐藏浏览器栏
  document.addEventListener('visibilitychange', function () { if (!document.hidden && isMobile) { setTimeout(function () { hideBrowserBars(); resize(); checkOrientation(); }, 200); } });

  // ---------- 全局状态 ----------
  var scene = 'base'; // 2026-08-18 Boss 指令：去掉开场标题界面，落地直接进基地
  var baseTab = 'hangar';
  var tipTimer = 0, tipEl = null;
  var paused = false;
  // 双朝向：autoFire 在竖屏默认开启（单手更难同时走位+按火力，自动开火是同类手游标配）；rotHintDismissed 控制标题页竖屏软提示
  var autoFire = false;
  var rotHintDismissed = false;
  var player, bullets, enemies, loot, nodes, particles, floaters, extractPoints, exfil, boss, bossSpawned, vaults, totems;
  var run, spawnTimer, buffTimer, buffPending, buffHold, buffSafe, gameTime, hintTimer, bannerQ = [], killForBuff, runeCount, screenFlash;
  // banner 队列：#389 三槽分桶（top/mid/bot），按 pri 决定 y 位置
  //   'top' = 屏幕顶部 12+SA.t（战局重要：杀 Boss / beacon 激活 / 自毁 / 转幕 / 穷奇召唤 / 安全时间）
  //   'mid' = 屏幕中央略上 H*0.32（特殊：单条中央信息）
  //   'bot' = 底部 64/205 槽（默认：掉落 / 按键提示 / 普通警告）
  // 同文本刷新不重复排队 —— 消灭单槽互相覆盖
  // 2026-08-18 规范化：生命周期硬顶 ≤4s；展示位置移至底部居中；字号减半
  function setBanner(text, life, col, pri) {
    var t = String(text);
    life = Math.min(Math.max(0.6, life || 2.2), 4);
    pri = pri || 'bot';
    if (pri !== 'top' && pri !== 'mid' && pri !== 'bot') pri = 'bot';
    for (var i = 0; i < bannerQ.length; i++) if (bannerQ[i].text === t) { bannerQ[i].life = life; bannerQ[i].max = life; if (col) bannerQ[i].col = col; bannerQ[i].pri = pri; return; }
    bannerQ.push({ text: t, life: life, max: life, col: col || null, age: 0, pri: pri });
    // 全局上限 6（top 2 + mid 1 + bot 2 = 5 实际可见），避免极端情况爆队列
    if (bannerQ.length > 6) bannerQ.shift();
  }
  var runPhase = 'qi', huntActive = false, huntWarnT = 0; // 起承转合·幕章状态机 + 围猎狂暴标记
  // 敌机行为 / 撤离惊动（规则圣经 v1）全局状态
  var pendingSpawns = [], lootArrow = null, edgeArrow = null;
  var exfilChoicePending = null, exfilStarted = false, exfilPoint = null, exfilChoice = null, exfilJadePenalty = 0, exfilAlarmT = 0, exfilCenter = null, exfilAutoT = 0;
  // 裂隙 / 黑洞系统全局状态
  var rifts = [], inRift = false, riftReturn = null, riftSnapshot = null, riftRoom = null, riftLoot = [], riftPrompt = false, riftExit = null, riftWaves = null, riftTrapT = 0, riftHidden = null, riftRect = null, riftStuckT = 0;
  var RIFT_DEADLOCK_T = 60; // #381-③ 裂隙防死锁安全阀：房间 60s 无法完成（riftExit 未生成）→ 自动强制脱离，杜绝玩家永久困住
  var riftActive = null; // 当前弹窗绑定的裂缝引用（取消后触发冷却）
  var vaultPrompt = false, vaultCd = 0; // 磁锁秘库·投喂借力开门交互状态
  var VAULT_JADE_COST = 30; // 支付灵玉开门的代价
  var VAULT_PROMPT_R = 150; // #381-② 磁锁秘库开门弹窗触发半径：仅玩家距秘库中心 <150px 才允许弹（E 键与 update 两处共用）
  var VAULT_SPAWN_CHANCE = 0.3; // #381-④ 磁锁秘库小概率随机刷新（Boss 拍板：小概率出现，但出现即高概率出好东西）
  var combatTimer = 0;
  var enemiesSlowT = 0, enemiesSlowFactor = 1;
  var lootCap = 22, invMax = 8; // invMax = 背包格子数（§4：有限格子逼出取舍）
  var DASH_DUR = 0.62; // 冲刺（闪避）时长：速度由 ease-out 爬升至 1.8× 基础，杜绝瞬移
  // ===== #199 机体手感加重：命名常量（消除魔数），"重但可控" =====
  var PLAYER_SPEED_MULT = 1.05;  // 略提极速（+5%），重拖拽后补偿巡航速度，保持动量
  var PLAYER_ACCEL_SAME = 12;    // 同向加速率（旧 15→12：略降加速度，"蓄力才有动量"的重量感）
  var PLAYER_ACCEL_TURN = 18;    // 反向/急转加速率（旧 22→18：转身仍灵敏，保持响应）
  var PLAYER_DECEL = 14;         // 无输入线性减速率（旧 9→14：松手减速更果断=踏实，不再长滑行）
  // 起承转合·围猎（转幕）狂暴系数：伤害×1.4、血量×1.3，配合红色脉冲环 + 周期猎杀预警
  var HUNT_DMG = 1.25, HUNT_HP = 1.3, HUNT_WARN_INT = 16; // #B2：狂暴增伤 1.4→1.25，降低转幕断层
  // 灵脉共振（v11）：增益型地图资源区——每系一条灵脉，吸收喂羁绊/觉醒/绝技，四幕演变规则
  var VEIN_N = 5, VEIN_R = 120, VEIN_ABSORB_R = 34, VEIN_CD = 45, VEIN_AURA_DOM = 0.10, VEIN_AURA_OFF = 0.04, VEIN_ULT_GAIN = 20;
  // ---------- 灵潮构筑流核心参数（玩法重构 v10）----------
  // 灵潮连击：连杀窗口内叠伤害加成（上限 +40%），受击即断——风险换爆发
  var COMBO_WINDOW = 4.0, COMBO_WINDOW_ZHUAN = 5.2;   // 转/合幕窗口放宽（对抗围猎压力）
  var COMBO_DMG_PER = 0.008, COMBO_DMG_CAP = 0.40;    // 每连击 +0.8% 伤害，封顶 +40%
  var COMBO_MILESTONES = [10, 25, 50];                // 里程碑反馈（震屏+顿帧+飘字）
  // 绝技（J）：击杀充能；流派随主元素变化，构筑决定大招形态
  var ULT_MAX = 100, ULT_KILL_GAIN = 3.2, ULT_COMBO_GAIN = 0.09; // 高连杀显著加速充能
  var ULT_NAMES = { '火': '离火·燎原', '水': '坎水·潮盾', '雷': '震雷·天罚', '风': '巽风·千羽', '土': '坤土·镇岳' };
  // 流派觉醒：单局内某系首次满 4 阶 → 永久 +15% 攻击 + 绝技充满 + 25% 回血（构筑 payoff 时刻）
  var EVOLVE_ATK = 0.15, EVOLVE_HEAL = 0.25;

  // ===== 相位潮汐 Phase Tide（悬圃·蚀空区块 关卡机制，见 design/level-design-xuantu-raid.md）=====
  var PHASE = { GOLD: 'gold', EMBER: 'ember' };
  var PHASE_GOLD_DUR = 22, PHASE_EMBER_DUR = 18, PHASE_TRANS = 1.5, EMBER_OPEN_WIN = 8, PILLAR_CD = 60, SAFETY_TIME = 720;
  // —— 相位赌注·重做（§7）新增常量 ——
  var CORE_CAP = 3, CORE_START = 2, CORE_PER_FLIP = 1, CORE_REGEN = 30, CORE_REGEN_GOLD_MULT = 2;
  var EMBER_EXFIL_DELAY = 2.5, AUTO_EMBER_WIN_DELAY = 4.0, AUTO_EMBER_WIN_LEN = 4.0, AUTO_UNCONTROLLED_DMG = 1.15;
  var EMBER_ENRAGE_ATK_RATE = 1.4, EMBER_ENRAGE_BULLET_SPD = 1.15, EMBER_ENRAGE_DMG = 1.25, EMBER_PLAYER_DMG_TAKEN = 1.3;
  var EMBER_AGGRO_RADIUS = 260, EMBER_AGGRO_DUR = 8.0;
  var PILLAR_AGGRO_RADIUS = 300, PILLAR_AGGRO_DUR = 8.0;
  var DEVOUR_ZONE_R = 40, DEVOUR_HOLD = 2.5, DEVOUR_DOT = 6, DEVOUR_PULL_SPD = 60;
  // === 三大机制商业级强化常量 (v12) ===
  var GRAV_RADIUS = 280, GRAV_CORE = 40, GRAV_K = 46000, GRAV_TEAR_DMG = 12;   // 引力裂缝：牵引半径/核心/引力常数/核心撕裂真伤
  var GRAV_FMAX = 1100, GRAV_ORBIT = 380, GRAV_PUSH = 140;   // v12 逃逸机制：引力上限 / 核心切向公转强度 / 离心外推强度
  var GRAV_BREAK = 1500;                                     // v12.5 冲刺挣脱：冲刺期向外冲量，单次冲刺稳定脱离 280px 牵引圈
  var CAM_LERP = 7;                                          // 相机平滑跟随系数（越大越跟手）
  var PILLAR_CHARGE_R = 160, PILLAR_CHARGE_RATE = 34, PILLAR_OVERLOAD_CD = 15, PILLAR_OVERLOAD_R = 360, PILLAR_OVERLOAD_DMG = 95; // 相位柱：充能半径/速率/过载冷却/脉冲半径/伤害
  var FLIP_IFRAME = 0.35, FLIP_GHOST_N = 4, PHASE_COUNTER_MULT = 1.5;         // 翻相：无敌帧/残影数/异相克制倍率
  // v12.7 战斗平衡重构：敌人伤害基数集中常量（便于 Boss 调参）
  var EDMG_NORMAL = 25, EDMG_ELITE = 72, EDMG_HEAVY = 120;
  var _lsCd = 0;        // 吸血内置冷却计时器（v12.7）
  var _lowHpT = 0;      // 残血心跳微震计时器（v12.7）
  var phase = PHASE.GOLD, phaseTimer = PHASE_GOLD_DUR, phaseTransT = 0, emberOpenWindow = 0;
  var phaseCore = CORE_START, phaseCoreRegen = 0;            // 相位核心充能（上限3/初始2/耗1/30s回1·鎏金×2）
  var activeEmber = false, emberPlayerMult = 1.0;            // 主动翻余烬旗标 / 余烬相受击增幅
  var exfilDelayT = 0, autoEmberWindowLen = AUTO_EMBER_WIN_LEN;
  var aggroT = 0, aggroRadius = 0, aggroX = 0, aggroY = 0, aggroFollow = false;  // Boss 仇恨集中
  var phaseMix = 0;                                          // 全图调色 lerp（0 金 / 1 余烬）
  var phasePillars = [], gravityRifts = [], secretVault = null;
  var weaverRifts = [];            // v12.6：引力编织者微型奇点球（临时拖拽，独立数组，不影响主线引力裂缝语义）
  var devourBorrowUsed = false;
  function enterPhase(p) {
    phase = p; phaseTransT = PHASE_TRANS;
    screenFlash = { color: p === PHASE.EMBER ? '#C8642A' : '#C9A24B', a: 0.32 };
    if (p === PHASE.EMBER) {
      phaseTimer = PHASE_EMBER_DUR; if (hasAffix('tide_fast')) phaseTimer *= 0.6; // 深渊异变·潮汐：周期缩短40%
      setBanner('相位翻转 · 余烬相', 1.4);
    } else {
      phaseTimer = PHASE_GOLD_DUR; if (hasAffix('tide_fast')) phaseTimer *= 0.6; // 深渊异变·潮汐：周期缩短40%
      emberOpenWindow = 0; closeExtractPoints();
      setBanner('相位翻转 · 鎏金相（安全 · 蓄能）', 1.4);
    }
  }
  // 撤离点：整图翻相位时统一开关（窗长与相位窗口对齐）
  // v15.1 修复：v12.6 撤离锁死下，sealed 撤离点**不得**被相位开窗拉进计时循环（open→closed→warning 循环
  // 会使 activateEvacBeacon 的解锁条件永不匹配 → 杀 Boss 后 beacon 无法激活）。仅对已非 sealed 的点兼容旧行为。
  function openExtractPoints() {
    if (!extractPoints) return;
    for (var _oi = 0; _oi < extractPoints.length; _oi++) { var _z = extractPoints[_oi]; if (_z.state === 'sealed') continue; _z.state = 'open'; _z.timer = emberOpenWindow > 0 ? emberOpenWindow : EXTRACT.openDur; _z.prog = 0; }
  }
  function closeExtractPoints() {
    if (!extractPoints) return;
    for (var _ci = 0; _ci < extractPoints.length; _ci++) { var _c = extractPoints[_ci]; if (_c.state === 'open') { _c.state = 'closed'; _c.timer = rand(EXTRACT.gapMin, EXTRACT.gapMax); _c.prog = 0; } }
  }
  // 相位赌注·核心翻转（唯一相位翻转入口，区分主动/失控）
  // opts: { active:bool, source:'auto'|'pillar'|'core'|'kill'|'safety', openWindow:number(可选,立即开窗) }
  function doFlip(target, opts) {
    opts = opts || {};
    enterPhase(target);
    emberOpenWindow = 0; closeExtractPoints(); exfilDelayT = 0;
    if (target === PHASE.EMBER) {
      activeEmber = !!opts.active;
      emberPlayerMult = activeEmber ? EMBER_PLAYER_DMG_TAKEN
        : (opts.openWindow != null ? 1.0 : (opts.source === 'pillar' ? 1.0 : AUTO_UNCONTROLLED_DMG));
      if (opts.openWindow != null) {
        emberOpenWindow = opts.openWindow; openExtractPoints();           // kill / safety：立即满窗
      } else if (activeEmber) {
        exfilDelayT = EMBER_EXFIL_DELAY;                                  // 主动翻余烬：2.5s 后开 8s 窗
      } else if (opts.source === 'auto') {
        exfilDelayT = AUTO_EMBER_WIN_DELAY; autoEmberWindowLen = AUTO_EMBER_WIN_LEN;  // 自动翻：降级（延4s/窗4s）
      } // pillar：不开窗（撤离仍须靠核心）
      if (activeEmber) setAggro(EMBER_AGGRO_RADIUS, EMBER_AGGRO_DUR, true);  // 260px 仇恨集中于玩家（至翻回鎏金）
      AudioSys.sfx.phaseFlip(true);
    } else {
      activeEmber = false; emberPlayerMult = 1.0; setAggro(0, 0, false);    // 鎏金：平复 Boss、清仇恨、关窗
      AudioSys.sfx.phaseFlip(false);
    }
    onPhaseFlipped(target);
  }
  // 翻相反馈（商业级）：0.35s 无敌帧 + 多重残影 + 同心圆相变冲击波震碎近身弹幕 + 全屏微震
  function onPhaseFlipped(p) {
    player.iframe = Math.max(player.iframe || 0, FLIP_IFRAME);
    var col = p === PHASE.EMBER ? '#C8642A' : '#C9A24B';
    for (var _r = 0; _r < 3; _r++) spawnRing(player.x, player.y, col, 60 + _r * 46);
    burst(player.x, player.y, col, 18, { ring: true, ringR: 90, r0: 10 });
    var gx = player.vx, gy = player.vy, gl = Math.hypot(gx, gy) || 1;
    for (var _g = 0; _g < FLIP_GHOST_N; _g++) {
      var off = (_g + 1) * 10;
      playerGhosts.push({ x: player.x - (gx / gl) * off, y: player.y - (gy / gl) * off, ang: player.ang, bank: player.bankSmooth, t: 0, life: 0.5 });
    }
    if (playerGhosts.length > 40) playerGhosts.splice(0, playerGhosts.length - 40);
    for (var _b = bullets.length - 1; _b >= 0; _b--) {
      var _bl = bullets[_b];
      if (_bl.from === 'enemy' && dist2(_bl.x, _bl.y, player.x, player.y) < 200 * 200) {
        burst(_bl.x, _bl.y, col, 3, { smin: 30, smax: 90 });
        bullets.splice(_b, 1);
      }
    }
    addShake(4, 200, 80);
    floatText(player.x, player.y - 50, p === PHASE.EMBER ? '余烬相！' : '鎏金相！', col, 'crit');
  }
  function setAggro(radius, dur, follow, x, y) {
    aggroRadius = radius; aggroT = dur; aggroFollow = !!follow; aggroX = x || 0; aggroY = y || 0;
  }
  // 玩家主动：献祭 1 相位核心翻转鎏金↔余烬（默认键 F）
  function tryActiveFlip() {
    if (scene !== 'mission' || paused) return;
    if (phaseCore < CORE_PER_FLIP) {
      setBanner('相位核心不足！(按 R 翻相位·每翻耗 1 核心)', 1.6);
      AudioSys.sfx.denied();
      return;
    }
    phaseCore -= CORE_PER_FLIP;
    doFlip(phase === PHASE.GOLD ? PHASE.EMBER : PHASE.GOLD, { active: true, source: 'core' });
  }
  // 相位柱 / 引力裂隙 / 磁锁秘库 布点（随 tier 微调位置密度）
  function spawnPhaseObjects() {
    phasePillars = []; gravityRifts = []; secretVault = null; weaverRifts = [];
    // #381-⑤ 相位柱 3→5 根：均匀分布地图（上下两排错开），金/余烬亲和交替（金3 余烬2），由分离 pass 兜底间距
    var pAnchors = [
      { x: WORLD_W * 0.16, y: WORLD_H * 0.20 },
      { x: WORLD_W * 0.48, y: WORLD_H * 0.14 },
      { x: WORLD_W * 0.82, y: WORLD_H * 0.22 },
      { x: WORLD_W * 0.30, y: WORLD_H * 0.66 },
      { x: WORLD_W * 0.72, y: WORLD_H * 0.62 }
    ];
    var pillarAff = [PHASE.GOLD, PHASE.EMBER, PHASE.GOLD, PHASE.EMBER, PHASE.GOLD];
    for (var i = 0; i < pAnchors.length; i++) phasePillars.push({ x: pAnchors[i].x, y: pAnchors[i].y, r: 26, cd: 0, affinity: pillarAff[i % pillarAff.length], charge: 0, overloadCd: 0, overloadFlash: 0 });
    var gAnchors = [
      { x: WORLD_W * 0.46, y: WORLD_H * 0.20 },
      { x: WORLD_W * 0.22, y: WORLD_H * 0.60 },
      { x: WORLD_W * 0.78, y: WORLD_H * 0.56 }
    ];
    for (var j = 0; j < gAnchors.length; j++) gravityRifts.push({ x: gAnchors[j].x, y: gAnchors[j].y, r: 70, pull: GRAV_RADIUS, core: GRAV_CORE, tearT: 0, spin: rand(0, 6.28), pulse: 0 });
    // #381-④ 磁锁秘库：小概率随机刷新（30%）+ 随机锚点（偏右下开阔区，避免贴出生点）；
    // 不生成则本局无秘库（搜刮/熔炼成为主要装备来源，回应 Boss 对"刷装备意义"的质疑）
    if (Math.random() < VAULT_SPAWN_CHANCE) {
      secretVault = { x: WORLD_W * (0.66 + Math.random() * 0.24), y: WORLD_H * (0.62 + Math.random() * 0.28), r: 34, opened: false };
    } else {
      secretVault = null;
    }
    // POI 最小间距分离 pass（E）：强制 相位柱 / 引力裂缝 / 秘库 两两间距 ≥ 700px，且均远离出生点（避免开局即触发秘库弹窗）
    (function separatePOIs() {
      var pts = [];
      for (var i = 0; i < phasePillars.length; i++) pts.push({ ref: phasePillars[i], pri: 0 });
      for (var j = 0; j < gravityRifts.length; j++) pts.push({ ref: gravityRifts[j], pri: 1 });
      if (secretVault) pts.push({ ref: secretVault, pri: 2 });
      var MIN = 700, MIN_SPAWN = 320;
      for (var iter = 0; iter < 300; iter++) {
        var moved = false;
        for (var a = 0; a < pts.length; a++) {
          for (var b = a + 1; b < pts.length; b++) {
            var A = pts[a].ref, B = pts[b].ref;
            var dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
            if (d < MIN) {
              var mover, fixed;
              if (pts[a].pri < pts[b].pri) { mover = B; fixed = A; }
              else if (pts[b].pri < pts[a].pri) { mover = A; fixed = B; }
              else { mover = B; fixed = A; } // 同级冲突：移动后者
              var ox = mover.x - fixed.x, oy = mover.y - fixed.y, od = Math.hypot(ox, oy) || 1;
              var push = (MIN - od) + 2;
              mover.x = clamp(mover.x + (ox / od) * push, 80, WORLD_W - 80);
              mover.y = clamp(mover.y + (oy / od) * push, 80, WORLD_H - 80);
              moved = true;
            }
          }
          // 与出生点的最小安全距离（出生点固定，仅外推 POI；秘库尤其须避开，否则开局即弹窗）
          var A2 = pts[a].ref;
          var dsx = A2.x - spawnPoint.x, dsy = A2.y - spawnPoint.y, ds = Math.hypot(dsx, dsy) || 1;
          if (ds < MIN_SPAWN) {
            var pushS = (MIN_SPAWN - ds) + 2;
            A2.x = clamp(A2.x + (dsx / ds) * pushS, 80, WORLD_W - 80);
            A2.y = clamp(A2.y + (dsy / ds) * pushS, 80, WORLD_H - 80);
            moved = true;
          }
        }
        if (!moved) break;
      }
    })();
    // #381-⑤ 相位柱存在感：开局 banner 提示布阵（站圈充能→过载清屏，过载有法器奖励）
    setBanner('相位柱已布阵 ×' + phasePillars.length + '：站圈充能→过载清屏，奖励法器', 3.4);
  }
  // 吞噬借力：把全厅松散战利品吸向玩家 + 触发成就 + 开磁锁秘库
  function triggerDevourBorrow(b) {
    for (var i = 0; i < loot.length; i++) {
      var L = loot[i];
      var dx = player.x - L.x, dy = player.y - L.y, d = Math.hypot(dx, dy) || 1;
      var pull = clamp(480 / d, 80, 700);
      L.vx += (dx / d) * pull; L.vy += (dy / d) * pull;
    }
    if (!devourBorrowUsed) {
      devourBorrowUsed = true;
      if (!meta.devourBorrow) { meta.devourBorrow = true; saveMeta(); }
      setBanner('以彼之道 · 吞噬借力！', 2.4);
      floatText(player.x, player.y - 46, '成就解锁：以彼之道', '#C9A24B', 'crit');
      addTint('#C9A24B', 0.25);
    }
    phaseObjectFeedback('rift', player.x, player.y);
  }
  // 磁锁秘库·投喂借力开门（§5：显式交互，玩家需主动投喂装备或支付灵玉）
  // #381-④ Boss 拍板：从"必出传说武器"改为"高概率高品质"——
  //   50% 传说武器 + 橙装（传说率随 tierDropBonus 每层 +4% 抬升，封顶 60%）
  //   40% 橙装双件
  //   10% 紫装群
  function openSecretVault() {
    if (!secretVault || secretVault.opened) return;
    secretVault.opened = true;
    var roll = Math.random();
    var legChance = Math.min(0.6, 0.5 + tierDropBonus(run ? run.tier : 1)); // 保 40% 给橙装分支
    if (roll < legChance) {
      var legKeys = Object.keys(LEGENDARY_WEAPONS);
      var lw = LEGENDARY_WEAPONS[legKeys[randi(0, legKeys.length - 1)]];
      dropLoot(secretVault.x, secretVault.y, lw.rarity, 'legendary_weapon', lw);
      dropLoot(secretVault.x + rand(-12, 12), secretVault.y + rand(-12, 12), 'orange', 'artifact');
      setBanner('磁锁秘库开启 · 传说武器降世！（投喂借力成功）', 2.8);
      floatText(secretVault.x, secretVault.y - 30, '★★ 传说!', '#FFE9A8', 'crit');
    } else if (roll < legChance + 0.4) {
      dropLoot(secretVault.x, secretVault.y, 'orange', 'artifact');
      dropLoot(secretVault.x + rand(-14, 14), secretVault.y + rand(-14, 14), 'orange', 'artifact');
      setBanner('磁锁秘库开启 · 双橙法器！（投喂借力成功）', 2.8);
      floatText(secretVault.x, secretVault.y - 30, '★★ 双橙!', '#FF9A6B', 'crit');
    } else {
      for (var _vp = 0; _vp < 4; _vp++) dropLoot(secretVault.x + rand(-18, 18), secretVault.y + rand(-18, 18), 'purple', 'artifact');
      setBanner('磁锁秘库开启 · 紫装成群！（投喂借力成功）', 2.8);
      floatText(secretVault.x, secretVault.y - 30, '★★ 紫装群!', '#C79BE8', 'crit');
    }
    phaseObjectFeedback('vault', secretVault.x, secretVault.y);
  }

  function tierMul(tier) { return 1 + (tier - 1) * 0.45; } // 敌人HP倍率：每层 +45%（v14.3 改签名接参数，基地态 run=null 不再崩）
  function tierDmgMul(tier) { return 1 + (tier - 1) * 0.30; } // 敌人攻击倍率：每层 +30%（v14.3 改签名）
  // ====== 深渊异变·词缀系统（确定性分配：按池顺序每 2 层追加 1 条，Tier 3 起生效） ======
  // ★ 371 修复：更名为 AFFIX_DEFS，避免覆盖 rollMods 依赖的 AFFIX_POOL 装备词缀池（否则任何带战利品结算必崩）
  var AFFIX_DEFS = [
    { key: 'frenzy',        name: '极速',      icon: '⚡', col: '#C8642A', desc: '敌怪移动速度 +20%' },
    { key: 'volatile_all',  name: '自爆',      icon: '💥', col: '#C94F4F', desc: '杂兵阵亡 30% 概率自爆' },
    { key: 'tide_fast',     name: '潮汐',      icon: '🌊', col: '#4E8FC7', desc: '相位交替周期缩短 40%' },
    { key: 'gravity_surge', name: '引力潮涌',  icon: '🕳', col: '#B06FD0', desc: '引力裂缝吸力与伤害 +50%' }
  ];
  function tierAffixCount(tier) { return tier >= 3 ? Math.min(4, 1 + Math.floor((tier - 3) / 2)) : 0; } // 3-4层1条 5-6层2条 7-8层3条 9+层4条
  function tierAffixes(tier) { var n = tierAffixCount(tier), arr = []; for (var i = 0; i < n; i++) arr.push(AFFIX_DEFS[i].key); return arr; } // 确定性：按池顺序每2层追加1条
  function hasAffix(key) { return !!(run && run.affixes && run.affixes.indexOf(key) >= 0); } // 词缀守卫：仅局内且含该词缀时生效（基地态 run=null 恒 false）
  function phaseDurNow() { return (phase === PHASE.EMBER ? PHASE_EMBER_DUR : PHASE_GOLD_DUR) * (hasAffix('tide_fast') ? 0.6 : 1); } // B2 修复：潮汐词缀周期 ×0.6，张力条分母随实际周期（避免 tide_fast 下分母失真）
  function tierDropBonus(tier) { return Math.min(0.35, (tier - 1) * 0.04); } // 传说/史诗掉落权重：每层 +4%，上限 35%
  function tierOreBonus(tier) { return 1 + (tier - 1) * 0.5; } // 灵矿产出加成：每层 +50%
  function tierTitle(t) { return t === 1 ? 'Tier 1【入门·潜入】' : t === 2 ? 'Tier 2【进阶·蚀空】' : 'Tier ' + t + '【深渊 ' + (t - 2) + ' 层】'; } // 基地出击面板标题（Tier 3+ 深渊层从 1 起，独立于 tierName）

  // ====== 统一伤害公式 ======
  // 乘区A 基础攻击力 = 机体基础 + 永久升级 + 装备词条 (加法, 上限 240)
  // 乘区B 研究/符文倍率 = player.atkMult (乘法积累, 无独立上限)
  // 乘区C 羁绊共鸣 = elemResonance() (乘法)
  // 乘区D 暴击 = crit ? critMult : 1 (乘法)
  // 乘区E 稀有度系数 = 1 + Σ(装备稀有度索引 × 0.03) (乘法)
  // 乘区F 处决 = (目标 HP < 50% && player.execute) ? 2.0 : 1 (乘法)
  // 弹片分配: 青隼 ×0.5 / 玄武 ×1÷3 / 赤鸾 ×1
  // 总上限: rawBonus > 300% 时超出部分 × 0.3 衰减
  var DMG_CAP_BONUS = 3.0;
  var DMG_CAP_DECAY = 0.3;

  function rarityCoeff() {
    var c = 1;
    if (!meta || !meta.equipped) return c;
    for (var si = 0; si < SLOTS.length; si++) {
      var id = meta.equipped[SLOTS[si]]; if (!id) continue;
      var art = null;
      for (var i = 0; i < meta.arsenal.length; i++) if (meta.arsenal[i].id === id) { art = meta.arsenal[i]; break; }
      if (art) c += RAR.indexOf(art.rarity) * 0.03;
    }
    return c;
  }

  // 有效攻击力 = 基础 × 研究符文倍率 (用于天罚/击杀爆炸等非弹道伤害)
  function effAtk() { return player.dmg * (player.atkMult || 1); }

  // 统一伤害计算: 传入子弹基础伤害(已含弹片分配)、暴击标记、目标
  function calcDamage(baseDmg, crit, target) {
    var atkMult = player.atkMult || 1;
    var bond = elemResonance();
    var critMul = crit ? Math.min(player.critMult || 2, 3.0) : 1; // #B6 修复：暴击倍率上限 3.0，防后期刀刀烈火秒 Boss
    var rar = rarityCoeff();
    // #Boss-HP-v2：处决对普通敌仍 ×2 斩杀，但对 Boss 只 ×1.4——防下半管血雪崩式蒸发
    var exec = (player.execute && target && target.hp < target.maxhp * 0.5) ? (target.kind ? 1.4 : 2.0) : 1.0;
    var comboMul = 1 + Math.min(COMBO_DMG_CAP, (player.combo || 0) * COMBO_DMG_PER); // 灵潮连击：连杀爆发乘区
    var rawMulti = atkMult * bond * critMul * rar * exec * comboMul * veinAuraMul(); // 灵脉光环（v11）：站圈增伤，受下方软上限管辖
    var rawBonus = rawMulti - 1;
    var cappedBonus = rawBonus > DMG_CAP_BONUS ? DMG_CAP_BONUS + (rawBonus - DMG_CAP_BONUS) * DMG_CAP_DECAY : rawBonus;
    return baseDmg * (1 + cappedBonus);
  }

  // ---------- 地形障碍（山海墨玉：掩体礁石 + 灵脉裂隙）----------
  var obstacles = [];
  var buildingRooftops = [];   // 锚点簇 PCG：主塔楼楼顶停机坪锚点（供宝箱/封印柱/撤离点优先锚定）
  // 空域：开阔天空，无房间/走廊结构。飞机在天空自由飞行，仅受障碍物与地图边界约束。
  var spawnPoint = { x: WORLD_W / 2, y: WORLD_H - 150 };

  function genMapLayout() {
    obstacles = [];
    buildingRooftops = [];
    spawnPoint = { x: WORLD_W / 2, y: WORLD_H - 150 };
  }


  // 视线遮挡射线检测（Line of Sight）：两点连线是否与建筑墙体（type==='wall'）相交。
  // 供狙击手断线重索敌、普通敌机盲区双倍衰减警戒调用。
  function pointClearOfWalls(x, y, r) {
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      if (ob.type !== 'wall') continue;
      if (Math.abs(x - ob.x) < ob.hw + r && Math.abs(y - ob.y) < ob.hh + r) return false;
    }
    return true;
  }
  // 线段 vs 轴对齐矩形（Liang–Barsky）：相交（含端点在内）返回 true
  function segRectHit(x1, y1, x2, y2, minx, miny, maxx, maxy) {
    var dx = x2 - x1, dy = y2 - y1, t0 = 0, t1 = 1;
    var pp = [-dx, dx, -dy, dy];
    var qq = [x1 - minx, maxx - x1, y1 - miny, maxy - y1];
    for (var i = 0; i < 4; i++) {
      var p = pp[i], q = qq[i];
      if (p === 0) { if (q < 0) return false; }
      else { var r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
    }
    return t0 <= t1;
  }
  function checkLineOfSight(x1, y1, x2, y2) {
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      if (ob.type !== 'wall') continue;
      if (segRectHit(x1, y1, x2, y2, ob.x - ob.hw, ob.y - ob.hh, ob.x + ob.hw, ob.y + ob.hh)) return false;
    }
    return true;
  }

  function generateObstacles() {
    // 锚点簇 PCG（Anchor Cluster PCG）：废除碎石散点，规划都市楼宇核心锚点 +
    // 复合楼宇预制（主塔楼 + L/凹型裙楼 Safe Pocket）+ 空中主干道 Skyways（严格 220~280px）。
    var t = run ? run.tier : 1;
    var N = 5 + (Math.random() * 3 | 0); // 5~7 个核心锚点
    buildingRooftops = [];
    var extractAnchors = [
      { x: WORLD_W * 0.5, y: WORLD_H * 0.16 },
      { x: WORLD_W * 0.16, y: WORLD_H * 0.44 },
      { x: WORLD_W * 0.84, y: WORLD_H * 0.44 }
    ];
    var plaza = { x: WORLD_W * 0.5, y: WORLD_H * 0.54 }; // 中央广场（开阔空域，留白）
    var anchors = [];
    var minDist = Math.max(560, WORLD_W * 0.2); // 楼宇跨度 + 空中主干道(220~280)：扣除塔楼半幅后仍留净走廊
    function tryPlace(minD) {
      var tries = 0;
      while (anchors.length < N && tries < 900) {
        tries++;
        var x = rand(WORLD_W * 0.13, WORLD_W * 0.87);
        var y = rand(WORLD_H * 0.24, WORLD_H * 0.82); // 避开顶部撤离带(y<0.2H)与出生(bottom)
        if (dist2(x, y, spawnPoint.x, spawnPoint.y) < 360 * 360) continue; // 避开出生点（下方中央）
        var bad = false;
        for (var ei = 0; ei < extractAnchors.length; ei++) if (dist2(x, y, extractAnchors[ei].x, extractAnchors[ei].y) < 300 * 300) { bad = true; break; }
        if (bad) continue;
        if (dist2(x, y, plaza.x, plaza.y) < 280 * 280) continue; // 中央广场留白
        for (var ai = 0; ai < anchors.length; ai++) if (dist2(x, y, anchors[ai].x, anchors[ai].y) < minD * minD) { bad = true; break; }
        if (bad) continue;
        anchors.push({ x: x, y: y });
      }
    }
    tryPlace(minDist);
    if (anchors.length < 5) tryPlace(minDist * 0.85);
    if (anchors.length < 5) tryPlace(minDist * 0.7);

    // 复合楼宇预制组装（直接注入已有的 obstacles 墙体数组，碰撞解算管线不变）
    for (var bi = 0; bi < anchors.length; bi++) {
      var ax = anchors[bi].x, ay = anchors[bi].y;
      var TW = rand(208, 258), TH = rand(140, 182);
      var cx = clamp(ax + rand(-16, 16), 80, WORLD_W - 80);
      var cy = clamp(ay + rand(-16, 16), 80, WORLD_H - 80);
      // 主塔楼：大型实心矩形（楼顶停机坪）
      obstacles.push({ type: 'wall', x: cx, y: cy, hw: TW / 2, hh: TH / 2, building: true, helipad: true, seed: rand(0, 1) });
      // L / 凹型裙楼：右侧竖裙 + 底部横裙 → 天然拐角安全区（Safe Pocket）
      var skW = rand(64, 104), skH = rand(40, 66);
      obstacles.push({ type: 'wall', x: clamp(cx + TW / 2 + skW / 2 + 8, 80, WORLD_W - 80), y: clamp(cy + rand(-26, 26), 80, WORLD_H - 80), hw: skW / 2, hh: skH / 2, building: true, skirt: true });
      obstacles.push({ type: 'wall', x: clamp(cx + rand(-18, 44), 80, WORLD_W - 80), y: clamp(cy + TH / 2 + skH / 2 + 8, 80, WORLD_H - 80), hw: skW / 2, hh: skH / 2, building: true, skirt: true });
      // 楼顶停机坪锚点（主塔楼正上方开阔空域，战机可飞抵“落地”）
      buildingRooftops.push({ x: cx, y: cy - TH / 2 - 34, w: TW, h: TH });
    }

    // 灵脉裂隙：保留为刻意布置的空域危害区（落在开阔主干道/广场外围，绝不埋进楼体）
    var riftN = 2 + Math.floor(t / 2), rtry = 0;
    while (obstacles.filter(function (o) { return o.type === 'rift'; }).length < riftN && rtry < 500) {
      rtry++;
      var rr2 = rand(42, 70), rx2 = rand(110, WORLD_W - 110), ry2 = rand(110, WORLD_H - 110);
      if (!pointClearOfWalls(rx2, ry2, rr2 + 40)) continue;
      if (dist2(rx2, ry2, spawnPoint.x, spawnPoint.y) < 240 * 240) continue;
      if (dist2(rx2, ry2, plaza.x, plaza.y) < 120 * 120) continue;
      obstacles.push({ type: 'rift', x: rx2, y: ry2, r: rr2, dps: 9 + t * 2, col: '#B06FD0', pulse: rand(0, 6.28) });
    }
  }
  function resolveObstacles(ent, rad) {
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      if (ob.type === 'rock') {
        var dx = ent.x - ob.x, dy = ent.y - ob.y, d = Math.hypot(dx, dy), min = ob.r + rad;
        if (d < min && d > 0.001) { var push = min - d; ent.x += dx / d * push; ent.y += dy / d * push; }
        else if (d <= 0.001) { ent.x += min; }
      } else if (ob.type === 'wall') {
        var nx = clamp(ent.x, ob.x - ob.hw, ob.x + ob.hw), ny = clamp(ent.y, ob.y - ob.hh, ob.y + ob.hh);
        var ddx = ent.x - nx, ddy = ent.y - ny, dd = Math.hypot(ddx, ddy);
        if (dd < rad) {
          if (dd > 0.001) { var p2 = rad - dd; ent.x += ddx / dd * p2; ent.y += ddy / dd * p2; }
          else { // 中心点落在墙内：推向最近的一条边
            var lft = ent.x - (ob.x - ob.hw), rgt = (ob.x + ob.hw) - ent.x, top = ent.y - (ob.y - ob.hh), bot = (ob.y + ob.hh) - ent.y, m = Math.min(lft, rgt, top, bot);
            if (m === lft) ent.x = ob.x - ob.hw - rad; else if (m === rgt) ent.x = ob.x + ob.hw + rad; else if (m === top) ent.y = ob.y - ob.hh - rad; else ent.y = ob.y + ob.hh + rad;
          }
        }
      }
    }
  }

  // 轻量避障（steering）：朝目标方向移动前，探测前方 lookAhead 距离内是否有障碍挡住直线。
  // 若有，沿障碍切向叠加一个侧向分力，让敌人贴着障碍边缘滑行绕行，而不是正面撞上后被垂直推开。
  // 返回 [dirx, diry]（归一化方向向量），调用方用它累加到位移上。
  function avoidObstacles(ent, rad, tx, ty) {
    var dx = tx - ent.x, dy = ty - ent.y, d = Math.hypot(dx, dy) || 1;
    var ux = dx / d, uy = dy / d;
    var lookAhead = rad + 46;          // 前方探测距离（≈下一个障碍前的刹车窗口）
    var probeX = ent.x + ux * lookAhead, probeY = ent.y + uy * lookAhead;
    var best = null, bestPush = 0;
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      var dist, push;
      if (ob.type === 'rock') {
        dist = Math.hypot(probeX - ob.x, probeY - ob.y) - ob.r - rad;
        push = -dist;                  // 负数=靠得太近需推开
      } else if (ob.type === 'wall') {
        var nx = clamp(probeX, ob.x - ob.hw, ob.x + ob.hw), ny = clamp(probeY, ob.y - ob.hh, ob.y + ob.hh);
        dist = Math.hypot(probeX - nx, probeY - ny) - rad;
        push = -dist;
      } else continue;
      if (push > bestPush) { bestPush = push; best = ob; }
    }
    if (!best || bestPush <= 0) return { x: ux, y: uy }; // 前方无阻挡，直线飞
    // 前方有障碍：取"从实体指向实体"的法线作为绕行方向（沿切向滑开）
    var ox, oy;
    if (best.type === 'rock') { ox = probeX - best.x; oy = probeY - best.y; }
    else {
      var nx2 = clamp(probeX, best.x - best.hw, best.x + best.hw), ny2 = clamp(probeY, best.y - best.hh, best.y + best.hh);
      ox = probeX - nx2; oy = probeY - ny2;
    }
    var od = Math.hypot(ox, oy) || 1;
    var sx = ox / od, sy = oy / od;    // 障碍指向我方的单位向量（绕行主导方向）
    // 切向：旋转90°取与"朝目标方向"更顺的一个绕向，使敌人既想绕过障碍又继续逼近目标
    var tx2 = -sy, ty2 = sx;           // 切向之一
    // 与朝目标方向的点积决定选哪个绕向（选更接近前进方向的）
    var dotA = ux * tx2 + uy * ty2, dotB = ux * (-tx2) + uy * (-ty2);
    var wx2 = (dotA >= dotB ? tx2 : -tx2), wy2 = (dotA >= dotB ? ty2 : -ty2);
    var wd = Math.hypot(wx2, wy2) || 1;
    // 融合：法向推开 + 切向绕行，权重大小随逼近程度
    var m = Math.min(1, bestPush / (rad + 30));
    var mixX = ux * (1 - m * 0.6) + (sx * m) + (wx2 / wd) * m;
    var mixY = uy * (1 - m * 0.6) + (sy * m) + (wy2 / wd) * m;
    var mixD = Math.hypot(mixX, mixY) || 1;
    return { x: mixX / mixD, y: mixY / mixD };
  }

  // ---------- 特殊宝箱（三角洲式「干点儿事才能开」）----------
  var VAULT = { channel: 5.0, sealDefender: 1.25, sealDefenders: 7, runeTotemHp: 52 };
  // 封印宝箱：飞近 + 按住 E 解封，解封期持续刷围堵，顶住才开 → 保底高品质
  // 符文宝箱：环绕符文柱，击破全部才解锁 → 保底最高品质（好宝箱放特殊位置）
  function placeVaults(t) {
    vaults = []; totems = [];
    var cand = [
      { x: WORLD_W * 0.5, y: WORLD_H * 0.42 },
      { x: WORLD_W * 0.2, y: WORLD_H * 0.26 },
      { x: WORLD_W * 0.8, y: WORLD_H * 0.3 },
      { x: WORLD_W * 0.5, y: WORLD_H * 0.62 }
    ];
    // 优先锚定楼顶停机坪 / 中央广场（撤离点所在空域的高价值点）
    buildingRooftops.forEach(function (r) { cand.push({ x: r.x, y: r.y }); });
    cand.push({ x: WORLD_W * 0.5, y: WORLD_H * 0.54 }); // 中央广场
    var chosen = [], safeR = 320;
    for (var ci = 0; ci < cand.length && chosen.length < (t >= 3 ? 2 : 1); ci++) {
      var c = { x: cand[ci].x, y: cand[ci].y }, bad = false;
      if (dist2(c.x, c.y, player.x, player.y) < safeR * safeR) continue;
      for (var ni = 0; ni < nodes.length; ni++) if (dist2(c.x, c.y, nodes[ni].x, nodes[ni].y) < 130 * 130) { bad = true; break; }
      if (bad) continue;
      for (var zi = 0; zi < extractPoints.length; zi++) { var z = extractPoints[zi]; if (dist2(c.x, c.y, z.x + z.w / 2, z.y + z.h / 2) < (z.w / 2 + 120) * (z.w / 2 + 120)) { bad = true; break; } }
      if (bad) continue;
      for (var k = 0; k < chosen.length; k++) if (dist2(c.x, c.y, chosen[k].x, chosen[k].y) < 360 * 360) { bad = true; break; }
      if (bad) continue;
      chosen.push(c);
    }
    for (var vi = 0; vi < chosen.length; vi++) {
      var v = chosen[vi], type = vi % 2 === 0 ? 'seal' : 'rune';
      var vault = { x: v.x, y: v.y, r: 22, type: type, state: 'locked', prog: 0, defT: 0, defN: 0, totems: [], idx: vi };
      if (type === 'rune') {
        var nt = 2 + (t >= 3 ? 1 : 0);
        for (var ti = 0; ti < nt; ti++) {
          var a = ti / nt * 6.283;
          vault.totems.push({ x: v.x + Math.cos(a) * 80, y: v.y + Math.sin(a) * 80, r: 14, hp: VAULT.runeTotemHp + t * 16, maxhp: VAULT.runeTotemHp + t * 16, dead: false, vid: vi });
        }
        totems = totems.concat(vault.totems);
      } else {
        // 封印宝箱：预置守卫（遭遇制，不再凭空刷）——用标志位 vaultGuard 关联，唤醒时遍历 enemies 按 idx 匹配
        var nDef = 5;
        for (var di = 0; di < nDef; di++) {
          var da = (di / nDef) * 6.28 + rand(-0.4, 0.4), dd2 = rand(180, 300);
          var dx2 = clamp(v.x + Math.cos(da) * dd2, 30, WORLD_W - 30);
          var dy2 = clamp(v.y + Math.sin(da) * dd2, 30, WORLD_H - 30);
          var de = spawnEnemy(dx2, dy2, Math.min(2, t));
          de.wake = 0; de.alert = 0; de.homeX = dx2; de.homeY = dy2; de.patrolAng = rand(0, 6.28);
          de.vaultGuard = vi;
        }
      }
      vaults.push(vault);
    }
  }
  function checkVaultTotems(vid) {
    for (var i = 0; i < vaults.length; i++) { var v = vaults[i]; if (v.idx === vid) { var alive = v.totems.some(function (tm) { return !tm.dead; }); if (!alive && v.state !== 'done') openVault(v); return; } }
  }
  function openVault(v) {
    if (v.state === 'done') return; v.state = 'done';
    var drops = v.type === 'seal' ? (Math.random() < 0.5 ? ['purple', 'orange'] : ['purple', 'blue']) : ['orange', 'purple'];
    for (var i = 0; i < drops.length; i++) { run.loot.push({ rarity: drops[i], name: pickName(drops[i]), slot: pickSlot() }); run.picked++; }
    burst(v.x, v.y, '#E0B84A', 26, { ring: true, ringR: 64 }); addShake(4, 180, 80); AudioSys.sfx.chestOpen(4);
    screenFlash = { color: '#E0B84A', a: 0.4 };
    floatText(v.x, v.y - 28, v.type === 'seal' ? '封印解除！' : '符文共鸣！', '#E0B84A');
    setBanner((v.type === 'seal' ? '封印宝箱' : '符文宝箱') + ' 开启 · 获得高品质战利品', 2.4);
  }
  function updateVaults(dt) {
    for (var vi = 0; vi < vaults.length; vi++) {
      var v = vaults[vi]; if (v.state === 'done') continue;
      var d = Math.hypot(player.x - v.x, player.y - v.y), inRange = d < v.r + 42;
      if (v.type === 'seal') {
        var sealActive = isMobile ? inRange : (inRange && keys['e']);
        var emberSeal = (phase === PHASE.EMBER);
        if (!emberSeal) {
          // 鎏金相：封印锁死，进度清零
          if (v.state === 'opening') { v.state = 'locked'; v.prog = 0; }
          if (inRange && sealActive) setBanner('封印碑 · 余烬相方可破封', 1.0);
          continue;
        }
        if (v.state === 'locked') {
          if (sealActive) { v.state = 'opening'; v.prog = 0; setBanner('封印解封中…顶住围堵！', 1.4); for (var ei = 0; ei < enemies.length; ei++) { if (enemies[ei].vaultGuard === v.idx) { enemies[ei].wake = 0.4; enemies[ei].fireCd = rand(1.6, 2.8); } } }
        } else if (v.state === 'opening') {
          if (!sealActive) { v.state = 'locked'; v.prog = Math.max(0, v.prog - dt * 1.6); continue; }
          v.prog += dt / VAULT.channel;
          if (v.prog >= 1) openVault(v);
        }
      }
      // rune 类型由子弹击破符文柱触发 checkVaultTotems → openVault
    }
  }

  function newRun(aircraftId, tier) {
    WORLD_W = Math.max(3200, Math.round(W * 3.2)); WORLD_H = Math.max(2200, Math.round(H * 3.2));
    var a = AIRCRAFT[aircraftId]; var up = meta.up;
    var hp = a.hp + up.hp * 22, spd = a.speed + up.speed * 14, dmg = a.dmg + up.dmg * 3;
    var sh = 40 + up.shield * 14, pick = 46 * (1 + up.pickup * 0.15);
    player = {
      x: WORLD_W / 2, y: WORLD_H * 0.8, vx: 0, vy: 0, r: isMobile ? 7 : 14, hp: hp, maxhp: hp, shield: 0, maxshield: sh, regen: 5,
      lvl: 1, xp: 0, xpNeed: xpNeedForLevel(1),
      speed: spd, fireRate: a.fireRate, dmg: dmg, bulletSpeed: a.bulletSpeed,
      fireCd: 0, pickR: pick, iframe: 0, dashCd: 0, dashT: 0, dashDX: 0, dashDY: 0,
      // 武器形态
      pellets: a.pellets, spread: a.spread, pierce: 0, homing: a.homing, explode: 0,
      // 符文属性
      critChance: 0.04, critMult: 2.0, atkMult: 1, burn: 0, lifesteal: 0, chain: 0,
      dodgeChance: 0, reflect: 0, magnet: false, slowAuraR: 0, slowFactor: 1,
      thorns: 0, shieldRegen: 0,
      // v9 子类型/套装/传说武器
      spreadAngle: 0, falloff: 0, splashRatio: 0, homingTurnRate: 0, chainDecay: 0, chainRange: 0,
      dmgReduce: 0, blockChance: 0, dashCdReduce: 0, jadeBonus: 0, dropBonus: 0, elemBoost: 0,
      setMarkCrit: false, setStandStillReduce: 0, setStandStillAura: 0, setStandStillSlow: 0, setStandStillTime: 0,
      setDashTrail: false, setDashProj: 0, setDashIframeBonus: 0, setElemBonus: 0, setMergeGuaranteed2: false, setBondReduce: 0,
      activeSets: {}, legendaryPassive: null, legZhulongT: 0, legTaowuTriggered: false, standStillT: 0,
      drones: 0, droneList: [], droneCd: 0, droneDmgMult: 1, droneCdMult: 1,
      color: a.color, ang: -Math.PI / 2, buffs: [], runes: [], elements: {}, flash: 0, bank: 0, bankSmooth: 0, extractBonus: 0,
      attackAnimT: 0, attackSeq: 0, attackSide: 0, attackFired: [false, false], dashAnimT: 0, engineT: 0,
      consumables: [],
      bondTiers: {}, killExplode: 0, freezeChance: 0, skyStrike: 0, skyCd: 0, skyT: 0, gale: false, galeActive: false, outOfCombatT: 0,
      runeDefs: [], // #BP2：本局已拾取符文定义（含 .apply 闭包），供 recomputeRunStats 重放，避免重算时丢失符文加成
      execute: 0, overload: 0, undying: false, undyingUsed: false, guardShock: 0,
      // 灵潮构筑流（v10）：连击 / 绝技充能 / 流派觉醒
      combo: 0, comboT: 0, comboBest: 0, ultCharge: 0, evolved: {}, aimLineT: 0
    };
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    bullets = []; enemies = []; loot = []; resetParticles(); resetFloaters(); nodes = []; vaults = []; totems = [];
    extractPoints = []; exfil = false; boss = null; bossSpawned = false;
    combatTimer = 0; exfilStarted = false; exfilChoice = null; exfilChoicePending = null; exfilJadePenalty = 0; exfilAlarmT = 0; exfilCenter = null; exfilAutoT = 0; lootArrow = null; edgeArrow = null;
    rifts = []; inRift = false; riftReturn = null; riftSnapshot = null; riftRoom = null; riftLoot = []; riftPrompt = false; riftExit = null; riftWaves = null; riftTrapT = 0; riftHidden = null; riftActive = null;
    run = { loot: [], kills: 0, oreCollected: 0, picked: 0, time: 0, aircraft: aircraftId, tier: tier, affixes: tierAffixes(tier), nodes: 0, killedBoss: false, enemyKills: {}, pity: 0, lootBonus: 0, jade: 0, artBudget: randi(12, 20), equipped: { weapon: null, armor: null, core: null, ammo: null }, _uid: 0, pickupFilter: (meta && meta.pickupFilter ? meta.pickupFilter.slice() : [true, true, true, true, true]), selfDestruct: 0, evacBeacon: false, _riftSdFrozen: 0 };
    runPhase = 'qi'; huntActive = false; huntWarnT = 0; huntRamp = 1.0; phaseSpeedMul = 1.0; // 起承转合·重置幕章 + 围猎平滑系数
    // 相位潮汐初始化（悬圃·蚀空区块）；深渊异变·潮汐：含 tide_fast 时周期 ×0.6
    phase = PHASE.GOLD; phaseTimer = PHASE_GOLD_DUR; if (hasAffix('tide_fast')) phaseTimer *= 0.6; phaseTransT = 0; emberOpenWindow = 0; devourBorrowUsed = false;
    spawnTimer = 2.5; buffTimer = 0; buffPending = false; buffHold = 0; buffSafe = 0; gameTime = 0; hintTimer = 6; bannerQ.length = 0; runeCount = 0; killForBuff = runeNextReq(0); screenFlash = { color: '#fff', a: 0 };
    enemiesSlowT = 0;
    genMapLayout(); // 空域：清空障碍并设出生点
    generateObstacles(); // 锚点簇 PCG：先建楼宇锚点/楼顶/主干道，供节点/撤离/宝箱优先锚定
    player.x = spawnPoint.x; player.y = spawnPoint.y; // 出生在空域下方中央
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    placeNodes(6 + tier);
    placeVeins(); // 灵脉共振（v11）：每系一条增益资源区，铺在节点之间的开阔空域
    applyEquipped(); // 把已装备法器 + 研究院被动实打实叠到这局属性上
    invMax = 8 + (meta.tech && meta.tech.bag ? meta.tech.bag : 0); // 乾坤纳戒：背包扩容
    run._gearFull = snapshotGearBase(); // #BP2：抓取「已叠完 meta 装备+研究院」的战斗属性基线（不含符文/战损），供 recomputeRunStats 安全重算；局内换装在此基线上叠加，绝不回血
    spawnPhaseObjects(); // 相位柱 / 引力裂隙 / 磁锁秘库布点
    if (meta.runs === 0) { var ek = isMobile ? '点按' : '[E]'; showTip('<b>目标：</b>搜刮战利品 → 撤离带回法器。天空有<b>礁石掩体/隔断墙</b>可当掩护、<b>五行灵脉</b>（小地图菱形点）飞过即吸灵韵喂羁绊；<b>封印宝箱</b>按住' + ek + '解封（会刷敌）、<b>符文宝箱</b>击破环绕符文柱解锁，都在特殊位置、保底高品质。撤离点<b>限时开放</b>（光柱亮起才能走）。战利品改为<b>手动拾取</b>：靠近按' + ek + '或点按拾取（不再触碰即捡）', 5); }
    vfxLines.length = 0;
    recalcBonds();
    initExtractPoints(); // 三角洲式：限时开放撤离点（开局为关闭，按时间窗循环开放）
    placeVaults(tier); // 特殊位置放置封印/符文宝箱（好宝箱，需做任务解锁）
    placeEncounters(); // 遭遇制：按地点固定布置敌人（宝箱护卫 + 少量游荡机）
    placeRifts(); // 角落/边缘放置 1-2 个裂隙入口
    generateBounty(); // 局内动态悬赏：随机生成即时目标
    // ★ 深渊异变·词缀横幅：进入带词缀层级时开局提示（仅 Tier 3+ 有词缀）
    if (run.affixes.length > 0) {
      var _affTxt = run.affixes.map(function (k) {
        for (var _ai = 0; _ai < AFFIX_DEFS.length; _ai++) if (AFFIX_DEFS[_ai].key === k) return AFFIX_DEFS[_ai].icon + AFFIX_DEFS[_ai].name;
        return k;
      }).join(' ');
      setBanner('深渊异变：' + _affTxt, 3.2);
    }
  }

  function placeNodes(n) {
    var tries = 0;
    while (nodes.length < n && tries < 400) {
      tries++;
      var x, y, useRoof = buildingRooftops.length > 0 && Math.random() < 0.62;
      if (useRoof) {
        // 优先锚定在楼顶停机坪（主塔楼正上方开阔空域）
        var rf = buildingRooftops[nodes.length % buildingRooftops.length];
        x = rf.x + rand(-26, 26); y = rf.y + rand(-10, 10);
        if (!pointClearOfWalls(x, y, 30)) { x = rand(WORLD_W * 0.08, WORLD_W * 0.92); y = rand(WORLD_H * 0.08, WORLD_H * 0.6); }
      } else { x = rand(WORLD_W * 0.08, WORLD_W * 0.92); y = rand(WORLD_H * 0.08, WORLD_H * 0.6); }
      if (dist2(x, y, player.x, player.y) < 200 * 200) continue;
      if (nodes.some(function (nd) { return dist2(x, y, nd.x, nd.y) < 120 * 120; })) continue;
      var tier = clamp(1 + Math.floor(gameTime / 28), 1, 4);
      nodes.push({ x: x, y: y, r: 18, collected: false, respawn: 0, chest: rollChestTier(), pulse: rand(0, 6) });
    }
  }
  // ---------- 灵脉共振（v11）：增益型地图资源区 ----------
  var veins = [];
  function placeVeins() {
    veins = [];
    var els = Object.keys(ELEMCOL); // 火水雷风土——每系恰好一条，构筑有确定性锚点
    var tries = 0;
    while (veins.length < VEIN_N && tries < 400) {
      tries++;
      var x = rand(WORLD_W * 0.08, WORLD_W * 0.92), y = rand(WORLD_H * 0.08, WORLD_H * 0.9);
      if (dist2(x, y, player.x, player.y) < 200 * 200) continue;
      if (veins.some(function (v) { return dist2(x, y, v.x, v.y) < 260 * 260; })) continue;
      if (nodes.some(function (nd) { return dist2(x, y, nd.x, nd.y) < 100 * 100; })) continue;
      veins.push({ x: x, y: y, elem: els[veins.length % els.length], r: VEIN_R, cd: 0, corrupted: false, pulse: rand(0, 6.28) });
    }
  }
  function dominantElem() { var best = null, bc = 0; for (var el in player.elements) if (player.elements[el] > bc) { bc = player.elements[el]; best = el; } return best; }
  // 灵脉光环乘区：站进灵脉圈内小幅增伤（主系 +10%/副系 +4%，染污灵脉再 +8%），受 calcDamage 软上限管辖
  function veinAuraMul() {
    if (inRift || !veins.length) return 1;
    var dom = dominantElem(), m = 1;
    for (var i = 0; i < veins.length; i++) {
      var v = veins[i]; if (v.cd > 0) continue;
      if (dist2(player.x, player.y, v.x, v.y) < v.r * v.r) {
        if (dom && v.elem === dom) m = Math.max(m, 1 + VEIN_AURA_DOM + (v.corrupted ? 0.08 : 0));
        else m = Math.max(m, 1 + VEIN_AURA_OFF);
      }
    }
    return m;
  }
  function absorbVein(v) {
    v.cd = VEIN_CD;
    var gain = v.corrupted ? 2 : 1; // 转幕染污：灵韵翻倍，代价是惊动围猎
    player.elements[v.elem] = (player.elements[v.elem] || 0) + gain;
    var ug = VEIN_ULT_GAIN * (runPhase === 'qi' ? 2 : 1); // 起幕双倍充能，鼓励开局绕路规划
    player.ultCharge = Math.min(ULT_MAX, player.ultCharge + ug);
    recalcBonds();
    floatText(player.x, player.y - 30, '灵脉共振 ' + v.elem + ' +' + gain, ELEMCOL[v.elem]);
    floatText(v.x, v.y - 40, v.corrupted ? '染污灵脉 · 惊动围猎！' : '灵韵入体', v.corrupted ? '#C8642A' : ELEMCOL[v.elem]);
    burst(v.x, v.y, ELEMCOL[v.elem], 10, { ring: true });
    spawnRing(v.x, v.y, ELEMCOL[v.elem], 70);
    AudioSys.sfx.runePick();
    if (v.corrupted && runPhase === 'zhuan') {
      for (var s = 0; s < 2; s++) { var ne = spawnEnemy(v.x + rand(-30, 30), v.y + rand(-30, 30), clamp(1 + Math.floor(gameTime / 28), 1, 4)); if (ne) { ne.hunt = true; ne.wake = 0; } }
      addShake(2.5, 140, 60);
    }
    if (!run._veinTip) { run._veinTip = true; setBanner('☯ 灵脉共振：+' + gain + ' 点' + v.elem + '系灵韵（喂羁绊/觉醒）· 灵脉圈内战斗有增伤光环', 3.0, ELEMCOL[v.elem]); }
  }
  function updateVeins(dt) {
    if (inRift) return;
    for (var i = 0; i < veins.length; i++) {
      var v = veins[i];
      if (v.cd > 0) v.cd -= dt;
      else {
        // 合幕：Boss 战燃料——圈内缓慢充能绝技，给终局留操作空间
        if (runPhase === 'he' && dist2(player.x, player.y, v.x, v.y) < v.r * v.r) player.ultCharge = Math.min(ULT_MAX, player.ultCharge + 8 * dt);
        if (dist2(player.x, player.y, v.x, v.y) < VEIN_ABSORB_R * VEIN_ABSORB_R) absorbVein(v);
      }
    }
  }
  // bonus: 0~0.12 表现加成（层级/连杀进度/无伤）——向上平移品质
  // 2026-08-18 调低 + 修 bug：① 橙 5%→1.5% 基线、紫 10%→4.5%；② 橙/紫增幅放缓（保持 橙<紫 梯度不倒挂，tier4 极限态 rare+ 约 16%）；③ 修正原实现 bonus 方向写反的 bug（原来表现好反而掉更差）
  function rollRarity(tier, bonus) {
    var r = Math.random();
    var s = tierDropBonus(tier) + (bonus || 0) * 0.5; // v15：层级品质权重走 tierDropBonus（每层+4%，封顶35%），替换旧 (tier-1)*0.03 因子
    if (r > 0.985 - s * 0.4) return 'orange';
    if (r > 0.94 - s * 0.7) return 'purple';
    if (r > 0.80 - s) return 'blue';
    if (r > 0.48 - s * 0.5) return 'green';
    return 'white';
  }
  // #B3 修复：统一难度口径——地图层级 + 时间升阶，敌人掉落/宝箱掉落共用，消除 etier/run.tier 两套语义
  function diffTier(tier) { return Math.min(99, tier + Math.floor(gameTime / 90)); } // 难度口径：随层级+时间递增，不封顶；v14.3 改签名接参数（基地态 run=null 不再崩）
  // ---------- 宝箱分级与开箱反馈 ----------
  var CHESTS = {
    wood:   { key: 'wood',   name: '木箱', color: '#8B95A0', edge: '#5b6470', glow: 6,  min: 2, max: 3, floor: 1, flash: '#cdd8e2', guard: 1 },
    silver: { key: 'silver', name: '银箱', color: '#CFE0DC', edge: '#7fa6c0', glow: 11, min: 3, max: 4, floor: 2, flash: '#dff0ff', guard: 1 },
    gold:   { key: 'gold',   name: '金箱', color: '#C9A24B', edge: '#8A6A1E', glow: 16, min: 4, max: 6, floor: 3, flash: '#C9A24B', guard: 2 },
    secret: { key: 'secret', name: '秘宝', color: '#8A6FB8', edge: '#6a2fb0', glow: 24, min: 5, max: 7, floor: 4, flash: '#8A6FB8', guard: 2 }
  };
  function rollChestTier() {
    var secretW = 0.04 + (run.tier - 1) * 0.02, r = Math.random();
    if (r < secretW) return 'secret';
    if (r < secretW + 0.12) return 'gold';
    if (r < secretW + 0.12 + 0.26) return 'silver';
    return 'wood';
  }
  function pickRarityWeighted(floor) {
    // 2026-08-18 调低：按箱级递进的掉率表（白/绿/蓝/紫/橙）——木箱回归保底、秘宝才是大奖
    var TABLES = {
      1: [40, 34, 18, 6, 2],   // 木箱：紫+橙 8%
      2: [24, 36, 26, 10, 4],  // 银箱：紫+橙 14%
      3: [10, 30, 34, 18, 8],  // 金箱：紫+橙 26%
      4: [0, 18, 32, 30, 20]   // 秘宝：紫+橙 50%
    };
    var w = TABLES[floor] || TABLES[1]; // #B4 白装燃料兜底：木箱白装 40% 不断粮
    var sum = w[0] + w[1] + w[2] + w[3] + w[4], r = Math.random() * sum;
    for (var i = 0; i < 5; i++) { r -= w[i]; if (r <= 0) return RAR[i]; }
    return RAR[4];
  }
  function chestBannerText(c, got) {
    var top = got.reduce(function (m, g) { return Math.max(m, RAR.indexOf(g)); }, 0);
    var tn = RARNAME[top];
    if (c.key === 'secret') return '✦ 秘宝现世！获得 ' + tn + ' 等 ' + got.length + ' 件 ✦';
    if (c.key === 'gold') return '★ 金宝箱开启！获得 ' + tn + ' 等 ' + got.length + ' 件';
    if (c.key === 'silver') return '◆ 银宝箱开启 · 获得 ' + got.length + ' 件战利品';
    return '搜刮 +' + got.length + ' 件';
  }
  function hexToRgba(hex, a) { var h = hex.replace('#', ''); return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')'; }

  // ---------- 敌人原型 ----------
  function pickArchetype(tier) {
    var r = Math.random();
    var ram = 0.22, shoot = 0.18, turret = 0.07 + tier * 0.03, heal = 0.06 + tier * 0.02, gunship = 0.06 + tier * 0.04, split = 0.06 + tier * 0.02;
    // 劫掠者：只在玩家已捡到战利品时才进入抽卡池（没东西可偷就不浪费出场）
    var looter = (run && run.loot.length > 0) ? (0.05 + tier * 0.02) : 0;
    // 狙击手：高层更多，强迫玩家走位
    var sniper = 0.05 + tier * 0.02;
    // 护盾兵：中高层出现，改变目标优先级
    var shielder = tier >= 2 ? (0.04 + tier * 0.02) : 0;
    // 蜂群：成群出现，制造弹幕压力
    var swarm = 0.05 + tier * 0.015;
    // v12.6 机制型怪：识破前摇、翻相躲致命招
    // 自爆突进蜂：低层起出现，逼迫冲刺/引力裂隙借力甩尾
    var kamikaze = 0.055 + tier * 0.012;
    // 相位狙击手：高层更多，1.2s 跟踪细激光 → 0.2s 闪 → 贯穿全屏光束（翻相 0.35s 无敌帧反打）
    var phaseSniper = tier >= 2 ? (0.03 + tier * 0.022) : 0;
    // 引力编织者：中高层，发微型引力奇点球 + 8 向螺旋余烬飞刃（中距风筝）
    var weaver = tier >= 2 ? (0.03 + tier * 0.018) : 0;
    // 鎏金重盾巨舰（精英）：高层稀有，正面 120° 无敌金盾 + 波浪扩散弹幕（绕后/余烬相破盾）
    var bastion = tier >= 3 ? (0.02 + tier * 0.012) : 0;
    var sum = ram + shoot + turret + heal + gunship + split + looter + sniper + shielder + swarm + kamikaze + phaseSniper + weaver + bastion; r *= sum;
    if (r < ram) return 'ram'; r -= ram;
    if (r < shoot) return 'shoot'; r -= shoot;
    if (r < turret) return 'turret'; r -= turret;
    if (r < heal) return 'heal'; r -= heal;
    if (r < gunship) return 'gunship'; r -= gunship;
    if (r < split) return 'split'; r -= split;
    if (r < looter) return 'looter'; r -= looter;
    if (r < sniper) return 'sniper'; r -= sniper;
    if (r < shielder) return 'shielder'; r -= shielder;
    if (r < swarm) return 'swarm'; r -= swarm;
    if (r < kamikaze) return 'kamikaze'; r -= kamikaze;
    if (r < phaseSniper) return 'phaseSniper'; r -= phaseSniper;
    if (r < weaver) return 'weaver'; r -= weaver;
    if (r < bastion) return 'bastion'; r -= bastion;
    return 'swarm';
  }
  // #B5/#M3 修复：opts = { arche: 'split' | 强制原型（免随机副作用）, elite: true | 统一走精英分支（3×血+精英掉落+修饰词） }
  function spawnEnemy(x, y, etier, opts) {
    opts = opts || {};
    var ex = x, ey = y, entryWake = 0;
    if (ex === undefined) {
      // 规则圣经：禁止凭空刷出——必须在玩家视野外（屏外 ≥150px）飞入，且玩家周围 400px 内不直刷
      var reach = Math.max(W, H) * 0.62 + ALERT.offScreen;
      var ang = rand(0, 6.28), st2 = 0;
      do {
        ex = clamp(player.x + Math.cos(ang) * reach, 40, WORLD_W - 40);
        ey = clamp(player.y + Math.sin(ang) * reach, 40, WORLD_H - 40);
        st2++; ang = rand(0, 6.28);
      } while (dist2(ex, ey, player.x, player.y) < ALERT.noSpawn * ALERT.noSpawn && st2 < 80);
      if (st2 >= 80) { ex = clamp(player.x + Math.cos(ang) * (WORLD_W), 40, WORLD_W - 40); ey = clamp(player.y + Math.sin(ang) * (WORLD_H), 40, WORLD_H - 40); }
      entryWake = ENTRY_OFF; // 边缘飞入 / 裂缝钻出 入场缓冲（缓冲期内缓慢巡逻，不冲锋）
    }
    // 出怪安全区：距机体 < SAFE_SPAWN_MIN 一律推到环上（脚本怪传 allowClose 豁免）
    if (!opts.allowClose) { var _sp = safeSpawnPos(ex, ey); ex = _sp[0]; ey = _sp[1]; }
    etier = etier || clamp(1 + Math.floor(gameTime / 28), 1, 4);
    var arche = opts.arche || pickArchetype(etier);
    var elite = opts.elite || arche === 'bastion' || (!x && Math.random() < 0.08);
    var baseHp = (16 + etier * 9) * tierMul(etier);
    if (arche === 'turret') baseHp *= 2.2; else if (arche === 'heal') baseHp *= 1.25; else if (arche === 'split') baseHp *= 0.9; else if (arche === 'gunship') baseHp *= 3.4; else if (arche === 'looter') baseHp *= 1.15;
    else if (arche === 'sniper') baseHp *= 0.8; else if (arche === 'shielder') baseHp *= 1.8; else if (arche === 'swarm') baseHp *= 0.35;
    if (elite && arche !== 'bastion') baseHp *= 3;
    var RAD = { turret: 22, gunship: 30, split: 22, heal: 20, looter: 17, ram: 15, sniper: 18, shielder: 22, swarm: 10, kamikaze: 16, phaseSniper: 18, weaver: 24, bastion: 46 };
    var r = RAD[arche] || 17;
    var _ecolMap = { heal: COL.extract, split: RARCOL.purple, looter: '#E0B84A', sniper: '#E8A050', shielder: '#5B9FD0', swarm: '#A8C84E', kamikaze: '#E0623A', phaseSniper: '#E84A6A', weaver: '#B06FD0', bastion: '#E0B84A' };
    var _eedgeMap = { heal: COL.ink, split: '#2a0a2a', looter: '#8a5f1a', sniper: '#6a4520', shielder: '#1a4a70', swarm: '#4a6020', kamikaze: '#5a1e10', phaseSniper: '#5a1024', weaver: '#3a1a4a', bastion: '#8a5f1a' };
    var ecol = _ecolMap[arche] || COL.enemy;
    var eedge = _eedgeMap[arche] || COL.enemyEdge;
    var e = {
      x: ex, y: ey, vx: 0, vy: 0, hp: baseHp, maxhp: baseHp, r: r,
      fireCd: rand(1.6, 3.0), tier: etier, arche: arche, ram: arche === 'ram' || arche === 'split' || arche === 'swarm',
      elite: elite, healCd: rand(2.5, 4.5), burst: 0,
      zig: arche === 'looter' || arche === 'swarm' ? rand(0, 6.28) : 0, fleeing: false, lootStolen: null,
      rarity: elite ? (Math.random() < 0.35 ? 'purple' : 'blue') : rollRarity(diffTier(run.tier)),
      flash: 0, wake: entryWake, entryMax: entryWake, dmgMul: tierDmgMul(run.tier) * (elite ? 1.2 : 1),
      burn: 0, burnT: 0, small: arche === 'swarm', col: ecol, edge: eedge, bigBullet: arche === 'gunship',
      hitT: 0, hitMag: 0,
      // —— 警戒 / 感知 / 追击（规则圣经 v1）——
      alert: 0, alertClock: 0, decayT: 0, quietT: 0,      // 0=无察觉 1=警觉 2=锁定
      homeX: ex, homeY: ey, patrolAng: rand(0, 6.28),     // 巡逻锚点
      pursueStage: 0, pursueT: 0, alarmIgnored: false, chargeState: 0, chargeT: 0, chargeDir: 0, chargeDist: 0,    // 追击三阶段 / 冲撞者状态机
      chestTrig: false, forceAlert: arche === 'swarm',     // 蜂群天生警觉
      // —— 新敌人特有字段 ——
      sniperCharge: 0, sniperAim: 0,     // 狙击手：充能计时 + 瞄准角度
      shieldRadius: 120, shieldPulse: 0, // 护盾兵：护盾范围 + 脉冲动画
      swarmId: 0,                         // 蜂群：群体编号
      // —— v12.6 机制型怪字段 ——
      kamikaze: arche === 'kamikaze', kamikazeDashes: 0, kamikazeMax: 3, kamikazeWind: 0.5, detonate: 0, // 自爆突进蜂：0.5s 蓄力红光 → 多段直冲 → 撞击/击毁爆炸
      phaseSniper: arche === 'phaseSniper', // 相位狙击手：1.2s 跟踪细激光 → 0.2s 闪 → 贯穿全屏光束（翻相 0.35s 无敌帧反打）
      sniperBeamFlash: 0, // 狙击光束开火前 0.2s 闪烁预警
      weaver: arche === 'weaver', weaverCd: rand(2.4, 3.4), weaverSpin: 0, // 引力编织者：发微型引力奇点球 + 8 向螺旋余烬飞刃
      bastion: arche === 'bastion', shieldArc: 2.094, shieldReflect: arche === 'bastion', // 鎏金重盾巨舰：正面 120° 无敌金盾（反射直射弹）
      // —— 精英修饰词 ——
      eliteMod: elite ? pickEliteMod() : null,  // 'volatile' / 'adaptive' / 'frenzied'
      phase: Math.random() < 0.45 ? 'gold' : 'ember',   // 敌机相位亲和（金/余烬）：异相克制 + 头顶标注
      lastElemHit: null, elemResist: 0,         // 适应：最后被命中的元素 + 抗性
      frenzyTriggered: false                    // 狂暴：是否已触发
    };
    if (!isFinite(e.fireCd)) e.fireCd = 2.0; // 防御：出怪计时器污染（NaN）→ 复位，避免永不冷却
    if (arche === 'swarm') {
      // 蜂群成群出现：直接创建2-4只额外蜂群成员（不递归调用spawnEnemy避免无限循环）
      var swarmCount = randi(2, 4);
      for (var si = 0; si < swarmCount; si++) {
        var sx = ex + rand(-30, 30), sy = ey + rand(-30, 30);
        if (!opts.allowClose) { var _sp2 = safeSpawnPos(sx, sy); sx = _sp2[0]; sy = _sp2[1]; }
        sx = clamp(sx, 40, WORLD_W - 40); sy = clamp(sy, 40, WORLD_H - 40);
        var se = {
          x: sx, y: sy, vx: 0, vy: 0, hp: Math.round(baseHp), maxhp: Math.round(baseHp), r: 10,
          fireCd: 99, tier: etier, arche: 'swarm', ram: true, elite: false, healCd: 99, burst: 0,
          zig: rand(0, 6.28), fleeing: false, lootStolen: null, rarity: rollRarity(diffTier(run.tier)),
          flash: 0, wake: ENTRY_SWARM, entryMax: ENTRY_SWARM, dmgMul: tierDmgMul(run.tier), burn: 0, burnT: 0, small: true,
          col: '#A8C84E', edge: '#4a6020', bigBullet: false, hitT: 0, hitMag: 0,
          alert: 2, alertClock: 0, decayT: 0, quietT: 0,
          homeX: sx, homeY: sy, patrolAng: rand(0, 6.28),
          pursueStage: 0, pursueT: 0, alarmIgnored: false, chargeState: 0, chargeT: 0, chargeDir: 0, chargeDist: 0,
          chestTrig: false, forceAlert: true,
          sniperCharge: 0, sniperAim: 0, shieldRadius: 120, shieldPulse: 0, swarmId: 0,
          eliteMod: null, lastElemHit: null, elemResist: 0, frenzyTriggered: false
        };
        if (huntActive) { se.dmgMul *= HUNT_DMG; se.maxhp = Math.round(se.maxhp * HUNT_HP); se.hp = se.maxhp; se.hunt = true; }
        enemies.push(se);
      }
    }
    if (arche === 'looter' && !run.looterWarned) { run.looterWarned = true; setBanner('⚠ 劫掠者出现！它会偷走你已捡的战利品，快击落它夺回！', 3.2); AudioSys.sfx.stolen(); }
    if (arche === 'sniper' && !run.sniperWarned) { run.sniperWarned = true; setBanner('⚠ 狙击手出现！注意躲避红色激光瞄准线！', 2.8); }
    if (arche === 'shielder' && !run.shielderWarned) { run.shielderWarned = true; setBanner('⚠ 护盾兵出现！优先击破它以解除友军护盾！', 2.8); }
    if (arche === 'kamikaze' && !run.kamikazeWarned) { run.kamikazeWarned = true; setBanner('⚠ 自爆突进蜂出现！见红光前摇立即冲刺/翻相甩尾，别硬接冲撞！', 3.0); }
    if (arche === 'phaseSniper' && !run.phaseSniperWarned) { run.phaseSniperWarned = true; setBanner('⚠ 相位狙击手！细激光跟踪瞄准后闪 0.2s 即贯穿全屏——冲刺或翻相 0.35s 无敌帧反打！', 3.4); }
    if (arche === 'weaver' && !run.weaverWarned) { run.weaverWarned = true; setBanner('⚠ 引力编织者！微型引力奇点球会拖拽你，注意 8 向螺旋余烬飞刃', 3.2); }
    if (arche === 'bastion' && !run.bastionWarned) { run.bastionWarned = true; setBanner('⚠ 鎏金重盾巨舰！正面 120° 金盾无敌，绕后或切余烬相破盾！', 3.4); }
    if (huntActive) { e.dmgMul *= HUNT_DMG; e.maxhp = Math.round(e.maxhp * HUNT_HP); e.hp = e.maxhp; e.hunt = true; }
    enemies.push(e); return e;
  }
  // 精英修饰词随机
  function pickEliteMod() {
    var mods = ['volatile', 'adaptive', 'frenzied'];
    return mods[randi(0, mods.length - 1)];
  }
  // 警戒 / 感知状态机（规则圣经模块一·2）：三段式、可衰减、可预判
  function updateAlert(e, d, dt) {
    if (e.alert === undefined) e.alert = 0;
    var stim = (d < ALERT.detectEdge) || (player.firedT > 0 && d < ALERT.fireAlarmDist) || e.chestTrig || (e.hitT > 0) || e.forceAlert;
    // 视线遮挡（Line of Sight）：玩家躲入大楼背侧 → 警戒衰减加速（双倍）
    var _los = checkLineOfSight(e.x, e.y, player.x, player.y);
    var _decayMul = _los ? 1 : 2;
    if (d < ALERT.detectCore) { e.alert = 2; e.alertClock = 0; e.quietT = 0; e.pursueStage = 0; e.pursueT = 0; }
    else if (stim) {
      e.quietT = 0; e.decayT = 0; e.chestTrig = false;
      if (e.alert === 0) { e.alert = 1; e.alertClock = 0; }
      else if (e.alert === 1) { e.alertClock += dt; if (e.alertClock >= ALERT.lv1To2) { e.alert = 2; e.pursueStage = 0; e.pursueT = 0; } }
      else { e.pursueStage = 0; e.pursueT = 0; }
    } else {
      e.chestTrig = false;
      if (e.alert === 1) { e.decayT += dt * _decayMul; if (e.decayT >= ALERT.decay1) { e.alert = 0; e.alertClock = 0; } }
      else if (e.alert === 2) {
        // 脱离视线 / 距离过远 → 锁定警戒值双倍速度衰减（建筑盲区脱战）
        if ((d > 500 || !_los) && !e.alarmIgnored) {
          e.quietT += dt * _decayMul;
          if (e.quietT >= ALERT.decay2quiet) { e.decayT += dt * _decayMul; if (e.decayT >= ALERT.decay2) { e.alert = 0; e.alertClock = 0; } }
        } else { e.quietT = 0; }
      }
    }
    // 追击阶段机（仅锁定态；狂暴区强制死追，不进入试探）
    if (e.alert === 2 && !e.alarmIgnored) {
      e.pursueT += dt;
      e.pursueStage = (d > 500) ? 1 : 0;   // 1 = 脱离试探（减速·不射击）
      if (e.pursueT > ALERT.pursueTime) { e.alert = 0; e.alertClock = 0; e.decayT = 0; }
    }
  }
  // 2026-08-18：自治射击例程（"怪物失去攻击欲望/不射击" 修复核心）
  // 关键修复：开火不再依赖 e.alert === 2 硬门。只要 冷却就绪 + 玩家在战斗半径内 + 在屏幕内，远程原型即开火。
  // e.alert 仍用于移动 AI / 进攻性，但不再是唯一开火开关。狙击手保留激光预警 + LOS 逻辑（躲入大楼背侧即断线重索）。
  function updateEnemyShooting(e, dt) {
    if (e.dead || e.freezeT > 0) return;
    if (e.arche !== 'shoot' && e.arche !== 'turret' && e.arche !== 'gunship' && e.arche !== 'sniper' && e.arche !== 'phaseSniper' && e.arche !== 'weaver' && e.arche !== 'bastion') return;
    // 防御：fireCd 污染（NaN/非数）→ 复位，杜绝因计时器损坏而永不冷却
    if (typeof e.fireCd !== 'number' || isNaN(e.fireCd)) e.fireCd = (e.baseCd || 2.0);
    e.fireCd -= dt;
    // 世界→屏幕变换（render 用 ctx.translate(-cam.x,-cam.y)）：屏外敌人不开火（玩家看不到，且避免离屏遥射）
    var _sx = e.x - cam.x, _sy = e.y - cam.y;
    var onScreen = _sx >= -40 && _sx <= W + 40 && _sy >= -40 && _sy <= H + 40;
    var dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
    var _rad = (e.arche === 'shoot' || e.arche === 'turret') ? 560 : (e.arche === 'gunship' ? 640 : 700);
    if (DBG_ENEMY_AI) console.log('[AI] shoot arche=' + e.arche + ' alert=' + e.alert + ' fireCd=' + e.fireCd.toFixed(2) + ' d=' + d.toFixed(0) + ' rad=' + _rad + ' onScreen=' + onScreen + ' canFire=' + (onScreen && d < _rad) + ' ready=' + (e.fireCd <= 0));
    if (e.arche === 'shoot') {
      if (e.fireCd <= 0 && d < 560 && onScreen) { fireBullet(e.x, e.y, Math.atan2(dy, dx), 'enemy', EDMG_NORMAL * e.dmgMul, 175); e.fireCd = rand(1.6, 3.0); }
    } else if (e.arche === 'turret') {
      if (e.fireCd <= 0 && d < 560 && onScreen) { for (var tb = -1; tb <= 1; tb++) fireBullet(e.x, e.y, Math.atan2(dy, dx) + tb * 0.12, 'enemy', EDMG_NORMAL * e.dmgMul, 180); e.fireCd = rand(2.0, 3.0); }
    } else if (e.arche === 'gunship') {
      if (e.fireCd <= 0 && d < 640 && onScreen) { fireBullet(e.x, e.y, Math.atan2(dy, dx), 'enemy', EDMG_NORMAL * e.dmgMul, 130, { big: true }); e.fireCd = rand(2.4, 3.6); }
    } else if (e.arche === 'weaver') {
      // 引力编织者：发微型引力奇点球(拖拽) + 8 向螺旋余烬飞刃（中距风筝）
      e.weaverCd -= dt;
      if (e.weaverCd <= 0 && d < 560 && onScreen) {
        var _wx = clamp(player.x + rand(-50, 50), 40, WORLD_W - 40), _wy = clamp(player.y + rand(-50, 50), 40, WORLD_H - 40);
        weaverRifts.push({ x: _wx, y: _wy, r: 14, pull: 140, core: 22, life: 3.6, spin: rand(0, 6.28), pulse: 0 });
        burst(_wx, _wy, '#B06FD0', 10, { ring: true, ringR: 26 });
        e.weaverSpin = (e.weaverSpin || 0) + 0.4; // 每次出刃旋转，形成螺旋观感
        for (var _wb = 0; _wb < 8; _wb++) {
          var _wa = e.weaverSpin + _wb * (6.283 / 8);
          fireBullet(e.x, e.y, _wa, 'enemy', EDMG_NORMAL * e.dmgMul, 165, { elem: 'ember', blade: true });
        }
        addShake(1.2, 90, 40); AudioSys.sfx.hit();
        e.weaverCd = rand(2.6, 3.6);
      }
    } else if (e.arche === 'bastion') {
      // 鎏金重盾巨舰：周期波浪扩散弹幕（正面金盾已在命中结算反弹）
      e.fireCd -= dt;
      if (e.fireCd <= 0 && d < 720 && onScreen) {
        var _ba0 = Math.atan2(dy, dx);
        var _waves = 3, _per = 7;
        for (var _wv = 0; _wv < _waves; _wv++) {
          for (var _wi = 0; _wi < _per; _wi++) {
            var _ang = _ba0 - 0.6 + (_wi / (_per - 1)) * 1.2 + _wv * 0.18;
            fireBullet(e.x, e.y, _ang, 'enemy', EDMG_NORMAL * e.dmgMul, 150 + _wv * 30);
          }
        }
        burst(e.x, e.y, '#E0B84A', 8, { smin: 60, smax: 180 }); addShake(1.5, 120, 50); AudioSys.sfx.hit();
        e.fireCd = rand(2.4, 3.4);
      }
    } else if (e.arche === 'sniper' || e.arche === 'phaseSniper') {
      var _losS = checkLineOfSight(e.x, e.y, player.x, player.y); // 视线被建筑墙体阻断则断线重索
      if (!_losS) { e.sniperCharge = 0; e.sniperBeamFlash = 0; e.sniperAim = Math.atan2(dy, dx); }
      else if (e.arche === 'phaseSniper') {
        // 相位狙击手：1.2s 跟踪细激光 → 0.2s 闪 → 贯穿全屏光束（翻相 0.35s 无敌帧反打）
        if (e.sniperBeamFlash > 0) {
          e.sniperBeamFlash -= dt;
          if (e.sniperBeamFlash <= 0) {
            var _ba = e.sniperAim;
            // 视觉：贯穿全屏红金光束
            addVfxLine(e.x, e.y, e.x + Math.cos(_ba) * 1500, e.y + Math.sin(_ba) * 1500, '#E84A6A', 0.28);
            addVfxLine(e.x, e.y, e.x + Math.cos(_ba) * 1500, e.y + Math.sin(_ba) * 1500, '#FFD24A', 0.14);
            burst(e.x, e.y, '#E84A6A', 8, { smin: 120, smax: 320 }); addShake(2.5, 160, 70); AudioSys.sfx.crit();
            // hitscan：开火瞬间判定玩家是否在光束线上（未被翻相无敌帧覆盖才命中）
            if (player.iframe <= 0) {
              var _px = player.x - e.x, _py = player.y - e.y;
              var _proj = _px * Math.cos(_ba) + _py * Math.sin(_ba);
              if (_proj > 0) {
                var _perp = Math.abs(-_px * Math.sin(_ba) + _py * Math.cos(_ba));
                if (_perp < (PHB + 16)) { damagePlayer(EDMG_ELITE * e.dmgMul); floatText(player.x, player.y - 22, '贯穿光束!', '#E84A6A', 'crit'); }
              }
            }
            e.sniperCharge = 0; e.fireCd = rand(2.6, 4.2);
          }
        } else if (e.sniperCharge < 1.2) { e.sniperCharge += dt; e.sniperAim = Math.atan2(dy, dx); }
        else { e.sniperBeamFlash = 0.2; } // 充能满 → 0.2s 闪光预警（翻相窗口）
      } else {
        // 普通狙击手：原逻辑
        if (e.sniperCharge < 1.2) { e.sniperCharge += dt; e.sniperAim = Math.atan2(dy, dx); }
        else if (onScreen && d < 700) { fireBullet(e.x, e.y, e.sniperAim, 'enemy', EDMG_ELITE * e.dmgMul, 420, { big: true }); burst(e.x, e.y, '#E8A050', 6, { smin: 80, smax: 200 }); addShake(1.5, 100, 40); e.sniperCharge = 0; e.fireCd = rand(2.5, 4.0); }
      }
    }
  }
  function nearestEnemy(x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < enemies.length; i++) { var d = dist2(x, y, enemies[i].x, enemies[i].y); if (d < bd) { bd = d; best = enemies[i]; } }
    if (boss && boss.wake <= 0) { var db = dist2(x, y, boss.x, boss.y); if (db < bd) best = boss; }
    return best;
  }
  function fireBullet(x, y, ang, from, dmg, speed, opts) {
    opts = opts || {};
    if (opts.boss && phase === PHASE.EMBER) { dmg *= EMBER_ENRAGE_DMG; speed *= EMBER_ENRAGE_BULLET_SPD; } // 余烬狂暴：伤害×1.25 / 弹速×1.15
    var br = from === 'player' ? 6.8 : (opts.big ? 10 : 5.5);
    var bkind = opts.boss ? 'boss' : (from === 'enemy' ? 'enemy' : (opts.crit ? 'crit' : (opts.homing ? 'homing' : (opts.pierce > 0 ? 'pierce' : (opts.explode > 0 ? 'explode' : 'normal')))));
    var b = { x: x, y: y, lastx: x, lasty: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: dmg, from: from, r: br, life: 3, age: 0,
      pierce: opts.pierce || 0, homing: !!opts.homing, explode: opts.explode || 0, crit: !!opts.crit, burn: opts.burn || 0, lifesteal: opts.lifesteal || 0, chain: opts.chain || 0, boss: !!opts.boss, kind: bkind, elem: opts.elem || null, xuanwu: !!opts.xuanwu, chilan: !!opts.chilan,
      homingTurnRate: opts.homingTurnRate || 0, splashRatio: opts.splashRatio || 0, chainRange: opts.chainRange || 140, chainDecay: opts.chainDecay || 0.5, falloff: opts.falloff || 0 };
    if (from === 'player' && opts.elem && ELEM_VFX[opts.elem]) b.trail = { elem: opts.elem, age: 0, fps: 18, size: 46 };
    if (!Array.isArray(bullets)) bullets = []; // 防御：bullets 被误置 null/非数组时复位，杜绝敌弹数组断层
    bullets.push(b);
    if (DBG_ENEMY_AI && from === 'enemy') console.log('[AI] fireBullet from=enemy x=' + x.toFixed(0) + ' y=' + y.toFixed(0) + ' ang=' + ang.toFixed(2) + ' dmg=' + dmg.toFixed(1) + ' spd=' + speed);
  }
  // type: 'artifact'(法器) | 'jade'(灵玉砂) | 'consumable'(丹药) | 'ore'(灵矿碎屑) | 'legendary'(传说核心) | 'bossrelic'(Boss遗物) | 'legendary_weapon'(传说武器)
  function dropLoot(x, y, rarity, type, relicData, opt) {
    type = type || 'artifact';
    opt = opt || {};
    var el = { x: x, y: y, type: type, rarity: rarity || 'white', slot: pickSlot(), vx: rand(-18, 18), vy: rand(-18, 18), life: type === 'bossrelic' ? 45 : (type === 'legendary' || type === 'legendary_weapon' ? 32 : (type === 'ore' ? 26 : 30)), age: 0 };
    if (type === 'jade') { el.amount = opt.amount != null ? opt.amount : (8 + Math.floor((run ? run.tier : 1) * 4) + randi(0, 7)); }
    else if (type === 'ore') { el.amount = opt.amount != null ? opt.amount : 1; }
    else if (type === 'consumable') { el.consKey = ['bomb', 'shield', 'heal', 'slow'][randi(0, 3)]; }
    else if (type === 'bossrelic' && relicData) {
      el.name = relicData.name; el.slot = relicData.slot; el.relicMods = relicData.mods; el.rarity = relicData.rarity;
    }
    else if (type === 'legendary_weapon' && relicData) {
      el.name = relicData.name; el.slot = relicData.slot; el.relicMods = relicData.mods; el.rarity = relicData.rarity;
      el.subtype = relicData.subtype; el.legendaryPassive = relicData.passive; el.isLegendaryWeapon = true;
    }
    else { var pool = LOOT_NAMES[rarity] || LOOT_NAMES.white; el.name = pool[randi(0, pool.length - 1)]; }
    loot.push(el);
    // 余烬相掉率 ×2 仅在「主动献祭核心翻余烬」时生效（自动/相位柱翻余烬不享受，§7.3）
    if (activeEmber && phase === PHASE.EMBER && type !== 'bossrelic' && type !== 'legendary_weapon' && type !== 'legendary') {
      var el2 = {}; for (var _k in el) el2[_k] = el[_k];
      el2.vx = rand(-18, 18); el2.vy = rand(-18, 18); el2.x = x + rand(-10, 10); el2.y = y + rand(-10, 10); el2.age = 0;
      loot.push(el2);
    }
  }
  // ============ 掉落分层重构（2026-08-19）：单局整装预算硬控 + 灵矿碎屑材料 ============
  // 灵矿碎屑（材料）：自动磁吸，不占背包格；局内仅累加 run.oreCollected，结算时按结局比例统一入 meta.ore（S1 修复：消除双重入账）
  // v15：灵矿产出按层级加成 tierOreBonus（每层+50%）；amount 为调用方传的基础值，仅乘一次；基地态 run=null 按 tier1 算
  function dropOre(x, y, amount) { dropLoot(x, y, 'white', 'ore', null, { amount: Math.max(1, Math.round((amount || 1) * tierOreBonus(run ? run.tier : 1))) }); }
  // 单局整装总产出预算：所有整装掉落（精英/Boss/宝箱）须过此闸；归零后整装降级为灵玉，严格把单局整装锁在 12~20 件
  function budgetArtifact(rar) {
    if (!run || !run.artBudget || run.artBudget <= 0) return false;
    run.artBudget--;
    return true;
  }
  // 背包系统（§4：有限格子→取舍）：满则自动舍弃最低价值件，逼出“带什么走”的抉择
  // #C2 修复：occupied=已占用的外部格子数（裂隙宝库用 run.loot.length 合并判满）；已带 rift 标志的件不再被覆盖（保住阵亡 50% 保底语义）
  function pushToLoot(arr, item, fx, fy, occupied) {
    item.rift = item.rift || (arr === riftLoot);
    if (arr.length + (occupied || 0) < invMax) { arr.push(item); return null; }
    var di = 0, dv = 1e9;
    for (var k = 0; k < arr.length; k++) { var v = RARVAL[RAR.indexOf(arr[k].rarity)] || 0; if (v < dv) { dv = v; di = k; } }
    var dropped = arr[di];
    arr.splice(di, 1); arr.push(item);
    if (fx !== undefined && fy !== undefined) { floatText(fx, fy - 30, '背包已满·舍弃「' + dropped.name + '」腾位', '#C94F4F'); burst(fx, fy, '#C94F4F', 6); }
    return dropped;
  }
  function burst(x, y, color, n, opt) {
    opt = opt || {};
    var ring = opt.ring, ringR = opt.ringR || 46;
    for (var i = 0; i < n; i++) { var a = rand(0, 6.28), s = rand(opt.smin || 60, opt.smax || 220); spawnParticle({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(opt.lmin || 0.25, opt.lmax || 0.6), color: color, r: rand(opt.rmin || 1.3, opt.rmax || 3) }); }
      if (ring) spawnParticle({ x: x, y: y, vx: 0, vy: 0, life: 0.3, color: color, r: 3, ring: true, rmax: ringR, r0: opt.r0 || 6 });
  }
  // 互动物触发反馈：迸发粒子 + WebAudio sting（不同音高）+ 可见状态切换（§P1）
  // 全部包 try-catch，绝不向每帧循环抛错
  function phaseObjectFeedback(kind, x, y) {
    try {
      if (kind === 'pillar') { AudioSys.sfx.pillar(); burst(x, y, phase === PHASE.EMBER ? '#C8642A' : '#C9A24B', 16, { ring: true, ringR: 70, r0: 8 }); addShake(5, 140, 60); }
      else if (kind === 'vault') { AudioSys.sfx.vault(); burst(x, y, '#E0B84A', 26, { ring: true, ringR: 90, r0: 10 }); addShake(7, 200, 70); }
      else if (kind === 'rift') { AudioSys.sfx.rift(); burst(x, y, '#B06FD0', 22, { ring: true, ringR: 80, r0: 10 }); addTint('#B06FD0', 0.18); }
      else if (kind === 'extract') { AudioSys.sfx.extract(); burst(x, y, '#7FB069', 24, { ring: true, ringR: 100, r0: 12 }); addShake(4, 130, 55); }
    } catch (e) {}
  }
  function floatText(x, y, text, color, style) {
    style = style || 'normal';
    var f = floaters[fCur]; fCur = (fCur + 1) % FPOOL;
    f.alive = true; f.x = x; f.y = y; f.text = text; f.color = color; f.style = style;
    f.maxLife = 1.1; f.life = 1.1; f.vy = -22;
  }
  // 任务式引导：底部目标提示卡（新手局按阶段弹出，不一次性灌输）
  function showTip(text, dur) {
    if (!tipEl) tipEl = document.getElementById('tipCard');
    tipTimer = dur || 4;
    if (tipEl) { tipEl.innerHTML = text; tipEl.style.display = 'block'; tipEl.style.animation = 'none'; void tipEl.offsetWidth; tipEl.style.animation = ''; }
  }
  function hasMergeable() {
    var cnt = {};
    for (var i = 0; i < run.loot.length; i++) { var r = run.loot[i].rarity; if (r === 'orange') continue; cnt[r] = (cnt[r] || 0) + 1; if (cnt[r] >= 2) return true; }
    return false;
  }

  // 安全窗口：玩家身边短暂无威胁（无敌弹/无敌怪贴脸）才允许弹出符文，避免中途掐断连招
  // 符文充能节奏：越往后越稀（依次叠加），并有总数上限，避免全程被打断式喂奶
  var RUNE_BASE = 7, RUNE_STEP = 4, RUNE_MAX_REQ = 20, RUNE_CAP = 8;
  function runeNextReq(n) { return Math.min(RUNE_BASE + n * RUNE_STEP, RUNE_MAX_REQ); }
  // ---------- 灵蕴 / 等级（幸存者式成长曲线）----------
  // 击杀掉落「灵蕴」宝石 → 飞过吸取 → 累积经验 → 升级触发三选一（复用 buffPending 安全窗口）
  var LEVEL_CAP = 30;
  function xpNeedForLevel(l) { return Math.round(7 + (l - 1) * 3.2 + l * l * 0.09); } // v10：二次曲线平滑（中期更快、满级相近），配合难度口径掉落成长
  // 战技：常驻自动副武器（土豆兄弟 / 幸存者式），作为升级三选一的额外选项
  var WEAPON_OPTIONS = [
    { name: '环列法球', elem: null, kind: 'weapon', desc: '召唤1枚自动法球（环绕射击）', apply: function () { player.drones = Math.min(6, player.drones + 1); } },
    { name: '法球共鸣', elem: null, kind: 'weapon', desc: '法球伤害 +40%', apply: function () { player.droneDmgMult = (player.droneDmgMult || 1) * 1.4; } },
    { name: '法球疾转', elem: null, kind: 'weapon', desc: '法球射速 +30%', apply: function () { player.droneCdMult = (player.droneCdMult || 1) * 0.7; } }
  ];
  var LEVEL_POOL = RUNES.concat(WEAPON_OPTIONS);
  function addXp(v) {
    if (!player) return;
    if (player.lvl >= LEVEL_CAP) { meta.currency += 2; return; } // 满级灵蕴折算灵玉
    player.xp += v;
    while (player.xp >= player.xpNeed && player.lvl < LEVEL_CAP) {
      player.xp -= player.xpNeed; player.lvl++;
      player.xpNeed = xpNeedForLevel(player.lvl);
      setBanner('✦ 升级 Lv.' + player.lvl + ' · 选择强化', 2.0, '#E0B84A');
      AudioSys.sfx.levelUp && AudioSys.sfx.levelUp();
      buffPending = true; // 升级即请求三选一（复用安全窗口机制）
    }
  }
  function dropXp(x, y, val) {
    loot.push({ x: x + rand(-10, 10), y: y + rand(-10, 10), type: 'xp', val: val, vx: rand(-26, 26), vy: rand(-26, 26), life: 24, age: 0 });
    if (activeEmber && phase === PHASE.EMBER) loot.push({ x: x + rand(-10, 10), y: y + rand(-10, 10), type: 'xp', val: val, vx: rand(-26, 26), vy: rand(-26, 26), life: 24, age: 0 });
  }
  function safeToOffer() {
    var R = 86, R2 = R * R;
    for (var i = 0; i < bullets.length; i++) { var b = bullets[i]; if (b.from !== 'player' && dist2(b.x, b.y, player.x, player.y) < R2) return false; }
    for (var j = 0; j < enemies.length; j++) { var e = enemies[j]; if (e.ram && !e.small && dist2(e.x, e.y, player.x, player.y) < R2) return false; }
    return true;
  }
  // ---------- 符文（随机强化，替代原BUFFS）----------
  var buffChoices = [];
  function offerBuff() {
    buffChoices = []; var pool = LEVEL_POOL.slice();
    for (var i = 0; i < 3; i++) { var k = randi(0, pool.length - 1); buffChoices.push(pool.splice(k, 1)[0]); }
    paused = true; document.getElementById('buffOverlay').style.display = 'flex'; document.getElementById('buffList').innerHTML = ''; showMobileControls();
    var haveParts = [];
    for (var e in player.elements) if (player.elements[e] > 0) haveParts.push(e + '×' + player.elements[e]);
    var bhEl = document.getElementById('buffHave');
    if (bhEl) {
      var bp = [];
      for (var el in BOND_TIERS) {
        var c = player.elements[el] || 0; if (c === 0) continue;
        var nx = null; BOND_TIERS[el].forEach(function (t) { if (c < t.need) nx = nx === null ? t : nx; });
        bp.push(el + '×' + c + (nx ? '(差' + (nx.need - c) + '→' + nx.name + ')' : '(已满阶)'));
      }
      bhEl.innerHTML = bp.length ? ('羁绊进度：' + bp.join(' · ')) : '同系符文集齐解锁羁绊（1/2/3/4 阶）；同时持有 2 种以上元素，命中已附着的敌人会触发蒸发/感电/超载等反应';
    }
    buffChoices.forEach(function (b, idx) {
      var el = document.createElement('div'); el.className = 'card';
      var ecol = b.elem ? ELEMCOL[b.elem] : '#E0B84A';
      el.style.borderColor = ecol;
      var bigSym = b.elem ? ((TRIGRAM[b.elem] || '') + b.elem) : '✦';
      var metaHtml;
      if (b.elem) {
        var have = player.elements[b.elem] || 0, nx = null; BOND_TIERS[b.elem].forEach(function (t) { if (have < t.need) nx = nx === null ? t : nx; });
        metaHtml = nx ? ('<div class="buff-meta">' + (TRIGRAM[b.elem] || '') + b.elem + '系 ' + have + ' 枚 · 再 ' + (nx.need - have) + ' 枚解锁「' + nx.name + '」</div>') : ('<div class="buff-have">' + (TRIGRAM[b.elem] || '') + b.elem + '系已满阶羁绊</div>');
      } else {
        metaHtml = '<div class="buff-meta">常驻副武器 · 自动环绕射击</div>';
      }
      el.innerHTML = '<div class="big" style="color:' + ecol + '">' + bigSym + '</div><div class="bname">' + b.name + '</div><div class="muted">' + b.desc + '</div>' + metaHtml;
      el.onclick = function () { chooseBuff(idx); };
      document.getElementById('buffList').appendChild(el);
    });
  }
  function chooseBuff(idx) {
    if (!paused || !buffChoices[idx]) return;
    var b = buffChoices[idx]; b.apply();
    player.buffs.push(b.name); player.runes.push(b.name); player.runeDefs.push(b); // #BP2：存定义供 recomputeRunStats 重放符文加成
    runeCount++; buffTimer = 0; killForBuff = runeNextReq(runeCount); // 每次取符文后，下一枚所需击杀数依次叠加（封顶）
    if (b.elem) { player.elements[b.elem] = (player.elements[b.elem] || 0) + 1; recalcBonds(); }
    setBanner('获得符文：' + b.name, 1.5);
    AudioSys.sfx.runePick();
    burst(player.x, player.y, ELEMCOL[b.elem], 8); // 系别色反馈（§5.3）
    addTint(ELEMCOL[b.elem], 0.12);
    document.getElementById('buffOverlay').style.display = 'none'; paused = false; buffChoices = []; showMobileControls();
  }

  // ---------- 合成（2合1 + 3合1）----------
  function toggleMerge() {
    if (scene !== 'mission') return;
    if (paused && document.getElementById('mergeOverlay').style.display === 'flex') { document.getElementById('mergeOverlay').style.display = 'none'; paused = false; showMobileControls(); return; }
    if (paused) return;
    paused = true; renderMerge(); document.getElementById('mergeOverlay').style.display = 'flex'; showMobileControls();
  }
  // 2026-08-19 重构：右侧合成键移除，合成入口迁入「战利品储物舱」（背包面板按钮触发）。
  // 调用时背包已打开（paused 已为 true），仅隐藏背包浮层并打开合成浮层，不改变暂停态。
  function openMergeFromBackpack() {
    if (scene !== 'mission') return;
    var bo = document.getElementById('backpackOverlay'), mo = document.getElementById('mergeOverlay');
    if (bo) bo.style.display = 'none';
    renderMerge(); if (mo) mo.style.display = 'flex'; showMobileControls();
  }
  var mergeSel = [];
  function renderMerge() {
    mergeSel = []; var box = document.getElementById('mergeGrid'); box.innerHTML = '';
    if (run.loot.length === 0) { box.innerHTML = '<div class="muted">背包空空，先去开宝箱搜刮战利品</div>'; }
    run.loot.forEach(function (it, idx) {
      var el = document.createElement('div'); el.className = 'chip r-' + it.rarity + (it.relicMods ? ' relic' : '');
      el.title = (it.relicMods ? '★ 遗物 · ' : '') + RARNAME[it.rarity] + ' · ' + it.name + ' · 价值' + RARVAL[RAR.indexOf(it.rarity)];
      el.textContent = it.relicMods ? '★' : it.name.charAt(0);
      el.onclick = function () { onMergeClick(idx, el); };
      box.appendChild(el);
    });
    document.getElementById('mergeLegend').innerHTML =
      '白10 · 绿25 · 蓝60 · 紫140 · 橙320（越稀有越值钱，撤离带回越多）<br>' +
      '点 2 个同色 → 2合1 <b>必升一阶（安全）</b>；凑齐 3 个同色 → ⚡3合1 <b>赌博</b>：大概率升1阶 / 小概率跳2阶 / 极小概率跳3阶，但 <b>15% 湮灭（三件全失）</b>，最高只到紫（金不可熔）';
    // 3合1 按钮可用状态
    var can3 = false;
    for (var ri = 0; ri < 4; ri++) { if (run.loot.filter(function (it) { return it.rarity === RAR[ri]; }).length >= 3) { can3 = true; break; } }
    var btn = document.getElementById('merge3btn');
    if (btn) { btn.disabled = !can3; btn.style.opacity = can3 ? '1' : '0.4'; }
  }
  function onMergeClick(idx, el) {
    // 套装件不可合成升稀
    if (run.loot[idx] && NAME_TO_SET[run.loot[idx].name]) {
      floatText(player.x, player.y - 20, '套装件不可合成!', '#E0B84A');
      mergeSel = []; refreshSel(); return;
    }
    if (mergeSel.indexOf(idx) >= 0) { mergeSel = mergeSel.filter(function (x) { return x !== idx; }); refreshSel(); return; }
    mergeSel.push(idx);
    if (mergeSel.length === 2) {
      var i = mergeSel[0], j = mergeSel[1];
      if (run.loot[i].rarity !== run.loot[j].rarity) {
        // 颜色不同：放弃前一次选择，以刚点中的为起点，立即反馈
        mergeSel = [j]; refreshSel(); return;
      }
      if (run.loot[i].rarity !== 'orange') {
        var ri = RAR.indexOf(run.loot[i].rarity);
        var sl = run.loot[i].slot || pickSlot();
        run.loot.splice(j, 1); run.loot.splice(i, 1); run.loot.push({ rarity: RAR[ri + 1], name: pickName(RAR[ri + 1]), slot: sl });
        burst(player.x, player.y, RARCOL[RAR[ri + 1]], 8);
        AudioSys.sfx.merge();
        setBanner('2合1 → ' + RARNAME[RAR[ri + 1]], 1.3);
        mergeSel = []; renderMerge(); return;
      }
    }
    if (mergeSel.length >= 3) {
      var allSame = mergeSel.every(function (k) { return run.loot[k].rarity === run.loot[mergeSel[0]].rarity; });
      var notOrange = run.loot[mergeSel[0]].rarity !== 'orange';
      if (allSame && notOrange) { threeMergeFrom(mergeSel.slice()); mergeSel = []; renderMerge(); return; }
      mergeSel = []; refreshSel();
    }
    refreshSel();
  }
  function pickName(rar) { var pool = LOOT_NAMES[rar] || LOOT_NAMES.white; return pool[randi(0, pool.length - 1)]; }
  function threeMergeFrom(idxs) {
    var baseRar = run.loot[idxs[0]].rarity;
    var sl3 = run.loot[idxs[0]].slot || pickSlot();
    var ri = RAR.indexOf(baseRar);
    if (ri < 0 || ri >= FG_CAP) {
      setBanner('史诗不可熔·返还', 1.3);
      return; // 先判上限再移除：零损失返还
    }
    idxs.sort(function (a, b) { return b - a; }).forEach(function (k) { run.loot.splice(k, 1); });
    var roll = rollForge3(baseRar);
    if (roll.state === 'destroy') {
      burst(player.x, player.y, '#C94F4F', 16);
      try { tone(110, 0.32, 'sawtooth', 0.14); } catch (e) {}
      setBanner('⚡三合失败·湮灭！', 1.6);
      return;
    }
    run.loot.push({ rarity: roll.out, name: pickName(roll.out), slot: sl3 });
    // 随机小词条（微小永久增益本局）
    var affix = randi(0, 3);
    if (affix === 0) player.atkMult *= 1.05;
    else if (affix === 1) player.fireRate = Math.min(15, player.fireRate * 1.05);
    else if (affix === 2) { player.maxhp += 8; player.hp += 8; }
    else player.bulletSpeed *= 1.05;
    burst(player.x, player.y, RARCOL[roll.out], 14);
    try { AudioSys.sfx.merge(); } catch (e) {}
    setBanner('⚡3合1 → ' + RARNAME[roll.out] + (roll.out !== baseRar ? '（跳阶！+词条）' : ' (+词条)'), 1.6);
  }
  function doThreeMerge() {
    for (var ri = 0; ri < 4; ri++) {
      var idxs = [];
      run.loot.forEach(function (it, k) { if (it.rarity === RAR[ri]) idxs.push(k); });
      if (idxs.length >= 3) { threeMergeFrom(idxs.slice(0, 3)); renderMerge(); return; }
    }
  }
  function refreshSel() { var chips = document.getElementById('mergeGrid').children; for (var k = 0; k < chips.length; k++) chips[k].classList.remove('sel'); mergeSel.forEach(function (ix) { if (chips[ix]) chips[ix].classList.add('sel'); }); }

  // ============ #197 掉落物拾取筛选 ============
  function togglePickupFilter() {
    if (scene !== 'mission') return;
    var ov = document.getElementById('pickupFilterOverlay');
    if (paused && ov.style.display === 'flex') { ov.style.display = 'none'; paused = false; showMobileControls(); return; }
    if (paused) return;
    paused = true; renderPickupFilter(); ov.style.display = 'flex'; showMobileControls();
  }
  function renderPickupFilter() {
    if (!run.pickupFilter) run.pickupFilter = [true, true, true, true, true];
    var box = document.getElementById('pickupFilterGrid'); if (!box) return; box.innerHTML = '';
    for (var ri = 0; ri < RAR.length; ri++) {
      (function (ri) {
        var on = !!run.pickupFilter[ri];
        var row = document.createElement('div');
        row.className = 'pf-row' + (on ? ' on' : '');
        row.style.borderColor = RARCOL[RAR[ri]];
        row.innerHTML = '<span class="pf-dot" style="background:' + RARCOL[RAR[ri]] + '"></span>' +
          '<span class="pf-name" style="color:' + RARCOL[RAR[ri]] + '">' + RARNAME[RAR[ri]] + '</span>' +
          '<span class="pf-val">价值 ' + RARVAL[ri] + '</span>' +
          '<span class="pf-sw">' + (on ? '✓ 自动捡' : '✗ 已过滤') + '</span>';
        row.onclick = function () {
          run.pickupFilter[ri] = !run.pickupFilter[ri];
          if (meta) { meta.pickupFilter = run.pickupFilter.slice(); saveMeta(); }
          renderPickupFilter();
        };
        box.appendChild(row);
      })(ri);
    }
  }
  // 强制捡取单个掉落物（无视筛选，手动覆盖）；v12：扩展至灵玉/丹药，并补回传说/遗物表现
  function forcePickupIndex(idx) {
    if (idx < 0 || idx >= loot.length) return;
    var it = loot[idx];
    if (!it.rarity || it.type === 'xp') return; // 经验灵蕴自动吸取，无需手动
    if (it.type === 'jade') {
      var jamt = it.amount || 10; meta.currency += jamt;
      floatText(it.x, it.y, '+' + jamt + ' 灵玉 (手动)', '#C9A24B');
      AudioSys.sfx.pickup('blue'); burst(it.x, it.y, '#C9A24B', 8, { ring: true, ringR: 20 });
      loot.splice(idx, 1); return;
    }
    if (it.type === 'consumable') {
      var _ck = it.consKey; addConsumable(_ck);
      floatText(it.x, it.y, '获得丹药 (手动)', '#D9B64A');
      AudioSys.sfx.pickup('green'); burst(it.x, it.y, '#D9B64A', 8);
      loot.splice(idx, 1); return;
    }
    if (it.type === 'ore') {
      // S1 修复：拾取路径只累加 run.oreCollected，不再写 meta.ore（meta.ore 仅在 finishRun 结算按比例统一入账，杜绝双重入账）
      var oamt = it.amount || 1;
      floatText(it.x, it.y, '+' + oamt + ' 灵矿碎屑', '#8FB0C8');
      AudioSys.sfx.pickup('green'); burst(it.x, it.y, '#8FB0C8', 6);
      bountyProgress('orePickup', oamt); // 动态悬赏：灵矿碎屑采集
      run.oreCollected = (run.oreCollected || 0) + oamt; // 局末结算：追踪本局采集量
      loot.splice(idx, 1); return;
    }
    // artifact / legendary / bossrelic / legendary_weapon → 入背包（满则取舍）
    var tgt = inRift ? riftLoot : run.loot;
    var lootItem = { rarity: it.rarity, name: it.name, slot: it.slot || pickSlot(), rift: inRift, uid: ++run._uid };
    if (it.type === 'bossrelic' && it.relicMods) lootItem.relicMods = it.relicMods;
    if (it.type === 'legendary_weapon' && it.relicMods) { lootItem.relicMods = it.relicMods; lootItem.isLegendaryWeapon = true; lootItem.legendaryPassive = it.legendaryPassive; lootItem.subtype = it.subtype; lootItem.subBonus = it.subBonus || (SUBTYPE_PARAMS[it.subtype] || null); }
    pushToLoot(tgt, lootItem, it.x, it.y);
    if (!inRift) run.picked++;
    AudioSys.sfx.pickup(it.rarity);
    var v = RARVAL[RAR.indexOf(it.rarity)]; floatText(it.x, it.y, '+' + v + ' ' + RARNAME[it.rarity] + ' (手动)', RARCOL[it.rarity]);
    // 特殊掉落额外表现
    if (it.type === 'legendary_weapon') { burst(it.x, it.y, '#FFE9A8', 34, { ring: true, ringR: 60 }); spawnRing(it.x, it.y, '#FFE9A8', 80); burst(it.x, it.y, '#E0B84A', 20, { ring: true, ringR: 44 }); }
    else if (it.type === 'bossrelic') { burst(it.x, it.y, '#FFE9A8', 28, { ring: true, ringR: 50 }); spawnRing(it.x, it.y, '#E0B84A', 50); burst(it.x, it.y, '#E0B84A', 16, { ring: true, ringR: 36 }); }
    else if (it.type === 'legendary') { burst(it.x, it.y, '#E0B84A', 22, { ring: true, ringR: 40 }); spawnRing(it.x, it.y, '#E0B84A', 40); }
    else { var pr = it.rarity; if (pr === 'orange') { burst(it.x, it.y, RARCOL.orange, 16, { ring: true, ringR: 34 }); spawnRing(it.x, it.y, RARCOL.orange, 30); } else if (pr === 'purple') { burst(it.x, it.y, RARCOL.purple, 10, { ring: true, ringR: 26 }); } else if (pr === 'blue') { burst(it.x, it.y, RARCOL.blue, 6); } else { burst(it.x, it.y, RARCOL.green, 4); } }
    if (it.type === 'legendary') { var lg = 200 + run.tier * 50; meta.currency += lg; floatText(it.x, it.y - 14, '传说核心! +' + lg + ' 灵玉', '#E0B84A'); }
    if (it.type === 'bossrelic') { floatText(it.x, it.y - 16, '★ 遗物!', '#FFE9A8', 'crit'); }
    if (it.type === 'legendary_weapon') { floatText(it.x, it.y - 20, '★★ 传说武器!', '#FFE9A8', 'crit'); }
    if (Math.random() < (it.rarity === 'orange' ? 0.5 : it.rarity === 'purple' ? 0.32 : it.rarity === 'blue' ? 0.18 : 0.07)) { var ck = ['bomb', 'shield', 'heal', 'slow'][randi(0, 3)]; addConsumable(ck); }
    loot.splice(idx, 1);
  }
  // E 键 / 点击：找玩家附近最近的战利品强制捡起
  function forcePickupNearest() {
    var best = -1, bestD = player.pickR * player.pickR * 2.2; // 略大于自动拾取范围，方便精准抓取
    for (var i = 0; i < loot.length; i++) {
      var it = loot[i];
      if (!it.rarity || it.type === 'xp' || it.type === 'jade' || it.type === 'ore') continue; // 自动磁吸物不进手动抓取
      var d = dist2(it.x, it.y, player.x, player.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) forcePickupIndex(best);
    else floatText(player.x, player.y - 24, '附近无可捡战利品', '#8B95A0');
  }

  // ============ #198 背包可打开整理 ============
  var backpackSel = []; // 移动端点选交换的选中索引
  var backpackDetail = null; // #BP2：当前查看详情的背包索引（非空时渲染详情卡而非网格）

  // #BP2 局内即时换装 / 折价熔解 / 属性对比 支撑函数
  // 受「装备/研究院/符文」影响的战斗字段（不含 hp —— 换装绝不回血）
  var GEAR_KEYS = ['dmg', 'maxhp', 'atkMult', 'bulletSpeed', 'speed', 'fireRate', 'maxshield', 'regen', 'critChance', 'critMult', 'pierce', 'dodgeChance', 'burn', 'pellets', 'explode', 'homing', 'homingTurnRate', 'shieldRegen', 'lifesteal', 'chain', 'chainDecay', 'chainRange', 'dmgReduce', 'blockChance', 'thorns', 'reflect', 'slowAuraR', 'slowFactor', 'magnet', 'dashCdReduce', 'jadeBonus', 'dropBonus', 'elemBoost', 'spreadAngle', 'falloff', 'splashRatio', 'shieldBreakIframe', 'pickR', 'extractBonus', 'setMarkCrit', 'setStandStillReduce', 'setStandStillAura', 'setStandStillSlow', 'setStandStillTime', 'setDashTrail', 'setDashProj', 'setDashIframeBonus', 'setElemBonus', 'setMergeGuaranteed2', 'setBondReduce', 'activeSets', 'legendaryPassive'];
  function cloneVal(v) { if (v && typeof v === 'object') { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } } return v; }
  function snapshotGearBase() { var o = {}; for (var i = 0; i < GEAR_KEYS.length; i++) { var k = GEAR_KEYS[i]; o[k] = cloneVal(player[k]); } return o; }
  function findLootByUid(uid) { if (uid == null) return null; for (var i = 0; i < run.loot.length; i++) if (run.loot[i].uid === uid) return run.loot[i]; return null; }
  // 当前槽位「生效中的装备」：优先本局换装的背包件，否则 meta 军械库已装配件
  function getEquippedForSlot(slot) {
    var uid = run.equipped[slot];
    if (uid != null) { var l = findLootByUid(uid); if (l) return l; }
    return getArt(meta.equipped[slot]);
  }
  // 安全重算玩家战斗属性：基线(run._gearFull=已叠完 meta 装备+研究院，不含符文/战损) → 重放符文 → 叠加局内换装覆盖件；绝不回血
  function recomputeRunStats() {
    if (!run || !run._gearFull) return;
    var base = run._gearFull;
    for (var i = 0; i < GEAR_KEYS.length; i++) { var k = GEAR_KEYS[i]; player[k] = cloneVal(base[k]); }
    if (player.runeDefs) for (var r = 0; r < player.runeDefs.length; r++) { var d = player.runeDefs[r]; if (d && d.apply) d.apply(); }
    for (var s = 0; s < SLOTS.length; s++) {
      var uid = run.equipped[SLOTS[s]]; if (uid == null) continue;
      var it = findLootByUid(uid); if (!it) { run.equipped[SLOTS[s]] = null; continue; }
      var m = it.relicMods || it.mods; if (m) applyArtifactMods(m, false);
      if (it.subtype) applySubtypeBonus({ subtype: it.subtype, subBonus: it.subBonus }, true);
      if (it.isLegendaryWeapon && it.legendaryPassive) player.legendaryPassive = it.legendaryPassive;
    }
    if (player.hp > player.maxhp) player.hp = player.maxhp;
  }
  function bpSetName(it) { return (it.relicMods ? '★ ' : '') + it.name; }
  var BP_MOD_LABEL = { dmg: '伤害', maxhp: '生命', maxshield: '护盾', regen: '回盾', fireRate: '射速', critChance: '暴击', critMult: '暴伤', bulletSpeed: '弹速', speed: '移速', dodgeChance: '闪避', pierce: '穿透', burn: '灼烧', pellets: '弹片', explode: '爆裂', lifesteal: '吸血', chain: '连锁', homing: '追踪' };
  function bpFmtMod(k, v) {
    if (v == null) return '—';
    if (k === 'critChance' || k === 'dodgeChance') return Math.round(v * 100) + '%';
    if (k === 'homing') return '有';
    return '' + v;
  }
  // 详情卡：词条属性 + 与当前装配对比（绿色↑提升 / 红色↓下降）
  function renderBackpackDetail(idx) {
    var grid = document.getElementById('backpackGrid'), det = document.getElementById('backpackDetail');
    if (!grid || !det) return;
    grid.style.display = 'none'; det.style.display = '';
    var it = run.loot[idx];
    if (!it) { backpackDetail = null; renderBackpack(); return; }
    var rc = RARCOL[it.rarity] || '#C9A24B';
    var mods = it.relicMods || it.mods || null;
    var affixHtml = '<div class="bp-detail-affix"><h4>词条属性</h4>';
    if (mods) affixHtml += modsText(mods).split(' · ').map(function (s) { return '<div class="bp-affix-line">' + s + '</div>'; }).join('');
    else affixHtml += '<div class="bp-affix-line muted">无特殊词条（基础法宝）</div>';
    affixHtml += '</div>';
    // 对比当前装配
    var eq = getEquippedForSlot(it.slot);
    var myMods = mods || {}, eqMods = eq ? (eq.relicMods || eq.mods || {}) : {};
    var cmpRows = '', any = false;
    Object.keys(BP_MOD_LABEL).forEach(function (k) {
      var a = myMods[k], b = eqMods[k]; if (a == null && b == null) return; any = true;
      var av = (a != null) ? a : 0, bv = (b != null) ? b : 0, cls = 'bp-same', arrow = '＝';
      if (av > bv) { cls = 'bp-up'; arrow = '↑'; } else if (av < bv) { cls = 'bp-down'; arrow = '↓'; }
      cmpRows += '<div class="bp-cmp-row"><span class="bp-cmp-key">' + BP_MOD_LABEL[k] + '</span>' +
        '<span class="bp-cmp-eq">' + bpFmtMod(k, b) + '</span>' +
        '<span class="bp-cmp-new ' + cls + '">' + bpFmtMod(k, a) + ' ' + arrow + '</span></div>';
    });
    var eqName = eq ? ((eq.relicMods ? '★ ' : '') + eq.name) : '（空槽）';
    var cmpHtml = '<div class="bp-compare"><h4>对比当前装配 · ' + (SLOTNAME[it.slot] || '装备') + '：' + eqName + '</h4>';
    if (!any) cmpHtml += '<div class="bp-affix-line muted">本件与当前装配均无数值词条，差异体现在稀有度/类型。</div>';
    cmpHtml += cmpRows + '</div>';
    var equipped = (run.equipped[it.slot] === it.uid);
    det.innerHTML =
      '<div class="bp-detail-head">' +
        '<div class="bp-detail-name" style="color:' + rc + '">' + bpSetName(it) + '</div>' +
        '<span class="bp-detail-slot">' + (SLOTNAME[it.slot] || '装备') + '</span>' +
        '<span class="bp-detail-rar" style="color:' + rc + ';border-color:' + rc + '">' + RARNAME[it.rarity] + '</span>' +
        (it.isLegendaryWeapon ? '<span class="bp-detail-rar" style="color:#FFE9A8;border-color:#FFE9A8">传说武器</span>' : '') +
      '</div>' + affixHtml + cmpHtml +
      '<div class="bp-detail-actions">' +
        (equipped ? '<button class="btn btn-sprite btn-bp-back" disabled style="opacity:.6">已装配·本局生效</button>'
                  : '<button class="btn btn-sprite btn-bp-equip" id="bpEquipBtn">⌁ 立即替换</button>') +
        '<button class="btn btn-sprite btn-bp-jade" id="bpJadeBtn">⚒ 折价熔解·换灵玉</button>' +
        '<button class="btn btn-sprite btn-bp-armor" id="bpArmorBtn">🛡 紧急熔解·回装甲</button>' +
        '<button class="btn btn-sprite btn-bp-drop" id="bpDropBtn">✕ 丢弃</button>' +
        '<button class="btn btn-sprite btn-bp-back" id="bpBackBtn">← 返回</button>' +
      '</div>';
    if (!equipped) { var eb = document.getElementById('bpEquipBtn'); if (eb) eb.onclick = function () { equipFromBackpack(idx); }; }
    var jb = document.getElementById('bpJadeBtn'); if (jb) jb.onclick = function () { salvageFromBackpack(idx, 'jade'); };
    var ab = document.getElementById('bpArmorBtn'); if (ab) ab.onclick = function () { salvageFromBackpack(idx, 'armor'); };
    var db = document.getElementById('bpDropBtn'); if (db) db.onclick = function () { dropFromBackpack(idx); };
    var bb = document.getElementById('bpBackBtn'); if (bb) bb.onclick = function () { backpackDetail = null; renderBackpack(); };
  }
  function equipFromBackpack(idx) {
    var it = run.loot[idx]; if (!it) return;
    var slot = it.slot;
    if (it.uid == null) it.uid = ++run._uid;
    // 换装：旧装备仍留背包（run.equipped 仅记录当前生效 uid），不 splice 删除；
    // 否则 recomputeRunStats / getEquippedForSlot 经 findLootByUid 找不到生效件 → 换装静默失效（#BP2 校验发现）
    run.equipped[slot] = it.uid;
    recomputeRunStats();
    floatText(player.x, player.y - 30, '已装配「' + it.name + '」', '#7FB069');
    burst(player.x, player.y, '#7FB069', 8);
    backpackDetail = null; renderBackpack();
  }
  function salvageFromBackpack(idx, mode) {
    var it = run.loot[idx]; if (!it) return;
    var val = Math.round((RARVAL[RAR.indexOf(it.rarity)] || 0) * 0.5);
    if (run.equipped[it.slot] === it.uid) { run.equipped[it.slot] = null; recomputeRunStats(); }
    run.loot.splice(idx, 1);
    if (mode === 'jade') {
      run.jade += val; meta.currency += val;
      floatText(player.x, player.y - 30, '折价熔解 → +' + val + ' 灵玉', '#E0B84A');
      burst(player.x, player.y, '#E0B84A', 8);
    } else {
      var heal = Math.round(player.maxhp * 0.15);
      player.hp = Math.min(player.maxhp, player.hp + heal);
      floatText(player.x, player.y - 30, '紧急熔解 → 回复 ' + heal + ' 装甲', '#5EA0D0');
      burst(player.x, player.y, '#5EA0D0', 8);
    }
    backpackDetail = null; renderBackpack();
  }
  // __BP_TEST_HOOK__ 已移除（验证通过：背包即时换装/折价熔解/recomputeRunStats 0 错误）

  // v12b 拾取列表（吃鸡式）：按 F 打开附近地面物品清单，键鼠/触屏选择拾取
  var pickupOpen = false, pickupSel = 0;
  var pickupRects = []; // 屏幕坐标命中框，供鼠标/触屏点击
  function togglePickupList() {
    if (scene !== 'mission') return;
    pickupOpen = !pickupOpen; pickupSel = 0;
  }
  function getNearLoot() {
    var R = 300, R2 = R * R, arr = [];
    for (var i = 0; i < loot.length; i++) {
      var it = loot[i];
      // 经验灵蕴 / 灵玉 / 灵矿碎屑 均自动磁吸，不列入手动拾取清单；只有整件法宝（含遗物/传说）才触发右侧【拾取】按键
      if (!it.rarity || it.type === 'xp' || it.type === 'jade' || it.type === 'ore') continue;
      var d = dist2(it.x, it.y, player.x, player.y);
      if (d <= R2) arr.push({ idx: i, it: it, d: d });
    }
    arr.sort(function (a, b) { return a.d - b.d; });
    return arr;
  }
  function pickupLabel(it) {
    if (it.type === 'jade') return '灵玉 ×' + (it.amount || 10);
    if (it.type === 'consumable') return '丹药 · ' + ((CONSUMABLES[it.consKey] && CONSUMABLES[it.consKey].name) || '丹药');
    if (it.type === 'bossrelic') return '★ 遗物 · ' + (it.name || '遗物');
    if (it.type === 'legendary_weapon') return '★★ 传说武器 · ' + (it.name || '传说武器');
    if (it.type === 'legendary') return '传说核心 · ' + (it.name || '传说核心');
    return RARNAME[it.rarity] + ' · ' + (it.name || '装备');
  }
  function pickupSelected(sel) {
    var near = getNearLoot();
    if (sel < 0 || sel >= near.length) return;
    forcePickupIndex(near[sel].idx);
    var n2 = getNearLoot().length;
    if (n2 === 0) { pickupOpen = false; }
    else if (pickupSel >= n2) pickupSel = n2 - 1;
  }
  function drawPickupList() {
    pickupRects = [];
    // 离开范围自动收起：无附近可拾取物时关闭列表（杜绝常驻遮挡战斗视野）
    if (pickupOpen && getNearLoot().length === 0) pickupOpen = false;
    if (!pickupOpen || scene !== 'mission') return;
    var isM = isMobile;
    var pad = 10, rowH = isM ? 46 : 34, w = isM ? Math.min(360, W * 0.62) : 320, headerH = 34;
    var near = getNearLoot();
    var bodyH = near.length ? near.length * rowH : 48;
    var h = headerH + bodyH + pad * 2;
    // 贴靠右上视野开阔区（小地图正下方），半透明轻量面板——不压暗全屏，杜绝遮挡中央战斗与触控轮盘
    var mw = isM ? 80 : 150, mh = Math.round(mw * WORLD_H / WORLD_W);
    var my0 = isM ? (78 + SA.t) : 140;
    var x = W - w - 14 - SA.r;
    var y0 = my0 + mh + 8;
    // 半透明底板（轻量，无全屏压暗）
    ctx.fillStyle = 'rgba(16,13,9,0.82)';
    roundRectPath(ctx, x, y0, w, h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(201,162,75,0.55)'; ctx.lineWidth = 1.5; roundRectPath(ctx, x, y0, w, h, 10); ctx.stroke();
    ctx.fillStyle = '#C9A24B'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(isM ? '附近可拾取 · 点按选取' : '附近可拾取  ·  F 关闭  ·  ↑↓ 选择  ·  Enter 拾取', x + pad, y0 + headerH / 2 + 1);
    if (near.length === 0) {
      ctx.fillStyle = '#8B95A0'; ctx.font = (isM ? 14 : 13) + 'px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('附近没有可拾取物品', x + w / 2, y0 + headerH + 24);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      return;
    }
    for (var i = 0; i < near.length; i++) {
      var it = near[i].it, ry = y0 + headerH + pad + i * rowH;
      var sel = (i === pickupSel);
      // 大触控热区：整行可点（mobile 行高 46），交互友好
      ctx.fillStyle = sel ? 'rgba(201,162,75,0.24)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(x + 4, ry, w - 8, rowH - 4);
      if (sel) { ctx.strokeStyle = '#C9A24B'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 4, ry, w - 8, rowH - 4); }
      var col = RARCOL[it.rarity] || '#E8DCC4';
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + pad + 8, ry + (rowH - 4) / 2, isM ? 7 : 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#E8DCC4'; ctx.font = (sel ? 'bold ' : '') + (isM ? 15 : 13) + 'px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText((i + 1) + '. ' + pickupLabel(it), x + pad + 24, ry + (rowH - 4) / 2);
      pickupRects.push({ x: x + 4, y: ry, w: w - 8, h: rowH - 4 });
    }
    ctx.textBaseline = 'alphabetic';
  }
  function toggleBackpack() {
    if (scene !== 'mission') return;
    var ov = document.getElementById('backpackOverlay');
    if (paused && ov.style.display === 'flex') { ov.style.display = 'none'; paused = false; showMobileControls(); return; }
    if (paused) return;
    paused = true; backpackSel = []; backpackDetail = null; renderBackpack(); ov.style.display = 'flex'; showMobileControls();
  }
  function renderBackpack() {
    var grid = document.getElementById('backpackGrid'), det = document.getElementById('backpackDetail');
    var cnt = document.getElementById('backpackCount'), stLoot = document.getElementById('bpStatLoot'), stJade = document.getElementById('bpStatJade');
    if (cnt) cnt.textContent = run.loot.length + ' / ' + invMax;
    if (stLoot) stLoot.textContent = run.loot.length;
    if (stJade) stJade.textContent = run.jade || 0;
    if (!grid || !det) return;
    if (backpackDetail != null) { renderBackpackDetail(backpackDetail); return; }
    grid.style.display = ''; det.style.display = 'none'; grid.innerHTML = '';
    if (run.loot.length === 0) { grid.innerHTML = '<div class="muted" style="grid-column:1/-1">背包空空，先去搜刮战利品</div>'; return; }
    run.loot.forEach(function (it, idx) {
      var card = document.createElement('div');
      var rc = RARCOL[it.rarity] || '#C9A24B';
      card.className = 'bp-card r-' + it.rarity;
      card.style.setProperty('--rc', rc);
      card.style.borderColor = rc;
      var equipped = (run.equipped[it.slot] === it.uid);
      if (equipped) card.classList.add('equipped');
      var sub = RARNAME[it.rarity] + ' · ' + (SLOTNAME[it.slot] || '装备') + ' · 价值' + RARVAL[RAR.indexOf(it.rarity)];
      card.innerHTML = '<div class="bp-card-name" style="color:' + rc + '">' + bpSetName(it) + '</div>' +
        '<div class="bp-card-sub">' + sub + '</div>' +
        (equipped ? '<div class="bp-card-eq">已装配</div>' : '') +
        '<button class="bp-drop" title="丢弃">✕</button>';
      card.querySelector('.bp-drop').onclick = function (e) { e.stopPropagation(); dropFromBackpack(idx); };
      card.onclick = function () { onBackpackCardClick(idx); };
      // 桌面拖拽交换位置（移动端用详情卡操作）
      card.draggable = true;
      card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/bp', String(idx)); });
      card.addEventListener('dragover', function (e) { e.preventDefault(); });
      card.addEventListener('drop', function (e) { e.preventDefault(); var from = parseInt(e.dataTransfer.getData('text/bp'), 10); if (!isNaN(from) && from !== idx) { swapBackpack(from, idx); } });
      grid.appendChild(card);
    });
  }
  function onBackpackCardClick(idx) {
    // #BP2：点选卡片 → 打开详情卡（词条+对比+即时换装/熔解），桌面仍可拖拽换位
    backpackDetail = idx; renderBackpack();
  }
  function swapBackpack(a, b) {
    if (a === b || a < 0 || b < 0 || a >= run.loot.length || b >= run.loot.length) { backpackSel = []; renderBackpack(); return; }
    var tmp = run.loot[a]; run.loot[a] = run.loot[b]; run.loot[b] = tmp;
    if (backpackDetail === a) backpackDetail = b; else if (backpackDetail === b) backpackDetail = a;
    backpackSel = []; renderBackpack();
    burst(player.x, player.y, COL.gold, 4);
  }
  function sortBackpack() {
    // 稀有度降序（RARVAL 大者在前）→ 类型 → 名称
    run.loot.sort(function (a, b) {
      var va = RARVAL[RAR.indexOf(a.rarity)], vb = RARVAL[RAR.indexOf(b.rarity)];
      if (vb !== va) return vb - va;
      var sa = a.slot || '', sb = b.slot || '';
      if (sa !== sb) return sa < sb ? -1 : 1;
      return (a.name || '') < (b.name || '') ? -1 : ((a.name || '') > (b.name || '') ? 1 : 0);
    });
    backpackDetail = null; backpackSel = []; renderBackpack();
    burst(player.x, player.y, COL.gold, 6);
  }
  function dropFromBackpack(idx) {
    if (idx < 0 || idx >= run.loot.length) return;
    var d = run.loot[idx];
    if (run.equipped[d.slot] === d.uid) { run.equipped[d.slot] = null; recomputeRunStats(); }
    run.loot.splice(idx, 1);
    floatText(player.x, player.y - 30, '丢弃「' + d.name + '」', '#C94F4F'); burst(player.x, player.y, '#C94F4F', 6);
    if (backpackDetail === idx) backpackDetail = null;
    renderBackpack();
  }

  // ---------- 丹药消耗品 ----------
  function addConsumable(key) {
    if (player.consumables.length >= 3) { floatText(player.x, player.y - 24, '丹药已满', '#D98A3D'); return; }
    player.consumables.push(key);
    var c = CONSUMABLES[key];
    floatText(player.x, player.y - 24, '获得丹药：' + c.name, '#D9B64A');
    setBanner('获得丹药：' + c.name + '（按 Q 使用）', 1.4);
  }
  function useConsumable() {
    if (scene !== 'mission' || paused || player.consumables.length === 0) return;
    var key = player.consumables.shift(); var c = CONSUMABLES[key];
    if (key === 'bomb') {
      for (var b = bullets.length - 1; b >= 0; b--) { if (bullets[b].from === 'enemy') bullets.splice(b, 1); }
      for (var i = enemies.length - 1; i >= 0; i--) { enemies[i].hp -= 35; enemies[i].flash = 0.1; if (enemies[i].hp <= 0) onEnemyDeath(enemies[i]); }
      if (boss && boss.wake <= 0) { boss.hp -= 35; boss.flash = 0.1; boss.hitT = 0.15; boss.hitMag = 1.8; }
      burst(player.x, player.y, '#D9B64A', 22); spawnVfx('vfx_explosion_sheet', player.x, player.y, 150, 0.8, 0, 0, { cols: 4, rows: 2, fps: 12 }); screenFlash = { color: '#D9B64A', a: 0.4 };
      addShake(6, 220, 110, true); addFreeze(60);
      AudioSys.sfx.bomb();
    } else if (key === 'shield') {
      player.shield = player.maxshield; player.iframe = 1.5; burst(player.x, player.y, '#4E8FC7', 14);
      AudioSys.sfx.shield();
    } else if (key === 'heal') {
      player.hp = Math.min(player.maxhp, player.hp + player.maxhp * 0.4); burst(player.x, player.y, '#7FB069', 14);
      AudioSys.sfx.heal();
    } else if (key === 'slow') {
      enemiesSlowT = 3; enemiesSlowFactor = 0.4; setBanner('凝时！敌人减速', 1.4);
      AudioSys.sfx.slow();
    }
    floatText(player.x, player.y - 24, '使用：' + c.name, '#fff');
  }

  // ---------- 撤离（三角洲式：限时开放循环 + 开放期围堵）----------
  // 设计：地图上 2~3 个撤离点，各自按 关闭→预兆→开放→关闭 循环；
  // 仅「开放」时光柱亮起、可读条撤离；开放期在撤离点周围刷围堵守卫（顶着压力冲进去）。
  var EXTRACT = {
    warnDur: 5,    // 开放前预兆（闪烁信号）时长
    openDur: 30,   // 单次开放窗口（秒）
    guardCd: 3.2,  // 开放期围堵刷新间隔
    gapMin: 25, gapMax: 45, // 关闭后到下一轮预兆的间隔
    beaconDur: 45  // v12.6：击破领主后金色光柱（beacon）自毁倒计时时长
  };
  // ===== 敌机行为与撤离惊动（规则圣经 v1 参数）=====
  var ALERT = {
    detectEdge: 300,   // 探测边缘半径（→ 1级警觉）
    detectCore: 150,   // 中心范围半径（→ 2级锁定）
    fireAlarmDist: 600,// 玩家开火惊动距离
    noSpawn: 400,      // 禁刷半径（玩家周围不直接刷）
    offScreen: 150,    // 屏外生成距离
    pursueDist: 800,   // 追击距离上限（从 home 起算）
    pursueTime: 10,    // 单只追击时间上限
    lv1To2: 2.0,       // 1级持续转锁定
    decay1: 4.0,       // 1级归零耗时
    decay2quiet: 3.0,  // 2级脱离静默要求
    decay2: 7.0,       // 2级归零耗时
    reinforce: 15.0    // 战斗持续增援阈值
  };
  // ===== 敌人 AI 重构（出场缓冲 / 差异化行为树 / 四幕节奏 / Boids 防挤压）=====
  var ENTRY_OFF = 1.4, ENTRY_PLACED = 1.0, ENTRY_SWARM = 1.0;   // 屏外飞入 / 定点遭遇 / 蜂群 入场缓冲（秒，≥1s 出生预警）
  var HUNT_AGGRO = 1.22;          // 转幕围猎：速度/侵略平滑抬升上限（不再瞬间暴冲）
  var SEP_RADIUS = 36;            // Boids 分离半径（防拥挤重叠；硬分离兜底见 resolveEnemyOverlaps）
  var CHARGE_RANGE = 340, CHARGE_TELE = 0.6, CHARGE_DIST = 230, CHARGE_FATIGUE = 1.1; // 冲撞者：触发距离/预警(0.6s红光前摇)/直冲距离/力竭时长
  var CHARGE_MAX = 2;             // 同屏最多 2 只同时蓄力冲刺（0.6s 红光前摇），防集体暴冲
  var SWARM_LO = 180, SWARM_HI = 240;  // 杂兵环绕游走环带半径（Orbit-and-Pounce：180~240px 切向游走）
  var SAFE_SPAWN_MIN = 400;       // 出怪安全区：距机体 ≥ 此值（屏外飞入/定点遭遇均生效）
  var PHASE_SPD = { qi: 0.82, cheng: 0.95, zhuan: 1.0, he: 1.08 }; // 四幕同屏移速系数（起幕限速）
  var ENEMY_CAP = { qi: 10, cheng: 16, zhuan: 22, he: 28 };        // 四幕同屏敌数硬上限（起幕严格控场）
  // #381-① 常规周期刷怪间隔（秒）：起幕慢→合幕快，配合 gameTime 梯度再缩短；玩家清完预置遭遇后场上仍持续有增援
  var SPAWN_INT = { qi: 6.0, cheng: 4.5, zhuan: 3.0, he: 2.5 };
  // ===== 机体手感（加速度-阻尼模型 + 冲刺残影）/ 打击感三件套 =====
  var SPRINT_MULT = 1.8;          // 黄金库：冲刺极速 = 基础移速 × 1.8（0.2s ease-out 爬升至此）
  var ACCEL_TAU = 0.05;           // 加速时间常数收窄：~0.12s 即贴满极速（推到多少就是多少速度，消除起步迟滞的“飘”）
  var DRAG_COEFF = 0.90;          // 松键阻尼：每帧(60fps)保留 90%（按手感规格），配合下方急停阈值即时止滑
  var GHOST_TRIG = 0.72;          // 残影触发：速度 ≥ 极速×此比例（含 dash）
  var GHOST_LIFE = 0.2;           // 残影淡出时长（秒）
  var HITSTOP_NORMAL = 0.03, HITSTOP_CRIT = 0.05, HITSTOP_CD = 0.12; // 顿帧：普通/暴击时长 + 冷却(防连射变慢动作)
  var TRAUMA_HIT = 2.5;           // 命中敌人微震振幅(px)
  var huntRamp = 1.0;             // 围猎速度平滑系数（1 → HUNT_AGGRO 缓动）
  var phaseSpeedMul = 1.0;        // = PHASE_SPD[runPhase] * huntRamp，每帧刷新
  function sepForce(e) {
    var sx = 0, sy = 0;
    for (var j = 0; j < enemies.length; j++) { var o = enemies[j]; if (o === e) continue; var ddx = e.x - o.x, ddy = e.y - o.y, dd = Math.hypot(ddx, ddy); if (dd > 0 && dd < SEP_RADIUS) { var w = (SEP_RADIUS - dd) / SEP_RADIUS; sx += (ddx / dd) * w; sy += (ddy / dd) * w; } }
    return { x: sx, y: sy };
  }
  // 硬分离兜底：位置级校正，彻底消除怪堆重叠（与 sepForce 软力互补；O(n²) 但敌数≤28 可忽略）
  function resolveEnemyOverlaps() {
    for (var a = 0; a < enemies.length; a++) {
      var ea = enemies[a];
      for (var b = a + 1; b < enemies.length; b++) {
        var eb = enemies[b];
        var ddx = eb.x - ea.x, ddy = eb.y - ea.y, dd = Math.hypot(ddx, ddy), minD = (ea.r + eb.r) * 0.92;
        if (dd > 0.001 && dd < minD) { var push = (minD - dd) * 0.5, nx = ddx / dd, ny = ddy / dd; ea.x -= nx * push; ea.y -= ny * push; eb.x += nx * push; eb.y += ny * push; }
      }
    }
  }
  // 出怪安全区：距机体 < SAFE_SPAWN_MIN 时沿玩家→敌方向推到环上（allowClose 的脚本怪豁免）
  function safeSpawnPos(x, y) {
    var dx = x - player.x, dy = y - player.y, d = Math.hypot(dx, dy);
    if (d < SAFE_SPAWN_MIN) {
      if (d < 1) { var aa = rand(0, 6.283); dx = Math.cos(aa); dy = Math.sin(aa); d = 1; }
      return [clamp(player.x + (dx / d) * SAFE_SPAWN_MIN, 40, WORLD_W - 40), clamp(player.y + (dy / d) * SAFE_SPAWN_MIN, 40, WORLD_H - 40)];
    }
    return [x, y];
  }
  function enemyCapNow() { var t = (run ? run.tier : 1); var base = ENEMY_CAP[runPhase] || 22; var sc = (runPhase === 'qi' ? 2 : (runPhase === 'cheng' ? 3 : (runPhase === 'zhuan' ? 4 : 5))); return base + t * sc; }
  function canSpawnMore() { return enemies.length < enemyCapNow(); }
  var EXFIL2 = {
    frenzy: 300,         // 狂暴区半径（满警戒·无限距）
    ripple: 700,         // 波及区半径（+1级）
    silentMul: 0.5,      // 静默启动缩减系数
    quickCast: 1.5,      // 急速读条时长
    quickJade: 0.10,     // 急速读条灵玉折损
    abortCd: 25.0        // 主动中断冷却
  };
  function initExtractPoints() {
    extractPoints = [];
    var n = 2 + (run.tier >= 3 ? 1 : 0); // tier1-2 给 2 个，tier3+ 给 3 个
    // 候选锚点：世界上半区 + 左右两侧，远离出生点（出生在世界下半 y≈0.8H）
    var anchors = [
      { x: WORLD_W * 0.5, y: WORLD_H * 0.16 },
      { x: WORLD_W * 0.16, y: WORLD_H * 0.44 },
      { x: WORLD_W * 0.84, y: WORLD_H * 0.44 }
    ];
    for (var i = 0; i < n; i++) {
      var a = anchors[i];
      var ap = { x: a.x, y: a.y }; // 撤离点落在候选锚点
      extractPoints.push({
        x: ap.x - 80, y: ap.y - 80, w: 160, h: 160,
        label: String.fromCharCode(65 + i), // A / B / C
        state: 'sealed', // v12.6：初始封锁态——须击破关卡领主才解锁（不再计时循环自开放）
        timer: 0, beacon: false, beaconTimer: 0,
        prog: 0, guardCd: EXTRACT.guardCd, cd: 0
      });
      // 预置围堵兵（遭遇制，不再凭空刷）——用标志位 extractGuard 关联，唤醒时遍历 enemies 按 idx 匹配
      for (var gi = 0; gi < 3; gi++) {
        var ga2 = (gi / 3) * 6.28 + rand(-0.4, 0.4), gd2 = rand(200, 320);
        var gx3 = clamp(ap.x + Math.cos(ga2) * gd2, 30, WORLD_W - 30);
        var gy3 = clamp(ap.y + Math.sin(ga2) * gd2, 30, WORLD_H - 30);
        var gue = spawnEnemy(gx3, gy3, 1 + (run.tier - 1));
        gue.wake = 0; gue.alert = 0; gue.homeX = gx3; gue.homeY = gy3; gue.patrolAng = rand(0, 6.28);
        gue.extractGuard = i;
      }
    }
  }
  // ===== 撤离惊动：反制选择 / 惊动触发 / 中断（规则圣经模块二）=====
  function showExfilChoice(ez) {
    var el = document.getElementById('exfilChoice'); if (!el) return;
    exfilAutoT = 2.0; // 2秒后自动按"标准撤离"执行
    el.style.display = 'flex';
  }
  function hideExfilChoice() { var el = document.getElementById('exfilChoice'); if (el) el.style.display = 'none'; }
  function commitExfil(choice) {
    if (!exfilChoicePending) return;
    var ez = exfilChoicePending;
    exfilChoice = choice; exfilStarted = true; exfilPoint = ez; exfilChoicePending = null; exfilAutoT = 0; hideExfilChoice();
    phaseObjectFeedback('extract', ez.x + ez.w / 2, ez.y + ez.h / 2);
    var silent = (choice === 'silent');
    if (silent && run.loot.length > 0) { run.loot.pop(); run.picked = Math.max(0, run.picked - 1); floatText(player.x, player.y - 30, '静默启动：消耗 1 件战利品', '#C9A24B'); }
    if (choice === 'quick') { exfilJadePenalty = EXFIL2.quickJade; floatText(player.x, player.y - 30, '急速读条！', '#7FB069'); }
    if (choice === 'clear') { floatText(player.x, player.y - 30, '提前清场撤离', '#7FB069'); }
    triggerAlarm(ez, silent);
  }
  function triggerAlarm(ez, silent) {
    var cx = ez.x + ez.w / 2, cy = ez.y + ez.h / 2; exfilCenter = { x: cx, y: cy };
    var fr = EXFIL2.frenzy, rp = EXFIL2.ripple;
    if (silent) { fr *= EXFIL2.silentMul; rp *= EXFIL2.silentMul; }
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i]; if (e.wake > 0) continue;
      var d = Math.hypot(e.x - cx, e.y - cy);
      if (d <= fr) { e.alert = 2; e.alarmIgnored = true; e.pursueStage = 0; e.pursueT = 0; }
      else if (d <= rp) { e.alert = Math.min(2, e.alert + 1); e.alarmIgnored = false; }
    }
    exfilAlarmT = 1.2;
    setBanner('撤离惊动！灵能脉冲唤醒敌机（红=狂暴死追·黄=波及）', 2.6, null, 'top');
  }
  function abortExfil(ez) {
    for (var i = 0; i < enemies.length; i++) { var e = enemies[i]; if (e.alarmIgnored) { e.alert = 0; e.alarmIgnored = false; e.alertClock = 0; e.decayT = 0; e.pursueT = 0; } }
    ez.prog = 0; ez.state = 'cooldown'; ez.cd = EXFIL2.abortCd;
    exfilStarted = false; exfilChoice = null; exfilCenter = null; exfilAutoT = 0;
    setBanner('撤离中断！被惊动敌机撤退，撤离点冷却 ' + Math.ceil(EXFIL2.abortCd) + 's', 2.8, null, 'top');
  }
  function updateExtractPoints(dt) {
    // v12.6：全局战场自毁倒计时（领主击破、beacon 激活后启动）
    if (run && run.selfDestruct > 0) {
      run.selfDestruct -= dt;
      if (run.selfDestruct <= 0) { run.selfDestruct = 0; collapseEvac(); }
    }
    if (!extractPoints) return;
    for (var i = 0; i < extractPoints.length; i++) {
      var z = extractPoints[i];
      if (z.state === 'sealed') {
        // 封锁态：无计时、无循环开放——须击破领主由 activateEvacBeacon() 解锁
        continue;
      }
      if (z.beacon) {
        // 光柱态：beaconTimer 递减，归零则光柱坍塌（collapsed）
        z.beaconTimer -= dt;
        if (z.beaconTimer <= 0) { z.beacon = false; z.state = 'collapsed'; z.prog = 0; }
        continue;
      }
      z.timer -= dt;
      if (z.state === 'closed') {
        if (z.timer <= 0) { z.state = 'warning'; z.timer = EXTRACT.warnDur; }
      } else if (z.state === 'warning') {
        if (z.timer <= 0) {
          z.state = 'open'; z.timer = EXTRACT.openDur;
          setBanner('撤离点 ' + z.label + ' 已开放！冲入光柱读条 2.8s 带出战利品（敌人正在围堵）', 3, null, 'top');
          for (var egi = 0; egi < enemies.length; egi++) { if (enemies[egi].extractGuard === i) { enemies[egi].wake = 0; enemies[egi].alert = 1; } }
        }
      } else if (z.state === 'open') {
        if (z.timer <= 0) { z.state = 'closed'; z.timer = rand(EXTRACT.gapMin, EXTRACT.gapMax); z.prog = 0; setBanner('撤离点 ' + z.label + ' 已关闭', 2.2); }
      } else if (z.state === 'cooldown') {
        z.cd -= dt;
        if (z.cd <= 0) { z.state = 'closed'; z.timer = rand(EXTRACT.gapMin, EXTRACT.gapMax); z.prog = 0; setBanner('撤离点 ' + z.label + ' 冷却结束（已关闭）', 2.0); }
      }
    }
  }
  // v12.6：领主击破 → 全部撤离点爆发金色光柱 beacon + 启动 45s 战场自毁 + 刷狂暴余烬杂兵围堵
  // v15.1 修复：解锁条件从「仅 sealed/collapsed」放宽为「所有非 beacon 撤离点」——
  // 旧版相位开窗（openExtractPoints）可能把撤离点拉进计时循环（open/closed/warning），
  // 导致杀 Boss 时不在 sealed 态 → beacon 永不激活 → 杀死 Boss 也无法撤离（Boss 实测反馈）
  function activateEvacBeacon() {
    if (!extractPoints || !extractPoints.length) return;
    // v15.1 终局清场（Boss 指令）：领主已殒，余下杂兵尽数湮灭。
    // 确定性实现：dead 标记 + 死亡视觉 + 悬赏计数 + splice 移除（不依赖 onEnemyDeath 的掉落/自爆链路，
    // 避免复杂路径抛错吞掉清场；倒序遍历 + splice 当前索引为经典安全模式）
    for (var _ci = enemies.length - 1; _ci >= 0; _ci--) {
      var _ce = enemies[_ci];
      if (!_ce || _ce.dead) continue;
      _ce.dead = true;
      run.kills++;
      try {
        burst(_ce.x, _ce.y, '#E8DCC4', 8, { smin: 30, smax: 80 });
        spawnVfx('vfx_explosion_sheet', _ce.x, _ce.y, 40, 0.5, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 12 });
        if (_ce.elite) bountyProgress('eliteKill', 1);
        if (player.phase === PHASE.EMBER) bountyProgress('emberKill', 1);
      } catch (err) {}
      enemies.splice(_ci, 1);
    }
    var any = false;
    for (var i = 0; i < extractPoints.length; i++) {
      var z = extractPoints[i];
      if (!z.beacon) { z.state = 'open'; z.beacon = true; z.beaconTimer = EXTRACT.beaconDur; z.prog = 0; any = true; }
    }
    if (!any) { // 全部坍塌（极端情况）：强制重新点亮全部，保底可撤离
      for (var j = 0; j < extractPoints.length; j++) { extractPoints[j].state = 'open'; extractPoints[j].beacon = true; extractPoints[j].beaconTimer = EXTRACT.beaconDur; extractPoints[j].prog = 0; }
    }
    run.selfDestruct = EXTRACT.beaconDur; run.evacBeacon = true;
    addShake(8, 600, 200, true); addTint('#FFE9A8', 0.3); screenFlash = { color: '#FFE9A8', a: 0.3 };
    AudioSys.sfx.alarm();
    setBanner('★ 领主已殒！金色光柱冲霄——战场将在 ' + EXTRACT.beaconDur + 's 后自毁，冲入光柱撤离！', 3.8, null, 'top');
    // 刷狂暴余烬杂兵围堵（出现即锁定、全速死追）
    for (var s = 0; s < 6; s++) {
      var ang = rand(0, 6.28), rr = rand(420, 640);
      var sx = clamp(player.x + Math.cos(ang) * rr, 40, WORLD_W - 40), sy = clamp(player.y + Math.sin(ang) * rr, 40, WORLD_H - 40);
      var se = spawnEnemy(sx, sy, run.tier, { arche: Math.random() < 0.5 ? 'kamikaze' : 'swarm', allowClose: true });
      se.wake = 0; se.alert = 2; se.alarmIgnored = true; se.dmgMul *= 1.3; se.hunt = true;
      if (se.arche === 'kamikaze') { se.hp = Math.round(se.hp * 1.4); se.maxhp = se.hp; }
    }
  }
  // v12.6：战场自毁坍塌（45s 内未撤离 → 强制结算失败）
  function collapseEvac() {
    if (scene !== 'mission') return;
    setBanner('⚠ 战场自毁！撤离失败！', 3, null, 'top');
    addShake(9, 700, 240, true); addTint('#B03A3A', 0.4); screenFlash = { color: '#B03A3A', a: 0.4 };
    AudioSys.sfx.bossDie();
    finishRun('death');
  }

  // ---------- 暂停 ----------
  function togglePause() {
    if (document.getElementById('pauseOverlay').style.display === 'flex') { closePause(); return; }
    paused = true; document.getElementById('pauseOverlay').style.display = 'flex';
    var st = document.getElementById('pauseStats');
    if (st && run) st.innerHTML = '本局：击杀 <b>' + run.kills + '</b> · 战利品 <b>' + run.loot.length + '</b> 件 · 已搜刮 <b>' + run.nodes + '/' + (3 + run.tier) + '</b> 点 · <b>' + Math.floor(run.time) + '</b> 秒';
    var _af = document.getElementById('pauseAutoFire'); if (_af) _af.textContent = '自动开火：' + (autoFire ? '开' : '关');
    showMobileControls(); checkOrientation();
  }
  function closePause() { document.getElementById('pauseOverlay').style.display = 'none'; paused = false; showMobileControls(); checkOrientation(); }

  // ---------- Boss ----------
  function bossPhaseColor(b) {
    if (b.kind === 'qiongqi') return b.phase >= 2 ? '#D96A7E' : COL.sha;
    if (b.kind === 'taotie') return b.phase >= 2 ? '#C8642A' : '#8A4B2A';
    if (b.kind === 'hundun') return b.phase >= 2 ? '#B06FD0' : '#6A4B8A';
    // 梼杌：紫秘宝 → 转赤 → 煞红（越来越危险的可读信号）
    if (b.phase === 3) return COL.sha;
    if (b.phase === 2) return '#D08A9A';
    return '#8A6FB8';
  }
  function setBossPhase(b, p) {
    if (b.phase === p) return;
    b.phase = p;
    var pcol = bossPhaseColor(b);
    // 阶段切换反馈：白闪 + 慢镜顿帧 + 抖动 + 色调偏移 + 1s 弱点无敌窗口
    addShake(5.5, 280, 130, true); addFreeze(120); addTint(pcol, 0.3);
    b.invuln = 1.0;
    var names = { qiongqi: '穷奇', taowu: '梼杌', taotie: '饕餮', hundun: '混沌' };
    var n = names[b.kind] || 'BOSS';
    var txt = p === 2 ? (n + '·狂暴！') : (p === 3 ? (n + '·末路！弹幕倾泻') : (n + '·阶段 ' + p + '！'));
    setBanner(txt, 1.5);
    AudioSys.sfx.bossPhase();
  }
  function spawnBoss() {
    bossSpawned = true;
    var kinds = ['taowu', 'qiongqi', 'taotie', 'hundun'];
    var kind = kinds[randi(0, kinds.length - 1)];
    var hpMul = { taowu: 1.0, qiongqi: 0.92, taotie: 1.08, hundun: 0.95 };
    var radius = { taowu: 46, qiongqi: 50, taotie: 52, hundun: 48 };
    // #B1 修复：血量改「搜刮进度为主 + 少量封顶时间压力」，不再随真实时间线性膨胀惩罚慢速搜刮流
    // #Boss-HP-v2：v10 灵潮(连击+觉醒)上线后玩家 DPS ↑~50%，基血 620→2600、进度项 60→100/箱、层系数 0.7→0.85，目标 Boss 战 25~40s
    var progBonus = clamp(run.nodes - (3 + run.tier), 0, 6) * 100;
    var hp = (2600 + progBonus + Math.min(gameTime, 240) * 3) * (1 + (run.tier - 1) * 0.85) * hpMul[kind];
    var names = { taowu: '梼杌', qiongqi: '穷奇', taotie: '饕餮', hundun: '混沌' };
    var tips = {
      taowu: '⚠ 梼杌·重甲堡垒 来袭！（弹幕+阶段强化）',
      qiongqi: '⚠ 穷奇·高速掠食 来袭！（突进+召唤）',
      taotie: '⚠ 饕餮·吞噬熔炉 来袭！（扇形火柱+吸引）',
      hundun: '⚠ 混沌·终焉虚空 来袭！（螺旋弹幕+旋转甲胄）'
    };
    boss = { kind: kind, x: WORLD_W / 2, y: -60, hp: hp, maxhp: hp, r: radius[kind], phase: 1, atkCd: 2.6, burstCd: 4.0, devourCd: 5, flash: 0, wake: 1.2, ang: 0,
      summonCd: 6, dashCd: 4, dashing: 0, dashWarn: 0, summonWarn: 0, invuln: 0, hitT: 0, hitMag: 0,
      dimTear: null, dimTearT: 0, dimTearDone: false, dimRot: 0 };
    setBanner(tips[kind], 2.4);
    // 出场反馈：暗角收拢 + 煞红闪 + 重抖
    addShake(6, 480, 160, true); addTint('#B03A3A', 0.25); bossVig = 1.2; screenFlash = { color: '#B03A3A', a: 0.25 };
    AudioSys.sfx.bossRoar();
  }
  function updateBoss(dt) {
    var b = boss;
    if (b.wake > 0) { b.wake -= dt; b.y += (WORLD_H * 0.22 - b.y) * dt * 0.7; return; }
    if (b.flash > 0) b.flash -= dt;
    if (b.hitT > 0) b.hitT -= dt;
    if (b.invuln > 0) b.invuln -= dt;
    // 元素附着 / 持续反应（感电·沉沦）计时
    if (b.auraT > 0) { b.auraT -= dt; if (b.auraT <= 0) b.aura = null; }
    if (b.electroT > 0) { b.electroT -= dt; b.electroCd -= dt; if (b.electroCd <= 0) { b.electroCd = 0.42; for (var ez2 = 0; ez2 < enemies.length; ez2++) { var eo = enemies[ez2]; if (eo.wake <= 0 && dist2(eo.x, eo.y, b.x, b.y) < 220 * 220) { eo.hp -= b.electroDmg; eo.flash = 0.06; addVfxLine(b.x, b.y, eo.x, eo.y, '#6FC0FF', 0.22); } } b.hp -= b.electroDmg * 0.4; } }
    if (b.drownT > 0) { b.drownT -= dt; b.hp -= b.drownDps * dt; }
    if (b.hp <= 0) { killBoss(); return; }
    // v12.6：半血维度撕裂大招（叠加在 4 种 Boss 现有弹幕之上）
    if (b.dimTear || (!b.dimTearDone && b.hp <= b.maxhp * 0.5)) {
      if (!b.dimTear) { b.dimTear = 'charge'; b.dimTearT = 1.4; setBanner('⚠ 维度撕裂蓄能！领主正在撕开相位壁——准备按颜色翻相！', 2.6, null, 'top'); addShake(4, 240, 120, true); }
      b.dimTearT -= dt;
      if (b.dimTear === 'charge') {
        b.x += (WORLD_W / 2 - b.x) * Math.min(1, dt * 2.2);
        b.y += (WORLD_H * 0.32 - b.y) * Math.min(1, dt * 2.2);
        b.dimRot += dt * 1.4;
        if (b.dimTearT <= 0) {
          b.dimTear = 'active'; b.dimTearT = 4.5;
          // 随机引爆 2 处引力裂缝（拖拽施压，复用 weaverRifts 牵引语义）
          for (var _dtf = 0; _dtf < 2; _dtf++) {
            var _dra = rand(0, 6.28), _drr = rand(260, 480);
            var _drx = clamp(player.x + Math.cos(_dra) * _drr, 60, WORLD_W - 60), _dry = clamp(player.y + Math.sin(_dra) * _drr, 60, WORLD_H - 60);
            weaverRifts.push({ x: _drx, y: _dry, r: 18, pull: 170, core: 26, life: 5.0, spin: rand(0, 6.28), pulse: 0, torn: true });
            burst(_drx, _dry, '#B06FD0', 14, { ring: true, ringR: 36 });
          }
          addShake(6, 360, 150, true); addTint('#B06FD0', 0.3); AudioSys.sfx.bossRoar();
          setBanner('⚠ 维度撕裂！红束致命于鎏金相 / 金束致命于余烬相——按光阵颜色即时翻相规避！', 3.4, null, 'top');
        }
      } else if (b.dimTear === 'active') {
        b.dimRot += dt * 1.6;
        // 双色旋转死亡光阵：红束（致命于鎏金相）+ 金束（致命于余烬相）；翻到对应安全相即可免伤
        if (player.iframe <= 0) {
          var _bra = b.dimRot, _bga = b.dimRot + Math.PI;
          var _tpx = player.x - b.x, _tpy = player.y - b.y;
          var _chk = function (ang) { var pr = _tpx * Math.cos(ang) + _tpy * Math.sin(ang); if (pr < 0 || pr > 1200) return false; var pe = Math.abs(-_tpx * Math.sin(ang) + _tpy * Math.cos(ang)); return pe < (PHB + 18); };
          if (player.phase === PHASE.GOLD && _chk(_bra)) { damagePlayer(EDMG_HEAVY * tierDmgMul(run.tier)); floatText(player.x, player.y - 22, '维度撕裂!', '#C94F4F', 'crit'); }
          if (player.phase === PHASE.EMBER && _chk(_bga)) { damagePlayer(EDMG_HEAVY * tierDmgMul(run.tier)); floatText(player.x, player.y - 22, '维度撕裂!', '#E0B84A', 'crit'); }
        }
        if (b.dimTearT <= 0) { b.dimTear = null; b.dimTearDone = true; setBanner('维度撕裂平息——追击破局！', 2.2); }
      }
    }
    var dx = player.x - b.x, dy = player.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (b.kind === 'qiongqi') updateQiongqi(b, dt, dx, dy, d);
    else if (b.kind === 'hundun') updateHundun(b, dt, dx, dy, d);
    else if (b.kind === 'taotie') updateTaotie(b, dt, dx, dy, d);
    else updateTaowu(b, dt, dx, dy, d);
  }
  function updateTaowu(b, dt, dx, dy, d) {
    var mv = (d > 280 ? 1 : -0.5) * 52 * dt;
    b.x = clamp(b.x + (dx / d) * mv, 70, WORLD_W - 70); b.y = clamp(b.y + (dy / d) * mv * 0.6, 70, WORLD_H * 0.5);
    if (b.phase === 1 && b.hp <= b.maxhp * 0.66) setBossPhase(b, 2);
    else if (b.phase === 2 && b.hp <= b.maxhp * 0.33) setBossPhase(b, 3);
    b.atkCd -= dt; var rate = b.phase === 3 ? 0.55 : (b.phase === 2 ? 0.75 : 1.2);
    if (b.atkCd <= 0) {
      var base = Math.atan2(dy, dx), shots = b.phase >= 2 ? 3 : 1;
      for (var s = 0; s < shots; s++) { var off = (s - (shots - 1) / 2) * 0.16; fireBullet(b.x, b.y, base + off, 'enemy', EDMG_NORMAL * tierDmgMul(run.tier), 200, { boss: true }); }
      b.atkCd = rate * (phase === PHASE.EMBER ? 1 / EMBER_ENRAGE_ATK_RATE : 1); // 余烬狂暴：射速×1.4
    }
    b.burstCd -= dt;
    if (b.burstCd <= 0) {
      var n = b.phase === 3 ? 22 : (b.phase === 2 ? 18 : 12), spd = b.phase === 3 ? 175 : 145; b.ang += 0.35;
      for (var i = 0; i < n; i++) { var a = b.ang + (i / n) * 6.28; fireBullet(b.x, b.y, a, 'enemy', EDMG_NORMAL * tierDmgMul(run.tier), spd, { boss: true }); }
      b.burstCd = b.phase === 3 ? 2.2 : (b.phase === 2 ? 2.8 : 3.8);
    }
  }
  function updateQiongqi(b, dt, dx, dy, d) {
    // 突进（带 0.4s 红色预警线）+ 召唤（带 0.6s 紫色法阵）+ 放射
    if (b.dashing > 0) {
      b.dashing -= dt; b.x += (dx / d) * 320 * dt; b.y += (dy / d) * 320 * dt;
    } else {
      var mv = (d > 240 ? 1 : -0.4) * 120 * dt;
      b.x = clamp(b.x + (dx / d) * mv, 60, WORLD_W - 60); b.y = clamp(b.y + (dy / d) * mv * 0.7, 60, WORLD_H * 0.55);
      b.dashCd -= dt;
      if (b.dashCd <= 0 && b.dashing <= 0) { b.dashWarn = 0.4; b.dashCd = (b.phase >= 2 ? 3 : 4.5); }
      if (b.dashWarn > 0) { b.dashWarn -= dt; if (b.dashWarn <= 0) b.dashing = 0.45; }
    }
    if (b.phase === 1 && b.hp <= b.maxhp * 0.6) setBossPhase(b, 2);
    else if (b.phase === 2 && b.hp <= b.maxhp * 0.3) setBossPhase(b, 3);
    b.atkCd -= dt; var rate = b.phase === 3 ? 0.5 : (b.phase === 2 ? 0.7 : 1.0);
    if (b.atkCd <= 0) {
      var base = Math.atan2(dy, dx), shots = b.phase >= 2 ? 5 : 3;
      for (var s = 0; s < shots; s++) { var off = (s - (shots - 1) / 2) * 0.12; fireBullet(b.x, b.y, base + off, 'enemy', EDMG_NORMAL * tierDmgMul(run.tier), 240, { boss: true }); }
      b.atkCd = rate * (phase === PHASE.EMBER ? 1 / EMBER_ENRAGE_ATK_RATE : 1); // 余烬狂暴：射速×1.4
    }
    b.summonCd -= dt;
    if (b.summonWarn > 0) {
      b.summonWarn -= dt;
      if (b.summonWarn <= 0) {
        if (enemies.length < 40) {
          var cnt = b.phase >= 2 ? 3 : 2;
          for (var k = 0; k < cnt; k++) spawnEnemy(b.x + rand(-40, 40), b.y + rand(-40, 40), b.tier || run.tier);
        }
        b.summonCd = b.phase >= 3 ? 4 : 7; setBanner('穷奇召唤眷属！', 1.2, null, 'top');
      }
    } else if (b.summonCd <= 0) { b.summonWarn = 0.6; }
  }
  function updateTaotie(b, dt, dx, dy, d) {
    // 饕餮：重甲慢速，阶段切换时大口吸引+扇形熔炉火柱
    if (b.phase === 1 && b.hp <= b.maxhp * 0.65) setBossPhase(b, 2);
    else if (b.phase === 2 && b.hp <= b.maxhp * 0.35) setBossPhase(b, 3);
    var mv = (d > 220 ? 1 : -0.3) * 28 * dt;
    b.x = clamp(b.x + (dx / d) * mv, 70, WORLD_W - 70); b.y = clamp(b.y + (dy / d) * mv * 0.5, 70, WORLD_H * 0.45);
    b.atkCd -= dt; var rate = b.phase === 3 ? 0.9 : (b.phase === 2 ? 1.2 : 1.7);
    if (b.atkCd <= 0) {
      var base = Math.atan2(dy, dx), shots = b.phase === 3 ? 7 : (b.phase === 2 ? 5 : 3);
      for (var s = 0; s < shots; s++) { var off = (s - (shots - 1) / 2) * 0.18; fireBullet(b.x, b.y, base + off, 'enemy', EDMG_NORMAL * tierDmgMul(run.tier), 160, { boss: true }); }
      b.atkCd = rate * (phase === PHASE.EMBER ? 1 / EMBER_ENRAGE_ATK_RATE : 1); // 余烬狂暴：射速×1.4
    }
    b.burstCd -= dt;
    if (b.burstCd <= 0) {
      var n = b.phase === 3 ? 28 : (b.phase === 2 ? 22 : 16), spd = b.phase === 3 ? 150 : 120; b.ang += 0.25;
      for (var i = 0; i < n; i++) { var a = b.ang + (i / n) * 6.28; fireBullet(b.x, b.y, a, 'enemy', EDMG_NORMAL * tierDmgMul(run.tier), spd, { boss: true }); }
      b.burstCd = b.phase === 3 ? 2.6 : (b.phase === 2 ? 3.4 : 4.4);
    }
    // 吞噬借力（设计 §1.2）：周期性吞噬——常规为威胁拉拽；玩家处于引力裂隙内则反转成工具（吸宝+开秘库）
    b.devourCd -= dt;
    if (b.devourCd <= 0) {
      b.devourCd = 6;
      var pull = clamp(1 - d / 520, 0, 1) * 120;
      player.vx -= (dx / d) * pull * dt * 6; player.vy -= (dy / d) * pull * dt * 6;
      for (var gri = 0; gri < gravityRifts.length; gri++) {
        var gr = gravityRifts[gri];
        if (Math.hypot(player.x - gr.x, player.y - gr.y) < gr.r && phase === PHASE.EMBER) { triggerDevourBorrow(b); break; } // 吞噬借力仅在余烬相生效（§7.6）
      }
    }
  }
  function updateHundun(b, dt, dx, dy, d) {
    // 混沌：终局弹幕型，虚空眼为核心，旋转甲胄 + 螺旋/环形弹幕
    if (b.phase === 1 && b.hp <= b.maxhp * 0.6) setBossPhase(b, 2);
    else if (b.phase === 2 && b.hp <= b.maxhp * 0.3) setBossPhase(b, 3);
    var mv = (d > 260 ? 1 : -1) * 18 * dt;
    b.x = clamp(b.x + (dx / d) * mv, 80, WORLD_W - 80); b.y = clamp(b.y + (dy / d) * mv * 0.4, 80, WORLD_H * 0.4);
    b.atkCd -= dt; var rate = b.phase === 3 ? 0.45 : (b.phase === 2 ? 0.65 : 0.9);
    if (b.atkCd <= 0) {
      var base = Math.atan2(dy, dx), shots = b.phase === 3 ? 6 : (b.phase === 2 ? 4 : 2);
      for (var s = 0; s < shots; s++) { var off = (s - (shots - 1) / 2) * 0.22; fireBullet(b.x, b.y, base + off, 'enemy', EDMG_NORMAL * tierDmgMul(run.tier), 210, { boss: true }); }
      b.atkCd = rate * (phase === PHASE.EMBER ? 1 / EMBER_ENRAGE_ATK_RATE : 1); // 余烬狂暴：射速×1.4
    }
    b.burstCd -= dt;
    if (b.burstCd <= 0) {
      var n = b.phase === 3 ? 36 : (b.phase === 2 ? 28 : 20), spd = 130;
      if (phase === PHASE.EMBER) {
        // 余烬相：螺旋弹幕（难、但掉率 ×2）
        b.ang += 0.42;
        for (var i = 0; i < n; i++) { var a = b.ang + (i / n) * 6.28 * (b.phase === 3 ? 2.5 : 1.8); fireBullet(b.x, b.y, a, 'enemy', EDMG_NORMAL * tierDmgMul(run.tier), spd + i * 2, { boss: true }); }
        b.burstCd = b.phase === 3 ? 2.0 : (b.phase === 2 ? 2.6 : 3.4);
      } else {
        // 鎏金相：环形弹幕（易读、可走位，鼓励用相位柱切回鎏金创造读弹窗口）
        b.ang += 0.12;
        for (var i2 = 0; i2 < n; i2++) { var a2 = b.ang + (i2 / n) * 6.28; fireBullet(b.x, b.y, a2, 'enemy', EDMG_NORMAL * tierDmgMul(run.tier), spd, { boss: true }); }
        b.burstCd = b.phase === 3 ? 2.4 : (b.phase === 2 ? 3.0 : 3.8);
      }
    }
  }
  function killBoss() {
    if (!boss) return;
    run.killedBoss = true; if (!meta.bossCleared) meta.bossCleared = true; saveMeta();
    run.enemyKills.boss = (run.enemyKills.boss || 0) + 1;
    // 死亡反馈：白闪 + 大爆裂双环 + 长抖 + 长顿帧
    burst(boss.x, boss.y, '#B37FD0', 30, { ring: true, ringR: 90, r0: 10 });
    burst(boss.x, boss.y, '#B03A3A', 16, { ring: true, ringR: 60 });
    addShake(6, 420, 150, true); addFreeze(180); addTint('#ffffff', 0.4); screenFlash = { color: '#ffffff', a: 0.4 };
    AudioSys.sfx.bossDie();
    // 常规战利品（掉落分层重构 2026-08-19）：150 灵玉 + 10 灵矿碎屑 + 2~3 件整装（60%蓝/38%紫/2%橙），整装过单局预算则降级为灵玉
    dropLoot(boss.x, boss.y, 'blue', 'jade', null, { amount: 150 });
    dropOre(boss.x, boss.y, 10);
    var nb = randi(2, 3);
    for (var bi2 = 0; bi2 < nb; bi2++) {
      var br = Math.random(), brar = br < 0.60 ? 'blue' : (br < 0.98 ? 'purple' : 'orange');
      var bx = boss.x + rand(-45, 45), by = boss.y + rand(-45, 45);
      if (budgetArtifact(brar)) dropLoot(bx, by, brar, 'artifact');
      else dropLoot(bx, by, 'blue', 'jade', null, { amount: 40 });
    }
    // ★ Boss 专属遗物（保底1件，从该Boss遗物表随机选）
    var relics = BOSS_RELICS[boss.kind] || BOSS_RELICS.taowu;
    var relic = relics[randi(0, relics.length - 1)];
    dropLoot(boss.x, boss.y, relic.rarity, 'bossrelic', relic);
    // ★ 首杀保底掉落对应传说武器
    var bossKey = boss.kind;
    if (!meta.bossFirstKill) meta.bossFirstKill = {};
    if (!meta.bossFirstKill[bossKey]) {
      meta.bossFirstKill[bossKey] = true; saveMeta();
      var legName = BOSS_LEGENDARY[bossKey];
      if (legName && LEGENDARY_WEAPONS[legName]) {
        var lw = LEGENDARY_WEAPONS[legName];
        dropLoot(boss.x, boss.y - 30, lw.rarity, 'legendary_weapon', { name: legName, slot: lw.slot, mods: lw.mods, subtype: lw.subtype, passive: lw.passive });
        burst(boss.x, boss.y - 30, '#FFE9A8', 30, { ring: true, ringR: 100, r0: 10 });
        spawnRing(boss.x, boss.y - 30, '#FFE9A8', 120);
        floatText(boss.x, boss.y - 80, '★★ ' + legName, '#FFE9A8', 'crit');
      }
    }
    // Boss 遗物掉落额外视觉：金光柱 + 多层爆裂
    burst(boss.x, boss.y, '#FFE9A8', 24, { ring: true, ringR: 70, r0: 8 });
    burst(boss.x, boss.y, '#E0B84A', 18, { ring: true, ringR: 50 });
    spawnRing(boss.x, boss.y, '#E0B84A', 80);
    floatText(boss.x, boss.y - 50, '★ ' + relic.name, '#FFE9A8', 'crit');
    // v12.6：击破领主 → 引爆金色光柱 beacon（解锁撤离点 + 45s 自毁 + 狂暴杂兵围堵）
    activateEvacBeacon();
    // （旧逻辑保留：破阶段后强制进入余烬开窗，呼应全关主题；撤离触发已改为 beacon，不再依赖相位窗）
    doFlip(PHASE.EMBER, { active: false, source: 'kill', openWindow: EMBER_OPEN_WIN });
    for (var bei = 0; bei < enemies.length; bei++) { if (enemies[bei].extractGuard !== undefined) { enemies[bei].wake = 0; enemies[bei].alert = 1; } }
    boss = null;
  }

  // ---------- 结算 ----------
  function finishRun(outcome) {
    if (scene !== 'mission') return;
    showScene('result');
    var killReward = Math.floor(run.kills * 2) + (outcome === 'success' ? 30 : outcome === 'abandon' ? 10 : 0);
    if (outcome === 'success' && exfilJadePenalty > 0) killReward = Math.floor(killReward * (1 - exfilJadePenalty)); // 急速读条折损
    // ★ 深渊层级：成功撤离带回 100% 灵矿碎屑 / 阵亡 15% / 弃局 30%
    var oreReturnRate = outcome === 'success' ? 1.0 : (outcome === 'abandon' ? 0.30 : 0.15);
    var oreReward = Math.floor((run.oreCollected || 0) * oreReturnRate);
    var kept = bankLoot(outcome);                 // 战利品入库为法器（按 outcome 比例，带研究院撤离加成）
    var lostLoot = run.loot.length - kept;        // 被没收的战利品件数
    meta.currency += killReward; meta.ore += oreReward; meta.runs += 1;  // 灵玉仅来自击杀；灵矿碎屑来自采集
    if (run.kills > meta.bestKills) meta.bestKills = run.kills;
    var unlockedNew = false;
    // ★ 解除 3 层封顶：通关当前最高层 Boss + 成功撤离 → 解锁下一层深渊裂隙（上限 99 层）
    if (outcome === 'success' && run.killedBoss && run.tier === meta.maxTier && meta.maxTier < 99) { meta.maxTier++; unlockedNew = true; }
    // ★ 历史最高通关层记录
    if (outcome === 'success' && run.tier > meta.bestLayer) meta.bestLayer = run.tier;
    checkUnlocks();
    for (var ek in run.enemyKills) { meta.codex.enemies[ek] = (meta.codex.enemies[ek] || 0) + run.enemyKills[ek]; } // 敌怪图鉴入库
    saveMeta();
    showResult(outcome, kept, lostLoot, killReward, unlockedNew, oreReward);
  }

  // ---------- 敌人死亡（掉落/分裂/计数/移除）----------
  function explodeAt(x, y, rad, dmg) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.wake > 0) continue;
      if (dist2(e.x, e.y, x, y) < rad * rad) {
        e.hp -= dmg; e.flash = 0.08; e.hitT = 0.1; e.hitMag = 2.2;
      }
    }
    burst(x, y, '#FF8C3A', 14, { ring: true, ringR: rad }); spawnVfx('vfx_explosion_sheet', x, y, 90, 0.7, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 12 }); AudioSys.sfx.explode(); addShake(2, 120, 50);
  }
  function skyStrikeAll() {
    for (var i = enemies.length - 1; i >= 0; i--) { var e = enemies[i]; if (e.wake > 0) continue; e.hp -= effAtk() * 1.2; e.flash = 0.1; e.hitT = 0.1; e.hitMag = 2; if (e.hp <= 0) onEnemyDeath(e, true); }
    if (boss) { boss.hp -= effAtk() * 1.2; boss.flash = 0.12; }
    screenFlash = { color: '#CFE8FF', a: 0.3 }; addShake(3, 180, 70); AudioSys.sfx.explode();
    for (var s2 = 0; s2 < 5; s2++) { var lx = rand(40, W - 40); spawnParticle({ x: lx, y: -10, vx: 0, vy: 620, life: 0.5, color: '#CFE8FF', r: 2 }); }
  }
  // ---------- 灵潮绝技（J）：流派构筑的大招层，形态随主元素变化 ----------
  function castUlt() {
    if (scene !== 'mission' || !player || paused || overlaysOpen()) return;
    if (player.ultCharge < ULT_MAX) {
      floatText(player.x, player.y - 26, '绝技充能 ' + Math.floor(player.ultCharge) + '%', '#8B95A0');
      return;
    }
    player.ultCharge = 0;
    var el = dominantElem(), col = el ? ELEMCOL[el] : '#D9B64A';
    var nm = ULT_NAMES[el] || '天诛';
    setBanner('☯ 绝技「' + nm + '」！', 2.2, col);
    addFreeze(160); addShake(5, 280, 120); screenFlash = { color: col, a: 0.3 };
    burst(player.x, player.y, col, 26, { ring: true, ringR: 130 });
    AudioSys.sfx.eliteDie();
    if (!el || el === '雷') {
      // 震雷·天罚：三波全屏闪电（默认流派）
      for (var w = 0; w < 3; w++) skyStrikeAll();
    } else if (el === '火') {
      // 离火·燎原：以自身为心的双重 nova
      explodeAt(player.x, player.y, 320, effAtk() * 9);
      explodeAt(player.x, player.y, 180, effAtk() * 6);
      if (boss && dist2(boss.x, boss.y, player.x, player.y) < 380 * 380) { boss.hp -= effAtk() * 10; boss.flash = 0.14; }
    } else if (el === '水') {
      // 坎水·潮盾：大量回复 + 满盾 + 无敌 + 全场缓速
      player.hp = Math.min(player.maxhp, player.hp + Math.round(player.maxhp * 0.35));
      player.shield = player.maxshield;
      player.iframe = Math.max(player.iframe, 2.5);
      enemiesSlowT = 4.5; enemiesSlowFactor = 0.45;
      floatText(player.x, player.y - 40, '潮盾回涌 +' + Math.round(player.maxhp * 0.35), '#7FB069', 'heal');
      AudioSys.sfx.heal();
    } else if (el === '风') {
      // 巽风·千羽：44 发追踪羽矛螺旋齐射
      for (var f = 0; f < 44; f++) {
        var fa = f / 44 * 6.283;
        fireBullet(player.x, player.y, fa, 'player', effAtk() * 0.9, 300, { pierce: 2, homing: true, crit: false, elem: '风' });
      }
    } else if (el === '土') {
      // 坤土·镇岳：大范围震击 + 重伤 + 全场缓速
      explodeAt(player.x, player.y, 420, effAtk() * 7);
      enemiesSlowT = 4; enemiesSlowFactor = 0.5;
      if (boss && dist2(boss.x, boss.y, player.x, player.y) < 460 * 460) { boss.hp -= effAtk() * 8; boss.flash = 0.14; }
      enemyKnockAll(180);
    }
  }
  function enemyKnockAll(force) {
    for (var i = 0; i < enemies.length; i++) { var e = enemies[i]; if (e.wake > 0) continue; enemyKnock(e, force); }
  }
  function onEnemyDeath(e, fromExpl) {
    if (!e || e.dead) return;
    e.dead = true;
    // v12.6：自爆突进蜂 —— 死亡即小范围爆炸（撞击/击毁/引信耗尽均触发，统一走此处）
    if (e.kamikaze && !e._exploded) {
      e._exploded = true;
      var kR = 58;
      burst(e.x, e.y, '#E0623A', 18, { ring: true, ringR: kR });
      burst(e.x, e.y, '#FFE9A8', 10, { smin: 50, smax: 180 });
      spawnVfx('vfx_explosion_sheet', e.x, e.y, 84, 0.6, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 12 });
      addShake(3.5, 180, 70); AudioSys.sfx.explode();
      if (player.iframe <= 0 && dist2(e.x, e.y, player.x, player.y) < (kR + PHB) * (kR + PHB)) {
        var kd = Math.round(EDMG_HEAVY * e.dmgMul);
        damagePlayer(kd); floatText(player.x, player.y - 22, '爆炸 -' + kd, '#E0623A', 'crit');
      }
    }
    // 深渊异变·自爆：杂兵（非自爆蜂/精英/Boss）阵亡 30% 概率小型范围爆炸（复用 kamikaze 爆炸结构，半径更小）
    if (!e.kamikaze && !e.elite && !e.boss && hasAffix('volatile_all') && Math.random() < 0.30) {
      var vAllR = 48;
      burst(e.x, e.y, '#E0623A', 12, { ring: true, ringR: vAllR });
      burst(e.x, e.y, '#FFE9A8', 6, { smin: 50, smax: 150 });
      spawnVfx('vfx_explosion_sheet', e.x, e.y, 56, 0.5, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 12 });
      addShake(2.5, 140, 50);
      if (player.iframe <= 0 && dist2(e.x, e.y, player.x, player.y) < (vAllR + PHB) * (vAllR + PHB)) {
        var vAllDmg = Math.round(EDMG_NORMAL * e.dmgMul);
        damagePlayer(vAllDmg); floatText(player.x, player.y - 22, '自爆 -' + vAllDmg, '#E0623A', 'crit');
      }
    }
    // ★ 山海猎兽人：击杀被标记敌人时，标记跳转到最近敌人
    if (e.marked && player.setMarkCrit) {
      var nearestUnmarked = null, nd = Infinity;
      for (var mi = 0; mi < enemies.length; mi++) {
        if (enemies[mi] !== e && !enemies[mi].marked && !enemies[mi].dead) {
          var md = dist2(e.x, e.y, enemies[mi].x, enemies[mi].y);
          if (md < nd) { nd = md; nearestUnmarked = enemies[mi]; }
        }
      }
      if (nearestUnmarked) { nearestUnmarked.marked = true; nearestUnmarked.markT = 5; }
    }
    // spawnVfx('vfx_enemy_death', e.x, e.y, 56, 0.5, rand(0, 6.28)); // 旧资产未抠干净，先禁用
    if (!fromExpl && player.killExplode > 0) explodeAt(e.x, e.y, player.killExplode, Math.max(10, effAtk() * 0.9));
    if (e.arche === 'looter' && e.lootStolen) { run.loot.push({ rarity: e.lootStolen.rarity, name: e.lootStolen.name, slot: e.lootStolen.slot || pickSlot() }); run.picked++; floatText(e.x, e.y - 18, '夺回战利品!', COL.extract, 'crit'); }
    if (e.elite) { burst(e.x, e.y, COL.elite, 18, { ring: true, ringR: 60 }); spawnVfx('vfx_explosion_sheet', e.x, e.y, 80, 0.7, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 12 }); addShake(4, 200, 90); addFreeze(90); AudioSys.sfx.eliteDie(); }
    else if (e.arche === 'split' && !e.small) { burst(e.x, e.y, RARCOL.purple, 12, { ring: true, ringR: 44 }); spawnVfx('vfx_explosion_sheet', e.x, e.y, 64, 0.6, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 12 }); addShake(3.5, 160, 70); addFreeze(90); AudioSys.sfx.enemyDie(); }
    else if (e.arche === 'swarm') { burst(e.x, e.y, '#A8C84E', 4); AudioSys.sfx.enemyDie(); }
    else { burst(e.x, e.y, e.col || COL.enemy, 6); addFreeze(90); AudioSys.sfx.enemyDie(); }
    // 精英·爆裂：死亡时爆炸对玩家造成范围伤害
    if (e.eliteMod === 'volatile' && !fromExpl) {
      var volR = 90;
      burst(e.x, e.y, '#FF6A2A', 20, { ring: true, ringR: volR });
      spawnVfx('vfx_explosion_sheet', e.x, e.y, 100, 0.8, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 12 });
      addShake(5, 220, 100); addFreeze(60);
      if (dist2(e.x, e.y, player.x, player.y) < volR * volR && player.iframe <= 0) {
        var volDmg = Math.round((12 + e.tier * 4) * tierDmgMul(e.tier));
        damagePlayer(volDmg);
        floatText(player.x, player.y - 22, '爆裂 -' + volDmg, '#FF6A2A', 'crit');
      }
    }
    // 掉落分层重构（2026-08-19）：严禁杂兵批量掉整装，单局整装总量由 run.artBudget 硬控 12~20 件
    run.pity = (run.pity || 0) + 1;
    var pitied = run.pity >= 8; if (pitied) run.pity = 0;
    run.lootBonus = Math.min(0.12, (run.tier - 1) * 0.02 + Math.min(0.06, (run.kills || 0) * 0.0012) + (player.hp >= player.maxhp ? 0.02 : 0));
    if (e.elite) {
      // 精英：30~50 灵玉 + 3~5 灵矿碎屑 + 100% 整装（75% 绿 / 25% 蓝），整装过预算则降级为灵玉
      dropLoot(e.x - 6, e.y, 'blue', 'jade', null, { amount: randi(30, 50) });
      dropOre(e.x + 6, e.y, randi(3, 5));
      var erar = Math.random() < 0.75 ? 'green' : 'blue';
      if (budgetArtifact(erar)) dropLoot(e.x, e.y, erar, 'artifact');
      else dropLoot(e.x, e.y, 'blue', 'jade', null, { amount: randi(20, 35) });
    } else {
      // 普通杂兵：1~3 灵玉（自动磁吸） + 15% 灵矿碎屑；绝不掉整装
      dropLoot(e.x, e.y, 'blue', 'jade', null, { amount: randi(1, 3) });
      if (Math.random() < 0.15) dropOre(e.x, e.y, 1);
    }
    if (e.arche === 'split' && !e.small) {
      for (var s = 0; s < 2; s++) { var ne = spawnEnemy(e.x + rand(-20, 20), e.y + rand(-20, 20), e.tier, { arche: 'split' }); ne.small = true; ne.r = 9; ne.hp = ne.maxhp = Math.round(e.maxhp * 0.4); ne.ram = true; ne.col = RARCOL.purple; ne.edge = '#2a0a2a'; } // #M3 修复：直建 split，不再随机到 swarm 多刷 2-4 只/触发横幅
    }
    // 灵潮连击：连杀刷新窗口（转/合幕更宽），叠伤害乘区 + 加速绝技充能
    player.combo++;
    player.comboT = (runPhase === 'zhuan' || runPhase === 'he') ? COMBO_WINDOW_ZHUAN : COMBO_WINDOW;
    if (player.combo > player.comboBest) player.comboBest = player.combo;
    if (COMBO_MILESTONES.indexOf(player.combo) >= 0) {
      floatText(player.x, player.y - 34, '灵潮 ×' + player.combo + '！伤害 +' + Math.round(Math.min(COMBO_DMG_CAP, player.combo * COMBO_DMG_PER) * 100) + '%', '#E0B84A', 'crit');
      addShake(3, 160, 60); addFreeze(110); burst(player.x, player.y, '#E0B84A', 12, { ring: true, ringR: 56 });
      AudioSys.sfx.eliteDie();
    }
    player.ultCharge = Math.min(ULT_MAX, player.ultCharge + ULT_KILL_GAIN + player.combo * ULT_COMBO_GAIN);
    if (player.ultCharge >= ULT_MAX && player.ultCharge - (ULT_KILL_GAIN + player.combo * ULT_COMBO_GAIN) < ULT_MAX) {
      floatText(player.x, player.y - 46, '☯ 绝技就绪 [J]', '#D9B64A', 'crit');
    }
    run.kills++;
    // 动态悬赏进度追踪
    if (e.elite) bountyProgress('eliteKill', 1);
    if (player.phase === PHASE.EMBER) bountyProgress('emberKill', 1);
    // 灵蕴（经验宝石）：击杀掉落，飞过即吸取，累积升级触发三选一（掉落量随难度口径平滑成长）
    dropXp(e.x, e.y, e.elite ? 6 : (1 + Math.floor(diffTier(run.tier) * 0.8)));
    run.enemyKills[e.arche] = (run.enemyKills[e.arche] || 0) + 1; // 敌怪图鉴计数
    if (runeCount < RUNE_CAP && buffTimer >= killForBuff) { buffTimer = 0; buffPending = true; } // 旧击杀计数触发（保留兼容；主成长改由 addXp 驱动）
    var idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
  }

  // ---------- 流程起承转合 + 危机递进（§1）----------
  // 幕章：起（潜入搜刮）→ 承（积累·裂隙支线）→ 转（围猎·敌机狂暴+猎杀预警）→ 合（终局·穷奇降临·撤离）
  function updateRunPhase(dt) {
    var need = 3 + run.tier;
    var np;
    if (bossSpawned || run.killedBoss) np = 'he';
    else if (run.nodes >= need * 0.72) np = 'zhuan';
    else if (run.nodes >= need * 0.3) np = 'cheng';
    else np = 'qi';
    if (np !== runPhase) { runPhase = np; onRunPhaseChange(np, need); }
    // 转·围猎：Boss 未现前周期触发猎杀预警 + 四方精英增援
    if (runPhase === 'zhuan' && !bossSpawned) {
      huntWarnT -= dt;
      if (huntWarnT <= 0) {
        huntWarnT = HUNT_WARN_INT;
        setBanner('⚠ 猎杀预警！敌机增援自四面涌来（狂暴·速攻）', 2.4, '#C8642A', 'top');
        floatText(player.x, player.y - 36, '猎杀预警·增援', '#C94F4F');
        var reach = Math.max(W, H) * 0.62 + 160;
        for (var h = 0; h < 4; h++) {
          if (!canSpawnMore()) break;
          var a = h / 4 * 6.28;
          var ex = clamp(player.x + Math.cos(a) * reach, 40, WORLD_W - 40);
          var ey = clamp(player.y + Math.sin(a) * reach, 40, WORLD_H - 40);
          var en = spawnEnemy(ex, ey, clamp(1 + Math.floor(gameTime / 28), 1, 4), { elite: true }); // #B5 修复：统一走精英分支（3×血+精英掉落+修饰词）
          if (en) { en.dmgMul *= 1.2; en.col = '#C94F4F'; en.edge = '#5a1414'; en.hunt = true; }
        }
        AudioSys.sfx.stolen(); addShake(3, 120, 50);
      }
    }
  }
  function onRunPhaseChange(np, need) {
    if (np === 'qi') {
      setBanner('起 · 潜入空域，搜刮战利品', 2.6, '#E8DCC4', 'top');
    } else if (np === 'cheng') {
      setBanner('承 · 搜刮积累 · 灵潮涌动：灵脉冷却重置，快去吸收', 2.8, '#C9A24B', 'top');
      screenFlash = { color: '#C9A24B', a: 0.16 };
      for (var cv = 0; cv < veins.length; cv++) veins[cv].cd = 0; // 灵潮涌动（v11）：灵脉全部就绪
    } else if (np === 'zhuan') {
      setBanner('转 · 围猎降临！灵脉染污：吸收灵韵×2 但惊动围猎', 3.2, '#C8642A', 'top');
      screenFlash = { color: '#C8642A', a: 0.3 }; addShake(5, 420, 150, true);
      for (var zv = 0; zv < veins.length; zv++) veins[zv].corrupted = true; // 染污（v11）：风险换构筑提速
      huntActive = true; huntWarnT = 4.5; // 首波预警稍快，给玩家反应
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        e.dmgMul *= HUNT_DMG; e.maxhp = Math.round(e.maxhp * HUNT_HP); e.hp = Math.min(e.maxhp, Math.round(e.hp * HUNT_HP)); e.hunt = true; // #B2 修复：等比放大，不清空玩家已造伤害
      }
      floatText(player.x, player.y - 36, '围猎开始', '#C8642A');
    } else if (np === 'he') {
      setBanner('合 · 终局！穷奇降临 · 撤离带出战利品', 3.6, '#C94F4F', 'top');
      screenFlash = { color: '#C94F4F', a: 0.32 }; addShake(7, 620, 210, true);
    }
  }

  // #381-① 常规周期刷怪（修复：spawnTimer 声明后从未递减/使用 → 玩家清完开局预置敌人后空场）。
  // 间隔按幕章查表（起 6s / 承 4.5s / 转 3s / 合 2.5s）再随 gameTime 梯度缩短（保底 2.5s）；
  // 环形屏外安全距离飞入（复用 spawnEnemy 自动入场缓冲 + safeSpawnPos），数量 1~3 随幕章/层数；
  // canSpawnMore 做 cap 兜底；inRift 不刷主图怪（裂隙有自己的波次）；撤离 beacon/读条中降频，窗口内不堆怪。
  function updatePeriodicSpawns(dt) {
    if (scene !== 'mission' || paused || inRift || !run || !player) return;
    if (typeof spawnTimer !== 'number' || !isFinite(spawnTimer) || spawnTimer < 0) spawnTimer = 2.5;
    spawnTimer -= dt;
    if (spawnTimer > 0) return;
    var base = SPAWN_INT[runPhase] || 4.5;
    var interval = Math.max(2.5, base - gameTime / 90);
    var evacuating = run.evacBeacon || exfilStarted;
    if (evacuating) interval *= 1.8; // 45s 撤离窗口内放缓刷怪，避免终局压力过大
    spawnTimer = interval;
    if (evacuating && runPhase !== 'zhuan' && runPhase !== 'he') return; // beacon 下仅转/合幕保留低频增援
    var n = runPhase === 'qi' ? 1 : (runPhase === 'cheng' ? 2 : (runPhase === 'zhuan' ? 2 + (Math.random() < 0.5 ? 1 : 0) : 3));
    n = Math.max(1, Math.min(n, 1 + Math.floor((run.tier || 1) / 2)));
    for (var i = 0; i < n; i++) {
      if (!canSpawnMore()) break;
      var en = spawnEnemy(undefined, undefined, clamp(1 + Math.floor(gameTime / 28), 1, 4));
      if (en) { en.homeX = en.x; en.homeY = en.y; en.patrolAng = rand(0, 6.28); }
    }
  }

  // ---------- 更新 ----------
  function update(dt) {
    gameTime += dt; run.time += dt;
    updateInteractHints();   // 互动物靠近提示 + 最近可交互（§P1）
    updatePhaseAmbient();    // 引力裂隙向心吸力粒子（复用粒子池）
    updateVeins(dt);         // 灵脉共振（v11）：冷却/吸收/合幕充能
    if (enemiesSlowT > 0) enemiesSlowT -= dt;
    if (hintTimer > 0) hintTimer -= dt;
    for (var bi = bannerQ.length - 1; bi >= 0; bi--) { bannerQ[bi].life -= dt; bannerQ[bi].age += dt; if (bannerQ[bi].life <= 0) bannerQ.splice(bi, 1); }
    // 灵潮连击窗口衰减：超时断连（高连断掉有提示）
    if (player.combo > 0) {
      player.comboT -= dt;
      if (player.comboT <= 0) {
        if (player.combo >= 15) floatText(player.x, player.y - 28, '灵潮退去 ×' + player.combo, '#8B95A0');
        player.combo = 0;
      }
    }
    // ===== 流程起承转合 + 危机递进（§1：起降落搜刮 → 承积累支线 → 转围猎狂暴 → 合终局Boss）=====
    updateRunPhase(dt);
    updatePeriodicSpawns(dt); // #381-① 常规周期刷怪：清空预置遭遇后场上持续有增援（spawnTimer 周期触发）
    // 围猎速度平滑缓动（1 → HUNT_AGGRO），避免转幕瞬间暴冲；并刷新四幕移速系数
    huntRamp += ((huntActive ? HUNT_AGGRO : 1.0) - huntRamp) * (1 - Math.exp(-dt * 0.7));
    phaseSpeedMul = (PHASE_SPD[runPhase] || 1) * huntRamp;
    // ===== 相位赌注 Phase Gambit 状态机 =====
    if (phaseTransT > 0) phaseTransT -= dt;
    // 撤离窗延迟开启（主动 2.5s / 自动降级 4s）：独立于相位过渡，从翻相位那一刻起算（§7.3/§7.4）
    if (exfilDelayT > 0) {
      exfilDelayT -= dt;
      if (exfilDelayT <= 0) {
        exfilDelayT = 0;
        emberOpenWindow = activeEmber ? EMBER_OPEN_WIN : autoEmberWindowLen;
        openExtractPoints();
      }
    }
    if (phaseTransT <= 0) {
      phaseTimer -= dt;
      if (phase === PHASE.GOLD) {
        if (phaseTimer <= 0) doFlip(PHASE.EMBER, { active: false, source: 'auto' }); // 40s 自动翻进余烬（失控惩罚）
      } else {
        if (emberOpenWindow > 0) {
          emberOpenWindow -= dt;
          if (emberOpenWindow <= 0) { emberOpenWindow = 0; closeExtractPoints(); } // 余烬开放窗口结束 → 撤离点关闭
        }
        if (phaseTimer <= 0) doFlip(PHASE.GOLD, { active: false, source: 'auto' });
      }
    }
    // 相位核心被动回充（30s/格；鎏金相 ×2）—— 太极灵韵科技加速回充
    var _flipBoost = 1 + (meta.tech && meta.tech.flip ? meta.tech.flip * 0.3 / CORE_REGEN : 0);
    phaseCoreRegen += dt * _flipBoost * (phase === PHASE.GOLD ? (CORE_REGEN_GOLD_MULT / CORE_REGEN) : (1 / CORE_REGEN));
    if (phaseCoreRegen >= 1) {
      var _addC = Math.floor(phaseCoreRegen);
      phaseCore = Math.min(CORE_CAP, phaseCore + _addC);
      phaseCoreRegen -= _addC;
    }
    // Boss 仇恨集中计时
    if (aggroT > 0) aggroT -= dt; if (aggroT <= 0) aggroRadius = 0;
    // 全图调色平滑过渡（金暖 ↔ 余烬橙暗）
    phaseMix += ((phase === PHASE.EMBER ? 1 : 0) - phaseMix) * Math.min(1, dt / PHASE_TRANS);
    // 相位柱（v12）：站圈充能（同相）→ 满 100% 过载引爆脉冲（全屏大招级）
    for (var ppi = 0; ppi < phasePillars.length; ppi++) {
      var pp = phasePillars[ppi];
      if (pp.overloadCd > 0) { pp.overloadCd -= dt; if (pp.overloadFlash > 0) pp.overloadFlash -= dt; }
      var pInRange = Math.hypot(player.x - pp.x, player.y - pp.y) < PILLAR_CHARGE_R;
      if (pp.overloadCd <= 0 && pInRange && phase === pp.affinity) {
        pp.charge = Math.min(100, pp.charge + PILLAR_CHARGE_RATE * dt);
        if (Math.random() < 0.5) {
          var _lt = Math.random(), _lx = player.x + (pp.x - player.x) * _lt, _ly = player.y + (pp.y - player.y) * _lt;
          spawnParticle({ x: _lx, y: _ly, vx: rand(-20, 20), vy: rand(-20, 20), life: rand(0.25, 0.5), color: pp.affinity === PHASE.EMBER ? '#C8642A' : '#C9A24B', r: rand(1.5, 3) });
        }
        if (pp.charge >= 100) triggerPillarOverload(pp);
      } else if (pp.overloadCd <= 0) {
        pp.charge = Math.max(0, pp.charge - PILLAR_CHARGE_RATE * 0.4 * dt); // 离场/异相缓慢泄压
      }
    }
  // 相位柱·过载引爆（v12）：全屏微震 + 超新星环冲击波消弹化灵玉碎屑 + 异相敌机 2s 瘫痪/冰冻+电弧+巨额范围伤害 + 15s 冷却
  function triggerPillarOverload(pp) {
    pp.charge = 0; pp.overloadCd = PILLAR_OVERLOAD_CD; pp.overloadFlash = 0.6;
    var col = pp.affinity === PHASE.EMBER ? '#C8642A' : '#C9A24B';
    addShake(8, 420, 160, true); addHitstop(70); addTint(col, 0.32); screenFlash = { color: col, a: 0.4 };
    setBanner('相位柱过载 · 超新星脉冲！', 1.8);
    AudioSys.sfx.pillar();
    for (var _o = 0; _o < 4; _o++) spawnRing(pp.x, pp.y, col, 80 + _o * 90);
    burst(pp.x, pp.y, col, 30, { ring: true, ringR: PILLAR_OVERLOAD_R, r0: 20 });
    // 消弹 → 灵玉碎屑（敌弹转化为金色粒子被吸收）
    for (var _ob = bullets.length - 1; _ob >= 0; _ob--) {
      var _b2 = bullets[_ob];
      if (_b2.from === 'enemy' && dist2(_b2.x, _b2.y, pp.x, pp.y) < PILLAR_OVERLOAD_R * PILLAR_OVERLOAD_R) {
        burst(_b2.x, _b2.y, '#FFD24A', 3, { smin: 30, smax: 90 });
        bullets.splice(_ob, 1);
      }
    }
    // 异相敌机 2s 瘫痪+巨额伤害
    for (var _pe = 0; _pe < enemies.length; _pe++) {
      var _pen = enemies[_pe];
      if (dist2(_pen.x, _pen.y, pp.x, pp.y) < PILLAR_OVERLOAD_R * PILLAR_OVERLOAD_R) {
        var _opp = (_pen.phase !== pp.affinity);
        var _dmg = PILLAR_OVERLOAD_DMG * (_opp ? 1.6 : 0.5);
        _pen.hp -= _dmg; _pen.flash = 0.1; _pen.hitT = 0.15; _pen.hitMag = 3;
        if (_opp) { _pen.freezeT = Math.max(_pen.freezeT || 0, 2.0); addVfxLine(pp.x, pp.y, _pen.x, _pen.y, '#C79BE8', 0.3); }
        floatText(_pen.x, _pen.y - _pen.r - 8, '-' + Math.round(_dmg), _opp ? '#FFD24A' : '#F4EFE6', _opp ? 'crit' : 'normal');
        burst(_pen.x, _pen.y, col, 8, { smin: 60, smax: 200 });
        if (_pen.hp <= 0) onEnemyDeath(_pen, true);
      }
    }
    if (boss && boss.wake <= 0 && dist2(boss.x, boss.y, pp.x, pp.y) < PILLAR_OVERLOAD_R * PILLAR_OVERLOAD_R) {
      boss.hp -= PILLAR_OVERLOAD_DMG; boss.flash = 0.1;
      if (boss.hp <= 0) killBoss();
    }
    // #381-⑤ 过载奖励强化：1 件高品质法器（过 budgetArtifact 预算）+ 灵矿 + 灵玉，已有效果（清屏/伤害/冰冻）保留
    var _pRar = Math.random() < 0.5 ? 'orange' : 'purple';
    if (budgetArtifact(_pRar)) dropLoot(pp.x + rand(-20, 20), pp.y + rand(-20, 20), _pRar, 'artifact');
    dropOre(pp.x, pp.y, 2);
    dropLoot(pp.x + rand(-16, 16), pp.y + rand(-16, 16), 'blue', 'jade', null, { amount: 5 + Math.floor((run ? run.tier : 1) * 2) });
    floatText(pp.x, pp.y - 48, '过载奖励', '#FFE9A8', 'crit');
  }
    // 保底撤离：超时强制开窗（core-loop §3.3）
    if (gameTime > SAFETY_TIME) {
      if (phase !== PHASE.EMBER) doFlip(PHASE.EMBER, { active: false, source: 'safety', openWindow: 9999 });
      else { emberOpenWindow = Math.max(emberOpenWindow, 9999); openExtractPoints(); }
      // #389 SAFETY_TIME 触发：顶部横幅通知玩家（一次性）
      if (!run._safetyBannerShown) { run._safetyBannerShown = true; setBanner('⚠ 超时保底撤离：余烬相强制开启撤离窗口！', 3.6, '#C94F4F', 'top'); }
    }
    if (tipTimer > 0) { tipTimer -= dt; if (tipTimer <= 0 && tipEl) tipEl.style.display = 'none'; }
    // 天罚（雷系4阶）：每 skyCd 秒全屏闪电
    if (player.skyStrike > 0) { player.skyT -= dt; if (player.skyT <= 0) { player.skyT = player.skyCd; skyStrikeAll(); } }
    // 御风（风系4阶）：脱战 2 秒进入极速
    var nearE = false; for (var ne2 = 0; ne2 < enemies.length; ne2++) if (dist2(enemies[ne2].x, enemies[ne2].y, player.x, player.y) < 240 * 240) { nearE = true; break; }
    if (nearE || player.iframe > 0.3) player.outOfCombatT = 0; else player.outOfCombatT += dt;
    player.galeActive = player.gale && player.outOfCombatT >= 2;

    // 符文：充满后缓冲到“安全窗口”才弹出，避免中途硬暂停掐断爽感
    if (buffPending && !overlaysOpen()) {
      buffHold += dt;
      if (safeToOffer()) buffSafe += dt; else buffSafe = 0;
      if (buffSafe >= 0.3 || buffHold > 6) { buffPending = false; buffHold = 0; buffSafe = 0; offerBuff(); }
    }

    // 移动
    var dirx = 0, diry = 0, mag = 0;
    // #381-⑥ 竖屏单摇杆：右下主摇杆兼作移动+开火（拖拽方向=移动方向，越过死区才移动；轻点=原地盲射不移动）
    if (isMobile && portraitNow() && aimJoy.active && aimJoy.mag > AIM_DEADZONE) {
      dirx = aimJoy.dx; diry = aimJoy.dy; mag = aimJoy.mag;
    } else if (isMobile && joy.active) {
      dirx = joy.dx; diry = joy.dy; mag = joy.mag;
    } else {
      var mx = 0, my = 0;
      if (keys['w'] || keys['arrowup']) my -= 1;
      if (keys['s'] || keys['arrowdown']) my += 1;
      if (keys['a'] || keys['arrowleft']) mx -= 1;
      if (keys['d'] || keys['arrowright']) mx += 1;
      if (mx || my) { var ml = Math.hypot(mx, my); dirx = mx / ml; diry = my / ml; mag = 1; }
    }
    var curSpeed = player.speed * (player.galeActive ? 1.6 : 1) * PLAYER_SPEED_MULT; // 常规巡航锚点（含倒退减速 ×0.6）；冲刺峰值另用 topSpeed
    var topSpeed = player.speed * SPRINT_MULT;   // 黄金库：冲刺极速 = 基础移速 × 1.8，0.2s ease-out 爬升至此（仅冲刺用）
    // 倒退减速：移动方向与朝向夹角>100°时降速至65%
    if (mag > 0.05) {
      var facingDot = dirx * Math.cos(player.ang) + diry * Math.sin(player.ang);
      if (facingDot < -0.17) curSpeed *= 0.6; // cos(100°)≈-0.17，超过100°算倒退
    }
    // --- 标准加速度-阻尼模型（Velocity & Drag）+ 冲刺（闪避）方向锁定缓升 ---
    // 冲刺中：方向锁定 + ease-out 爬升至 1.8× 基础（dashDX/dashDY 已在触发时锁定），杜绝瞬移；结束后自然阻尼滑行
    if (player.dashT > 0) {
      var dashPeak = player.speed * SPRINT_MULT; // = 1.8× 基础巡航
      var dak = 1 - Math.exp(-dt / ACCEL_TAU);
      player.vx += (player.dashDX * dashPeak - player.vx) * dak;
      player.vy += (player.dashDY * dashPeak - player.vy) * dak;
    } else if (mag > 0.05) {
      // 常规巡航用 curSpeed（已含倒退减速惩罚）；仅冲刺走 topSpeed(1.8×)
      var targetvx = dirx * curSpeed * mag, targetvy = diry * curSpeed * mag;
      // 加速：指数逼近（Ease-Out），时间常数 ACCEL_TAU → ~0.2s 平滑到极速
      var ak = 1 - Math.exp(-dt / ACCEL_TAU);
      player.vx += (targetvx - player.vx) * ak;
      player.vy += (targetvy - player.vy) * ak;
    } else {
      // 松键：阻尼滑行（每帧保留 DRAG_COEFF），呈现跟手惯性
      var damp = Math.pow(DRAG_COEFF, dt * 60);
      player.vx *= damp; player.vy *= damp;
      if (Math.hypot(player.vx, player.vy) < 4) { player.vx = 0; player.vy = 0; }
    }
    // 引擎尾焰粒子（移动时）
    var spdNow = Math.hypot(player.vx, player.vy);
    var sprinting = spdNow > topSpeed * GHOST_TRIG || player.dashAnimT > 0;
    // 冲刺残影（Ghosting）：高速移动 / 冲刺时沿位移反方向拖出渐隐幻影（0.2s 淡出）
    if (sprinting) {
      player.ghostT = (player.ghostT || 0) + dt;
      if (player.ghostT > 0.025) {
        player.ghostT = 0;
        playerGhosts.push({ x: player.x, y: player.y, ang: player.ang, bank: player.bankSmooth, t: 0, life: GHOST_LIFE });
        if (playerGhosts.length > 24) playerGhosts.shift();
      }
    }
    if (spdNow > curSpeed * 0.15 && player.iframe <= 0) {
      player.engineT += dt;
      if (player.engineT > 0.03) {
        player.engineT = 0;
        var eAng = Math.atan2(player.vy, player.vx);
        var eCraft = run.aircraft || 'a';
        var trailCol = eCraft === 'a' ? '#5EC8F0' : (eCraft === 'b' ? '#7EAD9A' : '#E8A0B0');
        spawnParticle({ x: player.x - Math.cos(eAng) * 14, y: player.y - Math.sin(eAng) * 14,
          vx: -Math.cos(eAng) * 35 + rand(-12, 12), vy: -Math.sin(eAng) * 35 + rand(-12, 12),
          life: 0.22, color: trailCol, r: rand(1.2, 2.6), len: sprinting ? rand(8, 16) : 0 });
      }
    }
    if (player.dashCd > 0) player.dashCd -= dt;
    // 侧倾平滑（与帧率无关）
    var targetBank = clamp(player.vx / Math.max(180, player.speed * 1.0), -0.35, 0.35);
    player.bankSmooth += (targetBank - player.bankSmooth) * Math.min(1, 6 * dt);
    // 冲刺（闪避）计时与触发：仅锁定方向，速度由上方 ease-out 爬升至 1.8× 基础，无敌帧用于躲 Boss 招式
    if (player.dashT > 0) player.dashT -= dt;
    if ((keys['shift'] || dashBtnPressed) && player.dashCd <= 0) {
      var ddx = dirx, ddy = diry;
      if (mag <= 0.05) { ddx = Math.cos(player.ang); ddy = Math.sin(player.ang); } // 无输入则朝当前朝向冲
      var dlen = Math.hypot(ddx, ddy) || 1;
      player.dashDX = ddx / dlen; player.dashDY = ddy / dlen; // 仅锁定方向，速度走 ease-out 爬升（杜绝瞬移）
      player.dashT = DASH_DUR;
      player.iframe = Math.max(player.iframe, 0.5);
      player.dashCd = 1.1;
      player.dashAnimT = DASH_DUR;
      AudioSys.sfx.dash();
      spawnRing(player.x, player.y, player.color, 64); // 起手冲击环
      addShake(2, 90, 40);
      burst(player.x, player.y, player.color, 6, { ring: false });
    }

    dashBtnPressed = false;
    if (consBtnPressed) { useConsumable(); consBtnPressed = false; }
    player.px = player.x; player.py = player.y;
    // 引力裂缝·真实物理牵引（v12）：F = K/distance·dir，近核心更强；自机冲刺挣脱（拉力×0.25）
    for (var _gri = 0; _gri < gravityRifts.length; _gri++) {
      var _grr = gravityRifts[_gri];
      var _gdx = _grr.x - player.x, _gdy = _grr.y - player.y, _gd = Math.hypot(_gdx, _gdy) || 1;
      if (player.dashT > 0) {
        // 冲刺期：免疫径向吸力 + 向外冲量，确保单次冲刺稳定挣脱黑洞（不依赖到达核心）
        var _gx = (_grr.x - player.x) / _gd, _gy = (_grr.y - player.y) / _gd;
        player.vx -= _gx * GRAV_BREAK * dt;
        player.vy -= _gy * GRAV_BREAK * dt;
        continue;
      }
      if (_gd < _grr.core) {
        // 核心死区：径向引力转为环形切向公转力 + 微弱离心外推，保留基础机动力、避免奇点死锁
        var _tx = -_gdy / _gd, _ty = _gdx / _gd; // 切线方向（垂直径向）
        player.vx += _tx * GRAV_ORBIT * dt;
        player.vy += _ty * GRAV_ORBIT * dt;
        player.vx += (-_gdx / _gd) * GRAV_PUSH * dt;  // 离心外推
        player.vy += (-_gdy / _gd) * GRAV_PUSH * dt;
        _grr.pulse = Math.min(1, _grr.pulse + dt * 2);
      } else if (_gd < _grr.pull) {
        var _gf = Math.min((hasAffix('gravity_surge') ? GRAV_K * 1.5 : GRAV_K) / (_gd + 24), GRAV_FMAX); // 引力上限，禁止无限大；深渊异变·引力潮涌：吸力+50%
        player.vx += (_gdx / _gd) * _gf * dt;
        player.vy += (_gdy / _gd) * _gf * dt;
        _grr.pulse = Math.min(1, _grr.pulse + dt * 2);
      }
    }
    // v12.6：引力编织者微型奇点球拖拽（独立数组，弱于主线裂缝，冲刺可挣脱）
    for (var _wri = weaverRifts.length - 1; _wri >= 0; _wri--) {
      var _wr = weaverRifts[_wri];
      _wr.life -= dt; _wr.pulse = Math.min(1, _wr.pulse + dt * 2);
      if (_wr.life <= 0) { weaverRifts.splice(_wri, 1); continue; }
      var _wdx = _wr.x - player.x, _wdy = _wr.y - player.y, _wd = Math.hypot(_wdx, _wdy) || 1;
      if (player.dashT > 0) continue; // 冲刺挣脱
      if (_wd < _wr.pull) {
        var _wf = Math.min(26000 / (_wd + 24), 520);
        player.vx += (_wdx / _wd) * _wf * dt;
        player.vy += (_wdy / _wd) * _wf * dt;
      }
    }
    player.x = clamp(player.x + player.vx * dt, 16, WORLD_W - 16);
    player.y = clamp(player.y + player.vy * dt, 16, WORLD_H - 16);
    resolveObstacles(player, player.r);
    // 空域：玩家仅受障碍物与地图边界约束（上方已 clamp 到世界范围）
    for (var oi = 0; oi < obstacles.length; oi++) { var ob = obstacles[oi]; if (ob.type === 'rift' && dist2(player.x, player.y, ob.x, ob.y) < (ob.r + player.r) * (ob.r + player.r)) { damagePlayer(ob.dps * dt); addTint(ob.col, 0.10); } }
    var _ctx = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W));
    var _cty = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    var _cl = Math.min(1, CAM_LERP * dt);
    cam.x += (_ctx - cam.x) * _cl;
    cam.y += (_cty - cam.y) * _cl;
    if (player.iframe > 0) player.iframe -= dt;
    if (_lsCd > 0) _lsCd -= dt;
    // v12.7 残血心跳：HP<30% 周期微震（心跳音效待补 audio-data.js 样本）
    if (player.hp > 0 && player.hp < player.maxhp * 0.3) { _lowHpT += dt; if (_lowHpT >= 0.8) { _lowHpT = 0; addShake(1.0, 80, 40); } } else { _lowHpT = 0; }
    if (player.attackAnimT > 0) player.attackAnimT -= dt;
    if (player.dashAnimT > 0) player.dashAnimT -= dt;
    if (player.galeActive) player.iframe = Math.max(player.iframe, 0.1);
    if (player.flash > 0) player.flash -= dt;
    if ((player.aimLineT || 0) > 0) player.aimLineT -= dt;
    if (screenFlash.a > 0) screenFlash.a = Math.max(0, screenFlash.a - dt * 1.6);

    // 瞄准 & 开火（移动端双摇杆架构）
    var aimWX, aimWY;
    var aimSourceAng;
    if (isMobile) {
      // 废除硬性自动锁敌：朝向绝对由玩家右摇杆矢量主导；无右摇杆时跟随移动方向兜底，否则保持最后朝向
      if (aimJoy.active) {
        if (aimJoy.mag > AIM_DEADZONE) {
          aimSourceAng = Math.atan2(aimJoy.dy, aimJoy.dx);
        } else {
          // 未拖过死区（点按/按住未拖拽）：吸附最近敌机方向，否则保持当前朝向
          var _ne = null, _nd = AIM_ASSIST_RANGE * AIM_ASSIST_RANGE;
          for (var _ae2 = 0; _ae2 < enemies.length; _ae2++) { var _d2 = dist2(enemies[_ae2].x, enemies[_ae2].y, player.x, player.y); if (_d2 < _nd) { _nd = _d2; _ne = enemies[_ae2]; } }
          if (boss && dist2(boss.x, boss.y, player.x, player.y) < AIM_ASSIST_RANGE * AIM_ASSIST_RANGE) { var _db2 = dist2(boss.x, boss.y, player.x, player.y); if (_db2 < _nd) { _nd = _db2; _ne = boss; } }
          aimSourceAng = _ne ? Math.atan2(_ne.y - player.y, _ne.x - player.x) : player.ang;
        }
      } else if (mag > 0.1) {
        aimSourceAng = Math.atan2(diry, dirx);
      } else {
        aimSourceAng = player.ang;
      }
    } else {
      aimWX = mouse.x + cam.x; aimWY = mouse.y + cam.y;
      aimSourceAng = Math.atan2(aimWY - player.y, aimWX - player.x);
    }
    // 辅助瞄准：15° 扇形微吸附（仅当朝向已接近某敌人/Boss 时轻推，不强行拽向最近敌）
    var _bestSnap = null, _bestDiff = AIM_ASSIST_CONE;
    for (var _ae = 0; _ae < enemies.length; _ae++) {
      var _e = enemies[_ae];
      if (_e.wake > 0) continue;
      var _ea = Math.atan2(_e.y - player.y, _e.x - player.x);
      var _ed = Math.abs(angDiff(_ea, aimSourceAng));
      if (_ed < _bestDiff && dist2(_e.x, _e.y, player.x, player.y) < AIM_ASSIST_RANGE * AIM_ASSIST_RANGE) { _bestDiff = _ed; _bestSnap = _ea; }
    }
    if (boss && boss.wake <= 0) {
      var _ba = Math.atan2(boss.y - player.y, boss.x - player.x);
      var _bd = Math.abs(angDiff(_ba, aimSourceAng));
      if (_bd < _bestDiff && dist2(boss.x, boss.y, player.x, player.y) < AIM_ASSIST_RANGE * AIM_ASSIST_RANGE) { _bestDiff = _bd; _bestSnap = _ba; }
    }
    if (_bestSnap !== null) aimSourceAng = _bestSnap;
    // 阻尼插值转向：响应 < 0.08s（推摇杆即朝向，松手即定角），消除线性差值的迟滞/抖动
    if (aimJoy.active) aimJoy.tapT += dt;
    var _targetAng = aimSourceAng;
    var _diff = angDiff(_targetAng, player.ang);
    player.ang += _diff * (1 - Math.exp(-dt / TURN_TAU));
    player.fireCd -= dt;
    if (player.firedT > 0) player.firedT -= dt;
    // 开火条件（移动端）：右摇杆按住持续开火 / 点按保底发射 / 可选 autoFire；PC 端保持鼠标左键或空格
    var firing = isMobile ? (((aimJoy.active || aimTapFire || autoFire) && !pickupOpen && !paused && !overlaysOpen())) : (mouse.down || keys[' ']);
    if (firing) { player.firedT = 0.35; player.aimLineT = 0.22; }   // 开火窗口 + 瞄准激光显示计时
    var craft = run.aircraft || 'a';
    var isQing = craft === 'a';
    var isXuan = craft === 'b';
    var isChi = craft === 'c';
    var shotElem = pickOwnedElem();

    // 青隼：攻击动画驱动左右交替开火（第3帧左、第6帧右）
    // QING_ATK_FPS / QING_ATK_DUR 在文件顶部定义
    if (isQing && firing) {
      if (player.attackAnimT <= 0) {
        player.attackAnimT = QING_ATK_DUR;
        player.attackFired = [false, false];
      }
    }
    if (isQing && player.attackAnimT > 0) {
      var progress = 1 - clamp(player.attackAnimT / QING_ATK_DUR, 0, 1);
      var atkFrame = Math.min(7, Math.floor(progress * 8));
      // 左侧炮：第3帧（index 2）
      if (atkFrame >= 2 && !player.attackFired[0]) {
        player.attackFired[0] = true;
        var qang = player.ang;
        var leftAng = qang - Math.PI / 2;
        var lbx = player.x + Math.cos(leftAng) * 14;
        var lby = player.y + Math.sin(leftAng) * 14;
        var lcrit = Math.random() < player.critChance;
        var ldmg = player.dmg * 0.5;
        fireBullet(lbx, lby, qang, 'player', ldmg, player.bulletSpeed,
          { pierce: player.pierce, homing: player.homing, explode: player.explode, crit: lcrit, burn: player.burn, lifesteal: player.lifesteal, chain: player.chain, elem: shotElem });
        var lmzX = player.x + Math.cos(leftAng) * 18;
        var lmzY = player.y + Math.sin(leftAng) * 18;
        spawnVfx('vfx_muzzle_flash_sheet', lmzX, lmzY, 52, 0.12, qang + Math.PI / 2, 0, { cols: 4, rows: 2, fps: 24 });
        AudioSys.sfx.shoot();
        player.attackSide = 0;
      }
      // 右侧炮：第6帧（index 5）
      if (atkFrame >= 5 && !player.attackFired[1]) {
        player.attackFired[1] = true;
        var qang2 = player.ang;
        var rightAng = qang2 + Math.PI / 2;
        var rbx = player.x + Math.cos(rightAng) * 14;
        var rby = player.y + Math.sin(rightAng) * 14;
        var rcrit = Math.random() < player.critChance;
        var rdmg = player.dmg * 0.5;
        fireBullet(rbx, rby, qang2, 'player', rdmg, player.bulletSpeed,
          { pierce: player.pierce, homing: player.homing, explode: player.explode, crit: rcrit, burn: player.burn, lifesteal: player.lifesteal, chain: player.chain, elem: shotElem });
        var rmzX = player.x + Math.cos(rightAng) * 18;
        var rmzY = player.y + Math.sin(rightAng) * 18;
        spawnVfx('vfx_muzzle_flash_sheet', rmzX, rmzY, 52, 0.12, qang2 + Math.PI / 2, 0, { cols: 4, rows: 2, fps: 24 });
        AudioSys.sfx.shoot();
        player.attackSide = 1;
      }
    }

    // 赤鸾：攻击动画驱动追踪羽矛（第4帧发射）
    if (isChi && firing) {
      if (player.attackAnimT <= 0) {
        player.attackAnimT = CHI_ATK_DUR;
        player.attackFired = [false];
      }
    }
    if (isChi && player.attackAnimT > 0) {
      var chiProgress = 1 - clamp(player.attackAnimT / CHI_ATK_DUR, 0, 1);
      var chiFrame = Math.min(7, Math.floor(chiProgress * 8));
      // 第4帧（index 3）发射追踪羽矛
      if (chiFrame >= 3 && !player.attackFired[0]) {
        player.attackFired[0] = true;
        var cang = player.ang;
        var cbx = player.x + Math.cos(cang) * 16;
        var cby = player.y + Math.sin(cang) * 16;
        var ccrit = Math.random() < player.critChance;
        var cdmg = player.dmg;
        fireBullet(cbx, cby, cang, 'player', cdmg, player.bulletSpeed,
          { pierce: player.pierce, homing: true, explode: player.explode, crit: ccrit, burn: player.burn, lifesteal: player.lifesteal, chain: player.chain, elem: shotElem, chilan: true });
        // 枪口闪光：赤鸾专属
        spawnVfx('vfx_chilan_muzzle_sheet', player.x + Math.cos(cang) * 14, player.y + Math.sin(cang) * 14, 56, 0.15, cang + Math.PI / 2, 0, { cols: 4, rows: 2, fps: 26 });
        AudioSys.sfx.shoot();
      }
    }

    if (firing && player.fireCd <= 0 && !isQing && !isChi) {
      var lastAng = player.ang;
      // 玄武：三炮散射齐射；其他：常规单发
      if (isXuan) {
        var xuanCannonOffsets = [0, -0.55, 0.55];
        var xuanSpreads = [0, -0.10, 0.10];
        for (var ci = 0; ci < 3; ci++) {
          var cang = player.ang + xuanSpreads[ci];
          lastAng = cang;
          var crit = Math.random() < player.critChance;
          var dmg = player.dmg / 3;
          var cxOff = xuanCannonOffsets[ci];
          var bx = player.x + Math.cos(player.ang + cxOff) * 22 + Math.cos(cang) * 6;
          var by = player.y + Math.sin(player.ang + cxOff) * 22 + Math.sin(cang) * 6;
          fireBullet(bx, by, cang, 'player', dmg, player.bulletSpeed,
            { pierce: player.pierce, homing: player.homing, explode: player.explode, crit: crit, burn: player.burn, lifesteal: player.lifesteal, chain: player.chain, elem: shotElem, xuanwu: true });
        }
      } else {
        for (var p = 0; p < player.pellets; p++) {
          var spreadStep = player.spreadAngle ? (player.spreadAngle / Math.max(1, player.pellets - 1)) : 0.16;
          var off = player.pellets === 1 ? 0 : (p - (player.pellets - 1) / 2) * spreadStep;
          var ang = player.ang + off;
          lastAng = ang;
          var crit = Math.random() < player.critChance;
          var dmg = player.dmg;
          var bx = player.x + Math.cos(ang) * 18;
          var by = player.y + Math.sin(ang) * 18;
          fireBullet(bx, by, ang, 'player', dmg, player.bulletSpeed,
            { pierce: player.pierce, homing: player.homing, explode: player.explode, crit: crit, burn: player.burn, lifesteal: player.lifesteal, chain: player.chain, elem: shotElem,
              homingTurnRate: player.homingTurnRate, splashRatio: player.splashRatio, chainRange: player.chainRange, chainDecay: player.chainDecay, falloff: player.falloff });
        }
      }
      player.fireCd = 1 / player.fireRate;
      AudioSys.sfx.shoot();
      // 开火动画计时（玄武/其他）
      player.attackAnimT = 0.4;
      // 枪口闪光
      var mx, my, mSize, mKey;
      if (isXuan) {
        mKey = 'vfx_xuanwu_muzzle_flash_sheet';
        mSize = 62;
        mx = player.x + Math.cos(player.ang) * 18;
        my = player.y + Math.sin(player.ang) * 18;
      } else {
        mKey = 'vfx_muzzle_flash_sheet';
        mSize = 46;
        mx = player.x + Math.cos(player.ang) * 22;
        my = player.y + Math.sin(player.ang) * 22;
      }
      spawnVfx(mKey, mx, my, mSize, 0.12, player.ang + Math.PI / 2, 0, { cols: 4, rows: 2, fps: 24 });
    }
    aimTapFire = false; // 点按保底仅触发一次
    if (player.shield < player.maxshield) player.shield = Math.min(player.maxshield, player.shield + (player.regen + (player.shieldRegen || 0)) * dt);

    // ★ 传说武器被动
    if (player.legendaryPassive === 'zhulong_wrath') {
      // 烛龙昼眠：每6秒全屏闪电
      player.legZhulongT += dt;
      if (player.legZhulongT >= 6) {
        player.legZhulongT = 0;
        var lightDmg = player.dmg * 1.2 * player.atkMult;
        // 全屏闪电：对所有敌人和Boss造成伤害
        for (var li = 0; li < enemies.length; li++) {
          enemies[li].hp -= lightDmg; enemies[li].flash = 0.1; enemies[li].hitT = 0.12; enemies[li].hitMag = 2.5;
          burst(enemies[li].x, enemies[li].y, '#7AB8FF', 6);
        }
        if (boss && boss.wake <= 0) {
          boss.hp -= lightDmg; boss.flash = 0.1; boss.hitT = 0.12;
          burst(boss.x, boss.y, '#7AB8FF', 12, { ring: true, ringR: 40 });
          if (boss.hp <= 0) killBoss();
        }
        // 视觉：全屏闪光 + 闪电粒子
        addTint('#7AB8FF', 0.25); screenFlash = { color: '#7AB8FF', a: 0.3 };
        addShake(3, 200, 80);
        AudioSys.sfx.explode();
        floatText(player.x, player.y - 30, '烛龙之怒!', '#7AB8FF', 'crit');
        for (var ls = 0; ls < 8; ls++) {
          var lx = player.x + rand(-300, 300), ly = player.y + rand(-200, 200);
          spawnParticle({ x: lx, y: ly, vx: 0, vy: 0, life: 0.3, color: '#7AB8FF', r: 3, ring: true, rmax: 30, r0: 4 });
        }
      }
    }
    if (player.legendaryPassive === 'taowu_immortal') {
      // 梼杌不灭：HP<30%时每秒回5%最大HP至50%，每局1次
      if (!player.legTaowuTriggered && player.hp > 0 && player.hp < player.maxhp * 0.3) {
        player.legTaowuTriggered = true;
        floatText(player.x, player.y - 30, '梼杌之怒!', '#E0503A', 'crit');
        addTint('#E0503A', 0.2);
      }
      if (player.legTaowuTriggered && player.hp < player.maxhp * 0.5) {
        player.hp = Math.min(player.maxhp * 0.5, player.hp + player.maxhp * 0.05 * dt);
        if (Math.random() < 0.3) spawnParticle({ x: player.x + rand(-12, 12), y: player.y + rand(-12, 12), vx: 0, vy: -20, life: 0.4, color: '#E0503A', r: 2 });
      }
    }
    // ★ 套装：玄龟镇海 - 站定不动效果
    if (player.setStandStillReduce > 0) {
      var moving = Math.abs(player.vx) > 5 || Math.abs(player.vy) > 5;
      if (!moving) { player.standStillT += dt; } else { player.standStillT = 0; }
    }

    // 自动炮台
    if (player.drones > 0) {
      while (player.droneList.length < player.drones) player.droneList.push({ ang: rand(0, 6.28) });
      player.droneCd -= dt;
      for (var di = 0; di < player.droneList.length; di++) { var dr = player.droneList[di]; dr.ang += 2.2 * dt; dr.x = player.x + Math.cos(dr.ang) * 56; dr.y = player.y + Math.sin(dr.ang) * 56; }
      if (player.droneCd <= 0) {
        for (var dj = 0; dj < player.droneList.length; dj++) {
          var d2 = player.droneList[dj]; var tgt = nearestEnemy(d2.x, d2.y);
          if (tgt) { var da = Math.atan2(tgt.y - d2.y, tgt.x - d2.x); fireBullet(d2.x, d2.y, da, 'player', player.dmg * 0.5 * (player.droneDmgMult || 1), player.bulletSpeed, { pierce: player.pierce, homing: player.homing, elem: pickOwnedElem() }); }
        }
        player.droneCd = 0.5 * (player.droneCdMult || 1);
      }
    }

    // 遭遇制：敌人开局按地点固定布置（宝箱护卫 + 少量游荡机），见 placeEncounters()
    // 常规周期增援由 updatePeriodicSpawns()（#381-①）驱动——清完一地点后场上仍持续有敌人涌入，杜绝空场。
    if (inRift) { updateRift(dt); }

    // 搜刮点（遭遇制：护卫清空前锁定，不再重生）
    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni]; nd.pulse += dt * 3;
      if (nd.collected) continue;
      if (nd.locked) {
        var gAlive = nd.guards.some(function (g) { return enemies.indexOf(g) >= 0; });
        if (!gAlive) { nd.locked = false; floatText(nd.x, nd.y - 26, '护卫已清！可开箱', CHESTS[nd.chest].color, 'crit'); }
        else if (dist2(nd.x, nd.y, player.x, player.y) < (nd.r + player.pickR * 0.6) * (nd.r + player.pickR * 0.6)) setBanner('⚠ 先清除护卫机再开箱', 1.0);
        continue;
      }
      if (dist2(nd.x, nd.y, player.x, player.y) < (nd.r + player.pickR * 0.6) * (nd.r + player.pickR * 0.6)) collectNode(nd);
    }
    // 裂隙入口触碰（主图）
    if (!inRift && !riftPrompt) {
      for (var ri = 0; ri < rifts.length; ri++) { if (rifts[ri].cooldown > 0) rifts[ri].cooldown -= dt; }
      for (var ri = 0; ri < rifts.length; ri++) {
        var rf = rifts[ri];
        if (rf.cooldown > 0) continue;
        if (rf.state === 'idle' && dist2(rf.x, rf.y, player.x, player.y) < (rf.r + player.pickR * 0.5) * (rf.r + player.pickR * 0.5)) { showRiftChoice(rf); break; }
      }
    }
    if (edgeArrow && edgeArrow.timer > 0) edgeArrow.timer -= dt;
    if (lootArrow && lootArrow.timer > 0) lootArrow.timer -= dt;
    updateExtractPoints(dt); // 撤离点限时开放状态机 + 围堵
    updateVaults(dt); // 封印/符文宝箱状态机（解封/击柱解锁）
    if (!inRift && !bossSpawned && run.nodes >= 3 + run.tier) spawnBoss(); // 裂隙内不触发主图Boss

    // 撤离逻辑（简化版）：进入开放点 → 立即开始读条；离开则进度衰减（不冷却不惩罚）
    exfil = false;
    if (exfilAlarmT > 0) exfilAlarmT -= dt;
    if (extractPoints && extractPoints.length) {
      for (var ei2 = 0; ei2 < extractPoints.length; ei2++) {
        var ez = extractPoints[ei2];
        // v12.6：撤离点仅在击破领主后的光柱（beacon, state==='open'）可发起读条；不再依赖相位窗
        if (ez.state !== 'open') continue;
        var inside = player.x > ez.x && player.x < ez.x + ez.w && player.y > ez.y && player.y < ez.y + ez.h;
        if (inside) {
          exfil = true;
          // 首次进入 → 触发惊动
          if (!exfilStarted || exfilPoint !== ez) {
            exfilStarted = true; exfilPoint = ez; exfilChoice = 'clear';
            triggerAlarm(ez, false);
            setBanner('撤离读条中…留在光柱内！', 1.8);
            phaseObjectFeedback('extract', ez.x + ez.w / 2, ez.y + ez.h / 2);
          }
          var castTime = 3.0; // v12.6：3s 无干扰读条（beacon 态）
          // 机动型核心：读条加速15%
          if (player.dashCdReduce > 0) castTime *= 0.85;
          ez.prog = Math.min(1, ez.prog + dt / castTime);
          if (ez.prog >= 1) { AudioSys.sfx.extract(); finishRun('success'); }
        } else {
          // 不在区域内：进度缓慢衰减
          if (ez.prog > 0) ez.prog = Math.max(0, ez.prog - dt / 3);
          // 如果当前正在读条的这个点，玩家离开了，清除读条状态（但不清零进度）
          if (exfilPoint === ez && exfilStarted) { exfilStarted = false; }
        }
      }
    }

    // 引力裂隙·吞噬借力（余烬相高风险支线，§7.6）：站入核心区停留 2.5s 借力；期间持续受伤 + 吸向 Boss 60px/s
    for (var _ri = 0; _ri < gravityRifts.length; _ri++) {
      var _gr = gravityRifts[_ri];
      if (phase !== PHASE.EMBER) continue;
      var _din = Math.hypot(player.x - _gr.x, player.y - _gr.y);
      if (_din < _gr.r) {
        // 裂隙内危险区：持续受伤（轻量，不每帧播 sfx）+ 吸向 Boss
        player.hp -= DEVOUR_DOT * dt;
        player.flash = Math.max(player.flash || 0, 0.06);
        if (player.hp <= 0) { player.hp = 0; burst(player.x, player.y, player.color, 16); addShake(6, 260, 120, true); AudioSys.sfx.playerDie(); if (inRift) dieInRift(); else finishRun('death'); }
        if (boss) {
          var _dx = boss.x - player.x, _dy = boss.y - player.y, _db = Math.hypot(_dx, _dy) || 1;
          player.vx += (_dx / _db) * DEVOUR_PULL_SPD * dt * 6;
          player.vy += (_dy / _db) * DEVOUR_PULL_SPD * dt * 6;
        }
      }
      if (_din < DEVOUR_ZONE_R) { // 站定核心区献祭站位才借力
        player.devourHold = (player.devourHold || 0) + dt;
        if (player.devourHold >= DEVOUR_HOLD && !devourBorrowUsed) {
          if (boss) triggerDevourBorrow(boss);
          player.devourHold = 0;
          setBanner('吞噬借力·全厅战利品归位！', 2.2);
        }
      } else {
        player.devourHold = 0;
      }
    }

    // 磁锁秘库·投喂借力开门（§5：靠近即弹出交互，玩家主动投喂/灵玉）→ 可感知
    if (vaultCd > 0) vaultCd -= dt;
    if (secretVault && !secretVault.opened && !vaultPrompt && !paused && scene === 'mission' && vaultCd <= 0) {
      // #381-② 距离门：仅距秘库中心 < VAULT_PROMPT_R(150px) 才弹（修复"只要秘库存在每帧都弹"）
      if (Math.hypot(player.x - secretVault.x, player.y - secretVault.y) < VAULT_PROMPT_R) openVaultPrompt();
    }

    // 敌人
    // 同屏蓄力冲压计数（限制最多 CHARGE_MAX 只同时进入蓄力态，防集体暴冲）
    var chargingNow = 0;
    for (var _cn = 0; _cn < enemies.length; _cn++) if (enemies[_cn].chargeState >= 1) chargingNow++;
    if (DBG_ENEMY_AI) console.log('[AI] enemies=' + enemies.length + ' dt=' + dt.toFixed(4));
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.burnT > 0) { e.hp -= e.burn * dt; e.burnT -= dt; if (e.hp <= 0) { onEnemyDeath(e); continue; } }
      // ★ 九婴之毒：每秒2%最大HP真伤，可叠3层
      if (e.jiuyingT > 0) {
        e.jiuyingT -= dt; e.jiuyingTick = (e.jiuyingTick || 0) + dt;
        if (e.jiuyingTick >= 1) {
          e.jiuyingTick = 0;
          var poisonDmg = (e.maxhp || e.hp) * 0.02 * (e.jiuyingPoison || 1);
          e.hp -= poisonDmg;
          burst(e.x, e.y, '#6B8E23', 3, { smin: 20, smax: 60, lmin: 0.15, lmax: 0.3 });
          if (e.hp <= 0) {
            // 毒杀传染：100px内敌人获得毒层
            for (var pi = 0; pi < enemies.length; pi++) {
              if (pi !== i && dist2(e.x, e.y, enemies[pi].x, enemies[pi].y) < 100 * 100) {
                enemies[pi].jiuyingPoison = Math.min(3, (enemies[pi].jiuyingPoison || 0) + 1);
                enemies[pi].jiuyingT = 3; enemies[pi].jiuyingTick = 0;
              }
            }
            onEnemyDeath(e); continue;
          }
        }
      }
      // ★ 山海猎兽人标记：被标记敌人受到的伤害+25%
      if (e.markT > 0) { e.markT -= dt; if (e.markT <= 0) e.marked = false; }
      // 元素附着 / 持续反应 计时
      if (e.knockT > 0) { e.x += e.knockx * dt; e.y += e.knocky * dt; e.knockT -= dt; }
      if (e.auraT > 0) { e.auraT -= dt; if (e.auraT <= 0) e.aura = null; }
      if (e.electroT > 0) { e.electroT -= dt; e.electroCd -= dt; if (e.electroCd <= 0) { e.electroCd = 0.42; var tz = nearestOther(e); if (tz) { tz.hp -= e.electroDmg; tz.flash = 0.06; tz.hitT = 0.08; tz.hitMag = 1.4; addVfxLine(e.x, e.y, tz.x, tz.y, '#6FC0FF', 0.22); } e.hp -= e.electroDmg * 0.4; burst(e.x, e.y, '#6FC0FF', 3, { smin: 40, smax: 120 }); } }
      if (e.drownT > 0) { e.drownT -= dt; e.hp -= e.drownDps * dt; }
      if (e.hp <= 0) { onEnemyDeath(e); continue; }
      // 引力裂缝·敌机牵引（聚怪爽感，v12）：直接位移（敌机无速度模型）
      for (var _eg = 0; _eg < gravityRifts.length; _eg++) {
        var _grx = gravityRifts[_eg];
        var _edx = _grx.x - e.x, _edy = _grx.y - e.y, _ed = Math.hypot(_edx, _edy) || 1;
        if (_ed < _grx.pull && _ed > _grx.core) {
          var _ef = Math.min((hasAffix('gravity_surge') ? GRAV_K * 1.5 : GRAV_K) / (_ed + 24), 1000); // B3 修复：词缀「引力裂缝吸力+50%」对敌我双方生效（与玩家吸力 L4507 对称）
          e.x += (_edx / _ed) * _ef * dt; e.y += (_edy / _ed) * _ef * dt;
        }
      }
      // 朝玩家方向 & 移速底盘（供出场缓冲与主 AI 共用）
      var dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      var baseSpeed = (e.arche === 'turret' ? 22 : (e.arche === 'gunship' ? 45 : (e.arche === 'heal' ? 40 : (e.arche === 'sniper' ? 55 : (e.arche === 'shielder' ? 38 : (e.arche === 'swarm' ? 95 + e.tier * 10 : (e.ram ? 70 + e.tier * 8 : 52 + e.tier * 6)))))));
      var es = (e.elite ? 1.3 : 1) * (e.boost || 1) * phaseSpeedMul * (hasAffix('frenzy') ? 1.2 : 1); // 深渊异变·极速：移速+20%（作用于出场/巡逻/追击全路径）
      var ef = (enemiesSlowT > 0 ? enemiesSlowFactor : 1);
      if (player.slowAuraR > 0 && d < player.slowAuraR) ef *= player.slowFactor;
      if (e.wake > 0) {
        // 出场缓冲：缓慢巡逻（50%速），不锁定/不冲锋/不开火，给玩家反应与拉扯空间
        e.wake -= dt;
        var ehx = e.homeX - e.x, ehy = e.homeY - e.y, ehd = Math.hypot(ehx, ehy);
        if (ehd > 60) { e.x += (ehx / ehd) * baseSpeed * 0.5 * es * ef * dt; e.y += (ehy / ehd) * baseSpeed * 0.5 * es * ef * dt; }
        else { e.x += Math.cos(e.patrolAng) * baseSpeed * 0.35 * dt; e.y += Math.sin(e.patrolAng) * baseSpeed * 0.35 * dt; e.patrolAng += dt * 0.8; }
        var esep = sepForce(e); e.x += esep.x * baseSpeed * 0.6 * dt; e.y += esep.y * baseSpeed * 0.6 * dt;
        resolveObstacles(e, e.r);
        if (e.flash > 0) e.flash -= dt; if (e.hitT > 0) e.hitT -= dt;
        continue;
      }
      if (e.freezeT > 0) { e.freezeT -= dt; e.flash = Math.max(0, e.flash - dt); if (e.hitT > 0) e.hitT -= dt; continue; }
      if (e.arche === 'looter') {
        if (e.hitT > 0) e.hitT -= dt;
        e.zig += dt * 6;
        var tx2, ty2;
        if (e.fleeing) { tx2 = e.x + (e.x - WORLD_W / 2); ty2 = e.y + (e.y - WORLD_H / 2); } else { tx2 = player.x; ty2 = player.y; }
        e.px = e.x; e.py = e.y;
        var ldd = Math.hypot(tx2 - e.x, ty2 - e.y) || 1, ls = (e.fleeing ? 170 : 135) * (hasAffix('frenzy') ? 1.2 : 1); // 深渊异变·极速：劫掠者移速+20%
        e.x += (tx2 - e.x) / ldd * ls * dt + Math.cos(e.zig) * 45 * dt;
        e.y += (ty2 - e.y) / ldd * ls * dt + Math.sin(e.zig) * 45 * dt;
        e.flash = Math.max(0, e.flash - dt);
        if (!e.fleeing && dist2(e.x, e.y, player.x, player.y) < (e.r + player.r + 4) * (e.r + player.r + 4)) {
          if (run.loot.length > 0) {
            var st = run.loot.pop(); run.picked = Math.max(0, run.picked - 1);
            e.lootStolen = st; e.fleeing = true;
            floatText(player.x, player.y - 26, '战利品被夺!', COL.sha, 'crit'); addShake(3.5, 200, 80); AudioSys.sfx.stolen();
          } else { e.fleeing = true; }
        }
        if (e.fleeing && (e.x < -10 || e.x > W + 10 || e.y < -10 || e.y > H + 10)) {
          if (e.lootStolen) floatText(player.x, player.y - 40, '战利品被带走了…', '#D96A7E', 'crit');
          var li = enemies.indexOf(e); if (li >= 0) enemies.splice(li, 1);
        }
        resolveObstacles(e, e.r);
        // 空域：敌人仅受障碍与边界约束；逃跑的劫掠者照常离场
        continue;
      }
      e.px = e.x; e.py = e.y;
      updateAlert(e, d, dt);
      // 精英·狂暴：血量低于50%时速度+40%
      if (e.eliteMod === 'frenzied' && !e.frenzyTriggered && e.hp < e.maxhp * 0.5) { e.frenzyTriggered = true; e.boost = 1.4; floatText(e.x, e.y - e.r - 12, '狂暴!', '#E0503A', 'crit'); }
      // —— 巡逻（未察觉）：绕 home 缓慢游荡，无视玩家 ——
      if (e.alert === 0 && e.chargeState === 0) {
        var hdx = e.homeX - e.x, hdy = e.homeY - e.y, hd = Math.hypot(hdx, hdy);
        if (hd > 70) { e.x += (hdx / hd) * baseSpeed * 0.32 * es * ef * dt; e.y += (hdy / hd) * baseSpeed * 0.32 * es * ef * dt; }
        else { e.x += Math.cos(e.patrolAng) * baseSpeed * 0.22 * dt; e.y += Math.sin(e.patrolAng) * baseSpeed * 0.22 * dt; e.patrolAng += dt * 0.8; }
        var psep = sepForce(e); e.x += psep.x * baseSpeed * 0.5 * dt; e.y += psep.y * baseSpeed * 0.5 * dt;
      } else {
        // ===== 差异化 AI 行为树（按原型分流；警觉=试探0.55×，锁定=全力）=====
        var engageMul = (e.chargeState >= 1) ? 1.0 : ((e.alert === 2) ? 1.0 : 0.55);
        var mvx = 0, mvy = 0, spd = baseSpeed * es * ef * engageMul;
        if (e.arche === 'swarm') {
          // 蜂群：180~250px 环带切向环绕（Orbit-and-Pounce），不直接死咬冲脸
          e.zig += dt * 6;
          var tang = { x: -uy, y: ux };
          var radial = (d > SWARM_HI) ? 0.55 : (d < SWARM_LO ? -0.55 : 0);
          mvx = ux * radial + tang.x * 1.0 + Math.cos(e.zig) * 0.2;
          mvy = uy * radial + tang.y * 1.0 + Math.sin(e.zig) * 0.2;
          spd *= 0.95;
        } else if (e.arche === 'ram' || e.arche === 'split' || e.kamikaze) {
          // 冲撞者 / 自爆突进蜂：蓄力(红色预警) → 直冲固定距离 → 力竭停顿（可被破）
          var RUSH = e.kamikaze ? 3.0 : 1.9;                       // 自爆蜂极速直冲
          var KW = e.kamikaze ? e.kamikazeWind : CHARGE_TELE;     // 自爆蜂 0.5s 前摇
          var KCR = e.kamikaze ? CHARGE_RANGE * 1.15 : CHARGE_RANGE;
          if (e.chargeState === 0) {
            mvx = ux; mvy = uy; spd *= e.kamikaze ? 1.0 : 0.85;
            if (e.alert === 2 && d < KCR && chargingNow < CHARGE_MAX) { e.chargeState = 1; e.chargeT = 0; chargingNow++; }
          } else if (e.chargeState === 1) {
            e.chargeT += dt; e.chargeDir = Math.atan2(dy, dx);
            mvx = 0; mvy = 0; spd = 0;
            if (e.chargeT >= KW) { e.chargeState = 2; e.chargeT = 0; e.chargeDist = CHARGE_DIST; e.chargeDir = Math.atan2(dy, dx); }
          } else if (e.chargeState === 2) {
            e.chargeT += dt; mvx = Math.cos(e.chargeDir); mvy = Math.sin(e.chargeDir); spd *= RUSH;
            e.chargeDist -= spd * dt;
            if (e.chargeDist <= 0) { e.chargeState = 3; e.chargeT = 0; }
          } else {
            e.chargeT += dt; mvx = 0; mvy = 0; spd = 0;
            if (e.chargeT >= CHARGE_FATIGUE) {
              e.chargeState = 0; e.chargeT = 0;
              if (e.kamikaze) { e.kamikazeDashes++; if (e.kamikazeDashes >= e.kamikazeMax) e.detonate = 0.5; } // 多段冲撞耗尽 → 引信自爆
            }
          }
        } else if (e.arche === 'shoot' || e.arche === 'turret' || e.arche === 'gunship') {
          // 远程：保持距离带 + 横移风筝
          var bLo, bHi;
          if (e.arche === 'turret') { bLo = 200; bHi = 520; }
          else if (e.arche === 'gunship') { bLo = 360; bHi = 660; }
          else { bLo = 280; bHi = 540; }
          if (d < bLo) { mvx = -ux; mvy = -uy; spd *= 0.9; }
          else if (d > bHi) { mvx = ux; mvy = uy; spd *= 0.8; }
          else { var ts = (Math.floor(e.patrolAng / 6.283) % 2 === 0) ? 1 : -1; mvx = -uy * ts; mvy = ux * ts; spd *= (e.arche === 'turret' ? 0.18 : 0.7); }
          e.zig += dt * 3; mvx += Math.cos(e.zig) * 0.12; mvy += Math.sin(e.zig) * 0.12;
        } else if (e.arche === 'weaver') {
          // 引力编织者：中距风筝，绕玩家缓慢游走（不直冲），便于持续吐奇点球 + 飞刃
          if (d < 360) { mvx = -ux; mvy = -uy; spd *= 0.9; }
          else if (d > 520) { mvx = ux; mvy = uy; spd *= 0.6; }
          else { var wts = (Math.floor(e.patrolAng / 6.283) % 2 === 0) ? 1 : -1; mvx = -uy * wts; mvy = ux * wts; spd *= 0.5; }
          e.zig += dt * 2.5; mvx += Math.cos(e.zig) * 0.15; mvy += Math.sin(e.zig) * 0.15;
        } else if (e.arche === 'sniper' || e.arche === 'phaseSniper') {
          // 狙击手/相位狙击手：保持距离（移动 AI）；充能/开火已迁至 updateEnemyShooting（自治，仅保留 LOS）
          if (d < 480) { mvx = -ux; mvy = -uy; spd *= 0.85; }
          else if (d > 700) { mvx = ux; mvy = uy; spd *= 0.5; }
          else { mvx = 0; mvy = 0; spd = 0; }
        } else if (e.arche === 'bastion') {
          // 鎏金重盾巨舰：缓慢逼近并保持中距，正面 120° 金盾始终朝向玩家（绕后 / 余烬破盾）
          if (d > 320) { mvx = ux; mvy = uy; spd *= 0.5; }
          else if (d < 220) { mvx = -ux; mvy = -uy; spd *= 0.4; }
          else { var bts = (Math.floor(e.patrolAng / 6.283) % 2 === 0) ? 1 : -1; mvx = -uy * bts; mvy = ux * bts; spd *= 0.22; }
          e.zig += dt * 1.5; mvx += Math.cos(e.zig) * 0.1; mvy += Math.sin(e.zig) * 0.1;
        } else if (e.arche === 'shielder') {
          // 护盾兵：跟随最近友军 + 投射护盾
          e.shieldPulse += dt * 3;
          var nAlly = null, nad = Infinity;
          for (var sa = 0; sa < enemies.length; sa++) { if (enemies[sa] === e || enemies[sa].arche === 'shielder') continue; var sad = dist2(e.x, e.y, enemies[sa].x, enemies[sa].y); if (sad < nad) { nad = sad; nAlly = enemies[sa]; } }
          if (nAlly && nad > 80 * 80) { var aA = Math.atan2(nAlly.y - e.y, nAlly.x - e.x); mvx = Math.cos(aA); mvy = Math.sin(aA); spd *= 0.6; }
          else { mvx = ux * 0.25; mvy = uy * 0.25; spd *= 0.3; }
        } else if (e.arche === 'heal') {
          // 游医：靠近最受伤友军治疗，否则绕玩家侧缓慢游弋
          var wounded = null, wd = Infinity;
          for (var hw = 0; hw < enemies.length; hw++) { var o2 = enemies[hw]; if (o2 === e || o2.hp >= o2.maxhp * 0.98) continue; var wd2 = dist2(e.x, e.y, o2.x, o2.y); if (wd2 < wd) { wd = wd2; wounded = o2; } }
          if (wounded && wd > 60 * 60) { var wA = Math.atan2(wounded.y - e.y, wounded.x - e.x); mvx = Math.cos(wA); mvy = Math.sin(wA); spd *= 0.7; }
          else { mvx = -uy * 0.6; mvy = ux * 0.6; spd *= 0.4; }
        } else {
          mvx = ux; mvy = uy; spd *= 0.7;
        }
        // 分离力（Boids）：防止多敌重叠成一点
        var sep = sepForce(e); mvx += sep.x * 0.85; mvy += sep.y * 0.85;
        var ml = Math.hypot(mvx, mvy);
        if (ml > 0.001) { e.x += (mvx / ml) * spd * dt; e.y += (mvy / ml) * spd * dt; }
      }
      resolveObstacles(e, e.r);
      // 空域：敌人受障碍与边界约束
      for (var oi2 = 0; oi2 < obstacles.length; oi2++) { var ob2 = obstacles[oi2]; if (ob2.type === 'rift' && dist2(e.x, e.y, ob2.x, ob2.y) < (ob2.r + e.r) * (ob2.r + e.r)) e.hp -= ob2.dps * dt; }
      if (e.hp <= 0 && !e.dead) { onEnemyDeath(e, true); continue; }
      if (e.flash > 0) e.flash -= dt;
      if (e.hitT > 0) e.hitT -= dt;
      // v12.6：自爆突进蜂引信耗尽 → 自爆（统一走 onEnemyDeath 爆炸逻辑）
      if (e.detonate > 0) { e.detonate -= dt; if (e.detonate <= 0) { onEnemyDeath(e); continue; } }
      // 开火（自治例程：冷却就绪 + 玩家在战斗半径内 + 屏内即射；不再依赖 e.alert===2 硬门）
      updateEnemyShooting(e, dt);
      if (e.arche === 'heal') {
        e.healCd -= dt;
        if (e.healCd <= 0) {
          var healed = false;
          for (var h = 0; h < enemies.length; h++) { var o = enemies[h]; if (o !== e && dist2(o.x, o.y, e.x, e.y) < 130 * 130 && o.hp < o.maxhp) { o.hp = Math.min(o.maxhp, o.hp + 22); healed = true; } }
          if (healed) { burst(e.x, e.y, '#7FB069', 8, { ring: true, ringR: 30 }); }
          e.healCd = 3.5;
        }
      }
    }
    resolveEnemyOverlaps(); // 硬分离兜底：消除怪堆重叠
    if (boss) updateBoss(dt);

    // 子弹
    for (var b = bullets.length - 1; b >= 0; b--) {
      var bl = bullets[b];
      bl.lastx = bl.x; bl.lasty = bl.y;
      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt; bl.age += dt;
      if (bl.trail) bl.trail.age += dt;
      // 空域：子弹由下方岩石/隔断墙碰撞处理，天空不做实体拦截
      if (bl.life <= 0 || bl.x < -60 || bl.x > WORLD_W + 60 || bl.y < -60 || bl.y > WORLD_H + 60) { bullets.splice(b, 1); continue; }
      var _blk = false, _bsr = bl.r || 3;
      for (var oi3 = 0; oi3 < obstacles.length; oi3++) {
        var _ob = obstacles[oi3];
        if (_ob.type === 'rock') { if (dist2(bl.x, bl.y, _ob.x, _ob.y) < _ob.r * _ob.r) { _blk = true; break; } }
        else if (_ob.type === 'wall') { if (bl.x > _ob.x - _ob.hw - _bsr && bl.x < _ob.x + _ob.hw + _bsr && bl.y > _ob.y - _ob.hh - _bsr && bl.y < _ob.y + _ob.hh + _bsr) { _blk = true; break; } }
      }
      if (_blk) { if (bl.from === 'player') { burst(bl.x, bl.y, '#9fd0e0', 3); spawnElementHit(bl.elem, bl.x, bl.y, 0.7); } bullets.splice(b, 1); continue; }
      // 符文柱（符文宝箱解谜目标）：玩家子弹可击破
      if (bl.from === 'player' && totems.length) {
        for (var _ti = totems.length - 1; _ti >= 0; _ti--) {
          var _tm = totems[_ti]; if (_tm.dead) continue;
          if (dist2(bl.x, bl.y, _tm.x, _tm.y) < (_tm.r + _bsr) * (_tm.r + _bsr)) {
            _tm.hp -= calcDamage(bl.dmg, bl.crit, null); burst(bl.x, bl.y, '#B06FD0', 3); spawnElementHit(bl.elem, bl.x, bl.y, 0.8);
            if (_tm.hp <= 0) { _tm.dead = true; burst(_tm.x, _tm.y, '#C79BE8', 14, { ring: true, ringR: 32 }); AudioSys.sfx.hit(); checkVaultTotems(_tm.vid); }
            break;
          }
        }
      }
      if (bl.from === 'player') {
        // v12.6：鎏金重盾巨舰 —— 正面 120° 金盾反弹直射弹（绕后 / 余烬相或余烬弹破盾）
        var _refl = false;
        if (phase !== PHASE.EMBER) {
          for (var _bs = 0; _bs < enemies.length; _bs++) {
            var _bn = enemies[_bs];
            if (!_bn.bastion) continue;
            if (dist2(bl.x, bl.y, _bn.x, _bn.y) < (_bn.r + bl.r + 6) * (_bn.r + bl.r + 6)) {
              var _bf = Math.atan2(player.y - _bn.y, player.x - _bn.x); // 盾朝向玩家
              var _bi = Math.atan2(bl.y - _bn.y, bl.x - _bn.x);          // 子弹相对巨舰方位
              if (Math.abs(angDiff(_bi, _bf)) < _bn.shieldArc / 2) {
                if (bl.elem === 'ember') { /* 余烬弹破盾：不反弹，正常结算伤害 */ }
                else {
                  bl.from = 'enemy'; bl.vx = -bl.vx; bl.vy = -bl.vy; bl.dmg = Math.max(6, bl.dmg * 0.5); bl.elem = null; bl.pierce = 0; bl.homing = false;
                  burst(bl.x, bl.y, '#E0B84A', 6, { smin: 60, smax: 160 }); spawnVfx('vfx_hit_star_sheet', bl.x, bl.y, 44, 0.3, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 22 }); AudioSys.sfx.hit();
                  floatText(_bn.x, _bn.y - _bn.r - 10, '金盾反弹!', '#E0B84A', 'normal');
                  _refl = true; break;
                }
              }
            }
          }
        }
        if (_refl) { continue; } // 反弹后本帧作为敌弹处理（下帧命中玩家），跳过玩家弹结算
        if (bl.homing) {
          var tgt = nearestEnemy(bl.x, bl.y);
          if (tgt) { var desired = Math.atan2(tgt.y - bl.y, tgt.x - bl.x); var cur = Math.atan2(bl.vy, bl.vx); var turnRate = bl.homingTurnRate || (bl.chilan ? 6 : 4); var nd2 = cur + clamp(angDiff(desired, cur), -turnRate * dt, turnRate * dt); var sp = Math.hypot(bl.vx, bl.vy); bl.vx = Math.cos(nd2) * sp; bl.vy = Math.sin(nd2) * sp; }
        }
        var consumed = false;
        if (boss && boss.wake <= 0 && dist2(bl.x, bl.y, boss.x, boss.y) < (boss.r + bl.r) * (boss.r + bl.r)) {
          var bdmg = calcDamage(bl.dmg, bl.crit, boss);
          boss.hp -= bdmg; boss.flash = 0.08; boss.hitT = 0.12; boss.hitMag = 1.4;
          if (bl.elem) handleElement(boss, bl.elem, bdmg);
          AudioSys.sfx.hit();
          spawnVfx(bl.chilan ? 'vfx_chilan_hit_sheet' : (bl.xuanwu ? 'vfx_xuanwu_hit_shock_sheet' : 'vfx_hit_star_sheet'), bl.x, bl.y, bl.chilan ? 60 : (bl.xuanwu ? 72 : 44), 0.36, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 22 });
          spawnElementHit(bl.elem, bl.x, bl.y, 1.1);
          burst(bl.x, bl.y, BULLET_COL.boss, bl.crit ? 10 : 6, { smin: 80, smax: 240, lmin: 0.2, lmax: 0.35 });
          floatText(boss.x, boss.y - boss.r - 8, '-' + Math.round(bdmg), bl.crit ? BULLET_COL.buff : '#F4EFE6', bl.crit ? 'crit' : 'normal');
          if (bl.lifesteal > 0 && _lsCd <= 0) {
            var _heal = Math.min(bdmg * bl.lifesteal, bdmg * 0.03); // 单次回复 ≤ 造成伤害的 3%
            player.hp = Math.min(player.maxhp, player.hp + Math.round(_heal));
            _lsCd = 0.2; // 0.2s 内置冷却，防高射速瞬间回满
            floatText(player.x, player.y - 20, '+' + Math.round(_heal), '#7FB069', 'heal');
          }
          if (boss.hp <= 0) killBoss();
          if (bl.pierce > 0) bl.pierce--; else { bullets.splice(b, 1); consumed = true; }
        }
        if (!consumed) {
          for (var ei = 0; ei < enemies.length; ei++) {
            var en = enemies[ei];
            if (dist2(bl.x, bl.y, en.x, en.y) < (en.r + bl.r) * (en.r + bl.r)) {
              var dmg0 = calcDamage(bl.dmg, bl.crit, en);
              // 异相克制：玩家相位与敌机相位相异 → ×1.5（余烬打金系 / 鎏金打余烬系）；金色火花 + 暴击大字
              if (phase !== en.phase) {
                dmg0 *= PHASE_COUNTER_MULT;
                burst(en.x, en.y, '#FFD24A', 6, { smin: 50, smax: 170, lmin: 0.2, lmax: 0.35 });
                if (bl.crit || Math.random() < 0.22) { floatText(en.x, en.y - en.r - 18, '克制 ×1.5', '#FFD24A', 'crit'); spawnRing(en.x, en.y, '#FFD24A', 30); }
              }
              if (en.marked) dmg0 *= 1.25; // 山海猎兽人标记增伤
              // 护盾兵减伤：附近有护盾兵时伤害-50%
              if (en.arche !== 'shielder') {
                for (var shi = 0; shi < enemies.length; shi++) {
                  if (enemies[shi].arche === 'shielder' && enemies[shi].wake <= 0 && enemies[shi] !== en && dist2(en.x, en.y, enemies[shi].x, enemies[shi].y) < enemies[shi].shieldRadius * enemies[shi].shieldRadius) {
                    dmg0 *= 0.5; break;
                  }
                }
              }
              // 精英·适应：对最后命中的元素减伤30%
              if (en.eliteMod === 'adaptive' && bl.elem && en.lastElemHit === bl.elem) {
                dmg0 *= 0.7;
              }
              if (bl.elem) en.lastElemHit = bl.elem; // 记录最后命中元素
              en.hp -= dmg0; en.flash = 0.03; en.hitT = 0.1; en.hitMag = bl.crit ? 3 : 2.2;
              // 打击感三件套：受击白闪(1~2帧) + Hitstop 顿帧 + Trauma 微震
              addHitstop(bl.crit ? HITSTOP_CRIT * 1000 : HITSTOP_NORMAL * 1000);
              addShake(TRAUMA_HIT, 90, 40);
              spawnVfx(bl.chilan ? 'vfx_chilan_hit_sheet' : (bl.xuanwu ? 'vfx_xuanwu_hit_shock_sheet' : 'vfx_hit_star_sheet'), bl.x, bl.y, bl.chilan ? 64 : (bl.xuanwu ? 78 : 48), 0.36, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 22 });
              spawnElementHit(bl.elem, bl.x, bl.y, 1.0);
              if (bl.elem) handleElement(en, bl.elem, dmg0);
              if (player.freezeChance > 0 && Math.random() < player.freezeChance && en.wake <= 0) { en.freezeT = 1.1; /* spawnVfx('vfx_frost', en.x, en.y, 34, 0.55, rand(0, 6.28)); // 旧资产未抠干净，先禁用 */ }
              if (bl.crit) AudioSys.sfx.crit(); else AudioSys.sfx.hit();
              var dnum = Math.round(dmg0);
              burst(bl.x, bl.y, bl.crit ? BULLET_COL.buff : COL.enemy, bl.crit ? 10 : 5, { smin: 60, smax: bl.crit ? 260 : 200, lmin: 0.18, lmax: bl.crit ? 0.4 : 0.32 });
              if (bl.crit) { addTint('#ffffff', 0.12); spawnRing(en.x, en.y, '#FFE9A8', 22); spawnVfx(bl.chilan ? 'vfx_chilan_hit_sheet' : (bl.xuanwu ? 'vfx_xuanwu_hit_shock_sheet' : 'vfx_hit_star_sheet'), en.x, en.y, bl.chilan ? 80 : (bl.xuanwu ? 96 : 72), 0.40, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 22 }); spawnElementHit(bl.elem, en.x, en.y, 1.2); floatText(en.x, en.y - en.r - 6, '暴击 -' + dnum, BULLET_COL.buff, 'crit'); }
              else { floatText(en.x, en.y - en.r - 6, '-' + dnum, '#F4EFE6', 'normal'); }
              if (bl.explode > 0) { var splashR = bl.splashRatio || 0.6; for (var ex2 = 0; ex2 < enemies.length; ex2++) { if (ex2 !== ei && dist2(en.x, en.y, enemies[ex2].x, enemies[ex2].y) < bl.explode * bl.explode) { enemies[ex2].hp -= dmg0 * splashR; enemies[ex2].flash = 0.06; enemies[ex2].hitT = 0.08; enemies[ex2].hitMag = 1.5; } } burst(bl.x, bl.y, '#D98A3D', 10); AudioSys.sfx.explode(); }
              if (bl.chain > 0) { var chained = 0; var chainR = bl.chainRange || 140; var chainD = bl.chainDecay || 0.5; for (var cx = 0; cx < enemies.length && chained < bl.chain; cx++) { if (cx !== ei && dist2(en.x, en.y, enemies[cx].x, enemies[cx].y) < chainR * chainR) { enemies[cx].hp -= dmg0 * chainD; enemies[cx].flash = 0.05; enemies[cx].hitT = 0.08; enemies[cx].hitMag = 1.5; chained++; } } }
              if (player.overload && bl.crit) { for (var ox = 0; ox < enemies.length; ox++) { if (ox !== ei && dist2(en.x, en.y, enemies[ox].x, enemies[ox].y) < 160 * 160) { enemies[ox].hp -= dmg0 * 0.7; enemies[ox].flash = 0.06; enemies[ox].hitT = 0.08; enemies[ox].hitMag = 1.5; if (enemies[ox].hp <= 0) onEnemyDeath(enemies[ox], true); } } spawnRing(en.x, en.y, '#CFE8FF', 20); }
              if (bl.burn > 0) { en.burn = Math.max(en.burn || 0, bl.burn); en.burnT = 3; }
              // ★ 九婴之毒：命中施加毒层
              if (player.legendaryPassive === 'jiuying_poison') {
                en.jiuyingPoison = Math.min(3, (en.jiuyingPoison || 0) + 1);
                en.jiuyingT = 3; // 3秒持续
                en.jiuyingTick = 0;
              }
              // ★ 山海猎兽人套装：暴击标记
              if (player.setMarkCrit && bl.crit) {
                en.marked = true; en.markT = 5;
              }
              if (dmg0 > bl.dmg * 2.5 && en.hp > 0) floatText(en.x, en.y - en.r - 20, '噬魂!', '#C94F4F', 'crit');
              if (bl.lifesteal > 0 && _lsCd <= 0) {
                var _heal = Math.min(dmg0 * bl.lifesteal, dmg0 * 0.03); // 单次回复 ≤ 造成伤害的 3%
                player.hp = Math.min(player.maxhp, player.hp + Math.round(_heal));
                _lsCd = 0.2; // 0.2s 内置冷却，防高射速瞬间回满
                floatText(player.x, player.y - 20, '+' + Math.round(_heal), '#7FB069', 'heal');
              }
              if (bl.pierce > 0) { bl.pierce--; } else { bullets.splice(b, 1); consumed = true; }
              if (en.hp <= 0) { onEnemyDeath(en); ei--; } // 敌人被移除，回退索引避免跳过下一个
              if (bl.pierce <= 0) break;
            }
          }
        }
      } else {
        if (dist2(bl.x, bl.y, player.x, player.y) < (PHB + bl.r) * (PHB + bl.r)) {
          bullets.splice(b, 1);
          if (player.iframe <= 0) {
            if (player.dodgeChance > 0 && Math.random() < player.dodgeChance) { player.flash = 0.1; floatText(player.x, player.y - 20, '闪避', '#C9A24B'); }
            else if (player.reflect > 0 && Math.random() < player.reflect) { var rt = nearestEnemy(player.x, player.y); if (rt) fireBullet(player.x, player.y, Math.atan2(rt.y - player.y, rt.x - player.x), 'player', bl.dmg * 2, player.bulletSpeed, {}); floatText(player.x, player.y - 20, '反震', '#4E8FC7'); }
            else damagePlayer(bl.dmg);
          }
        }
      }
    }

    // 接触
    for (var ci = enemies.length - 1; ci >= 0; ci--) {
      var ec = enemies[ci];
      if (ec.wake > 0) continue; // 出场缓冲期不结算接触伤害（防出生即贴脸秒）
      if (dist2(ec.x, ec.y, player.x, player.y) < (ec.r + PHB) * (ec.r + PHB)) {
        if (player.iframe <= 0) {
          if (player.dodgeChance > 0 && Math.random() < player.dodgeChance) { player.flash = 0.1; }
          else damagePlayer((ec.ram ? EDMG_HEAVY : EDMG_NORMAL) * ec.dmgMul);
        }
        if (ec.ram) { burst(ec.x, ec.y, COL.enemy, 5); onEnemyDeath(ec); }
      }
    }
    if (boss && boss.wake <= 0 && dist2(boss.x, boss.y, player.x, player.y) < (boss.r + PHB + 1) * (boss.r + PHB + 1)) { if (player.iframe <= 0) damagePlayer(EDMG_HEAVY * tierDmgMul(run.tier)); }

    // 战利品
    for (var l = loot.length - 1; l >= 0; l--) {
      var it = loot[l]; it.life -= dt; it.age += dt;
      if (player.magnet) { var mdx = player.x - it.x, mdy = player.y - it.y, md = Math.hypot(mdx, mdy) || 1; if (md < 300) { it.x += (mdx / md) * 220 * dt; it.y += (mdy / md) * 220 * dt; } }
      else { it.x += it.vx * dt; it.y += it.vy * dt; it.vx *= 0.9; it.vy *= 0.9; }
      if (it.type === 'xp') { var pdx = player.x - it.x, pdy = player.y - it.y, pd = Math.hypot(pdx, pdy) || 1; if (pd < 150) { it.x += (pdx / pd) * 260 * dt; it.y += (pdy / pd) * 260 * dt; } } // 灵蕴自带微弱吸附，手感更顺
      // 灵玉（基础通货）与灵矿碎屑（材料）：战机靠近 150px 自动磁吸入包，不占背包格（2026-08-19 掉落分层）
      if (it.type === 'jade') { var jdx = player.x - it.x, jdy = player.y - it.y, jd = Math.hypot(jdx, jdy) || 1; if (jd < 150) { it.x += (jdx / jd) * 300 * dt; it.y += (jdy / jd) * 300 * dt; } }
      if (it.type === 'ore') { var odx = player.x - it.x, ody = player.y - it.y, od = Math.hypot(odx, ody) || 1; if (od < 150) { it.x += (odx / od) * 300 * dt; it.y += (ody / od) * 300 * dt; } }
      if (it.life <= 0) { loot.splice(l, 1); continue; }
      // v12b：经验灵蕴 + 灵玉（基础通货）自动吸取；灵矿碎屑同理；其余战利品（丹药/装备/遗物）改为手动拾取
      if (it.type === 'xp' && dist2(it.x, it.y, player.x, player.y) < player.pickR * player.pickR) {
        addXp(it.val); floatText(it.x, it.y, '+' + it.val + ' 灵蕴', '#E0B84A'); AudioSys.sfx.pickup('green'); burst(it.x, it.y, '#E0B84A', 5, { ring: true, ringR: 14 });
        loot.splice(l, 1); continue;
      }
      if (it.type === 'jade' && dist2(it.x, it.y, player.x, player.y) < player.pickR * player.pickR) {
        var jamt = it.amount || 10; meta.currency += jamt; floatText(it.x, it.y, '+' + jamt + ' 灵玉', '#C9A24B'); AudioSys.sfx.pickup('blue'); burst(it.x, it.y, '#C9A24B', 6, { ring: true, ringR: 16 });
        loot.splice(l, 1); continue;
      }
      if (it.type === 'ore' && dist2(it.x, it.y, player.x, player.y) < player.pickR * player.pickR) {
        var oamt = it.amount || 1; floatText(it.x, it.y, '+' + oamt + ' 灵矿碎屑', '#8FB0C8'); AudioSys.sfx.pickup('green'); burst(it.x, it.y, '#8FB0C8', 6); // S1 修复：不写 meta.ore，仅 run.oreCollected（结算统一入账）
        bountyProgress('orePickup', oamt); // 动态悬赏：灵矿碎屑采集
        run.oreCollected = (run.oreCollected || 0) + oamt; // 局末结算：追踪本局采集量
        loot.splice(l, 1); continue;
      }
      // 其余战利品保留在地面，等待玩家手动拾取（点按 / 触屏点按）
    }
    for (var p2 = 0; p2 < POOL; p2++) { var pa = particles[p2]; if (!pa.alive) continue; pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.vx *= 0.92; pa.vy *= 0.92; pa.life -= dt; if (pa.life <= 0) pa.alive = false; }
    for (var f = 0; f < FPOOL; f++) { var fl = floaters[f]; if (!fl.alive) continue; fl.y += fl.vy * dt; fl.life -= dt; if (fl.life <= 0) fl.alive = false; }
    for (var vl = vfxLines.length - 1; vl >= 0; vl--) { vfxLines[vl].life -= dt; if (vfxLines[vl].life <= 0) vfxLines.splice(vl, 1); }
    reapDead();
  }
  function collectNode(nd) {
    nd.collected = true; run.nodes++;
    bountyProgress('nodeCollect', 1); // 动态悬赏：灵韵节点采集
    var c = CHESTS[nd.chest]; if (!c) return;
    // #C2 修复：宝箱入包统一走 pushToLoot（8 格上限 + 满则弃最低）；
    // 被 #197 掉落筛选过滤的稀有度不掉入背包，改为掉到地面（暗化显示，E 键可强制捡回）
    function chestGain(rar) {
      run.picked++;
      // 单局整装预算耗尽 → 折算灵玉（不超 12~20 硬上限）
      if (!budgetArtifact(rar)) { dropLoot(nd.x, nd.y, 'blue', 'jade', null, { amount: (RARVAL[RAR.indexOf(rar)] || 1) * 6 }); return rar; }
      var item = { rarity: rar, name: pickName(rar), slot: pickSlot() };
      if (run.pickupFilter && !run.pickupFilter[RAR.indexOf(rar)]) {
        loot.push({ x: nd.x + rand(-14, 14), y: nd.y + rand(-14, 14), type: 'artifact', rarity: item.rarity, name: item.name, slot: item.slot, vx: rand(-18, 18), vy: rand(-18, 18), life: 22, age: 0 });
        return rar;
      }
      pushToLoot(run.loot, item, nd.x, nd.y);
      return rar;
    }
    var cnt = randi(c.min, c.max), got = [];
    for (var i = 0; i < cnt; i++) { got.push(chestGain(pickRarityWeighted(c.floor))); }
    var hasFloor = got.some(function (g) { return RAR.indexOf(g) >= c.floor; });
    if (!hasFloor) { got.push(chestGain(RAR[c.floor])); }
    if (c.key === 'secret' && !got.some(function (g) { return g === 'orange'; })) { got.push(chestGain('orange')); }
    burst(nd.x, nd.y, c.color, c.key === 'wood' ? 10 : 18, { ring: c.key !== 'wood', ringR: 40 });
    AudioSys.sfx.chestOpen(c.floor);
    if (meta.runs === 0 && run.picked === 1) showTip('开箱获得<b>战利品</b>！同色战利品按 <b>M</b> 可合成升级（2合1/3合1）', 4.5);
    for (var s = 0; s < (c.key === 'wood' ? 5 : 12); s++) { var sa = rand(0, 6.28), sp = rand(60, 210); spawnParticle({ x: nd.x, y: nd.y, vx: Math.cos(sa) * sp, vy: Math.sin(sa) * sp, life: rand(0.4, 0.9), color: c.color, r: rand(1.5, 3) }); }
    screenFlash = { color: c.flash, a: c.key === 'wood' ? 0.12 : (c.key === 'silver' ? 0.24 : 0.42) };
    addShake(c.key === 'wood' ? 1.8 : 3, 90, 40);
    if (c.key !== 'wood') addFreeze(40);
    if (c.key === 'wood') floatText(nd.x, nd.y - 22, '+' + got.length + ' 件战利品', c.color);
    else setBanner(chestBannerText(c, got), c.key === 'secret' ? 2.6 : 2.0);
    // 开箱概率再掉丹药
    if (Math.random() < 0.22) addConsumable(['bomb', 'shield', 'heal', 'slow'][randi(0, 3)]);
    // 注：护卫已在关卡生成时预置在宝箱旁（placeEncounters），此处不再刷怪——清完护卫才能开箱
  }
  function relocateNode(nd) {
    var x, y, t = 0;
    do { x = rand(W * 0.08, W * 0.92); y = rand(H * 0.08, H * 0.6); t++; } while ((dist2(x, y, player.x, player.y) < 170 * 170 || nodes.some(function (o) { return o !== nd && dist2(x, y, o.x, o.y) < 120 * 120; })) && t < 80);
    nd.x = x; nd.y = y; nd.collected = false; nd.chest = rollChestTier(); nd.pulse = rand(0, 6);
  }
  // ================= 裂隙 / 黑洞系统 =================
  function hasElem(el) { return (player.runes || []).some(function (r) { return r && r.elem === el; }); }
  function lootValue(arr) { var w = [10, 22, 40, 70, 130], v = 0; for (var i = 0; i < arr.length; i++) v += (w[RAR.indexOf(arr[i].rarity)] || 10); return v; }
  // 关卡生成：角落/边缘（非必经）放置 1-2 个裂隙入口（Boss 房排除由生成区域保证）
  function placeRifts() {
    var count = (run.tier >= 2 && Math.random() < 0.6) ? 2 : 1;
    var corners = [{ x: WORLD_W * 0.12, y: WORLD_H * 0.14 }, { x: WORLD_W * 0.88, y: WORLD_H * 0.14 }, { x: WORLD_W * 0.12, y: WORLD_H * 0.86 }, { x: WORLD_W * 0.88, y: WORLD_H * 0.86 }];
    corners = corners.filter(function (p) { return dist2(p.x, p.y, spawnPoint.x, spawnPoint.y) > 360 * 360; });
    corners.sort(function () { return Math.random() - 0.5; });
    for (var i = 0; i < count && i < corners.length; i++) rifts.push({ x: corners[i].x, y: corners[i].y, r: 34, state: 'idle', cooldown: 0 });
  }
  // 关卡生成：按地点固定布置敌人（遭遇制，不再无限刷）
  function placeEncounters() {
    for (var i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      var plan = { wood: 0, silver: 1, gold: 2, secret: 2 }[nd.chest] || 0;
      nd.guards = []; nd.locked = (plan > 0);
      for (var g = 0; g < plan; g++) {
        var ang = rand(0, 6.28), dd = rand(160, 300);
        var gx = clamp(nd.x + Math.cos(ang) * dd, 30, WORLD_W - 30), gy = clamp(nd.y + Math.sin(ang) * dd, 30, WORLD_H - 30);
        var guardElite = (nd.chest === 'gold' || nd.chest === 'secret') && g === 0;
        var ge = spawnEnemy(gx, gy, (nd.chest === 'secret' || nd.chest === 'gold') ? 2 : 1, guardElite ? { elite: true } : undefined); // #B5 修复：统一走精英分支
        ge.wake = ENTRY_PLACED; ge.entryMax = ENTRY_PLACED; ge.alert = 0; ge.homeX = gx; ge.homeY = gy; ge.patrolAng = rand(0, 6.28);
        nd.guards.push(ge);
      }
    }
    var ambient = 4 + run.tier * 2;
    for (var a = 0; a < ambient; a++) {
      if (!canSpawnMore()) break;
      var x, y, t = 0;
      do { x = rand(120, WORLD_W - 120); y = rand(120, WORLD_H - 120); t++; } while ((dist2(x, y, player.x, player.y) < 300 * 300 || nodes.some(function (n) { return dist2(x, y, n.x, n.y) < 120 * 120; })) && t < 60);
      var ae = spawnEnemy(x, y, 1 + (run.tier - 1));
      ae.wake = ENTRY_PLACED; ae.entryMax = ENTRY_PLACED; ae.alert = 0; ae.homeX = x; ae.homeY = y; ae.patrolAng = rand(0, 6.28);
    }
  }
  function showRiftChoice(rf) {
    riftActive = rf;
    var el = document.getElementById('riftChoice'); if (!el) return;
    var info = document.getElementById('riftInfo');
    if (info) info.innerHTML = '当前战利品 <b>' + run.loot.length + '</b> 件 · 估值约 <b style="color:#C9A24B">' + lootValue(run.loot) + '</b> 灵玉<br><span style="opacity:.8;font-size:12px">进入后战利品冻结；裂隙内收益豁免「未撤离即丢」，阵亡保底 50%</span>';
    el.style.display = 'flex'; riftPrompt = true; paused = true;
  }
  function hideRiftChoice() { var el = document.getElementById('riftChoice'); if (el) el.style.display = 'none'; riftPrompt = false; paused = false; for (var kk in keys) keys[kk] = false; }
  function commitRift(confirm) {
    var rf = riftActive; hideRiftChoice();
    if (confirm) enterRift();
    else if (rf) { rf.cooldown = 3; }   // 取消后该裂缝 3 秒冷却，避免刚走一步又弹窗
    riftActive = null;
  }
  // 磁锁秘库·投喂借力开门交互
  function openVaultPrompt() {
    var el = document.getElementById('vaultPrompt'); if (!el) return;
    vaultPrompt = true; paused = true;
    var feedBtn = document.getElementById('vaultFeedBtn');
    var jadeBtn = document.getElementById('vaultJadeBtn');
    var canFeed = run.loot.length > 0;
    var canJade = meta.currency >= VAULT_JADE_COST;
    if (feedBtn) { feedBtn.disabled = !canFeed; feedBtn.style.opacity = canFeed ? '1' : '0.4'; feedBtn.textContent = canFeed ? '① 投喂装备（舍弃最低件）' : '① 投喂装备（背包空）'; }
    if (jadeBtn) { jadeBtn.disabled = !canJade; jadeBtn.style.opacity = canJade ? '1' : '0.4'; jadeBtn.textContent = canJade ? ('② 支付灵玉 ' + VAULT_JADE_COST) : ('② 支付灵玉 ' + VAULT_JADE_COST + '（不足）'); }
    el.style.display = 'flex';
  }
  function closeVaultPrompt(commit) {
    var el = document.getElementById('vaultPrompt'); if (el) el.style.display = 'none';
    vaultPrompt = false;
    if (commit) { openSecretVault(); }
    else { vaultCd = 2.0; } // 取消后短冷却，避免立刻重弹
    paused = false; for (var kk in keys) keys[kk] = false;
  }
  function vaultFeed() {
    if (run.loot.length === 0) return;
    var di = 0, dv = 1e9;
    for (var k = 0; k < run.loot.length; k++) { var v = RARVAL[RAR.indexOf(run.loot[k].rarity)] || 0; if (v < dv) { dv = v; di = k; } }
    var fed = run.loot.splice(di, 1)[0];
    floatText(player.x, player.y - 24, '投喂「' + fed.name + '」借力开门', '#E0B84A');
    closeVaultPrompt(true);
  }
  function vaultJade() {
    if (meta.currency < VAULT_JADE_COST) return;
    meta.currency -= VAULT_JADE_COST;
    floatText(player.x, player.y - 24, '支付 ' + VAULT_JADE_COST + ' 灵玉借力开门', '#E0B84A');
    closeVaultPrompt(true);
  }
  function snapshotWorld() {
    return {
      enemies: enemies.map(function (o) { return JSON.parse(JSON.stringify(o)); }),
      bullets: bullets.map(function (o) { return JSON.parse(JSON.stringify(o)); }),
      loot: loot.map(function (o) { return JSON.parse(JSON.stringify(o)); }),
      nodes: nodes.map(function (o) { return JSON.parse(JSON.stringify(o)); }),
      obstacles: obstacles.map(function (o) { return JSON.parse(JSON.stringify(o)); }),
      totems: totems.map(function (o) { return JSON.parse(JSON.stringify(o)); }),
      vaults: vaults.map(function (o) { return JSON.parse(JSON.stringify(o)); }),
      extractPoints: extractPoints.map(function (o) { return JSON.parse(JSON.stringify(o)); }),
      boss: boss ? JSON.parse(JSON.stringify(boss)) : null, bossSpawned: bossSpawned,
      gameTime: gameTime, runTime: run.time,
      player: { x: player.x, y: player.y, hp: player.hp, maxhp: player.maxhp, shield: player.shield, maxshield: player.maxshield, iframe: player.iframe }
    };
  }
  function restoreWorld(s) {
    enemies = s.enemies; bullets = s.bullets; loot = s.loot; nodes = s.nodes;
    obstacles = s.obstacles; totems = s.totems; vaults = s.vaults; extractPoints = s.extractPoints;
    boss = s.boss; bossSpawned = s.bossSpawned; gameTime = s.gameTime; run.time = s.runTime;
    player.x = s.player.x; player.y = s.player.y; player.hp = s.player.hp; player.maxhp = s.player.maxhp;
    player.shield = s.player.shield; player.maxshield = s.player.maxshield; player.iframe = s.player.iframe;
  }
  function addRiftWalls(RX, RY, RW, RH) {
    obstacles.push({ type: 'wall', x: RX + RW / 2, y: RY, hw: RW / 2 + 12, hh: 12 });
    obstacles.push({ type: 'wall', x: RX + RW / 2, y: RY + RH, hw: RW / 2 + 12, hh: 12 });
    obstacles.push({ type: 'wall', x: RX, y: RY + RH / 2, hw: 12, hh: RH / 2 + 12 });
    obstacles.push({ type: 'wall', x: RX + RW, y: RY + RH / 2, hw: 12, hh: RH / 2 + 12 });
  }
  function spawnArenaWave(n) {
    var RR = riftRect, cx = WORLD_W / 2, cy = RR.RY + RR.RH * 0.42;
    var fire = hasElem('火');
    if (n === 4) {
      // 末波·竞技统领（精英 Boss）：高血 + 2 名精英护卫
      var champ = spawnEnemy(cx, RR.RY + 100, run.tier);
      champ.wake = 0; champ.alert = 2; champ.homeX = cx; champ.homeY = RR.RY + 100; champ.patrolAng = 0;
      champ.elite = true; champ.isChampion = true; champ.col = '#C94F4F'; champ.name = '竞技统领';
      champ.hp = champ.maxhp = Math.round(champ.maxhp * 6);
      champ.dmgMul = (champ.dmgMul || 1) * 1.3; champ.r = Math.max(champ.r, 22);
      for (var a = 0; a < 2; a++) {
        var aa = a / 2 * 6.28;
        var gx = clamp(cx + Math.cos(aa) * 160, RR.RX + 40, RR.RX + RR.RW - 40);
        var gy = clamp(cy + Math.sin(aa) * 120, RR.RY + 40, RR.RY + RR.RH - 40);
        var ge = spawnEnemy(gx, gy, run.tier); ge.wake = 0; ge.alert = 2; ge.homeX = gx; ge.homeY = gy; ge.elite = true; ge.hp = ge.maxhp = Math.round(ge.maxhp * 2);
      }
      setBanner('⚔️ 竞技统领降临！', 2.4);
      addShake(5, 160, 60);
      return;
    }
    var cnt = (n === 1) ? 3 : 4;
    for (var i = 0; i < cnt; i++) {
      var ang = rand(0, 6.28), dd = rand(40, 160);
      var x = clamp(cx + Math.cos(ang) * dd, RR.RX + 40, RR.RX + RR.RW - 40);
      var y = clamp(cy + Math.sin(ang) * dd, RR.RY + 40, RR.RY + RR.RH - 40);
      var e = spawnEnemy(x, y, run.tier);
      e.wake = 0; e.alert = 2; e.homeX = x; e.homeY = y; e.patrolAng = rand(0, 6.28);
      if (fire) e.boost = 1.2;               // 火系引燃敌意：+20% 移速
      if (n >= 2) { e.elite = true; e.hp = e.maxhp = Math.round(e.maxhp * 2); } // 第2波起全员精英 → 难度爬升
      if (n === 3 && i === 1) e.arche = 'turret'; // 第3波含远程
    }
  }
  function spawnRiftDrops() {
    var RR = riftRect, cx = WORLD_W / 2, cy = RR.RY + RR.RH * 0.5, fire = hasElem('火');
    var base = ['blue', 'blue', 'purple'];
    for (var i = 0; i < base.length; i++) {
      var rar = base[i];
      if (fire && RAR.indexOf(rar) < 4) rar = RAR[RAR.indexOf(rar) + 1]; // 火系掉落提档
      var a = rand(0, 6.28), dd = rand(30, 120);
      loot.push({ x: clamp(cx + Math.cos(a) * dd, RR.RX + 30, RR.RX + RR.RW - 30), y: clamp(cy + Math.sin(a) * dd, RR.RY + 30, RR.RY + RR.RH - 30), rarity: rar, name: pickName(rar), slot: pickSlot(), vx: 0, vy: 0, life: 9999, age: 0 });
    }
  }
  function enterRift() {
    riftReturn = { x: player.x, y: player.y };
    riftSnapshot = snapshotWorld();
    inRift = true; riftLoot = []; riftExit = null; riftHidden = null; riftWaves = null; riftTrapT = 0; riftStuckT = 0;
    // A1 修复：裂隙内冻结战场自毁倒计时（裂隙无自毁 HUD，且竞技房 4 波可能拖过 45s 被 collapseEvac 无预警强杀）
    if (run) { run._riftSdFrozen = run.selfDestruct || 0; run.selfDestruct = 0; }
    enemies = []; bullets = []; loot = []; nodes = []; obstacles = []; totems = []; vaults = []; extractPoints = []; boss = null; bossSpawned = false;
    var RW = Math.min(WORLD_W * 0.66, 880), RH = Math.min(WORLD_H * 0.66, 620);
    var RX = (WORLD_W - RW) / 2, RY = (WORLD_H - RH) / 2; riftRect = { RX: RX, RY: RY, RW: RW, RH: RH };
    player.x = WORLD_W / 2; player.y = RY + RH - 70; player.vx = 0; player.vy = 0; player.iframe = 0.5;
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    var r = Math.random();
    if (r < 0.4) {
      riftRoom = { type: 'treasury', done: false, chest: { x: WORLD_W / 2, y: RY + RH * 0.38, r: 20, chest: 'secret' } };
      setBanner('🎁 宝库房 · 安全（触碰中央秘宝获取战利品）', 2.6);
    } else if (r < 0.8) {
      addRiftWalls(RX, RY, RW, RH);
      riftRoom = { type: 'arena', done: false }; riftWaves = { wave: 1, gap: 0 };
      spawnArenaWave(1);
      setBanner('⚔️ 竞技房 · 第 1 / 4 波（清完才能离开）', 2.6);
    } else {
      addRiftWalls(RX, RY, RW, RH);
      var cxm = WORLD_W / 2;
      riftRoom = { type: 'trap', done: false,
        mechs: [
          { x: RX + RW * 0.25, y: RY + RH * 0.34, r: 20, act: false, prog: 0 },
          { x: cxm, y: RY + RH * 0.22, r: 20, act: false, prog: 0 },
          { x: RX + RW * 0.75, y: RY + RH * 0.34, r: 20, act: false, prog: 0 }
        ],
        beamAng: 0, beamSpd: 0.95, beamN: 3, poisonT: 0.4
      };
      setBanner('☠️ 机关房 · 激活 3 座机关柱解除封锁（当心旋转毒光）', 3.2);
    }
    AudioSys.sfx.extract();
    // #381-③ 裂隙出口改回"走到指定出口传送门"：不再显示 #riftLeaveBtn（CSS 亦 display:none !important 兜底）
  }
  function updateRift(dt) {
    var RR = riftRect;
    // #381-③ 防死锁安全阀：房间 60s 未完成（传送门未生成）→ 强制脱离，避免房间卡死永久困住玩家
    // （正常房间：宝库触碰即完成 / 竞技 4 波 / 机关 3 柱，通常 <45s；仅异常卡死才触发）
    if (riftRoom && !riftRoom.done) {
      riftStuckT = (riftStuckT || 0) + dt;
      if (riftStuckT >= RIFT_DEADLOCK_T) {
        setBanner('⚠ 裂隙房间异常卡死 · 安全阀强制脱离', 3.2, '#C94F4F');
        forceExitRift();
        return;
      }
    } else { riftStuckT = 0; }
    if (riftRoom.type === 'treasury') {
      var ch = riftRoom.chest;
      if (!riftRoom.done && dist2(ch.x, ch.y, player.x, player.y) < (ch.r + player.pickR * 0.6) * (ch.r + player.pickR * 0.6)) {
        riftRoom.done = true;
        // 宝库房·强制拾取：必出 2 件（橙/紫），背包满则自动舍弃最低价值件 → 逼出取舍
        var t1 = Math.random() < 0.45 ? 'orange' : 'purple';
        pushToLoot(riftLoot, { rarity: t1, name: pickName(t1), slot: pickSlot(), rift: true }, ch.x, ch.y, run.loot.length); // #C2 合并口径判满
        var t2 = Math.random() < 0.25 ? 'orange' : 'purple';
        pushToLoot(riftLoot, { rarity: t2, name: pickName(t2), slot: pickSlot(), rift: true }, ch.x, ch.y, run.loot.length);
        // ★ 3%概率额外掉落随机传说武器
        if (Math.random() < 0.03) {
          var legKeys = Object.keys(LEGENDARY_WEAPONS);
          var legName = legKeys[randi(0, legKeys.length - 1)];
          var lw = LEGENDARY_WEAPONS[legName];
          pushToLoot(riftLoot, { rarity: lw.rarity, name: legName, slot: lw.slot, rift: true, relicMods: lw.mods, isLegendaryWeapon: true, legendaryPassive: lw.passive, subtype: lw.subtype }, ch.x, ch.y, run.loot.length);
          burst(ch.x, ch.y, '#FFE9A8', 30, { ring: true, ringR: 60 });
          spawnRing(ch.x, ch.y, '#FFE9A8', 80);
          floatText(ch.x, ch.y - 40, '★★ 传说武器!', '#FFE9A8', 'crit');
          setBanner('★★ 罕见！宝库房发现传说武器「' + legName + '」！', 3.6);
        }
        burst(ch.x, ch.y, CHESTS.secret.color, 18, { ring: true, ringR: 40 }); AudioSys.sfx.chestOpen(4); screenFlash = { color: CHESTS.secret.flash, a: 0.42 }; addShake(3, 90, 40);
        setBanner('✦ 宝库房·强制拾取！获得 ' + RARNAME[t1] + '/' + RARNAME[t2] + '（背包满会舍弃最低件）', 3.0);
        riftExit = { x: WORLD_W / 2, y: RR.RY + 60, r: 30 };
      }
    } else if (riftRoom.type === 'arena') {
      if (!riftRoom.done && enemies.length === 0 && !boss) {
        if (riftWaves.wave < 4) {
          riftWaves.gap -= dt;
          if (riftWaves.gap <= 0) { riftWaves.wave++; spawnArenaWave(riftWaves.wave); riftWaves.gap = 3; setBanner('⚔️ 竞技房 · 第 ' + riftWaves.wave + ' / 4 波', 2.2); }
        } else { riftRoom.done = true; spawnRiftDrops(); riftExit = { x: WORLD_W / 2, y: RR.RY + 60, r: 30 }; setBanner('✓ 竞技房清空！传送门已开启', 2.6); }
      }
    } else if (riftRoom.type === 'trap') {
      if (!riftRoom.done) {
        // 旋转毒光：从房间中心扫出的扇形光柱，命中持续受伤（风系驱散减半）
        riftRoom.beamAng += riftRoom.beamSpd * dt;
        riftRoom.poisonT -= dt;
        if (riftRoom.poisonT <= 0) {
          riftRoom.poisonT = 0.5;
          var pa = Math.atan2(player.y - (RR.RY + RR.RH / 2), player.x - (WORLD_W / 2));
          var hit = false;
          for (var bi2 = 0; bi2 < riftRoom.beamN; bi2++) {
            var ba = riftRoom.beamAng + bi2 * (6.283 / riftRoom.beamN);
            var diff = Math.abs(((pa - ba + Math.PI * 3) % 6.283) - Math.PI);
            if (diff < 0.24) { hit = true; break; }
          }
          if (hit) { damagePlayer(hasElem('风') ? 5 : 9); if (!inRift) return; }
        }
        // 机关柱：靠近蓄力激活，离开则缓慢回落
        var allOn = true;
        for (var mi = 0; mi < riftRoom.mechs.length; mi++) {
          var m = riftRoom.mechs[mi];
          if (!m.act) {
            allOn = false;
            if (dist2(m.x, m.y, player.x, player.y) < (m.r + player.pickR * 0.6) * (m.r + player.pickR * 0.6)) {
              m.prog += dt;
              if (Math.random() < 0.3) burst(m.x, m.y, '#7FB069', 2, { ring: false });
              if (m.prog >= 0.7) { m.act = true; burst(m.x, m.y, '#7FB069', 16, { ring: true, ringR: 42 }); AudioSys.sfx.pillar(); floatText(m.x, m.y - 22, '机关激活!', '#7FB069', 'crit'); }
            } else if (m.prog > 0) { m.prog = Math.max(0, m.prog - dt * 0.5); }
          }
        }
        if (allOn) {
          riftRoom.done = true; spawnRiftDrops();
          riftExit = { x: WORLD_W / 2, y: RR.RY + 60, r: 30 };
          setBanner('✓ 三机齐鸣！封锁解除，传送门开启', 2.8);
          addShake(4, 160, 60);
        }
      }
    }
    if (riftRoom.done && riftExit && dist2(riftExit.x, riftExit.y, player.x, player.y) < (riftExit.r + player.pickR * 0.5) * (riftExit.r + player.pickR * 0.5)) exitRift();
  }
  function riftRandomExitPos() {
    // v12.5.2：裂隙离场后传送到主图随机安全点（避开墙体/裂隙危险区），原裂缝随后由离场逻辑移除
    for (var _t = 0; _t < 40; _t++) {
      var _rx = rand(240, WORLD_W - 240), _ry = rand(240, WORLD_H - 240), _ok = true;
      for (var _o = 0; _o < obstacles.length; _o++) {
        var _ob = obstacles[_o];
        if (_ob.hw != null && _ob.hh != null) {
          if (Math.abs(_rx - _ob.x) < _ob.hw + (player.r || 16) + 8 && Math.abs(_ry - _ob.y) < _ob.hh + (player.r || 16) + 8) { _ok = false; break; }
        } else if (_ob.r != null) {
          if (dist2(_rx, _ry, _ob.x, _ob.y) < (_ob.r + (player.r || 16) + 8) * (_ob.r + (player.r || 16) + 8)) { _ok = false; break; }
        }
      }
      if (_ok) return { x: _rx, y: _ry };
    }
    return { x: WORLD_W / 2, y: WORLD_H / 2 };
  }
  function exitRift() {
    var ret = riftReturn;
    restoreWorld(riftSnapshot);
    inRift = false; riftRoom = null; riftExit = null; riftWaves = null; riftTrapT = 0; riftHidden = null; riftRect = null;
    if (run && run._riftSdFrozen > 0) { run.selfDestruct = run._riftSdFrozen; run._riftSdFrozen = 0; } // A1：恢复裂隙冻结的自毁倒计时（正常退出路径）
    var ep = riftRandomExitPos();
    player.x = ep.x; player.y = ep.y; player.vx = 0; player.vy = 0; player.iframe = Math.max(player.iframe || 0, 1.0);
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    for (var i = 0; i < riftLoot.length; i++) pushToLoot(run.loot, riftLoot[i], ep.x, ep.y); // 收益落在随机落点
    for (var k = 0; k < rifts.length; k++) { if (dist2(rifts[k].x, rifts[k].y, ret.x, ret.y) < 80 * 80) { rifts.splice(k, 1); break; } } // 原裂隙消失
    riftLoot = [];
    setBanner('裂隙收益已并入战利品 · 已随机传送至主图（原裂隙关闭）', 2.6);
    var _rlb1 = document.getElementById('riftLeaveBtn'); if (_rlb1) _rlb1.style.display = 'none';
  }
  function dieInRift() {
    var ret = riftReturn;
    restoreWorld(riftSnapshot);
    inRift = false;
    var ep = riftRandomExitPos();
    player.x = ep.x; player.y = ep.y; player.vx = 0; player.vy = 0;
    player.hp = Math.round(player.maxhp * 0.3); player.shield = 0; player.iframe = 2;
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    for (var i = 0; i < riftLoot.length; i++) pushToLoot(run.loot, riftLoot[i], ep.x, ep.y); // 收益落在随机落点
    for (var k = 0; k < rifts.length; k++) { if (dist2(rifts[k].x, rifts[k].y, ret.x, ret.y) < 80 * 80) { rifts.splice(k, 1); break; } } // 原裂隙消失
    riftLoot = []; riftRoom = null; riftExit = null; riftWaves = null; riftTrapT = 0; riftHidden = null; riftRect = null;
    if (run && run._riftSdFrozen > 0) { run.selfDestruct = run._riftSdFrozen; run._riftSdFrozen = 0; } // A1：恢复裂隙冻结的自毁倒计时（阵亡弹回路径）
    setBanner('裂隙内阵亡！被随机弹回主图（HP 30%），原裂隙已关闭', 3);
    var _rlb3 = document.getElementById('riftLeaveBtn'); if (_rlb3) _rlb3.style.display = 'none';
  }
  function forceExitRift() {
    // v12.5 安全阀：任意 inRift 状态均可强制离开，不依赖房间完成；保留已进入背包的裂隙战利品
    if (!inRift || !riftReturn) return;
    var ret = riftReturn;
    if (riftSnapshot) restoreWorld(riftSnapshot);
    inRift = false; riftRoom = null; riftExit = null; riftWaves = null; riftTrapT = 0; riftHidden = null; riftRect = null; riftReturn = null; riftSnapshot = null;
    if (run && run._riftSdFrozen > 0) { run.selfDestruct = run._riftSdFrozen; run._riftSdFrozen = 0; } // A1：恢复裂隙冻结的自毁倒计时（强制离开路径）
    var ep = riftRandomExitPos();
    player.x = ep.x; player.y = ep.y; player.vx = 0; player.vy = 0; player.iframe = Math.max(player.iframe || 0, 0.6);
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    for (var _i = 0; _i < riftLoot.length; _i++) pushToLoot(run.loot, riftLoot[_i], ep.x, ep.y); // 收益落在随机落点
    for (var _k = 0; _k < rifts.length; _k++) { if (dist2(rifts[_k].x, rifts[_k].y, ret.x, ret.y) < 80 * 80) { rifts.splice(_k, 1); break; } } // 原裂隙消失
    riftLoot = [];
    var _rlb = document.getElementById('riftLeaveBtn'); if (_rlb) _rlb.style.display = 'none';
    setBanner('已脱离裂隙（已拾取收益保留）· 随机传送至主图', 2.6);
  }

  function damagePlayer(dmg) {
    if (phase === PHASE.EMBER) dmg *= emberPlayerMult; // 余烬相受击增幅（主动×1.3 / 失控×1.15，§7.3/§7.4）
    player.flash = 0.13;
    if (exfil) dmg *= 0.9; // 撤离期间飞船掩护，小幅减伤
    // v12.7 护甲减伤：dmgReduce + 站定威慑，硬上限 70%（minDamage = raw*0.3）
    var _mit = 0;
    if (player.dmgReduce) _mit += player.dmgReduce;
    if (player.setStandStillReduce > 0 && player.standStillT >= (player.setStandStillTime || 1.5)) _mit += player.setStandStillReduce;
    _mit = Math.min(_mit, 0.70);
    dmg *= (1 - _mit);
    if (player.shield > 0) { var ab = Math.min(player.shield, dmg); player.shield -= ab; dmg -= ab; if (player.undying && !player.undyingUsed && player.shield <= 0) { player.undyingUsed = true; player.hp = Math.min(player.maxhp, player.hp + Math.round(player.maxhp * 0.3)); floatText(player.x, player.y - 24, '厚德!', '#7FB069', 'heal'); AudioSys.sfx.heal(); } }
    if (dmg > 0) player.hp -= dmg;
    // 灵潮连击：真实掉血即断连（护盾全额吸收不断）——风险换爆发的对价
    if (dmg > 0 && player.combo >= 5) { floatText(player.x, player.y - 36, '连击中断 ×' + player.combo, '#C94F4F'); }
    if (dmg > 0) { player.combo = 0; player.comboT = 0; }
    if (player.guardShock) explodeAt(player.x, player.y, player.guardShock, Math.max(8, player.dmg * 0.4)); // 土·山岳：受击范围震击
    // 反伤词条：受击时对周围敌人造成固定伤害
    if (player.thorns) { burst(player.x, player.y, '#FF7A59', 8, { ring: true, ringR: 40 }); for (var ti = 0; ti < enemies.length; ti++) { if (dist2(enemies[ti].x, enemies[ti].y, player.x, player.y) < 50 * 50) { enemies[ti].hp -= player.thorns; } } if (boss && dist2(boss.x, boss.y, player.x, player.y) < 60 * 60) { boss.hp -= player.thorns; boss.flash = 0.08; } }
    addShake(3.2, 150, 60); screenFlash = { color: '#C94F4F', a: 0.22 };
    player.iframe = Math.max(player.iframe || 0, 0.2); // v12.7 受击无敌帧降至 0.2s（仅防同帧多段；翻相 0.35/dash 0.5/gale 0.1 经 Math.max 保留更长免伤）
    AudioSys.sfx.playerHit();
    if (player.hp <= 0) { player.hp = 0; burst(player.x, player.y, player.color, 16); addShake(6, 260, 120, true); AudioSys.sfx.playerDie(); if (inRift) dieInRift(); else finishRun('death'); }
  }

  // ---------- 渲染 ----------
  function drawGrid() {
    // 可见屏幕底色（在相机平移后的世界坐标里）
    ctx.fillStyle = COL.bg; ctx.fillRect(cam.x - 24, cam.y - 24, W + 48, H + 48);
    // 世界内网格（随相机滚动），裁剪到世界范围
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, WORLD_W, WORLD_H); ctx.clip();
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    var step = 52, gx0 = Math.floor(cam.x / step) * step, gx1 = cam.x + W;
    for (var x = gx0; x <= gx1; x += step) { ctx.beginPath(); ctx.moveTo(x, cam.y - 24); ctx.lineTo(x, cam.y + H + 24); ctx.stroke(); }
    var gy0 = Math.floor(cam.y / step) * step, gy1 = cam.y + H;
    for (var y = gy0; y <= gy1; y += step) { ctx.beginPath(); ctx.moveTo(cam.x - 24, y); ctx.lineTo(cam.x + W + 24, y); ctx.stroke(); }
    ctx.restore();
    // 世界边界外暗带（让玩家看清地图边缘，地图比屏幕大）
    if (WORLD_W > W || WORLD_H > H) {
      ctx.fillStyle = 'rgba(4,5,7,0.85)';
      if (cam.x > 0) ctx.fillRect(cam.x - 4000, cam.y - 4000, 4000, H + 8000);
      if (cam.x + W < WORLD_W) ctx.fillRect(cam.x + W, cam.y - 4000, 4000, H + 8000);
      if (cam.y > 0) ctx.fillRect(cam.x - 4000, cam.y - 4000, W + 8000, 4000);
      if (cam.y + H < WORLD_H) ctx.fillRect(cam.x - 4000, cam.y + H, W + 8000, 4000);
      ctx.strokeStyle = 'rgba(127,176,105,0.5)'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
    }
  }
  // (空域无设施地板，drawMapLayout 已移除)
  function drawObstacles() {
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      if (ob.type === 'rock') {
        // 残垣屏障：真精灵 env_ruin_barrier，圆形裁剪 + 覆盖缩放（不拉伸）
        ctx.save(); ctx.translate(ob.x, ob.y);
        ctx.globalAlpha = 0.30; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, ob.r * 0.55, ob.r * 1.02, ob.r * 0.5, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        ctx.restore();
        var rd = ob.r * 2.2;
        ctx.save(); ctx.translate(ob.x, ob.y); ctx.beginPath(); ctx.arc(0, 0, ob.r, 0, 7); ctx.clip();
        if (!blitCover('env_ruin_barrier', 0, 0, rd, rd)) {
          ctx.fillStyle = '#39404e'; ctx.beginPath();
          for (var v = 0; v < ob.verts.length; v++) { var p = ob.verts[v]; if (v === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.save(); ctx.translate(ob.x, ob.y);
        if (glowOn) { ctx.shadowColor = '#6b7686'; ctx.shadowBlur = 10; }
        ctx.strokeStyle = '#7a8699'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, ob.r + 1.5, 0, 7); ctx.stroke();
        ctx.restore();
      } else if (ob.type === 'wall') {
        // 城市俯视：大厦实体墙（2.5D 立体投影 + 窗格 + 楼顶停机坪）
        var wx = ob.x - ob.hw, wy = ob.y - ob.hh, ww = ob.hw * 2, wh = ob.hh * 2;
        // 2.5D 大楼立体投影：右下方偏移长投影（战机低空掠过摩天楼，营造纵深）
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(wx + 16, wy + 20, ww, wh); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
        if (!blitCover('env_cover_block', wx + ww / 2, wy + wh / 2, ww, wh)) {
          var grd = ctx.createLinearGradient(wx, wy, wx, wy + wh);
          grd.addColorStop(0, '#5a6373'); grd.addColorStop(1, '#2c323d');
          ctx.fillStyle = grd; ctx.fillRect(wx, wy, ww, wh);
        }
        if (ob.building) {
          // 城市俯视窗格（鎏金微光，呼应“霓虹山海→鎏金暗色”基调）
          ctx.fillStyle = 'rgba(201,162,75,0.12)';
          for (var gyy = wy + 12; gyy < wy + wh - 8; gyy += 20) {
            for (var gxx = wx + 12; gxx < wx + ww - 8; gxx += 24) {
              if ((((gxx * 7 + gyy * 13) | 0) % 5) === 0) ctx.fillRect(gxx, gyy, 14, 9);
            }
          }
        }
        ctx.restore();
        ctx.save();
        if (glowOn) { ctx.shadowColor = '#6b7686'; ctx.shadowBlur = 10; }
        ctx.strokeStyle = '#8a96a8'; ctx.lineWidth = 2; ctx.strokeRect(wx, wy, ww, wh);
        ctx.restore();
        // 楼顶停机坪（H 标 / 发光停机圈）——仅主塔楼
        if (ob.helipad) {
          var hcx = ob.x, hcy = ob.y - ob.hh + Math.min(30, ob.hh * 0.42);
          var hp = 0.5 + 0.25 * Math.sin(gameTime * 3);
          ctx.save();
          ctx.strokeStyle = 'rgba(201,162,75,' + (0.45 + hp * 0.4) + ')'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(hcx, hcy, Math.min(24, ob.hw * 0.4), 0, 7); ctx.stroke();
          ctx.fillStyle = 'rgba(201,162,75,' + (0.7 + hp * 0.25) + ')';
          ctx.font = 'bold ' + Math.min(20, ob.hw * 0.32) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('H', hcx, hcy);
          ctx.restore();
        }
      } else { // 灵脉裂隙：持续伤害区
        var pulse = 0.5 + Math.sin(gameTime * 3 + ob.pulse) * 0.25;
        ctx.save(); ctx.translate(ob.x, ob.y);
        var g = ctx.createRadialGradient(0, 0, ob.r * 0.2, 0, 0, ob.r);
        g.addColorStop(0, 'rgba(176,111,208,0.45)'); g.addColorStop(0.6, 'rgba(120,70,170,0.22)'); g.addColorStop(1, 'rgba(80,40,120,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, ob.r, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(205,155,235,' + (0.5 + pulse * 0.4) + ')'; ctx.lineWidth = 2;
        for (var c = 0; c < 5; c++) { var a = ob.pulse + c * 1.25; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * ob.r * (0.6 + pulse * 0.4), Math.sin(a) * ob.r * (0.6 + pulse * 0.4)); ctx.stroke(); }
        ctx.restore();
      }
    }
  }
  // ---------- 灵脉共振（v11）：绘制 ----------
  function drawVeins() {
    if (inRift) return; // 裂隙子图：主图灵脉不渲染（快照换图期间防串景）
    var inAuraCol = null;
    for (var i = 0; i < veins.length; i++) {
      var v = veins[i];
      var col = ELEMCOL[v.elem] || '#C9A24B';
      var ready = v.cd <= 0;
      var cr = v.corrupted ? '#C8642A' : col;
      var pul = 0.5 + Math.sin(gameTime * 2.2 + v.pulse) * 0.3;
      var R = ready ? v.r : v.r * 0.72;
      ctx.save(); ctx.translate(v.x, v.y);
      // 光环渐变底
      var g = ctx.createRadialGradient(0, 0, 4, 0, 0, R);
      g.addColorStop(0, hexToRgba(cr, ready ? 0.20 + pul * 0.06 : 0.06));
      g.addColorStop(0.55, hexToRgba(cr, ready ? 0.10 : 0.03));
      g.addColorStop(1, hexToRgba(cr, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
      // 外圈旋转虚线
      ctx.strokeStyle = hexToRgba(cr, ready ? 0.55 : 0.25); ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]); ctx.lineDashOffset = -gameTime * 14;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      // 中心符文 + 灵韵核
      ctx.shadowColor = cr; ctx.shadowBlur = ready ? 14 : 4;
      ctx.fillStyle = cr; ctx.beginPath(); ctx.arc(0, 0, ready ? 9 + pul * 2 : 6, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(v.elem, 0, 0.5); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      // 冷却进度弧（就绪前灰弧显示剩余）
      if (!ready) {
        ctx.strokeStyle = 'rgba(200,205,210,0.5)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 14, -Math.PI / 2, -Math.PI / 2 + (1 - v.cd / VEIN_CD) * 6.283); ctx.stroke();
      } else if (v.corrupted) {
        // 染污警示：锯齿内圈
        ctx.strokeStyle = 'rgba(200,100,42,0.65)'; ctx.lineWidth = 2; ctx.beginPath();
        for (var t2 = 0; t2 < 8; t2++) { var aa = t2 / 8 * 6.283 + gameTime * 0.8, rr2 = 18 + (t2 % 2 ? 4 : 0); var px2 = Math.cos(aa) * rr2, py2 = Math.sin(aa) * rr2; if (t2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2); }
        ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
      // 玩家处于就绪灵脉圈内：脚下同色指示环（增伤生效的可视反馈）
      if (ready && dist2(player.x, player.y, v.x, v.y) < v.r * v.r) inAuraCol = cr;
    }
    if (inAuraCol) {
      ctx.strokeStyle = hexToRgba(inAuraCol, 0.35 + Math.sin(gameTime * 6) * 0.15); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 14, 0, 7); ctx.stroke();
    }
  }
  function drawNodes() {
    for (var i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      if (nd.collected) { ctx.strokeStyle = 'rgba(201,162,39,0.18)'; ctx.setLineDash([4, 4]); ctx.strokeRect(nd.x - 15, nd.y - 15, 30, 30); ctx.setLineDash([]); continue; }
      var c = CHESTS[nd.chest]; if (!c) continue;
      var pulse = 1 + Math.sin(nd.pulse) * 0.08, bob = Math.sin(nd.pulse * 1.3) * 2;
      var ck = (c.key === 'secret') ? 'chest_vault' : 'chest_common';
      if (blit(ck, nd.x, nd.y + bob, 34 * pulse, 34 * pulse, 0)) {
        if (c.key === 'secret') { ctx.save(); ctx.translate(nd.x, nd.y + bob); ctx.rotate(gameTime * 2); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.92; ctx.beginPath(); for (var st = 0; st < 8; st++) { var a2 = st * Math.PI / 4, rad = st % 2 ? 4 : 9, px = Math.cos(a2) * rad, py = Math.sin(a2) * rad; if (st === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.restore(); }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        continue;
      }
      // 回退：原几何宝箱
      ctx.save(); ctx.translate(nd.x, nd.y + bob); ctx.scale(pulse, pulse);
      ctx.shadowColor = c.color; ctx.shadowBlur = c.glow; ctx.fillStyle = c.color; ctx.strokeStyle = c.edge; ctx.lineWidth = 2;
      var w = 15, h = 11;
      ctx.beginPath(); ctx.moveTo(-w, h); ctx.lineTo(-w * 0.65, -h); ctx.lineTo(w * 0.65, -h); ctx.lineTo(w, h); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w * 0.65, -h); ctx.lineTo(w * 0.65, -h); ctx.stroke();
      ctx.fillStyle = c.edge; ctx.fillRect(-3, -3, 6, 7);
      if (c.key === 'secret') {
        ctx.rotate(gameTime * 2); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.92;
        ctx.beginPath();
        for (var st = 0; st < 8; st++) { var a2 = st * Math.PI / 4, rad = st % 2 ? 4 : 9, px = Math.cos(a2) * rad, py = Math.sin(a2) * rad; if (st === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.restore(); ctx.shadowBlur = 0; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }
  function drawRiftHud() {
    var label = '';
    if (riftRoom.type === 'treasury') label = '🎁 宝库房 · 安全（触碰中央秘宝）';
    else if (riftRoom.type === 'arena') label = '⚔️ 竞技房 · 第 ' + riftWaves.wave + ' / 4 波' + (riftRoom.done ? ' · 已清空' : '');
    else if (riftRoom.type === 'trap') { var on = 0; for (var _m = 0; _m < riftRoom.mechs.length; _m++) if (riftRoom.mechs[_m].act) on++; label = '☠️ 机关房 · 激活机关柱 ' + on + '/' + riftRoom.mechs.length + '（躲开旋转毒光）'; }
    if (riftRoom.done) label += ' · 踏入传送门离开';
    else label += ' · 完成房间后走入传送门撤离'; // #381-③ 去"随时按 Esc/点离开裂隙"
    ctx.save(); ctx.fillStyle = 'rgba(20,12,30,0.72)'; ctx.fillRect(W / 2 - 180, 10, 360, 26); ctx.fillStyle = '#E0C8FF'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, W / 2, 23); ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // A1 修复：裂隙内自毁倒计时提示（进裂隙时已冻结，但玩家需知剩余时间——离场即恢复计时）
    if (run && (run.selfDestruct > 0 || run._riftSdFrozen > 0)) {
      var _sd = Math.ceil(run.selfDestruct + (run._riftSdFrozen || 0));
      ctx.save(); ctx.fillStyle = 'rgba(60,12,12,0.78)'; ctx.fillRect(W / 2 - 150, 42, 300, 24); ctx.fillStyle = '#FF8C7A'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚠ 战场自毁 ' + _sd + 's · 尽快撤离', W / 2, 54); ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }
  function drawRift() {
    if (inRift) {
      if (riftRoom && riftRoom.type === 'treasury' && !riftRoom.done) {
        var ch = riftRoom.chest;
        ctx.save(); ctx.translate(ch.x, ch.y); ctx.rotate(gameTime * 1.5);
        ctx.fillStyle = CHESTS.secret.color; ctx.shadowColor = CHESTS.secret.color; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.moveTo(-16, 12); ctx.lineTo(-10, -12); ctx.lineTo(10, -12); ctx.lineTo(16, 12); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.shadowBlur = 0;
      }
      if (riftRoom && riftRoom.type === 'trap' && !riftRoom.done) {
        var tcx = WORLD_W / 2, tcy = riftRect.RY + riftRect.RH / 2;
        // 旋转毒光柱（从房间中心扫出）
        ctx.save();
        for (var bi3 = 0; bi3 < riftRoom.beamN; bi3++) {
          var ang = riftRoom.beamAng + bi3 * (6.283 / riftRoom.beamN);
          ctx.save(); ctx.translate(tcx, tcy); ctx.rotate(ang);
          var bg = ctx.createLinearGradient(0, 0, riftRect.RW * 0.62, 0);
          bg.addColorStop(0, 'rgba(150,230,120,0.34)'); bg.addColorStop(1, 'rgba(150,230,120,0)');
          ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, riftRect.RW * 0.62, -0.24, 0.24); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        // 机关柱（未激活灰蓝，蓄力显示进度环，激活变青绿 ✓）
        for (var mi2 = 0; mi2 < riftRoom.mechs.length; mi2++) {
          var m2 = riftRoom.mechs[mi2];
          ctx.save(); ctx.translate(m2.x, m2.y);
          ctx.fillStyle = m2.act ? 'rgba(127,176,105,0.92)' : 'rgba(40,62,74,0.92)';
          ctx.strokeStyle = m2.act ? '#7FB069' : 'rgba(127,176,105,0.5)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, m2.r, 0, 6.28); ctx.fill(); ctx.stroke();
          if (!m2.act && m2.prog > 0) { ctx.strokeStyle = '#7FB069'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, m2.r + 6, -Math.PI / 2, -Math.PI / 2 + 6.283 * (m2.prog / 0.7)); ctx.stroke(); }
          if (m2.act) { ctx.fillStyle = '#0E0B08'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', 0, 1); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; }
          ctx.restore();
        }
      }
      if (riftExit) {
        var ex = riftExit; ctx.save(); ctx.translate(ex.x, ex.y); ctx.rotate(gameTime * 2);
        for (var r = 0; r < 3; r++) { ctx.strokeStyle = 'rgba(160,110,220,' + (0.65 - r * 0.16) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, ex.r - r * 6, 0, 6.28); ctx.stroke(); }
        ctx.restore();
      }
      drawRiftHud();
    } else {
      for (var i = 0; i < rifts.length; i++) {
        var rf = rifts[i]; if (rf.state !== 'idle') continue;
        ctx.save(); ctx.translate(rf.x, rf.y); ctx.rotate(gameTime * 1.2);
        for (var s2 = 0; s2 < 3; s2++) { ctx.strokeStyle = s2 === 0 ? 'rgba(40,20,60,0.9)' : (s2 === 1 ? 'rgba(120,60,200,0.8)' : 'rgba(180,120,240,0.7)'); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, rf.r - s2 * 9, gameTime * (s2 % 2 ? 1 : -1) * 1.5, gameTime * (s2 % 2 ? 1 : -1) * 1.5 + 4.2); ctx.stroke(); }
        ctx.restore(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(200,150,250,0.9)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('未知裂隙', rf.x, rf.y + rf.r + 14); ctx.textAlign = 'left';
      }
    }
  }
  function drawVaults() {
    for (var i = 0; i < vaults.length; i++) {
      var v = vaults[i], done = v.state === 'done';
      ctx.save(); ctx.translate(v.x, v.y);
      ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(0, v.r * 0.5, v.r * 1.1, v.r * 0.5, 0, 0, 7); ctx.fill();
      var rgb = v.type === 'seal' ? '224,184,74' : '176,111,208';
      var ringA = done ? 0.15 : (v.state === 'opening' ? 0.6 + Math.sin(gameTime * 8) * 0.3 : 0.4);
      // 法阵贴图（金）作为封印宝箱的地面符文；失败时回退到旧圆环
      ctx.globalAlpha = ringA;
      var sealSize = 92;
      var sealOk = blit('seal_circle_gold', 0, 0, sealSize, sealSize, gameTime * (v.state === 'opening' ? 0.8 : 0.4));
      if (!sealOk) { ctx.strokeStyle = 'rgba(' + rgb + ',' + ringA + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, v.r + 14, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = done ? '#3a3f4a' : (v.type === 'seal' ? '#E0B84A' : '#B06FD0'); ctx.globalAlpha = done ? 0.5 : 1;
      ctx.beginPath(); ctx.moveTo(-14, 12); ctx.lineTo(-14, -2); ctx.quadraticCurveTo(0, -16, 14, -2); ctx.lineTo(14, 12); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = done ? '#555' : '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
      if (!done) {
        if (v.type === 'seal') { ctx.fillStyle = '#fff'; ctx.fillRect(-3, -4, 6, 9); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -4, 4, Math.PI, 0); ctx.stroke(); }
        else { ctx.rotate(gameTime * 1.5); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9; ctx.beginPath(); for (var st = 0; st < 6; st++) { var a2 = st * Math.PI / 3, rad = st % 2 ? 3 : 8, px = Math.cos(a2) * rad, py = Math.sin(a2) * rad; if (st === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
      }
      if (v.state === 'opening') { ctx.strokeStyle = '#E0B84A'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, v.r + 22, -Math.PI / 2, -Math.PI / 2 + 6.283 * v.prog); ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawTotems() {
    for (var i = 0; i < totems.length; i++) {
      var t = totems[i]; if (t.dead) continue;
      ctx.save(); ctx.translate(t.x, t.y);
      var pulse = 0.6 + Math.sin(gameTime * 4) * 0.25;
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, t.r * 0.5, t.r, t.r * 0.5, 0, 0, 7); ctx.fill();
      ctx.shadowColor = '#B06FD0'; ctx.shadowBlur = 12; ctx.fillStyle = '#8A5FB8'; ctx.fillRect(-t.r * 0.6, -t.r, t.r * 1.2, t.r * 2);
      ctx.shadowBlur = 0; ctx.strokeStyle = '#C79BE8'; ctx.lineWidth = 2; ctx.strokeRect(-t.r * 0.6, -t.r, t.r * 1.2, t.r * 2);
      ctx.fillStyle = 'rgba(199,155,232,' + (0.5 + pulse * 0.4) + ')'; ctx.beginPath(); ctx.arc(0, 0, t.r * 0.4, 0, 7); ctx.fill();
      var hw = t.r * 1.4; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-hw / 2, -t.r - 8, hw, 3); ctx.fillStyle = '#C79BE8'; ctx.fillRect(-hw / 2, -t.r - 8, hw * clamp(t.hp / t.maxhp, 0, 1), 3);
      ctx.restore();
    }
  }
  function drawPlayer() {
    var bank = player.bankSmooth;
    var craft = run.aircraft || 'a';
    var psc = isMobile ? 0.5 : 1; // 2026-08-18 移动端机体缩小 50%（视野更开阔），判定同步 PHB/player.r
    var psz = (PSIZE[craft] || 50) * ICON_SCALE * psc;
    // 冲刺残影渲染（渐隐幻影，纯几何确保零资产依赖）
    for (var gk = 0; gk < playerGhosts.length; gk++) {
      var gho = playerGhosts[gk];
      var ga = clamp(1 - gho.t / gho.life, 0, 1) * 0.32;
      if (ga <= 0) continue;
      ctx.save(); ctx.globalAlpha = ga; ctx.translate(gho.x, gho.y); ctx.rotate(gho.ang + Math.PI / 2 + gho.bank); ctx.scale(psc, psc);
      ctx.fillStyle = player.color; ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(11, 13); ctx.lineTo(0, 7); ctx.lineTo(-11, 13); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    var speed = Math.hypot(player.vx, player.vy);
    var moving = speed > player.speed * 0.25;
    var dashing = player.dashAnimT > 0;
    var attacking = player.attackAnimT > 0;
    var sheetKey, frame, fps;

    if (craft === 'a' && dashing) {
      // 青隼冲刺：单次 8 帧 @ 18 fps
      sheetKey = 'ply_a_dash_sheet';
      fps = 18;
      var dashProgress = 1 - clamp(player.dashAnimT / DASH_DUR, 0, 1);
      frame = Math.min(7, Math.floor(dashProgress * 8));
      bank *= 0.3; // 冲刺时机身更稳
    } else if (craft === 'b' && dashing) {
      // 玄武冲刺：单次 8 帧 @ 16 fps
      sheetKey = 'ply_b_dash_sheet';
      fps = 16;
      var dashProgressB = 1 - clamp(player.dashAnimT / DASH_DUR, 0, 1);
      frame = Math.min(7, Math.floor(dashProgressB * 8));
    } else if (craft === 'c' && dashing) {
      // 赤鸾冲刺：单次 8 帧 @ 18 fps
      sheetKey = 'ply_c_dash_sheet';
      fps = 18;
      var dashProgressC = 1 - clamp(player.dashAnimT / DASH_DUR, 0, 1);
      frame = Math.min(7, Math.floor(dashProgressC * 8));
    } else if (craft === 'a' && attacking) {
      // 青隼射击：8 帧循环 @ 16 fps，从 attackAnimT 起点播放
      sheetKey = 'ply_a_attack_sheet';
      fps = 16;
      var attackProgress = 1 - clamp(player.attackAnimT / QING_ATK_DUR, 0, 1);
      frame = Math.min(7, Math.floor(attackProgress * 8));
      // 开火侧反向偏摆
      if (player.attackSide === 0) bank += 0.10;
      else if (player.attackSide === 1) bank -= 0.10;
    } else if (craft === 'b' && attacking) {
      // 玄武射击：8 帧循环 @ 16 fps
      sheetKey = 'ply_b_attack_sheet';
      fps = 16;
      frame = Math.floor(gameTime * fps) % 8;
      bank += Math.sin(gameTime * 18) * 0.04;
    } else if (craft === 'c' && attacking) {
      // 赤鸾射击：8 帧周期 @ 14 fps，从 attackAnimT 起点播放
      sheetKey = 'ply_c_attack_sheet';
      fps = CHI_ATK_FPS;
      var chiAtkProgress = 1 - clamp(player.attackAnimT / CHI_ATK_DUR, 0, 1);
      frame = Math.min(7, Math.floor(chiAtkProgress * 8));
    } else if (craft === 'a') {
      // 青隼移动/待机
      if (moving) {
        sheetKey = 'ply_a_move_sheet';
        fps = 10;
      } else {
        sheetKey = 'ply_a_sheet';
        fps = 7;
      }
      frame = Math.floor(gameTime * fps) % 8;
    } else if (craft === 'c') {
      // 赤鸾移动/待机
      if (moving) {
        sheetKey = 'ply_c_move_sheet';
        fps = 10;
      } else {
        sheetKey = 'ply_c_sheet';
        fps = 7;
      }
      frame = Math.floor(gameTime * fps) % 8;
    } else {
      // 玄武：移动用 boost_sheet，待机用 sheet
      var boosting = player.iframe > 0 || speed > player.speed * 0.58;
      sheetKey = 'ply_' + craft + (boosting ? '_boost_sheet' : '_sheet');
      fps = boosting ? 14 : 10;
      frame = Math.floor(gameTime * fps) % 8;
    }
    // 冲刺残影：沿位移反方向拖出 3 道渐隐幻影（精致的闪避反馈）
    if (dashing) {
      var gmag = Math.hypot(player.vx, player.vy) || 1;
      var gnx = player.vx / gmag, gny = player.vy / gmag;
      for (var gi = 1; gi <= 3; gi++) {
        var off = gi * 12;
        ctx.save();
        ctx.globalAlpha = 0.22 * (4 - gi);
        ctx.translate(player.x - gnx * off, player.y - gny * off);
        ctx.rotate(player.ang + Math.PI / 2 + bank);
        ctx.scale(psc, psc); // 残影随机体缩放
        ctx.fillStyle = player.color; ctx.shadowColor = player.color; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(11, 13); ctx.lineTo(0, 7); ctx.lineTo(-11, 13); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }
    var drawn = blitSheet(sheetKey, player.x, player.y, psz, psz, player.ang + Math.PI / 2 + bank, 4, 2, frame);
    if (!drawn && !blit('ply_' + craft, player.x, player.y, psz, psz, player.ang + Math.PI / 2)) {
      ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.ang + Math.PI / 2 + bank); ctx.scale(psc, psc);
      ctx.shadowColor = player.color; ctx.shadowBlur = 10; ctx.fillStyle = player.iframe > 0 ? '#fff' : player.color; ctx.strokeStyle = COL.playerEdge; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(11, 13); ctx.lineTo(0, 7); ctx.lineTo(-11, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore(); ctx.shadowBlur = 0;
    }
    if (player.flash > 0) { ctx.fillStyle = 'rgba(201,79,79,0.3)'; ctx.beginPath(); ctx.arc(player.x, player.y, 20 * psc, 0, 7); ctx.fill(); }
    for (var di = 0; di < player.droneList.length; di++) { var dr = player.droneList[di];
      ctx.save(); ctx.translate(dr.x, dr.y);
      ctx.shadowColor = '#E8DCC4'; ctx.shadowBlur = 16; ctx.fillStyle = '#E8FFF5'; ctx.beginPath(); ctx.arc(0, 0, 10 * psc, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.strokeStyle = '#E8DCC4'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, (15 + Math.sin(gameTime * 6 + di) * 2) * psc, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.shadowBlur = 0; ctx.restore(); }
    // 机体护盾光环先禁用：旧资产未抠干净
    // if (player.shield > 0) {
    //   var bua = IMG['vfx_buff_aura'];
    //   if (bua && bua.complete && bua.naturalWidth > 0) {
    //     ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + Math.sin(gameTime * 4) * 0.18;
    //     ctx.translate(player.x, player.y); ctx.rotate(gameTime * 0.4); ctx.drawImage(bua, -42, -42, 84, 84); ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    //   } else { ctx.save(); ctx.globalAlpha = 0.4 + Math.sin(gameTime * 4) * 0.15; ctx.strokeStyle = '#C9A24B'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, 26, 0, 7); ctx.stroke(); ctx.restore(); }
    // }
    // 2026-08-19：移除自机机头瞄准指示线/锥形光束（drawPlayer 内原 5231–5244 段）。
    // 射击方向已由 player.angle 旋转自然呈现，机头前方不再绘制任何实体粗线/锥形，保持战斗画面干净。
  }
  function drawEnemies() {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.wake > 0) {
        // 出场预警信标：外扩环 + 倒计时进度环 + 旋转虚线 + 顶部警示三角（缓冲期内不渲染本体）
        var tot = e.entryMax || 1, p = clamp(1 - e.wake / tot, 0, 1);
        ctx.save(); ctx.translate(e.x, e.y);
        for (var ri = 0; ri < 3; ri++) {
          var ph = (gameTime * 1.5 + ri * 0.33) % 1;
          ctx.globalAlpha = (1 - ph) * 0.5; ctx.strokeStyle = '#C9A24B'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, e.r + 6 + ph * 26, 0, 7); ctx.stroke();
        }
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#E8DCC4'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 12, -Math.PI / 2, -Math.PI / 2 + p * 6.283); ctx.stroke();
        ctx.globalAlpha = 0.7; ctx.strokeStyle = '#C8642A'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -gameTime * 40;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.25 + 0.5 * p; ctx.fillStyle = e.col;
        ctx.beginPath(); ctx.arc(0, 0, e.r * (0.4 + 0.5 * p), 0, 7); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#C8642A';
        ctx.beginPath(); ctx.moveTo(0, -e.r - 20); ctx.lineTo(-6, -e.r - 30); ctx.lineTo(6, -e.r - 30); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
        continue;
      }
      // 围猎（转幕）狂暴：红色脉冲环标识
      if (e.hunt) {
        var _hp = 0.5 + 0.5 * Math.sin(gameTime * 9);
        ctx.strokeStyle = 'rgba(201,79,79,' + (0.45 + 0.4 * _hp) + ')';
        ctx.lineWidth = 2.5; ctx.shadowColor = '#C94F4F'; ctx.shadowBlur = 8 + 5 * _hp;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, 7); ctx.stroke(); ctx.shadowBlur = 0;
      }
      var hx = 0, hy = 0;
      if (e.hitT > 0) { var hk = e.hitMag * (e.hitT / 0.1); hx = rand(-hk, hk); hy = rand(-hk, hk); }
      ctx.save(); ctx.translate(e.x + hx, e.y + hy);
      ctx.shadowColor = e.elite ? COL.elite : e.col; ctx.shadowBlur = e.elite ? 14 : 8;
      var fill = e.flash > 0 ? '#fff' : ((e.arche === 'ram' || e.arche === 'split') && e.chargeState === 1 ? '#C94F4F' : e.col);
      ctx.fillStyle = fill; ctx.strokeStyle = e.edge; ctx.lineWidth = 2;
      var esz = ((e.small ? 24 : (ESIZE[e.arche] || 42)) + (e.elite ? 10 : 0)) * ICON_SCALE;
      if (!blit(enemySprite(e), 0, 0, esz, esz, 0)) {
        if (e.arche === 'turret') {
          ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2); ctx.strokeRect(-e.r, -e.r, e.r * 2, e.r * 2);
        } else if (e.arche === 'gunship') {
          // 横向长舰体 + 前端 3 炮口 + 顶部装甲
          roundRectPath(ctx, -e.r, -e.r * 0.45, e.r * 2, e.r * 0.9, 6); ctx.fill(); ctx.stroke();
          ctx.fillStyle = e.flash > 0 ? '#fff' : COL.ink; ctx.beginPath(); ctx.arc(-e.r * 0.7, -e.r * 0.45, 3, 0, 7); ctx.arc(-e.r * 0.7, e.r * 0.45, 3, 0, 7); ctx.arc(e.r * 0.7, 0, 3, 0, 7); ctx.fill();
          ctx.fillStyle = e.flash > 0 ? '#fff' : COL.enemyEdge; ctx.fillRect(-e.r * 0.2, -e.r * 0.55, e.r * 0.4, e.r * 1.1);
        } else if (e.arche === 'heal') {
          // 圆润菱形/灯笼体（4 点星）
          var n4 = 4; ctx.beginPath(); for (var k2 = 0; k2 < n4 * 2; k2++) { var a2 = k2 / (n4 * 2) * 6.28 - Math.PI / 2; var rr2 = e.r * (k2 % 2 ? 0.5 : 1); var px2 = Math.cos(a2) * rr2, py2 = Math.sin(a2) * rr2; if (k2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2); } ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (e.arche === 'split') {
          // 八边形细胞 + 十字分割线（暗示会裂开）
          var n3 = 8; ctx.beginPath(); for (var k3 = 0; k3 < n3; k3++) { var a3 = k3 / n3 * 6.28 - Math.PI / 2; var rr3 = e.r * (k3 % 2 ? 0.7 : 1); var px3 = Math.cos(a3) * rr3, py3 = Math.sin(a3) * rr3; if (k3 === 0) ctx.moveTo(px3, py3); else ctx.lineTo(px3, py3); } ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -e.r * 0.7); ctx.lineTo(0, e.r * 0.7); ctx.moveTo(-e.r * 0.7, 0); ctx.lineTo(e.r * 0.7, 0); ctx.stroke();
        } else if (e.arche === 'looter') {
          var nL = 4, gl = 1 + Math.sin(gameTime * 14) * 0.2; ctx.beginPath();
          for (var kl = 0; kl < nL * 2; kl++) { var al = kl / (nL * 2) * 6.28 - Math.PI / 2; var rrl = e.r * (kl % 2 ? 0.45 : 1) * gl; var pxl = Math.cos(al) * rrl, pyl = Math.sin(al) * rrl; if (kl === 0) ctx.moveTo(pxl, pyl); else ctx.lineTo(pxl, pyl); }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          if (e.fleeing) { ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('逃!', 0, -e.r - 6); ctx.textAlign = 'left'; }
        } else if (e.arche === 'sniper') {
          // 狙击手：前指三角+长炮管
          ctx.rotate(e.sniperAim || 0);
          ctx.beginPath(); ctx.moveTo(e.r, 0); ctx.lineTo(-e.r * 0.6, -e.r * 0.7); ctx.lineTo(-e.r * 0.6, e.r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = e.flash > 0 ? '#fff' : COL.ink; ctx.fillRect(e.r * 0.3, -2, e.r * 1.1, 4); // 长炮管
        } else if (e.arche === 'shielder') {
          // 护盾兵：六边形+中心圆环
          var ns = 6; ctx.beginPath(); for (var ks = 0; ks < ns; ks++) { var as = (ks / ns) * 6.28; var rs = e.r * (ks % 2 ? 0.7 : 1); var pxs = Math.cos(as) * rs, pys = Math.sin(as) * rs; if (ks === 0) ctx.moveTo(pxs, pys); else ctx.lineTo(pxs, pys); } ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = '#5B9FD0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.5, 0, 7); ctx.stroke();
        } else if (e.arche === 'swarm') {
          // 蜂群：小三角
          ctx.beginPath(); ctx.moveTo(e.r, 0); ctx.lineTo(-e.r * 0.6, -e.r * 0.7); ctx.lineTo(-e.r * 0.6, e.r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else {
          // ram / shoot：六边形
          var n = 6; ctx.beginPath(); for (var k = 0; k < n; k++) { var a = (k / n) * 6.28; var rr = e.r * (k % 2 ? 0.7 : 1); var px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      if (e.elite) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, 7); ctx.stroke(); }
      ctx.restore(); ctx.shadowBlur = 0;
      // 冲撞者/自爆蜂·蓄力预警：红色瞄准线 + 闪烁（可预判走位闪避）
      if ((e.arche === 'ram' || e.arche === 'split' || e.kamikaze) && e.chargeState === 1) {
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.chargeDir);
        ctx.strokeStyle = 'rgba(201,79,79,' + (0.5 + 0.4 * Math.sin(gameTime * 30)) + ')';
        ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.lineDashOffset = gameTime * 60;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(320, 0); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
      }
      // 自爆突进蜂·冲刺中：橙红拖尾（极速直冲）
      if (e.kamikaze && e.chargeState === 2) {
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.chargeDir);
        ctx.strokeStyle = 'rgba(224,98,58,0.5)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-46, 0); ctx.stroke();
        ctx.restore();
      }
      // 狙击手/相位狙击手激光瞄准线（充能时显示）
      if ((e.arche === 'sniper' || e.arche === 'phaseSniper') && e.sniperCharge > 0) {
        var laserA = e.sniperAim || 0;
        var _isPS = e.arche === 'phaseSniper';
        var _lcol = _isPS ? '232,74,106' : '232,160,80';
        var laserAlpha = Math.min(0.8, e.sniperCharge / 1.2 * 0.8);
        var laserW = 1 + e.sniperCharge * 2;
        ctx.save(); ctx.strokeStyle = 'rgba(' + _lcol + ',' + laserAlpha + ')'; ctx.lineWidth = laserW;
        ctx.setLineDash([8, 6]); ctx.lineDashOffset = -gameTime * 30;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(laserA) * 800, e.y + Math.sin(laserA) * 800); ctx.stroke();
        ctx.setLineDash([]);
        // 充能满时变实线+加粗
        if (e.sniperCharge >= 1.0) { ctx.strokeStyle = 'rgba(255,80,40,' + (0.6 + 0.4 * Math.sin(gameTime * 30)) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(laserA) * 800, e.y + Math.sin(laserA) * 800); ctx.stroke(); }
        // 相位狙击手：0.2s 闪光预警（翻相窗口）——整条亮白粉闪
        if (_isPS && e.sniperBeamFlash > 0) {
          ctx.strokeStyle = 'rgba(255,235,245,' + (0.5 + 0.5 * Math.sin(gameTime * 50)) + ')'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(laserA) * 900, e.y + Math.sin(laserA) * 900); ctx.stroke();
        }
        ctx.restore();
      }
      // 护盾兵护盾泡泡（覆盖附近友军）
      if (e.arche === 'shielder' && e.wake <= 0) {
        var sp = 0.4 + 0.2 * Math.sin(e.shieldPulse || 0);
        ctx.save(); ctx.strokeStyle = 'rgba(91,159,208,' + sp + ')'; ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]); ctx.lineDashOffset = gameTime * 20;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.shieldRadius || 120, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      // 鎏金重盾巨舰：正面 120° 金盾弧（朝向玩家；余烬相下变暗提示可破盾）
      if (e.bastion && e.wake <= 0) {
        var _bf = Math.atan2(player.y - e.y, player.x - e.x);
        var _sa = e.shieldArc / 2;
        var _scol = phase === PHASE.EMBER ? 'rgba(224,184,74,0.28)' : 'rgba(224,184,74,0.85)';
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(_bf);
        ctx.strokeStyle = _scol; ctx.lineWidth = 5; ctx.shadowColor = '#E0B84A'; ctx.shadowBlur = glowOn ? 12 : 0;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 14, -_sa, _sa); ctx.stroke();
        ctx.globalAlpha = phase === PHASE.EMBER ? 0.06 : 0.16; ctx.fillStyle = '#E0B84A';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, e.r + 14, -_sa, _sa); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      // 精英修饰词标识
      if (e.eliteMod) {
        var modCol = e.eliteMod === 'volatile' ? '#FF6A2A' : (e.eliteMod === 'adaptive' ? '#6FC0FF' : '#E0503A');
        var modTxt = e.eliteMod === 'volatile' ? '爆' : (e.eliteMod === 'adaptive' ? '适' : '狂');
        ctx.fillStyle = modCol; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(modTxt, e.x + e.r + 2, e.y - e.r - 8); ctx.textAlign = 'left';
      }
      // 警戒图标 ? / !（规则圣经模块一·2：可预判的感知信号）
      if (e.alert === 1) { ctx.fillStyle = '#E0B84A'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', e.x, e.y - e.r - 12); ctx.textAlign = 'left'; }
      else if (e.alert === 2) { ctx.fillStyle = '#E0503A'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', e.x, e.y - e.r - 12); ctx.textAlign = 'left'; }
      // 灵能尖啸：撤离惊动时未激活敌机显示听觉波纹
      if (exfilAlarmT > 0 && e.alert === 0) {
        ctx.save(); ctx.strokeStyle = 'rgba(127,176,105,0.7)'; ctx.lineWidth = 2; ctx.globalAlpha = (exfilAlarmT / 1.2) * 0.8;
        var wr = 10 + (1 - exfilAlarmT / 1.2) * 22; ctx.beginPath(); ctx.arc(e.x, e.y, wr, 0, 7); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      }
      // 游医：旋转绿色十字光环（语义色=增益，非玩家阵营）
      if (e.arche === 'heal') {
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(gameTime * 1.5);
        ctx.strokeStyle = COL.extract; ctx.shadowColor = COL.extract; ctx.shadowBlur = glowOn ? 10 : 0; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(-e.r - 6, 0); ctx.lineTo(e.r + 6, 0); ctx.moveTo(0, -e.r - 6); ctx.lineTo(0, e.r + 6); ctx.stroke();
        ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      if (e.hp < e.maxhp) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - 16, e.y - e.r - 9, 32, 3); ctx.fillStyle = e.col; ctx.fillRect(e.x - 16, e.y - e.r - 9, 32 * (e.hp / e.maxhp), 3); }
      if (e.freezeT > 0) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#A8D8E8'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, 7); ctx.fill(); ctx.strokeStyle = '#CFE8FF'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
      // 元素附着光环（提示该敌人当前携带的元素，可被异元素反应）
      if (e.aura) { var ac = ELEMCOL[e.aura]; ctx.save(); ctx.strokeStyle = ac; ctx.shadowColor = ac; ctx.shadowBlur = glowOn ? 12 : 0; ctx.globalAlpha = 0.6 + 0.25 * Math.sin(gameTime * 8); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 7, 0, 7); ctx.stroke(); ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      if (e.electroT > 0) { ctx.save(); ctx.globalAlpha = 0.6; ctx.strokeStyle = '#6FC0FF'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5 + Math.sin(gameTime * 20) * 2, 0, 7); ctx.stroke(); ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      // 敌机相位标注（三角：金=鎏金 / 橙红=余烬）：异相克制目标可视化
      if (e.phase) {
        var _pc = e.phase === 'gold' ? '#C9A24B' : '#C8642A';
        var _my = e.y - e.r - 20;
        ctx.save(); ctx.translate(e.x, _my); ctx.fillStyle = _pc; ctx.shadowColor = _pc; ctx.shadowBlur = glowOn ? 8 : 0;
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, 3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.shadowBlur = 0;
      }
    }
  }
  function drawWeaverRifts() {
    for (var i = 0; i < weaverRifts.length; i++) {
      var w = weaverRifts[i], a = clamp(w.life / 1.2, 0, 1);
      ctx.save(); ctx.translate(w.x, w.y);
      ctx.globalAlpha = 0.16 * a; ctx.strokeStyle = '#B06FD0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, w.pull, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.rotate(gameTime * 3 + (w.spin || 0));
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, w.r + 8);
      g.addColorStop(0, 'rgba(176,111,208,' + (0.85 * a) + ')'); g.addColorStop(1, 'rgba(176,111,208,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w.r + 8, 0, 7); ctx.fill();
      for (var k = 0; k < 3; k++) { ctx.strokeStyle = 'rgba(224,200,240,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, w.r * (0.4 + k * 0.25), k, k + 2.2); ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  function drawBoss() {
    var b = boss;
    var qang = Math.atan2(player.y - b.y, player.x - b.x);
    var taoPulse = (b.kind === 'taotie') ? Math.pow(Math.sin(gameTime * 1.6), 2) : 0;
    var bhx = 0, bhy = 0;
    if (b.hitT > 0) { var bhk = b.hitMag * (b.hitT / 0.12); bhx = rand(-bhk, bhk); bhy = rand(-bhk, bhk); }
    // 梼杌：前后抖动
    if (b.kind === 'taowu') { var jm = Math.sin(gameTime * 20) * 3.5; bhx += Math.cos(qang) * jm; bhy += Math.sin(qang) * jm; }
    // 召唤法阵预警（紫色旋转收束环）
    if (b.summonWarn > 0) {
      var st = 1 - b.summonWarn / 0.6;
      ctx.save(); ctx.translate(b.x + bhx, b.y + bhy); ctx.rotate(gameTime * 3);
      ctx.strokeStyle = COL.sha; ctx.shadowColor = COL.sha; ctx.shadowBlur = glowOn ? 14 : 0;
      ctx.globalAlpha = 0.4 + 0.4 * st; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 40 * (1 - st) + 8, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.stroke();
      ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.translate(b.x + bhx, b.y + bhy);
    var enraged = (phase === PHASE.EMBER); // 余烬相：Boss 狂暴形态（§7.11-3）
    if (enraged) { var _ep = 1 + 0.05 * Math.sin(gameTime * 9); ctx.scale(_ep, _ep); } // 微缩放脉动
    var col = bossPhaseColor(b);
    var bsz = b.r * 2.5 * ICON_SCALE;
    var bok = false;
    // 穷奇：先画身后煽动翅膀，再叠精灵
    if (b.kind === 'qiongqi') { drawBossWings(b, col, bsz, qang); bok = blit('boss_qiongqi', 0, 0, bsz, bsz, qang); }
    // 饕餮：呼吸式放大（扑过来的张力）
    else if (b.kind === 'taotie') { ctx.save(); ctx.scale(1 + 0.16 * taoPulse, 1 + 0.16 * taoPulse); bok = blit('boss_taotie', 0, 0, bsz, bsz, qang); ctx.restore(); }
    else if (b.kind === 'hundun') bok = blit('boss_hundun', 0, 0, bsz, bsz, gameTime * 0.15);
    else bok = blit('boss_taowu', 0, 0, bsz, bsz, gameTime * 0.25);
    if (!bok) {
      // 回退：原几何 Boss
      ctx.shadowColor = col; ctx.shadowBlur = 16;
      ctx.fillStyle = b.flash > 0 ? '#fff' : col; ctx.strokeStyle = '#2a0a2a'; ctx.lineWidth = 3;
      if (b.kind === 'qiongqi' || b.kind === 'taotie') {
        // 前倾捕食箭头 / 大口
        ctx.rotate(qang);
        ctx.beginPath(); ctx.moveTo(b.r, 0); ctx.lineTo(-b.r * 0.7, -b.r * 0.85); ctx.lineTo(-b.r * 0.3, 0); ctx.lineTo(-b.r * 0.7, b.r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#8A6FB8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.r, 0); ctx.lineTo(-b.r * 0.3, 0); ctx.stroke();
      } else {
        // 梼杌/混沌：旋转八尖 + 封印冠 + 弱点核心
        var n = 8; ctx.beginPath(); for (var k = 0; k < n; k++) { var a = (k / n) * 6.28 + gameTime * 0.3; var rr = b.r * (k % 2 ? 0.7 : 1.1); var px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#2a0a2a'; ctx.lineWidth = 2;
        for (var c2 = 0; c2 < 8; c2++) { var ca = c2 / 8 * 6.28 + gameTime * 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(ca) * b.r * 1.1, Math.sin(ca) * b.r * 1.1); ctx.lineTo(Math.cos(ca) * b.r * 1.42, Math.sin(ca) * b.r * 1.42); ctx.stroke(); }
        var coreA = b.invuln > 0 ? (0.5 + 0.5 * Math.sin(gameTime * 20)) : 0.85;
        ctx.fillStyle = b.invuln > 0 ? '#fff' : '#FFE9A8'; ctx.globalAlpha = coreA; ctx.shadowColor = '#FFE9A8'; ctx.shadowBlur = glowOn ? 12 : 0;
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.3, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
    } else if (b.flash > 0) {
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, bsz * 0.42, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
    // 各 Boss 专属氛围特效
    if (b.kind === 'taowu') drawBossCrumble(b, col, bsz);
    else if (b.kind === 'taotie') drawBossLunge(b, col, bsz, qang, taoPulse);
    else if (b.kind === 'hundun') drawBossBlackhole(b, col, bsz);
    if (enraged) { // 狂暴橙描边 + 脉动（视觉即难度）
      ctx.strokeStyle = '#FF7A2A'; ctx.lineWidth = 3; ctx.shadowColor = '#FF7A2A'; ctx.shadowBlur = glowOn ? 16 : 0;
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(gameTime * 9);
      ctx.beginPath(); ctx.arc(0, 0, (b.r * 2.5 * ICON_SCALE) * 0.56, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    ctx.restore(); ctx.shadowBlur = 0;
    // v12.6：维度撕裂·双色旋转死亡光阵（红束致命于鎏金相 / 金束致命于余烬相）
    if (b.dimTear) {
      var _rot = b.dimRot || 0;
      ctx.save(); ctx.translate(b.x, b.y);
      if (b.dimTear === 'charge') {
        var _ca = clamp(1 - b.dimTearT / 1.4, 0, 1);
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(gameTime * 20);
        ctx.strokeStyle = '#C94F4F'; ctx.lineWidth = 6; ctx.rotate(_rot);
        ctx.beginPath(); ctx.arc(0, 0, 60 + _ca * 240, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#E0B84A'; ctx.rotate(Math.PI);
        ctx.beginPath(); ctx.arc(0, 0, 60 + _ca * 240, 0, 7); ctx.stroke();
      } else if (b.dimTear === 'active') {
        ctx.rotate(_rot);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(201,79,79,0.9)'; ctx.lineWidth = 14; ctx.shadowColor = '#C94F4F'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1200, 0); ctx.stroke();
        ctx.rotate(Math.PI);
        ctx.strokeStyle = 'rgba(224,184,74,0.9)'; ctx.shadowColor = '#E0B84A';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1200, 0); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // 元素附着光环
    if (boss.aura) { var bac = ELEMCOL[boss.aura]; ctx.save(); ctx.strokeStyle = bac; ctx.shadowColor = bac; ctx.shadowBlur = glowOn ? 14 : 0; ctx.globalAlpha = 0.7 + 0.2 * Math.sin(gameTime * 8); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r + 10, 0, 7); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0; }
    // 突进预警红线（与 Boss 弹幕预警同源信号）
    if (b.dashWarn > 0) {
      var dang = Math.atan2(player.y - b.y, player.x - b.x);
      ctx.strokeStyle = 'rgba(201,79,79,' + (0.4 + 0.5 * Math.abs(Math.sin(gameTime * 30))) + ')';
      ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(dang) * 1000, b.y + Math.sin(dang) * 1000); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (b.wake > 0) { ctx.globalAlpha = 0.7; ctx.strokeStyle = COL.enemy; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 16 + Math.sin(gameTime * 12) * 4, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  // ===== 四大 Boss 专属氛围特效 =====
  function drawBossWings(b, col, bsz, qang) {
    ctx.save(); ctx.rotate(qang);
    var flap = Math.sin(gameTime * 9);          // 煽动相位 -1..1
    var a = 0.5 + flap * 0.4;                   // 翼展开角（煽动）
    for (var side = -1; side <= 1; side += 2) {
      ctx.save(); ctx.scale(side, 1); ctx.translate(bsz * 0.16, 0); ctx.rotate(-a);
      var wlen = bsz * 0.62, wh = bsz * 0.44;
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = glowOn ? 14 : 0;
      ctx.globalAlpha = 0.5 + 0.25 * (flap * 0.5 + 0.5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(wlen * 0.5, -wh, wlen, -wh * 0.22);
      ctx.quadraticCurveTo(wlen * 0.62, 0, wlen * 0.96, wh * 0.22);
      ctx.quadraticCurveTo(wlen * 0.5, wh * 0.46, wlen * 0.26, wh * 0.2);
      ctx.quadraticCurveTo(wlen * 0.1, wh * 0.05, 0, 0);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#1a0a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(wlen * 0.5, -wh * 0.5, wlen, -wh * 0.2); ctx.stroke();
      ctx.restore();
    }
    ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  function drawBossCrumble(b, col, bsz) {
    // 土崩瓦解：碎屑环绕 + 外环崩裂虚线
    var N = 16, baseR = bsz * 0.6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < N; i++) {
      var ang = i / N * 6.2831853 + gameTime * 0.7;
      var rr = baseR + 6 + Math.sin(gameTime * 2 + i * 1.7) * 10;
      var s = 4 + (i % 3) * 2.5;
      ctx.save(); ctx.translate(Math.cos(ang) * rr, Math.sin(ang) * rr); ctx.rotate(ang * 2 + gameTime);
      ctx.fillStyle = col; ctx.globalAlpha = 0.32 + 0.3 * (Math.sin(gameTime * 3 + i) * 0.5 + 0.5);
      ctx.shadowColor = col; ctx.shadowBlur = glowOn ? 8 : 0;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, s * 0.6); ctx.lineTo(-s * 0.7, s * 0.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 0.4; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.arc(0, 0, baseR + 14 + Math.sin(gameTime * 1.5) * 4, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  function drawBossLunge(b, col, bsz, qang, pulse) {
    // 扑过来：朝玩家方向的冲击波（脉冲峰值时出现）
    if (pulse <= 0.35) return;
    var pa = (pulse - 0.35) / 0.65;
    ctx.save(); ctx.rotate(qang); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#E0894A'; ctx.shadowColor = '#E0894A'; ctx.shadowBlur = glowOn ? 10 : 0;
    ctx.globalAlpha = 0.55 * (1 - pa); ctx.lineWidth = 3;
    for (var k = -2; k <= 2; k++) {
      var off = k * 11;
      ctx.beginPath(); ctx.moveTo(bsz * 0.30, off); ctx.lineTo(bsz * 0.60 + pa * 46, off); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  function drawBossBlackhole(b, col, bsz) {
    // 黑洞吸收：向内卷入的旋臂 + 暗核 + 发光视界
    var coreR = bsz * 0.30;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var arms = 3, perArm = 34, maxR = bsz * 0.62;
    for (var ar = 0; ar < arms; ar++) {
      for (var i = 0; i < perArm; i++) {
        var t = ((i / perArm) + gameTime * 0.35 + ar / arms) % 1;   // 0 外 → 1 内
        var rad = maxR * (1 - t);
        var ang = ar / arms * 6.2831853 + t * 7.0 - gameTime * 1.2;
        ctx.fillStyle = (ar % 2) ? '#B06FD0' : '#7EAD9A';
        ctx.globalAlpha = (1 - t) * 0.6; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = glowOn ? 6 : 0;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * rad, Math.sin(ang) * rad, 1.6 + (1 - t) * 2.0, 0, 7); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    var g = ctx.createRadialGradient(0, 0, coreR * 0.2, 0, 0, coreR * 1.5);
    g.addColorStop(0, '#000000'); g.addColorStop(0.6, '#05060a'); g.addColorStop(0.85, 'rgba(176,111,208,0.5)'); g.addColorStop(1, 'rgba(176,111,208,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, coreR * 1.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#C9A24B'; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(gameTime * 4); ctx.lineWidth = 2.5;
    ctx.shadowColor = '#C9A24B'; ctx.shadowBlur = glowOn ? 12 : 0;
    ctx.beginPath(); ctx.arc(0, 0, coreR, 0, 7); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  function drawBulletTrails() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i]; var tr = b.trail; if (!tr || !ELEM_VFX[tr.elem]) continue;
      var im = IMG[ELEM_VFX[tr.elem].trail];
      if (!im || !im.complete || im.naturalWidth === 0) continue;
      var ang = Math.atan2(b.vy, b.vx);
      var tx = b.x - Math.cos(ang) * (b.r + 16);
      var ty = b.y - Math.sin(ang) * (b.r + 16);
      var frame = Math.floor((tr.age * tr.fps) % 8);
      var sz = tr.size * (0.85 + 0.15 * Math.sin(tr.age * 12));
      ctx.globalAlpha = 0.9;
      blitSheet(ELEM_VFX[tr.elem].trail, tx, ty, sz, sz, ang + Math.PI / 2, 4, 2, frame);
    }
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawBullets() {
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      var ang = Math.atan2(b.vy, b.vx);
      var bsz = Math.max(18, b.r * 3.4);
      // 青隼羽形子弹：新精灵表动画，asset 已含直线拖尾
      var isQingBullet = b.from === 'player' && b.kind === 'normal' && (run.aircraft || 'a') === 'a';
      if (isQingBullet) {
        var frame = Math.floor((b.age * 16) % 8);
        if (blitSheet('bul_player_sheet', b.x, b.y, bsz * 1.25, bsz * 1.25, ang + Math.PI / 2, 4, 2, frame)) continue;
      }
      // 玄武重型弹丸：8帧循环，三炮散射，asset 已含推进焰
      var isXuanBullet = b.from === 'player' && b.xuanwu;
      if (isXuanBullet) {
        var xframe = Math.floor((b.age * 16) % 8);
        if (blitSheet('bul_xuanwu_sheet', b.x, b.y, bsz * 2.0, bsz * 2.0, ang + Math.PI / 2, 4, 2, xframe)) continue;
      }
      // 赤鸾追踪羽矛：8帧循环，尺寸明显小于机体
      var isChiBullet = b.from === 'player' && b.chilan;
      if (isChiBullet) {
        var cframe = Math.floor((b.age * 14) % 8);
        if (blitSheet('bul_chilan_sheet', b.x, b.y, bsz * 0.9, bsz * 0.9, ang + Math.PI / 2, 4, 2, cframe)) continue;
      }
      var col, tcol;
      if (b.from === 'player' && b.elem && b.kind !== 'crit') { col = ELEMCOL[b.elem]; tcol = col; }
      else if (b.kind === 'crit') { col = BULLET_COL.buff; tcol = '#FFE9A8'; }
      else if (b.kind === 'boss') { col = BULLET_COL.boss; tcol = col; }
      else if (b.kind === 'enemy') { col = COL.bulletE; tcol = col; }
      else if (b.kind === 'pierce') { col = '#bff7ff'; tcol = col; }
      else if (b.kind === 'homing') { col = '#ff9bd0'; tcol = col; }
      else if (b.kind === 'explode') { col = '#D98A3D'; tcol = col; }
      else { col = player.color || COL.bulletP; tcol = col; }
      // 霓虹拖尾（世界坐标，旋转前画）
      if (glowOn) {
        ctx.strokeStyle = tcol; ctx.globalAlpha = b.kind === 'crit' ? 0.7 : 0.5;
        ctx.lineWidth = b.from === 'player' ? (b.kind === 'pierce' ? 1.5 : 2) : (b.boss ? 3 : 2);
        ctx.beginPath(); ctx.moveTo(b.lastx, b.lasty); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (!blit(bulletSprite(b), b.x, b.y, bsz, bsz, ang + Math.PI / 2)) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(ang);
        ctx.shadowColor = col; ctx.shadowBlur = b.kind === 'crit' ? 9 : 5; ctx.fillStyle = col;
        if (b.kind === 'explode') {
          ctx.beginPath(); ctx.arc(0, 0, b.r * (1 + 0.15 * Math.sin(gameTime * 14)), 0, 7); ctx.fill();
          ctx.globalAlpha = 0.5; ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, b.r + 6 + ((gameTime * 6) % 1) * 5, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        } else if (b.kind === 'pierce') {
          ctx.globalAlpha = 0.35; ctx.fillRect(-b.r * 4, -b.r * 0.5, b.r * 4, b.r * 1.0); ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.moveTo(b.r * 2.0, 0); ctx.lineTo(-b.r * 1.2, -b.r * 0.9); ctx.lineTo(-b.r * 1.2, b.r * 0.9); ctx.closePath(); ctx.fill();
        } else if (b.kind === 'homing') {
          ctx.beginPath(); ctx.moveTo(b.r * 1.2, 0); ctx.lineTo(-b.r * 0.5, -b.r * 0.8); ctx.lineTo(-b.r * 0.15, 0); ctx.lineTo(-b.r * 0.5, b.r * 0.8); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.5; ctx.fillRect(-b.r * 1.8, -b.r * 0.2, b.r * 1.1, b.r * 0.4); ctx.globalAlpha = 1;
        } else if (b.kind === 'crit') {
          ctx.beginPath(); ctx.moveTo(b.r * 2.6, 0); ctx.lineTo(-b.r * 1.4, -b.r * 1.0); ctx.lineTo(-b.r * 0.7, 0); ctx.lineTo(-b.r * 1.4, b.r * 1.0); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(0, 0, b.r * 2.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        } else {
          // 普通：尖头光梭（机型色）
          ctx.beginPath(); ctx.moveTo(b.r * 2.4, 0); ctx.lineTo(-b.r * 1.4, -b.r * 0.9); ctx.lineTo(-b.r * 0.5, 0); ctx.lineTo(-b.r * 1.4, b.r * 0.9); ctx.closePath(); ctx.fill();
        }
        ctx.shadowBlur = 0; ctx.restore();
      }
      if (b.kind === 'enemy' || b.kind === 'boss') { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke(); }
    }
  }
  function drawVfxLines() {
    for (var i = 0; i < vfxLines.length; i++) {
      var l = vfxLines[i], a = Math.max(0, l.life / l.max);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = l.col; ctx.shadowColor = l.col; ctx.shadowBlur = 8; ctx.lineWidth = 2;
      ctx.beginPath(); var segs = 4, dx = (l.x2 - l.x1) / segs, dy = (l.y2 - l.y1) / segs;
      ctx.moveTo(l.x1, l.y1);
      for (var s = 1; s <= segs; s++) { var jx = (s === segs) ? l.x2 : l.x1 + dx * s + rand(-6, 6), jy = (s === segs) ? l.y2 : l.y1 + dy * s + rand(-6, 6); ctx.lineTo(jx, jy); }
      ctx.stroke(); ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }
  function drawLoot() {
    for (var i = 0; i < loot.length; i++) {
      var it = loot[i]; var age = it.age || 0; var bob = Math.sin(age * 3 + i) * 2;
      // #197 已过滤掉落物：暗化弱化渲染（仍可见），不影响 xp/灵玉/丹药
      var _isArtLoot = it.type !== 'xp' && it.type !== 'jade' && it.type !== 'consumable' && it.type !== 'ore';
      if (_isArtLoot && it.rarity && run && run.pickupFilter && !run.pickupFilter[RAR.indexOf(it.rarity)]) {
        var _fcol = RARCOL[it.rarity] || '#888';
        ctx.save(); ctx.translate(it.x, it.y + bob);
        ctx.globalAlpha = 0.3; ctx.fillStyle = _fcol; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.45; ctx.strokeStyle = _fcol; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore(); continue;
      }
      // 灵蕴（经验宝石）
      if (it.type === 'xp') {
        var xpPulse = 0.55 + Math.sin(age * 6) * 0.45;
        ctx.save(); ctx.translate(it.x, it.y + bob);
        ctx.shadowColor = '#FFD25A'; ctx.shadowBlur = 16;
        ctx.fillStyle = '#FFE49A'; ctx.beginPath();
        var rs = 6 * xpPulse;
        ctx.moveTo(0, -rs); ctx.lineTo(rs * 0.9, 0); ctx.lineTo(0, rs); ctx.lineTo(-rs * 0.9, 0); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.6; ctx.strokeStyle = '#E0B84A'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(0, -rs * 1.5); ctx.lineTo(rs * 1.35, 0); ctx.lineTo(0, rs * 1.5); ctx.lineTo(-rs * 1.35, 0); ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.shadowBlur = 0; ctx.restore(); continue;
      }
      // 特殊掉落物视觉
      if (it.type === 'jade') {
        ctx.save(); ctx.translate(it.x, it.y + bob); ctx.scale(ICON_SCALE, ICON_SCALE); ctx.shadowColor = '#C9A24B'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#E8D68C'; ctx.strokeStyle = '#C9A24B'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#231a05'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('玉', 0, 0.5);
        ctx.shadowBlur = 0; ctx.restore(); continue;
      }
      if (it.type === 'consumable') {
        var cc = CONSUMABLES[it.consKey]; ctx.save(); ctx.translate(it.x, it.y + bob); ctx.shadowColor = '#7EAD9A'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#1c2e26'; ctx.strokeStyle = '#7EAD9A'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#7FB069'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cc ? cc.glyph : '丹', 0, 0.5);
        ctx.shadowBlur = 0; ctx.restore(); continue;
      }
      if (it.type === 'ore') {
        var op = 0.6 + Math.sin(age * 5) * 0.4; ctx.save(); ctx.translate(it.x, it.y + bob); ctx.scale(ICON_SCALE, ICON_SCALE); ctx.shadowColor = '#8FB0C8'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#9FB8CC'; ctx.strokeStyle = '#5E7C92'; ctx.lineWidth = 1.4; ctx.beginPath();
        for (var _k2 = 0; _k2 < 6; _k2++) { var _a2 = _k2 * Math.PI / 3 + age * 0.5, _r2 = (_k2 % 2 ? 4 : 6); if (_k2 === 0) ctx.moveTo(Math.cos(_a2) * _r2, Math.sin(_a2) * _r2); else ctx.lineTo(Math.cos(_a2) * _r2, Math.sin(_a2) * _r2); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#DCEAF5'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('矿', 0, 0.5);
        ctx.shadowBlur = 0; ctx.restore(); continue;
      }
      if (it.type === 'legendary') {
        var lpc = Math.sin(age * 5) * 0.5 + 0.5; ctx.save(); ctx.translate(it.x, it.y + bob); ctx.rotate(age);
        ctx.globalAlpha = 0.5; ctx.strokeStyle = '#E0B84A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 12 + lpc * 5, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.shadowColor = '#E0B84A'; ctx.shadowBlur = 20; ctx.fillStyle = '#FFE9A8'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(-2, -2, 2.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        ctx.shadowBlur = 0; ctx.restore(); continue;
      }
      if (it.type === 'legendary_weapon') {
        var lwpc = Math.sin(age * 3) * 0.5 + 0.5;         ctx.save(); ctx.translate(it.x, it.y + bob); ctx.scale(ICON_SCALE, ICON_SCALE);
        // 双层旋转光环
        ctx.rotate(age * 0.5); ctx.globalAlpha = 0.3; ctx.strokeStyle = '#FFE9A8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 22 + lwpc * 8, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.rotate(-age * 1.2); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#E0B84A'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 16 + lwpc * 5, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        // 八芒星
        ctx.rotate(age * 2); ctx.strokeStyle = '#FFE9A8'; ctx.lineWidth = 1.5;
        for (var sp2 = 0; sp2 < 8; sp2++) { var sa2 = sp2 * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(sa2) * 10, Math.sin(sa2) * 10); ctx.lineTo(Math.cos(sa2) * (20 + lwpc * 6), Math.sin(sa2) * (20 + lwpc * 6)); ctx.stroke(); }
        // 核心
        ctx.shadowColor = '#FFE9A8'; ctx.shadowBlur = 30; ctx.fillStyle = '#FFE9A8'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(-3, -3, 3, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        ctx.shadowBlur = 0; ctx.restore(); continue;
      }
      if (it.type === 'bossrelic') {
        var bpc = Math.sin(age * 4) * 0.5 + 0.5;         ctx.save(); ctx.translate(it.x, it.y + bob); ctx.scale(ICON_SCALE, ICON_SCALE);
        // 外层旋转光环
        ctx.rotate(age * 0.8); ctx.globalAlpha = 0.4; ctx.strokeStyle = '#FFE9A8'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 16 + bpc * 6, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        // 星芒
        ctx.rotate(-age * 1.6); ctx.strokeStyle = '#E0B84A'; ctx.lineWidth = 1.5;
        for (var sp = 0; sp < 4; sp++) { var sa = sp * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(sa) * 8, Math.sin(sa) * 8); ctx.lineTo(Math.cos(sa) * (16 + bpc * 4), Math.sin(sa) * (16 + bpc * 4)); ctx.stroke(); }
        // 核心宝石
        ctx.shadowColor = '#FFE9A8'; ctx.shadowBlur = 24; ctx.fillStyle = '#FFE9A8'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(-2.5, -2.5, 2.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        ctx.shadowBlur = 0; ctx.restore(); continue;
      }
      // 武器类战利品：用新武器等级图标替代程序化几何
      if (it.slot === 'weapon') {
        var wrow = RAR.indexOf(it.rarity); if (wrow < 0) wrow = 0;
        var wcolMap = { ballistic: 0, homing: 0, spread: 1, splash: 2, chain: 2 };
        var wcol = (it.subtype && wcolMap[it.subtype] !== undefined) ? wcolMap[it.subtype]
          : (Math.abs((it.name || '').split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0)) % 3);
        var wimg = IMG['wpn_r' + wrow + '_c' + wcol];
        var wlk = (it.rarity === 'purple' || it.rarity === 'orange') ? 'loot_rare' : 'loot_common';
        blit(wlk, it.x, it.y + bob, 26 * ICON_SCALE, 26 * ICON_SCALE, age * 0.6); // 保留发光底环
        ctx.save(); ctx.translate(it.x, it.y + bob);
        ctx.shadowColor = RARCOL[it.rarity]; ctx.shadowBlur = it.rarity === 'orange' ? 16 : (it.rarity === 'purple' ? 12 : 8);
        if (wimg && wimg.complete && wimg.naturalWidth) ctx.drawImage(wimg, -11 * ICON_SCALE, -11 * ICON_SCALE, 22 * ICON_SCALE, 22 * ICON_SCALE);
        else { ctx.fillStyle = RARCOL[it.rarity]; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); }
        ctx.shadowBlur = 0; ctx.restore();
        continue;
      }
      // 护甲/核心/弹药类战利品：用新装备等级图标替代程序化几何
      if (it.slot === 'armor' || it.slot === 'core' || it.slot === 'ammo') {
        var gimg = IMG['gear_' + it.slot + '_' + it.rarity];
        var glk = (it.rarity === 'purple' || it.rarity === 'orange') ? 'loot_rare' : 'loot_common';
        blit(glk, it.x, it.y + bob, 26 * ICON_SCALE, 26 * ICON_SCALE, age * 0.6);
        ctx.save(); ctx.translate(it.x, it.y + bob);
        ctx.shadowColor = RARCOL[it.rarity]; ctx.shadowBlur = it.rarity === 'orange' ? 16 : (it.rarity === 'purple' ? 12 : 8);
        if (gimg && gimg.complete && gimg.naturalWidth) ctx.drawImage(gimg, -11 * ICON_SCALE, -11 * ICON_SCALE, 22 * ICON_SCALE, 22 * ICON_SCALE);
        else { ctx.fillStyle = RARCOL[it.rarity]; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); }
        ctx.shadowBlur = 0; ctx.restore();
        continue;
      }
      var col = RARCOL[it.rarity];
      var rot = age * (it.rarity === 'purple' ? 1.6 : (it.rarity === 'orange' ? 1.2 : 0.8));
      var lk = (it.rarity === 'purple' || it.rarity === 'orange') ? 'loot_rare' : 'loot_common';
      if (blit(lk, it.x, it.y + bob, 22 * ICON_SCALE, 22 * ICON_SCALE, rot)) continue;
      ctx.save(); ctx.translate(it.x, it.y + bob); ctx.scale(ICON_SCALE, ICON_SCALE); ctx.rotate(rot);
      ctx.shadowColor = col; ctx.shadowBlur = it.rarity === 'orange' ? 16 : (it.rarity === 'purple' ? 12 : 8);
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1;
      if (it.rarity === 'white') {
        ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill(); ctx.stroke();
      } else if (it.rarity === 'green') {
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (it.rarity === 'blue') {
        ctx.beginPath();
        for (var s2 = 0; s2 < 6; s2++) { var a2 = Math.PI / 3 * s2 - Math.PI / 6; var px = Math.cos(a2) * 6, py = Math.sin(a2) * 6; if (s2 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (it.rarity === 'purple') {
        ctx.fillRect(-4, -7, 8, 14); ctx.strokeRect(-4, -7, 8, 14);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(4, -3); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.moveTo(-4, 3); ctx.lineTo(4, 3); ctx.stroke();
      } else { // orange 秘宝宝珠
        var op = Math.sin(age * 4) * 0.5 + 0.5;
        ctx.globalAlpha = 0.4; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 9 + op * 4, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(-1.5, -1.5, 1.8, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0; ctx.restore();
    }
  }
  function drawExtract() {
    if (!extractPoints || !extractPoints.length) return;
    // 撤离惊动圈（规则圣经模块二·2）：红=狂暴·死追，黄=波及·+1级，玩家可见
    if (exfilCenter) {
      var fr = EXFIL2.frenzy, rp = EXFIL2.ripple;
      if (exfilChoice === 'silent') { fr *= EXFIL2.silentMul; rp *= EXFIL2.silentMul; }
      ctx.save();
      ctx.strokeStyle = 'rgba(224,80,58,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(exfilCenter.x, exfilCenter.y, fr, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(224,184,74,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(exfilCenter.x, exfilCenter.y, rp, 0, 7); ctx.stroke();
      if (exfilAlarmT > 0) { var pr2 = (1.2 - exfilAlarmT) / 1.2; ctx.globalAlpha = (exfilAlarmT / 1.2) * 0.7; ctx.strokeStyle = '#7FB069'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(exfilCenter.x, exfilCenter.y, pr2 * rp, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.restore();
    }
    for (var pi = 0; pi < extractPoints.length; pi++) {
      var z = extractPoints[pi], cx = z.x + z.w / 2, cy = z.y + z.h / 2;
      if (z.state === 'open' && z.beacon) {
        // v12.6：金色光柱 beacon + 战场自毁倒计时（领主击破后）
        var prog = z.prog || 0;
        var secs = Math.ceil(run ? run.selfDestruct : (z.beaconTimer || 0));
        var pulse = 0.5 + 0.5 * Math.abs(Math.sin(gameTime * 4));
        var px0 = cx, pillarW = z.w * 0.5;
        // 冲天光柱（叠加亮色）
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var grd = ctx.createLinearGradient(px0, z.y + z.h, px0, z.y - 380);
        grd.addColorStop(0, 'rgba(255,233,168,' + (0.55 * pulse) + ')');
        grd.addColorStop(1, 'rgba(255,233,168,0)');
        ctx.fillStyle = grd; ctx.fillRect(px0 - pillarW / 2, z.y - 380, pillarW, z.h + 380);
        ctx.restore();
        // 地面金色法阵
        var gs = ctx.createRadialGradient(cx, cy, 0, cx, cy, 104);
        gs.addColorStop(0, 'rgba(255,233,168,' + (0.4 + 0.4 * prog) + ')');
        gs.addColorStop(0.6, 'rgba(201,162,75,0.3)');
        gs.addColorStop(1, 'rgba(201,162,75,0)');
        ctx.fillStyle = gs; ctx.beginPath(); ctx.arc(cx, cy, 104, 0, 7); ctx.fill();
        // 程序化金色符文环（避免依赖贴图）
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(gameTime * 0.4);
        ctx.globalAlpha = clamp(0.5 + 0.5 * prog, 0, 1); ctx.strokeStyle = '#FFE9A8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 78, 0, 7); ctx.stroke();
        for (var _rs = 0; _rs < 12; _rs++) { var _ra2 = _rs / 12 * 6.283; ctx.beginPath(); ctx.moveTo(Math.cos(_ra2) * 70, Math.sin(_ra2) * 70); ctx.lineTo(Math.cos(_ra2) * 88, Math.sin(_ra2) * 88); ctx.stroke(); }
        ctx.restore(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#FFE9A8'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('撤离点' + z.label + ' ' + Math.floor(prog * 100) + '%', cx, z.y - 14);
        ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = secs <= 10 ? '#FF6A2A' : '#E0B84A';
        ctx.fillText('战场自毁 ' + secs + 's · 冲入光柱！', cx, z.y + z.h + 18); ctx.textAlign = 'left';
        if (z.near) drawInteractLabel(cx, z.y - 32, '金色光柱 · 站定 3s 撤离', '#FFE9A8');
      } else if (z.state === 'open') {
        // 法阵贴图（青）作为撤离点主体（兼容旧计时开放逻辑）
        var prog2 = z.prog || 0;
        var sealSz = 176;
        var glowA = 0.28 + 0.4 * prog2 + Math.sin(gameTime * 3) * 0.08;
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, sealSz * 0.62);
        g.addColorStop(0, 'rgba(127,176,105,' + (glowA * 0.9) + ')');
        g.addColorStop(0.55, 'rgba(127,176,105,' + (glowA * 0.4) + ')');
        g.addColorStop(1, 'rgba(127,176,105,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, sealSz * 0.62, 0, 7); ctx.fill();
        ctx.globalAlpha = clamp(0.45 + 0.45 * prog2 + Math.sin(gameTime * 3) * 0.1, 0, 1);
        blit('seal_circle_teal', cx, cy, sealSz, sealSz, gameTime * 0.35);
        ctx.globalAlpha = 1;
        ctx.fillStyle = COL.extract; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('撤离点' + z.label + ' ' + Math.floor(prog2 * 100) + '%', cx, z.y - 12);
        ctx.font = '11px sans-serif'; ctx.fillText('开放 ' + Math.ceil(z.timer) + 's', cx, z.y + z.h + 16); ctx.textAlign = 'left';
        if (z.near) drawInteractLabel(cx, z.y - 30, '撤离点 · 站定读条撤离', '#7FB069');
      } else if (z.state === 'sealed') {
        // v12.6：封锁态——暗淡锁闭光圈 + 锁头，须击败领主才解锁
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.2 * Math.sin(gameTime * 2);
        ctx.strokeStyle = 'rgba(120,120,140,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(cx, cy, 70, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(150,150,170,0.85)'; ctx.fillRect(cx - 14, cy - 6, 28, 24);
        ctx.strokeStyle = 'rgba(150,150,170,0.85)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy - 6, 12, Math.PI, 0); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = 'rgba(175,180,195,0.95)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('相位封锁', cx, z.y - 8);
        ctx.fillText('击败关卡领主以激活撤离通道', cx, z.y + z.h + 16); ctx.textAlign = 'left';
      } else if (z.state === 'collapsed') {
        ctx.fillStyle = 'rgba(176,58,58,0.6)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('撤离通道已坍塌', cx, cy); ctx.textAlign = 'left';
      } else if (z.state === 'warning') {
        // 预兆：青色法阵极淡浮现 + 柔和光晕，逆时针微转（无虚线方框、无光柱）
        var sealSz2 = 176;
        var wg = 0.12 + 0.1 * Math.abs(Math.sin(gameTime * 8));
        var g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, sealSz2 * 0.62);
        g2.addColorStop(0, 'rgba(127,176,105,' + (wg * 0.8) + ')');
        g2.addColorStop(0.55, 'rgba(127,176,105,' + (wg * 0.35) + ')');
        g2.addColorStop(1, 'rgba(127,176,105,0)');
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx, cy, sealSz2 * 0.62, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.18 + 0.12 * Math.abs(Math.sin(gameTime * 8));
        blit('seal_circle_teal', cx, cy, sealSz2, sealSz2, -gameTime * 0.2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#E0B84A'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('撤离点' + z.label + ' 即将开放 ' + Math.ceil(z.timer) + 's', cx, z.y - 10); ctx.textAlign = 'left';
      } else {
        // 关闭：极暗静态法阵 + 暗灰光晕 + 静默倒计时（无虚框、无光柱）
        var sealSz3 = 176;
        var g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, sealSz3 * 0.62);
        g3.addColorStop(0, 'rgba(120,130,140,0.06)');
        g3.addColorStop(0.6, 'rgba(120,130,140,0.025)');
        g3.addColorStop(1, 'rgba(120,130,140,0)');
        ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(cx, cy, sealSz3 * 0.62, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.1;
        blit('seal_circle_teal', cx, cy, sealSz3, sealSz3, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(150,160,170,0.75)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('撤离点' + z.label + ' 关闭 ' + Math.ceil(z.timer) + 's', cx, z.y - 8); ctx.textAlign = 'left';
      }
    }
  }
  function drawParticles() {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < POOL; i++) {
      var p = particles[i]; if (!p.alive) continue;
      var a = clamp(p.life / p.maxLife, 0, 1);
      if (p.ring) {
        var rr = Math.max(0, p.r0 + (p.rmax - p.r0) * (1 - a));
        ctx.globalAlpha = a * 0.8; ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, 3 * a);
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.stroke();
      } else {
        if (p.len > 0) {
          // 动态尾焰拉伸：高速时粒子沿运动方向拉长成流线
          var _pa = Math.atan2(p.vy, p.vx), _px = Math.cos(_pa), _py = Math.sin(_pa);
          ctx.globalAlpha = a * 0.85; ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.r);
          ctx.lineCap = 'round'; ctx.beginPath();
          ctx.moveTo(p.x - _px * p.len, p.y - _py * p.len);
          ctx.lineTo(p.x + _px * p.len * 0.3, p.y + _py * p.len * 0.3); ctx.stroke();
        } else {
          ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (var f = 0; f < FPOOL; f++) {
      var fl = floaters[f]; if (!fl.alive) continue;
      var fa = clamp(fl.life / fl.maxLife, 0, 1);
      ctx.globalAlpha = fa; ctx.textAlign = 'center';
      if (fl.style === 'crit') {
        var sc = 1.0 + 0.3 * fa; ctx.save(); ctx.translate(fl.x, fl.y); ctx.scale(sc, sc);
        ctx.font = 'bold 20px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.fillStyle = fl.color;
        ctx.strokeText(fl.text, 0, 0); ctx.fillText(fl.text, 0, 0); ctx.restore();
      } else if (fl.style === 'heal') {
        ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = fl.color; ctx.fillText(fl.text, fl.x, fl.y);
      } else {
        ctx.font = '14px sans-serif'; ctx.fillStyle = fl.color; ctx.fillText(fl.text, fl.x, fl.y);
      }
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  // 背包槽位（左上·相位卡下方）：显示当前携带的战利品，桌面可点选丢弃
  function drawBackpack() {
    bpSlotRects = [];
    if (isMobile) return; // 移动端减负：战利品数量已在右上状态面板显示，背包详情由 🎒 按钮浮层查看
    // 桌面：4×2 竖排于右侧（红line：背包移至右侧，解放左上与左下空间）
    var cols = isMobile ? 8 : 4, s = isMobile ? 22 : 26, g = isMobile ? 3 : 5;
    // 紧跟小地图底部：小地图顶(78+SA.t)+高(mh,镜像drawMinimap)+8px间隙
    var _mmw = 150, _mmh = Math.round(_mmw * WORLD_H / WORLD_W);
    var bx = W - cols * (s + g) - 14 - SA.r, by = (78 + SA.t) + _mmh + 8;
    ctx.fillStyle = '#C9A24B'; ctx.font = 'bold ' + (isMobile ? 10 : 12) + 'px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('背包 ' + run.loot.length + '/' + invMax, bx, by - 5);
    for (var i = 0; i < invMax; i++) {
      var cx = bx + (i % cols) * (s + g);
      var cy = by + Math.floor(i / cols) * (s + g);
      ctx.fillStyle = 'rgba(16,13,9,0.72)'; ctx.strokeStyle = 'rgba(201,162,75,0.45)'; ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx, cy, s, s, 5); ctx.fill(); ctx.stroke(); } else { ctx.fillRect(cx, cy, s, s); ctx.strokeRect(cx, cy, s, s); }
      if (i < run.loot.length) {
        var it = run.loot[i];
        var col = RARCOL[it.rarity] || '#fff';
        ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = col;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx + 3, cy + 3, s - 6, s - 6, 3); ctx.fill(); } else { ctx.fillRect(cx + 3, cy + 3, s - 6, s - 6); }
        ctx.restore();
        ctx.fillStyle = '#0E0B08'; ctx.font = 'bold ' + Math.floor(s * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(it.name.charAt(0), cx + s / 2, cy + s / 2); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      }
      bpSlotRects.push({ x: cx, y: cy, w: s, h: s, idx: i });
    }
  }
  function drawMinimap() {
    var mw = isMobile ? 80 : 150, mh = Math.round(mw * WORLD_H / WORLD_W), mx = W - mw - 14 - SA.r, my = 78 + SA.t; // 紧跟战利品面板底部(10+SA.t+60)+8px间隙；移动端同位（v3上移至极简相位条下方）
    // 暗金圆角容器（与左侧血条/相位面板同风格：圆角 + 暗金描边 + 外投影 + 内辉光）
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(18,14,10,0.75)';
    roundRectPath(ctx, mx, my, mw, mh, 8); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(201,162,75,0.4)'; ctx.lineWidth = 1;
    roundRectPath(ctx, mx, my, mw, mh, 8); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,162,75,0.1)'; ctx.lineWidth = 1;
    roundRectPath(ctx, mx + 1, my + 1, mw - 2, mh - 2, 7); ctx.stroke();
    roundRectPath(ctx, mx, my, mw, mh, 8); ctx.clip();
    var sx = mw / WORLD_W, sy = mh / WORLD_H;
    // 空域：小地图仅显示节点/撤离点/宝箱（无设施结构）
    for (var i = 0; i < nodes.length; i++) { var nd = nodes[i]; if (nd.collected) continue; ctx.fillStyle = CHESTS[nd.chest].color; ctx.fillRect(mx + nd.x * sx - 2, my + nd.y * sy - 2, 4, 4); }
    // 裂隙入口（主图紫色❓）/ 子图房间缩略
    if (!inRift) {
      for (var ri2 = 0; ri2 < rifts.length; ri2++) { var rf2 = rifts[ri2]; if (rf2.state !== 'idle') continue; ctx.fillStyle = '#B06FD0'; ctx.fillRect(mx + rf2.x * sx - 2, my + rf2.y * sy - 2, 4, 4); ctx.fillStyle = '#E0C8FF'; ctx.font = (isMobile ? 7 : 10) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('❓', mx + rf2.x * sx, my + rf2.y * sy - 4); ctx.textAlign = 'left'; }
    } else if (riftRect) {
      var RR = riftRect;
      ctx.strokeStyle = 'rgba(176,111,208,0.7)'; ctx.strokeRect(mx + RR.RX * sx, my + RR.RY * sy, RR.RW * sx, RR.RH * sy);
      ctx.fillStyle = '#5FFFD0'; ctx.fillRect(mx + player.x * sx - 1.5, my + player.y * sy - 1.5, 3, 3);
      for (var ei3 = 0; ei3 < enemies.length; ei3++) { ctx.fillStyle = '#E0503A'; ctx.fillRect(mx + enemies[ei3].x * sx - 1, my + enemies[ei3].y * sy - 1, 2, 2); }
      if (riftExit) { ctx.fillStyle = '#B06FD0'; ctx.fillRect(mx + riftExit.x * sx - 2, my + riftExit.y * sy - 2, 4, 4); }
      if (riftHidden && !riftHidden.taken) { ctx.fillStyle = '#C79BE8'; ctx.fillRect(mx + riftHidden.x * sx - 1.5, my + riftHidden.y * sy - 1.5, 3, 3); }
    }
    if (extractPoints) for (var mpi = 0; mpi < extractPoints.length; mpi++) {
      var mz = extractPoints[mpi];
      var pulse = 1.4 + Math.sin(gameTime * 5) * 0.9; // 呼吸脉冲，撤离点更醒目
      var mc;
      if (mz.state === 'sealed') mc = 'rgba(120,120,140,0.6)';
      else if (mz.beacon) mc = (Math.sin(gameTime * 7) > 0 ? '#FFE9A8' : '#E0B84A'); // v12.6：beacon 金色闪烁
      else if (mz.state === 'open') mc = COL.extract;
      else if (mz.state === 'warning') mc = '#E0B84A';
      else mc = 'rgba(120,130,140,0.85)';
      ctx.fillStyle = mc;
      ctx.fillRect(mx + mz.x * sx - pulse * 0.5, my + mz.y * sy - pulse * 0.5, mz.w * sx + pulse, mz.h * sy + pulse);
    }
    for (var oi = 0; oi < obstacles.length; oi++) { var ob = obstacles[oi]; ctx.fillStyle = ob.type === 'rock' ? 'rgba(150,160,175,0.9)' : (ob.type === 'wall' ? 'rgba(120,130,145,0.9)' : 'rgba(176,111,208,0.9)'); var os = ob.type === 'rock' ? 3 : (ob.type === 'wall' ? 7 : 2.5); if (ob.type === 'wall') ctx.fillRect(mx + (ob.x - ob.hw) * sx, my + (ob.y - ob.hh) * sy, ob.hw * 2 * sx, ob.hh * 2 * sy); else ctx.fillRect(mx + ob.x * sx - os / 2, my + ob.y * sy - os / 2, os, os); }
    // 灵脉（v11）：菱形点，就绪显元素色 / 冷却显灰
    for (var gv = 0; gv < veins.length; gv++) {
      var vn = veins[gv]; ctx.save(); ctx.translate(mx + vn.x * sx, my + vn.y * sy); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = vn.cd <= 0 ? (ELEMCOL[vn.elem] || '#C9A24B') : 'rgba(130,135,140,0.8)';
      ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore();
    }
    // #381-⑤ 相位柱小地图标记（金/余烬菱形，未进圈也可见柱位，提升存在感）
    for (var _pmi = 0; _pmi < phasePillars.length; _pmi++) {
      var _pm = phasePillars[_pmi];
      ctx.save(); ctx.translate(mx + _pm.x * sx, my + _pm.y * sy); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = _pm.affinity === PHASE.EMBER ? 'rgba(200,100,42,0.95)' : 'rgba(201,162,75,0.95)';
      ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore();
    }
    // 撤离惊动圈（小地图红/黄）
    if (exfilCenter) {
      var mfr = EXFIL2.frenzy, mrp = EXFIL2.ripple; if (exfilChoice === 'silent') { mfr *= EXFIL2.silentMul; mrp *= EXFIL2.silentMul; }
      ctx.strokeStyle = 'rgba(224,80,58,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mx + exfilCenter.x * sx, my + exfilCenter.y * sy, mfr * sx, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(224,184,74,0.55)'; ctx.beginPath(); ctx.arc(mx + exfilCenter.x * sx, my + exfilCenter.y * sy, mrp * sx, 0, 7); ctx.stroke();
    }
    for (var vi2 = 0; vi2 < vaults.length; vi2++) { var vz = vaults[vi2]; if (vz.state === 'done') continue; ctx.fillStyle = vz.type === 'seal' ? '#E0B84A' : '#B06FD0'; ctx.save(); ctx.translate(mx + vz.x * sx, my + vz.y * sy); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
    for (var ti2 = 0; ti2 < totems.length; ti2++) { var tz = totems[ti2]; if (tz.dead) continue; ctx.fillStyle = '#C79BE8'; ctx.fillRect(mx + tz.x * sx - 1.5, my + tz.y * sy - 1.5, 3, 3); }
    if (boss) { ctx.fillStyle = '#B37FD0'; ctx.beginPath(); ctx.arc(mx + boss.x * sx, my + boss.y * sy, 4, 0, 7); ctx.fill(); }
    // 地面战利品（Boss遗物用金色星标）
    for (var li = 0; li < loot.length; li++) { if (loot[li].type === 'bossrelic') { ctx.fillStyle = '#FFE9A8'; ctx.beginPath(); ctx.arc(mx + loot[li].x * sx, my + loot[li].y * sy, 3, 0, 7); ctx.fill(); } }
    ctx.fillStyle = COL.enemy; for (var e = 0; e < enemies.length; e++) ctx.fillRect(mx + enemies[e].x * sx - 1, my + enemies[e].y * sy - 1, 2, 2);
    ctx.fillStyle = COL.player; ctx.beginPath(); ctx.arc(mx + player.x * sx, my + player.y * sy, 3, 0, 7); ctx.fill();
    ctx.restore(); // 结束圆角裁剪 + 容器上下文
  }
  function drawConsumables() {
    var n = 3, size = isMobile ? 30 : 38, gap = isMobile ? 6 : 10, totalW = n * size + (n - 1) * gap;
    // 5锚点之「底部居中·战术道具区」：水平居中浮动，避开底部系统小白条/手势条
    var bx = (W - totalW) / 2;                              // 水平居中
    var by = H - size - (isMobile ? 24 + SA.b : 16);        // 避开底部安全区
    for (var i = 0; i < n; i++) {
      var x = bx + i * (size + gap);
      var key = player.consumables[i];
      var active = !!key; // 持有丹药的槽视为 active（亮金描边 + 外微光 + 内辉光）
      ctx.save();
      // 暗金圆角卡槽（同血条面板风格）
      ctx.fillStyle = active ? 'rgba(20,15,9,0.82)' : 'rgba(0,0,0,0.5)';
      roundRectPath(ctx, x, by, size, size, 6); ctx.fill();
      if (active) { ctx.shadowColor = 'rgba(255,215,0,0.3)'; ctx.shadowBlur = 6; }
      ctx.strokeStyle = active ? '#FFD700' : 'rgba(201,162,75,0.35)';
      ctx.lineWidth = active ? 1.6 : 1;
      roundRectPath(ctx, x, by, size, size, 6); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.strokeStyle = active ? 'rgba(255,215,0,0.2)' : 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      roundRectPath(ctx, x + 1, by + 1, size - 2, size - 2, 5); ctx.stroke();
      if (key) {
        var c = CONSUMABLES[key];
        if (!blit('con_' + key, x + size / 2, by + size / 2 - 4, size - 12, size - 12, 0)) {
          ctx.fillStyle = '#D9B64A'; ctx.font = 'bold ' + (isMobile ? 14 : 18) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(c.glyph, x + size / 2, by + size / 2 - 4); ctx.textBaseline = 'alphabetic';
        }
        ctx.fillStyle = '#E8DCC4'; ctx.font = (isMobile ? 9 : 10) + 'px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(c.name, x + size / 2, by + size - 5); ctx.textAlign = 'left';
      }
      ctx.restore();
    }
    if (!isMobile) { ctx.fillStyle = '#8B95A0'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Q 键使用丹药', bx + totalW / 2, by - 4); ctx.textAlign = 'left'; }
  }
  // ===== 互动物·靠近提示 + 触发反馈 统一系统（§P1）=====
  // affordR：进入此半径即视为“可交互”→ 辉光/脉动加强 + 悬停标签
  var AFFORD_R = 82;
  var nearHover = null; // 最近的可交互物 { type, x, y, label, r }
  var bpSlotRects = []; // 背包槽位屏幕矩形（用于点击丢弃命中检测）

  // 悬停提示标签：精炼描边底框 + 文字（置于物体上方）
  function drawInteractLabel(x, y, text, col) {
    try {
      // #389 顶部安全区：物体太靠屏幕顶部时，标签往物体下方 8px 偏移，避免与 top banner 槽互压
      // x/y 在 drawExtract/drawPhaseObjects 等调用时已是世界坐标（ctx 已 translate -cam），
      // 屏幕 Y = worldY - cam.y；为安全把"距屏幕顶部 50px 以内"的标签往下挪 8px
      try {
        var _syLbl = y - cam.y;
        if (_syLbl < 50) y += (50 - _syLbl) + 8;
      } catch (e) { /* cam 不可用时忽略 */ }
      ctx.save();
      ctx.font = 'bold 13px sans-serif';
      var w = ctx.measureText(text).width;
      var padX = 12, bh = 26, bw = w + padX * 2, bx = x - bw / 2, by = y - bh / 2;
      ctx.fillStyle = 'rgba(16,13,9,0.82)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 13); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh); }
      ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.5);
      ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } catch (e) {}
  }

  // 每帧收集可交互物清单 + 作用半径，标记 near 并选出最近者（HUD 单行提示用）
  function updateInteractHints() {
    try {
      nearHover = null;
      for (var i = 0; i < phasePillars.length; i++) phasePillars[i].near = false;
      for (var j = 0; j < gravityRifts.length; j++) gravityRifts[j].near = false;
      if (secretVault) secretVault.near = false;
      if (extractPoints) for (var k = 0; k < extractPoints.length; k++) extractPoints[k].near = false;
      var best = 1e9, bestObj = null;
      var consider = function (type, obj, x, y, label, r) {
        var d = Math.hypot(player.x - x, player.y - y);
        if (d < (r || AFFORD_R)) {
          obj.near = true;
          if (d < best) { best = d; bestObj = { type: type, x: x, y: y, label: label, r: r || AFFORD_R }; }
        }
      };
      for (var pi = 0; pi < phasePillars.length; pi++) {
        var p = phasePillars[pi], ready = p.overloadCd <= 0;
        // #381-⑤ 充能引导：互动物标签追加实时充能百分比（柱顶进度环之外，HUD 单行提示也可见）
        var _pLabel = ready ? ('相位柱 · ' + (p.affinity === PHASE.EMBER ? '余烬' : '鎏金') + '相站圈充能→过载脉冲') : ('相位柱过载冷却 ' + Math.ceil(p.overloadCd) + 's');
        if (ready && p.charge > 0) _pLabel += ' · 充能 ' + Math.floor(p.charge) + '%';
        consider('pillar', p, p.x, p.y, _pLabel, AFFORD_R);
      }
      for (var gi = 0; gi < gravityRifts.length; gi++) {
        var g = gravityRifts[gi];
        consider('rift', g, g.x, g.y, '引力裂隙 · 站入被吞噬 → 反夺全厅战利品+开秘库（持续受伤）', AFFORD_R);
      }
      if (secretVault && !secretVault.opened) consider('vault', secretVault, secretVault.x, secretVault.y, '磁锁秘库 · 投喂装备或灵玉借力开门（高概率高品质）', AFFORD_R);
      if (extractPoints) for (var ei = 0; ei < extractPoints.length; ei++) {
        var z = extractPoints[ei];
        if (z.state === 'open' && emberOpenWindow > 0) consider('extract', z, z.x + z.w / 2, z.y + z.h / 2, '撤离点 · 站定读条撤离', AFFORD_R);
      }
      nearHover = bestObj;
    } catch (e) {}
  }

  // 引力裂缝·向心吸力粒子（复用粒子池，紫色 #B06FD0）+ 核心每 0.2s 撕裂真伤（v12）+ 余烬相炽热拖尾
  function updatePhaseAmbient() {
    try {
      for (var gi = 0; gi < gravityRifts.length; gi++) {
        var g = gravityRifts[gi];
        var a = rand(0, 6.28), sp = rand(40, 70);
        var sx = g.x + Math.cos(a) * g.r * 0.95, sy = g.y + Math.sin(a) * g.r * 0.95;
        spawnParticle({ x: sx, y: sy, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp, life: rand(0.3, 0.55), color: '#B06FD0', r: rand(1.3, 2.4) });
        // 虚空微粒螺旋（外圈更密，强化黑洞感）
        if (Math.random() < 0.5) {
          var a2 = rand(0, 6.28), rr = g.pull * (0.5 + Math.random() * 0.45);
          spawnParticle({ x: g.x + Math.cos(a2) * rr, y: g.y + Math.sin(a2) * rr, vx: -Math.cos(a2) * 30, vy: -Math.sin(a2) * 30, life: rand(0.4, 0.8), color: '#C79BE8', r: rand(1, 2) });
        }
        // 核心撕裂真伤（每 0.2s）：玩家与敌机近核心持续掉血 + 白光闪烁
        g.tearT -= dt;
        if (g.tearT <= 0) {
          g.tearT = 0.2;
          var dp = Math.hypot(player.x - g.x, player.y - g.y);
          if (dp < g.core + player.r) {
            player.hp -= (hasAffix('gravity_surge') ? GRAV_TEAR_DMG * 1.5 : GRAV_TEAR_DMG); player.flash = Math.max(player.flash || 0, 0.08); // 深渊异变·引力潮涌：核心撕裂伤害+50%
            burst(player.x, player.y, '#C79BE8', 5, { smin: 30, smax: 100 });
            if (player.hp <= 0) { player.hp = 0; burst(player.x, player.y, player.color, 16); addShake(6, 260, 120, true); AudioSys.sfx.playerDie(); if (inRift) dieInRift(); else finishRun('death'); }
          }
          for (var _te = enemies.length - 1; _te >= 0; _te--) {
            var _ee = enemies[_te];
            if (_ee.wake > 0) continue;
            if (Math.hypot(_ee.x - g.x, _ee.y - g.y) < g.core + _ee.r) {
              _ee.hp -= (hasAffix('gravity_surge') ? GRAV_TEAR_DMG * 1.5 : GRAV_TEAR_DMG); _ee.flash = 0.08; _ee.hitT = 0.1; _ee.hitMag = 2; // 深渊异变·引力潮涌：核心撕裂伤害+50%
              burst(_ee.x, _ee.y, '#C79BE8', 4, { smin: 30, smax: 90 });
              if (_ee.hp <= 0) { bountyProgress('riftTear', 1); onEnemyDeath(_ee, true); }
            }
          }
        }
      }
      // 余烬相：玩家周身炽热粒子拖尾（沉浸反馈）
      if (phase === PHASE.EMBER && player && player.hp > 0) {
        if (Math.random() < 0.6) {
          var _pa = rand(0, 6.28), _pr = rand(18, 34);
          spawnParticle({ x: player.x + Math.cos(_pa) * _pr, y: player.y + Math.sin(_pa) * _pr, vx: -Math.cos(_pa) * 20 + rand(-8, 8), vy: -Math.sin(_pa) * 20 + rand(-8, 8), life: rand(0.3, 0.6), color: '#E0702A', r: rand(1.5, 3) });
        }
      }
    } catch (e) {}
  }

  function drawPhaseObjects() {
    // ---- 引力裂隙：精细“吞噬漩涡”（多层旋转螺旋臂 + 径向辉光 + 向心吸力粒子）----
    for (var gi = 0; gi < gravityRifts.length; gi++) {
      var g = gravityRifts[gi];
      var near = g.near, boost = near ? 1.4 : 1;
      var pullR = g.pull * (0.92 + Math.sin(gameTime * 1.5 + gi) * 0.04);
      var coreR = g.core * (1 + Math.sin(gameTime * 3 + gi) * 0.08);
      ctx.save(); ctx.translate(g.x, g.y);
      // 牵引半径淡环（让玩家感知吸附范围）
      ctx.globalAlpha = 0.07 * boost; ctx.strokeStyle = '#B06FD0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, pullR, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      // 径向辉光（呼吸光晕）
      var halo = 0.5 + 0.5 * Math.sin(gameTime * 2 + gi);
      var gg = ctx.createRadialGradient(0, 0, coreR * 0.6, 0, 0, pullR);
      gg.addColorStop(0, 'rgba(176,111,208,' + (0.20 * boost) + ')');
      gg.addColorStop(0.4, 'rgba(140,80,200,' + (0.30 * boost) + ')');
      gg.addColorStop(0.7, 'rgba(90,40,140,' + (0.16 * boost) + ')');
      gg.addColorStop(1, 'rgba(40,10,60,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, pullR, 0, 7); ctx.fill();
      // 吸积盘（双层反向旋转亮环，加法发光）
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var disk = 0; disk < 2; disk++) {
        ctx.rotate((disk === 0 ? gameTime * 2.4 : -gameTime * 1.6));
        ctx.strokeStyle = disk === 0 ? 'rgba(220,170,255,0.9)' : 'rgba(150,90,220,0.7)';
        ctx.lineWidth = disk === 0 ? 3 : 2;
        ctx.beginPath();
        for (var t = 0; t <= 1.0001; t += 0.04) {
          var rad = coreR * 1.4 + (pullR * 0.5) * t, ang = t * (disk === 0 ? 7.0 : -5.0) + disk * 1.5;
          var px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
          if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      // 螺旋光轨（虚空微粒拖尾）
      ctx.save(); ctx.rotate(gameTime * 1.1);
      ctx.strokeStyle = 'rgba(199,155,232,' + (0.55 * boost) + ')'; ctx.lineWidth = 1.4;
      for (var arm = 0; arm < 3; arm++) {
        var a0 = arm * (Math.PI * 2 / 3);
        ctx.beginPath();
        for (var t3 = 0; t3 <= 1.0001; t3 += 0.05) {
          var rad3 = coreR * 1.2 + (pullR - coreR * 1.2) * t3, ang3 = a0 + t3 * 4.2, px3 = Math.cos(ang3) * rad3, py3 = Math.sin(ang3) * rad3;
          if (t3 === 0) ctx.moveTo(px3, py3); else ctx.lineTo(px3, py3);
        }
        ctx.stroke();
      }
      ctx.restore();
      // 核心暗口（紫黑能量球 + 高斯模糊感：多层渐隐同心圆）
      var cg = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 1.6);
      cg.addColorStop(0, 'rgba(8,2,14,0.95)');
      cg.addColorStop(0.6, 'rgba(40,12,60,0.7)');
      cg.addColorStop(1, 'rgba(120,60,180,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, coreR * 1.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(12,4,22,0.96)'; ctx.beginPath(); ctx.arc(0, 0, coreR, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(220,170,255,' + (0.6 + 0.4 * halo) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, coreR, 0, 7); ctx.stroke();
      ctx.restore();
      if (near) drawInteractLabel(g.x, g.y - pullR - 12, '引力裂缝 · 站入被吞噬(冲刺挣脱) 核心撕裂真伤', '#C79BE8');
    }
    // ---- 相位柱：真精灵 terminal_active/idle + 状态描边 + 辉光 + 底部投影 ----
    for (var pi = 0; pi < phasePillars.length; pi++) {
      var p = phasePillars[pi];
      var ready = p.overloadCd <= 0;
      var col = p.affinity === PHASE.EMBER ? '#C8642A' : '#C9A24B';
      var near = p.near;
      var charging = p.overloadCd <= 0 && phase === p.affinity && Math.hypot(player.x - p.x, player.y - p.y) < PILLAR_CHARGE_R;
      var sz = 60 * (near ? 1.06 : 1);
      // 充能八卦光圈（同相站圈 160px + 流动符文）
      if (p.overloadCd <= 0) {
        ctx.save(); ctx.translate(p.x, p.y);
        var baguaA = (phase === p.affinity) ? 0.55 : 0.2;
        ctx.globalAlpha = baguaA * (0.7 + 0.3 * Math.sin(gameTime * 3 + pi));
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -gameTime * 30;
        ctx.beginPath(); ctx.arc(0, 0, PILLAR_CHARGE_R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        for (var _ru = 0; _ru < 8; _ru++) {
          var _ra = _ru / 8 * 6.283 + gameTime * 0.8, _rx = Math.cos(_ra) * PILLAR_CHARGE_R, _ry = Math.sin(_ra) * PILLAR_CHARGE_R;
          ctx.globalAlpha = baguaA; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(_rx, _ry, 2.4, 0, 7); ctx.fill();
        }
        ctx.restore(); ctx.globalAlpha = 1;
      }
      // 过载熄灭冷却：暗化
      if (p.overloadCd > 0) { ctx.save(); ctx.globalAlpha = 0.4; }
      // 底部椭圆投影
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.globalAlpha *= 0.32; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 30, 26, 11, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
      // 状态描边圈 + 辉光（glowOn 时更强）
      ctx.save(); ctx.translate(p.x, p.y);
      if (glowOn) { ctx.shadowColor = col; ctx.shadowBlur = (ready ? 16 : 8) * (near ? 1.8 : 1); }
      ctx.strokeStyle = col; ctx.lineWidth = near ? 4 : 2.5; ctx.beginPath(); ctx.arc(0, 0, sz * 0.5 + 4, 0, 7); ctx.stroke();
      ctx.restore();
      // 真精灵（资源未就绪自动回退到精细几何柱）
      if (!blit(ready ? 'terminal_active' : 'terminal_idle', p.x, p.y, sz, sz, 0)) {
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.fillStyle = 'rgba(20,16,10,0.85)'; ctx.beginPath(); ctx.arc(0, 0, sz * 0.42, 0, 7); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, sz * 0.42, 0, 7); ctx.stroke();
        ctx.restore();
      }
      // 充能进度环（柱顶 0~100%）
      if (p.overloadCd <= 0 && p.charge > 0) {
        ctx.save(); ctx.translate(p.x, p.y - sz * 0.5 - 12);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 14, -Math.PI / 2, -Math.PI / 2 + (p.charge / 100) * 6.283); ctx.stroke();
        ctx.fillStyle = col; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(Math.floor(p.charge) + '%', 0, 0);
        ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      // 充能闪电链 玩家↔柱（加法发光）
      if (charging && Math.random() < 0.6) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(player.x, player.y);
        var segs = 5; for (var _s = 1; _s < segs; _s++) { var _tt = _s / segs; var _lx = player.x + (p.x - player.x) * _tt + rand(-12, 12), _ly = player.y + (p.y - player.y) * _tt + rand(-12, 12); ctx.lineTo(_lx, _ly); }
        ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      }
      if (p.overloadCd > 0) ctx.restore(); // 关闭暗化 save
      if (near) drawInteractLabel(p.x, p.y - sz * 0.5 - 26, ready ? ('相位柱·' + (p.affinity === PHASE.EMBER ? '余烬' : '鎏金') + '相站圈充能→过载脉冲') : ('相位柱过载冷却 ' + Math.ceil(p.overloadCd) + 's'), col);
    }
    // ---- 磁锁秘库：真精灵 vault_door + 状态着色 + 辉光 + 已开脉动 ----
    if (secretVault) {
      var sv = secretVault, opened = sv.opened;
      var svcol = opened ? '#7FB069' : '#E0B84A';
      var near = sv.near;
      var pulse = opened ? (1 + Math.sin(gameTime * 4) * 0.04) : 1;
      var svsz = 56 * pulse * (near ? 1.06 : 1);
      // 投影
      ctx.save(); ctx.translate(sv.x, sv.y);
      ctx.globalAlpha = 0.32; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 28, 24, 10, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
      // 状态描边 + 辉光
      ctx.save(); ctx.translate(sv.x, sv.y);
      if (glowOn) { ctx.shadowColor = svcol; ctx.shadowBlur = (opened ? 14 : 12) * (near ? 1.8 : 1); }
      ctx.strokeStyle = svcol; ctx.lineWidth = near ? 4 : 2.5; ctx.beginPath(); ctx.arc(0, 0, svsz * 0.5 + 4, 0, 7); ctx.stroke();
      ctx.restore();
      // 真精灵（回退到精细几何秘库）
      if (!blit('vault_door', sv.x, sv.y, svsz, svsz, 0)) {
        ctx.save(); ctx.translate(sv.x, sv.y);
        ctx.fillStyle = 'rgba(20,16,10,0.85)'; ctx.beginPath(); ctx.arc(0, 0, svsz * 0.42, 0, 7); ctx.fill();
        ctx.strokeStyle = svcol; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, svsz * 0.42, 0, 7); ctx.stroke();
        ctx.restore();
      }
      // 状态文字
      ctx.save(); ctx.fillStyle = svcol; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(opened ? '已开' : '秘库', sv.x, sv.y); ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (near) drawInteractLabel(sv.x, sv.y - svsz * 0.5 - 14, opened ? '磁锁秘库 · 已开启' : '磁锁秘库 · 吞噬开门（代价: 芯片伤 / 弃装）', svcol);
    }
    // Boss 仇恨集中指示（余烬相主动翻 / 相位柱拉仇恨，§7.11-7）
    if (aggroT > 0 && aggroRadius > 0) {
      var _ax = aggroFollow ? player.x : aggroX, _ay = aggroFollow ? player.y : aggroY;
      ctx.save(); ctx.strokeStyle = 'rgba(224,79,79,' + (0.3 + 0.25 * Math.sin(gameTime * 8)) + ')'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(_ax, _ay, aggroRadius, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }
  }
  function drawHUD() {
    // ===== 5 锚点分区（屏幕自适应 v13）=====
    // 【左上角·机体状态区】暂停按钮 + 血条面板 + 相位倒计时（内嵌 Safe Area Inset 左/上）
    // 【右上角·情报雷达区】小地图 + 顶部资源简报（紧贴 Safe Area 右/上）
    // 【左下角·机动走位区】纯净开阔，仅用于移动摇杆触摸感应
    // 【右下角·战斗操作区】双摇杆开火/拾取主键 + 冲刺/翻相/绝技/背包战术技能扇面
    // 【底部居中·战术道具区】3 道具/丹药卡槽水平居中浮动（避开底部系统小白条）
    function hp(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke(); }
    // 竖屏（窄长屏）适配：收窄右上信息列各卡片，避免占满窄屏宽度
    var P = isMobile && window.innerHeight > window.innerWidth;
    var lootVal = run.loot.reduce(function (s, it) { return s + RARVAL[RAR.indexOf(it.rarity)]; }, 0);
    // 机体状态面板定位（2026-08-19 红line：左上角统一堆叠，左下角彻底清空留给虚拟摇杆）
    var lpW = isMobile ? 176 : 200, lpH = 92;
    var lpX = 16 + SA.l;
    var lpY = (isMobile ? 46 : 16) + SA.t; // 移动端让出最左上角暂停微按钮的 6~38px 区
    // 顶部信息堆栈：Boss条→撤离点→灵潮连击→幕章→banner队列
    // #389 调整：top banner 槽独立占据 12+SA.t ~ 12+SA.t+64 区，
    // 已有顶部信息堆栈（boss/extract/combo/act）整体下移到 12+SA.t+64 后开始，
    // 避免与战局重要 top banner 互压
    var _sy = 12 + SA.t + 64;
    function _slot(h) { var y = _sy; _sy += h + 8; return y; }
    var _bossY = boss ? _slot(30) : -1;
    var _extOpen = [], _extWarn = [];
    if (extractPoints && extractPoints.length) { for (var zz2 = 0; zz2 < extractPoints.length; zz2++) { var p2 = extractPoints[zz2]; if (p2.state === 'open') _extOpen.push(p2); else if (p2.state === 'warning') _extWarn.push(p2); } }
    var _extY = (_extOpen.length || _extWarn.length) ? _slot(22) : -1;
    var _comboY = (player && player.combo >= 3) ? _slot(21) : -1;
    var _actY = _slot(20);
    // _bannerTop 已废弃：banner 移至底部居中（见 drawHUD 尾部）
    // 顶部：撤离点开放状态（一级危险/时机信息：保留高对比，尺寸微收）
    if (_extY >= 0) {
      var openZ = _extOpen, warnZ = _extWarn;
      if (openZ.length) {
        var ot = openZ.map(function (q) { var t = q.beacon ? Math.ceil(run.selfDestruct) : Math.ceil(q.timer); return (q.beacon ? '⚠ 战场自毁 ' + t + 's · 冲入光柱撤离' : '撤离点' + q.label + ' 开放 ' + t + 's'); }).join('   ·   ');
        ctx.font = 'bold 12px sans-serif'; var ow = ctx.measureText(ot).width;
        ctx.fillStyle = 'rgba(16,13,9,0.72)'; ctx.strokeStyle = 'rgba(127,176,105,0.55)'; ctx.lineWidth = 1;
        hp(W / 2 - ow / 2 - 12, _extY, ow + 24, 22, 11);
        ctx.fillStyle = COL.extract; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(ot, W / 2, _extY + 15); ctx.textAlign = 'left';
      } else if (warnZ.length) {
        var wt = warnZ.map(function (q) { return '撤离点' + q.label + ' ' + Math.ceil(q.timer) + 's 后开放'; }).join('   ·   ');
        ctx.font = 'bold 11px sans-serif'; var ww = ctx.measureText(wt).width;
        ctx.fillStyle = 'rgba(16,13,9,0.7)'; ctx.strokeStyle = 'rgba(201,162,75,0.55)'; ctx.lineWidth = 1;
        hp(W / 2 - ww / 2 - 12, _extY, ww + 24, 20, 10);
        ctx.fillStyle = '#D9B64A'; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(wt, W / 2, _extY + 14); ctx.textAlign = 'left';
      }
    }
    // 起承转合·幕章标识（二级信息：缩小 + 半透明弱化，不抢战斗焦点）
    {
      var _ai = ({ qi: ['起', '潜入搜刮', '#E8DCC4'], cheng: ['承', '积累·裂隙', '#C9A24B'], zhuan: ['转', '围猎·狂暴', '#C8642A'], he: ['合', '终局·穷奇', '#C94F4F'] })[runPhase] || ['起', '潜入搜刮', '#E8DCC4'];
      var _aw = 118, _ax = W / 2 - _aw / 2, _ay = _actY, _ah = 20;
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = 'rgba(16,13,9,0.42)'; ctx.strokeStyle = _ai[2]; ctx.lineWidth = 1;
      hp(_ax, _ay, _aw, _ah, 10);
      ctx.fillStyle = _ai[2]; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('第 ' + _ai[0] + ' 幕 · ' + _ai[1], W / 2, _ay + 14); ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    // 灵潮连击计数（二级信息：缩小 + 半透明弱化；连击数随连击弹跳）
    if (player.combo >= 3) {
      var _cpct = Math.min(COMBO_DMG_CAP, player.combo * COMBO_DMG_PER);
      var _ccol = player.combo >= 50 ? '#C8642A' : (player.combo >= 25 ? '#D9B64A' : '#B8AE98');
      var _cscale = Math.min(1.15, 1 + (player.combo % 10) * 0.02);
      ctx.save(); ctx.translate(W / 2, _comboY + 8); ctx.scale(_cscale, _cscale); ctx.globalAlpha = 0.72;
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      var _ct = '灵潮 ×' + player.combo + ' · 伤害 +' + Math.round(_cpct * 100) + '%';
      var _ctw = ctx.measureText(_ct).width;
      ctx.fillStyle = 'rgba(16,13,9,0.35)'; ctx.fillRect(-_ctw / 2 - 9, -10, _ctw + 18, 16);
      ctx.fillStyle = _ccol; ctx.strokeStyle = 'transparent'; ctx.fillText(_ct, 0, 2);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // 相位仪：桌面左上卡片 / 移动端右上单行极简条（2026-08-18 v3：移动端去键位提示、大幅压缩、高透明）
    {
      var pcol = phase === PHASE.EMBER ? '#C8642A' : '#C9A24B';
      var plabel = phase === PHASE.EMBER ? '余烬相' : '鎏金相';
      var _cardW, _cardH, _cardX, _cardY, _cx, _cy, _cw = 14, _cg = 4;
      if (isMobile) {
        // 移动端：单行极简条（相位 + 计时 + 核心点 + 张力微条），归并到左上角机体面板正下方
        _cardW = 152; _cardH = 34;
        _cardX = lpX; _cardY = lpY + lpH + 6;
        ctx.fillStyle = 'rgba(16,13,9,0.45)'; ctx.strokeStyle = pcol; ctx.lineWidth = 1;
        hp(_cardX, _cardY, _cardW, _cardH, 8);
        var _ms = Math.ceil(Math.max(phaseTransT, phaseTimer));
        ctx.fillStyle = pcol; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(plabel + ' ' + _ms + 's', _cardX + 8, _cardY + 15);
        if (phase === PHASE.EMBER) { ctx.fillStyle = '#E8A05A'; ctx.font = 'bold 8px sans-serif'; ctx.fillText('撤' + Math.ceil(Math.max(0, emberOpenWindow)), _cardX + 8, _cardY + 27); }
        // 核心点（小方块）
        for (var _k = 0; _k < CORE_CAP; _k++) {
          var _fx = _cardX + 66 + _k * 16;
          ctx.fillStyle = _k < phaseCore ? pcol : 'rgba(255,255,255,0.12)';
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_fx, _cardY + 8, 11, 11, 2); ctx.fill(); } else ctx.fillRect(_fx, _cardY + 8, 11, 11);
        }
        // 张力微条
        if (phase === PHASE.GOLD) {
          var _tf2 = clamp(1 - phaseTimer / phaseDurNow(), 0, 1), _red2 = phaseTimer <= 6;
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; hp(_cardX + 66, _cardY + 24, 48, 4, 2);
          ctx.fillStyle = _red2 ? '#E04A4A' : '#7FB069'; hp(_cardX + 66, _cardY + 24, 48 * _tf2, 4, 2);
        }
      } else {
        // 桌面：左上卡片，归并到机体状态面板正下方（紧凑垂直堆叠）
        var ptxt = plabel + ' ' + Math.ceil(Math.max(phaseTransT, phaseTimer)) + 's' + (phase === PHASE.EMBER ? (' · 撤窗 ' + Math.ceil(Math.max(0, emberOpenWindow)) + 's') : ' · 蓄能');
        _cardW = 184; _cardH = 58;
        _cardX = lpX; _cardY = lpY + lpH + 6;
        _cx = _cardX + 10; _cy = _cardY + 24;
        ctx.fillStyle = 'rgba(16,13,9,0.74)'; ctx.strokeStyle = pcol; ctx.lineWidth = 1;
        hp(_cardX, _cardY, _cardW, _cardH, 9);
        ctx.fillStyle = pcol; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(ptxt, _cardX + 10, _cardY + 15);
        for (var _k2 = 0; _k2 < CORE_CAP; _k2++) {
          var _fx2 = _cx + _k2 * (_cw + _cg);
          ctx.fillStyle = _k2 < phaseCore ? (phase === PHASE.EMBER ? '#C8642A' : '#C9A24B') : 'rgba(255,255,255,0.10)';
          ctx.strokeStyle = 'rgba(201,162,75,0.5)';
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_fx2, _cy, _cw, _cw, 3); ctx.fill(); ctx.stroke(); } else { ctx.fillRect(_fx2, _cy, _cw, _cw); ctx.strokeRect(_fx2, _cy, _cw, _cw); }
        }
        ctx.fillStyle = '#C9A24B'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(phaseCore + '/' + CORE_CAP + (isMobile ? '' : ' [F]'), _cx + _cw * 3 + _cg * 2 + 6, _cy + 11);
        if (phase === PHASE.GOLD) {
          var _tf = clamp(1 - phaseTimer / phaseDurNow(), 0, 1), _red = phaseTimer <= 6;
          var _tx = _cardX + 10, _ty = _cardY + 46, _tw = _cardW - 20;
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; hp(_tx, _ty, _tw, 5, 2.5);
          ctx.fillStyle = _red ? '#E04A4A' : '#7FB069'; hp(_tx, _ty, _tw * _tf, 5, 2.5);
          if (_red) { ctx.fillStyle = (Math.sin(gameTime * 10) > 0 ? '#E04A4A' : '#fff'); ctx.font = 'bold 9px sans-serif'; ctx.fillText('⚠ 主动翻否则失控', _tx + 2, _ty - 2); }
        } else {
          ctx.fillStyle = '#C8642A'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(activeEmber ? '主动余烬·狂暴' : '余烬·失控', _cardX + 10, _cardY + 50);
        }
      }
      ctx.textAlign = 'left';
    }
    // 左上：机体状态面板（lpX/lpY/lpW/lpH 已在 drawHUD 顶部定义为左上角堆叠起点）
    ctx.fillStyle = 'rgba(16,13,9,0.74)'; ctx.strokeStyle = 'rgba(201,162,75,0.4)'; ctx.lineWidth = 1;
    hp(lpX, lpY, lpW, lpH, 10);
    var hpBarW = lpW - 20;
    // 移动端 v3：元素羁绊小标签收纳进血条面板顶部（巽风/震雷/坎水/离火/坤土），不再外挂竖列
    if (isMobile) {
      var _mels = ['风', '雷', '水', '火', '土'], _mtw = 30, _mth = 13, _mtg = 2;
      for (var _mi = 0; _mi < _mels.length; _mi++) {
        var _mel = _mels[_mi], _mcnt = player.elements[_mel] || 0, _mmx = 0;
        BOND_TIERS[_mel].forEach(function (t) { if (player.bondTiers[t.key]) _mmx = t.need; });
        var _mx2 = lpX + 8 + _mi * (_mtw + _mtg), _my2 = lpY + 5;
        ctx.fillStyle = 'rgba(16,13,9,0.55)'; ctx.strokeStyle = _mmx > 0 ? ELEMCOL[_mel] : 'rgba(201,162,75,0.22)'; ctx.lineWidth = 1;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_mx2, _my2, _mtw, _mth, 3); ctx.fill(); ctx.stroke(); } else { ctx.fillRect(_mx2, _my2, _mtw, _mth); ctx.strokeRect(_mx2, _my2, _mtw, _mth); }
        ctx.fillStyle = ELEMCOL[_mel]; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText((TRIGRAM[_mel] || '') + _mcnt, _mx2 + _mtw / 2, _my2 + 10);
      }
      ctx.textAlign = 'left';
    }
    // 行1：经验 / 等级条（紧凑；移动端下移给元素标签让位）
    var xpY = lpY + (isMobile ? 22 : 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; hp(lpX + 8, xpY, hpBarW, 6, 3);
    var xpw = hpBarW * Math.max(0, Math.min(1, player.xp / player.xpNeed));
    ctx.fillStyle = '#E0B84A'; hp(lpX + 8, xpY, Math.max(2, xpw), 6, 3);
    ctx.fillStyle = '#E8E4D8'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Lv ' + player.lvl, lpX + 10, xpY + 5);
    if (player.lvl >= LEVEL_CAP) { ctx.fillStyle = '#E8DCC4'; ctx.textAlign = 'right'; ctx.fillText('MAX', lpX + lpW - 10, xpY + 5); ctx.textAlign = 'left'; }
    else { ctx.fillStyle = '#C9A24B'; ctx.textAlign = 'right'; ctx.fillText(player.xp + '/' + player.xpNeed, lpX + lpW - 10, xpY + 5); ctx.textAlign = 'left'; }
    // 行2：HP 条
    var hpY = lpY + (isMobile ? 32 : 22);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; hp(lpX + 10, hpY, hpBarW, isMobile ? 10 : 12, 6);
    var hpw = hpBarW * Math.max(0, Math.min(1, player.hp / player.maxhp));
    var hpg = ctx.createLinearGradient(lpX + 10, 0, lpX + 10 + hpBarW, 0); hpg.addColorStop(0, '#D96A7E'); hpg.addColorStop(1, '#C81E3E');
    ctx.fillStyle = hpg; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; hp(lpX + 10, hpY, Math.max(4, hpw), isMobile ? 10 : 12, 6);
    // 行3：护盾条
    var shY = lpY + (isMobile ? 47 : 40);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.strokeStyle = 'transparent'; hp(lpX + 10, shY, hpBarW, isMobile ? 7 : 8, 4);
    var shw = hpBarW * Math.max(0, Math.min(1, player.shield / player.maxshield));
    ctx.fillStyle = '#4E8FC7'; hp(lpX + 10, shY, Math.max(3, shw), isMobile ? 7 : 8, 4);
    // 行3.5：灵潮绝技充能条（移动端无 [J] 键位提示）
    {
      var _uel = dominantElem(), _ucol = _uel ? ELEMCOL[_uel] : '#D9B64A';
      var _uY = shY + (isMobile ? 10 : 11);
      var _uw = hpBarW * Math.max(0, Math.min(1, player.ultCharge / ULT_MAX));
      var _ready = player.ultCharge >= ULT_MAX;
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.strokeStyle = 'transparent'; hp(lpX + 10, _uY, hpBarW, isMobile ? 6 : 7, 3.5);
      ctx.fillStyle = _ready ? ((0.5 + 0.5 * Math.sin(gameTime * 6)) > 0.6 ? '#F2D98A' : _ucol) : _ucol;
      hp(lpX + 10, _uY, Math.max(2, _uw), isMobile ? 6 : 7, 3.5);
      ctx.fillStyle = _ready ? '#F2D98A' : '#C9A24B'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'right'; ctx.strokeStyle = 'transparent';
      ctx.fillText(_ready ? ('☯ ' + (ULT_NAMES[_uel] || '天诛') + (isMobile ? '' : ' [J]')) : ('绝技 ' + Math.floor(player.ultCharge) + '%'), lpX + lpW - 10, _uY + (isMobile ? 5 : 6));
      ctx.textAlign = 'left';
    }
    // 行4：数值与层数击杀（移动端收紧在面板内，不出框）
    ctx.fillStyle = '#E8E4D8'; ctx.font = 'bold ' + (isMobile ? 9 : 11) + 'px sans-serif'; ctx.strokeStyle = 'transparent';
    ctx.fillText('HP ' + Math.ceil(player.hp) + '/' + player.maxhp, lpX + 10, lpY + (isMobile ? 84 : 78));
    ctx.fillStyle = '#E8DCC4'; ctx.font = (isMobile ? '9px' : 'bold 11px') + ' sans-serif';
    ctx.fillText('第' + run.tier + '层 · 杀' + run.kills + ' · 峰' + player.comboBest, lpX + (isMobile ? 66 : 78), lpY + (isMobile ? 84 : 78));
    // 羁绊条：#389 合并方案——5 元素 chip 横向一行 + | 分隔 + 9px 紧凑字 + 半透明背景，
    // 放在相位卡下方一行（替代原桌面竖列 30×16×5 块），不再与相位卡/HP 面板挤压
    if (!isMobile) {
      var _els = ['风', '雷', '水', '火', '土'];
      var _chipW = 30, _chipH = 16, _chipGap = 1; // 紧凑：5 个 30 + 4 间隔 1 = 154px（之前 5×30+3×4 = 162）
      var _chipX0 = lpX + 8;
      var _chipY0 = lpY + lpH + 6 + 58 + 6; // 相位卡底（58 高）+ 6px 间距
      // 背景单条半透明（不再每 chip 独立描边）：整行更紧凑
      var _totalW = _els.length * _chipW + (_els.length - 1) * _chipGap;
      ctx.fillStyle = 'rgba(16,13,9,0.5)'; ctx.strokeStyle = 'rgba(201,162,75,0.25)'; ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_chipX0 - 4, _chipY0 - 1, _totalW + 8, _chipH + 2, 6); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(_chipX0 - 4, _chipY0 - 1, _totalW + 8, _chipH + 2); ctx.strokeRect(_chipX0 - 4, _chipY0 - 1, _totalW + 8, _chipH + 2); }
      for (var _bi = 0; _bi < _els.length; _bi++) {
        var _el = _els[_bi], _cnt = player.elements[_el] || 0, _mx = 0;
        BOND_TIERS[_el].forEach(function (t) { if (player.bondTiers[t.key]) _mx = t.need; });
        var _cx = _chipX0 + _bi * (_chipW + _chipGap);
        // 元素文字 + 计数值（金色，9px）
        ctx.fillStyle = _mx > 0 ? ELEMCOL[_el] : '#C9A24B'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText((TRIGRAM[_el] || '') + _el + _cnt, _cx + _chipW / 2, _chipY0 + 11);
        // | 分隔符
        if (_bi < _els.length - 1) {
          ctx.fillStyle = 'rgba(201,162,75,0.3)';
          ctx.fillText('|', _cx + _chipW + _chipGap / 2, _chipY0 + 11);
        }
      }
      ctx.textAlign = 'left';
    }
    // 右上状态 v3：移动端单行极简状态条（高透明不遮视野）；桌面保留紧凑面板
    if (isMobile) {
      var _needM3 = 3 + run.tier;
      var _stt = '拾' + run.loot.length + '/' + invMax + ' · 值' + lootVal + ' · 刮' + Math.min(run.nodes, _needM3) + '/' + _needM3;
      ctx.font = 'bold 9px sans-serif'; var _stw = ctx.measureText(_stt).width;
      var _stW2 = _stw + 16, _stX2 = W - _stW2 - 8 - SA.r, _stY2 = 8 + SA.t;
      ctx.fillStyle = 'rgba(16,13,9,0.4)'; ctx.strokeStyle = 'rgba(201,162,75,0.26)'; ctx.lineWidth = 1;
      hp(_stX2, _stY2, _stW2, 22, 11);
      ctx.fillStyle = '#E8DCC4'; ctx.textAlign = 'right'; ctx.strokeStyle = 'transparent';
      ctx.fillText(_stt, W - 16 - SA.r, _stY2 + 14); ctx.textAlign = 'left';
    } else {
      var rpW = 200, rpH = 60;
      var rpX2 = W - rpW - 10 - SA.r, rpY2 = 10 + SA.t;
      ctx.fillStyle = 'rgba(16,13,9,0.55)'; ctx.strokeStyle = 'rgba(201,162,75,0.3)';
      hp(rpX2, rpY2, rpW, rpH, 8);
      ctx.textAlign = 'right';
      var rpX = W - 16;
      ctx.fillStyle = '#E8DCC4'; ctx.font = '11px sans-serif'; ctx.strokeStyle = 'transparent';
      ctx.fillText('战利品 ' + run.loot.length + '/' + invMax, rpX, rpY2 + 15);
      ctx.fillStyle = COL.gold; ctx.font = 'bold 12px sans-serif'; ctx.fillText('价值 ' + lootVal, rpX, rpY2 + 31);
      var need = 3 + run.tier;
      var res = elemResonance();
      var _rune = res > 1 ? ('共鸣 +' + Math.round((res - 1) * 100) + '%') : ('搜刮 ' + Math.min(run.nodes, need) + '/' + need);
      ctx.fillStyle = res > 1 ? '#D9B64A' : '#8B95A0'; ctx.font = '10px sans-serif';
      ctx.fillText(_rune + ' · BOSS', rpX, rpY2 + 50);
      var progX = rpX2 + 8, progW = rpW - 16;
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.strokeStyle = 'transparent'; hp(progX, rpY2 + 53, progW, 4, 2);
      ctx.fillStyle = '#7FB069'; hp(progX, rpY2 + 53, progW * Math.min(1, run.nodes / need), 4, 2);
      ctx.textAlign = 'left';
    }
    // 特殊宝箱交互提示（就近显示）
    var nearV = null, nd2 = 1e9;
    for (var _v = 0; _v < vaults.length; _v++) { var _vv = vaults[_v]; if (_vv.state === 'done') continue; var _dd = Math.hypot(player.x - _vv.x, player.y - _vv.y); if (_dd < _vv.r + 64 && _dd < nd2) { nd2 = _dd; nearV = _vv; } }
    if (nearV) {
      var vtxt;
      if (nearV.type === 'seal') vtxt = nearV.state === 'opening' ? ('解封中 ' + Math.floor(nearV.prog * 100) + '% · ' + (isMobile ? '靠近顶住围堵' : '按住 [E] 顶住围堵')) : (isMobile ? '靠近解封封印宝箱（持续刷敌，顶住 5 秒）' : '按住 [E] 解封封印宝箱（持续刷敌，顶住 5 秒）');
      else { var totAlive = nearV.totems.filter(function (t) { return !t.dead; }).length; vtxt = '击破符文柱解锁（剩余 ' + totAlive + '/' + nearV.totems.length + '）'; }
      ctx.font = 'bold ' + (isMobile ? 12 : 15) + 'px sans-serif'; var vtw = ctx.measureText(vtxt).width;
      ctx.fillStyle = 'rgba(16,13,9,0.78)'; ctx.strokeStyle = nearV.type === 'seal' ? 'rgba(224,184,74,0.6)' : 'rgba(176,111,208,0.6)';
      var vpY = isMobile ? H - 180 - SA.b : H - 104;
      hp(W / 2 - vtw / 2 - 18, vpY, vtw + 36, isMobile ? 24 : 30, 15);
      ctx.fillStyle = nearV.type === 'seal' ? '#E0B84A' : '#C79BE8'; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(vtxt, W / 2, vpY + (isMobile ? 16 : 20)); ctx.textAlign = 'left';
    }
    // 互动物·最近可交互 单行提示（统一悬停系统：相位柱/引力裂隙/磁锁秘库/撤离点）
    if (nearHover) {
      var htxt = nearHover.label;
      var hc = nearHover.type === 'rift' ? '#C79BE8' : (nearHover.type === 'extract' ? '#7FB069' : (nearHover.type === 'vault' ? '#E0B84A' : '#C9A24B'));
      ctx.font = 'bold 13px sans-serif'; var htw = ctx.measureText(htxt).width;
      ctx.fillStyle = 'rgba(16,13,9,0.8)'; ctx.strokeStyle = hc; ctx.lineWidth = 1.5;
      var hY = isMobile ? H - 210 - SA.b : H - 140;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(W / 2 - htw / 2 - 16, hY, htw + 32, 26, 13); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(W / 2 - htw / 2 - 16, hY, htw + 32, 26); ctx.strokeRect(W / 2 - htw / 2 - 16, hY, htw + 32, 26); }
      ctx.fillStyle = hc; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(htxt, W / 2, hY + 18); ctx.textAlign = 'left';
    }
    // #381-⑤ 相位柱充能引导：玩家进入同相充能半径时，世界坐标锚定在相位柱上方（p.y - 50），
    // 离开半径自动消失（不与底部 banner 互压）。#389 修复：之前画在屏幕中央与底部 banner 抢位置
    if (!inRift && scene === 'mission' && phasePillars) {
      for (var _pgi = 0; _pgi < phasePillars.length; _pgi++) {
        var _pg = phasePillars[_pgi];
        if (_pg.overloadCd > 0 || phase !== _pg.affinity) continue;
        if (Math.hypot(player.x - _pg.x, player.y - _pg.y) < PILLAR_CHARGE_R) {
          var _pgTxt = '站圈充能 · ' + Math.floor(_pg.charge) + '%';
          ctx.font = 'bold 12px sans-serif'; var _pgw = ctx.measureText(_pgTxt).width;
          // 世界→屏幕投影：胶囊画在相位柱上方 50px，世界坐标减 cam
          var _pgScreenX = _pg.x - cam.x;
          var _pgScreenY = _pg.y - 50 - cam.y;
          // 边界 clamp：避免离屏或被顶到屏幕最上沿（与 top banner 留 4px 间隙）
          _pgScreenX = clamp(_pgScreenX, _pgw / 2 + 18, W - _pgw / 2 - 18);
          _pgScreenY = clamp(_pgScreenY, 12 + SA.t + 60, H - 60); // 顶部 60px 让给 top banner 槽，底部 60px 让给 bot 槽
          ctx.fillStyle = 'rgba(16,13,9,0.82)'; ctx.strokeStyle = _pg.affinity === PHASE.EMBER ? '#C8642A' : '#C9A24B'; ctx.lineWidth = 1.5;
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_pgScreenX - _pgw / 2 - 10, _pgScreenY - 13, _pgw + 20, 22, 11); ctx.fill(); ctx.stroke(); }
          else { ctx.fillRect(_pgScreenX - _pgw / 2 - 10, _pgScreenY - 13, _pgw + 20, 22); ctx.strokeRect(_pgScreenX - _pgw / 2 - 10, _pgScreenY - 13, _pgw + 20, 22); }
          ctx.fillStyle = _pg.affinity === PHASE.EMBER ? '#FF9A6B' : '#FFE9A8'; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(_pgTxt, _pgScreenX, _pgScreenY + 2); ctx.textAlign = 'left';
          break;
        }
      }
    }
    // 底部提示行（胶囊底）
    if (hintTimer > 0 && !isMobile) {
      // 三级边缘信息：极简、低对比、贴底不抢焦点
      ctx.globalAlpha = clamp(hintTimer / 2, 0, 1) * 0.55;
      var ht = '连杀叠灵潮伤 · 击杀充绝技[J] · 飞过灵脉吸收灵韵喂羁绊（圈内战斗增伤） · 搜够 ' + (3 + run.tier) + ' 个触发 BOSS → 撤离点光柱亮起 → 飞入读条 2.8s 撤离 · 战利品按[F]打开列表选择 · [E]捡最近';
      ctx.font = '10px sans-serif'; var tw = ctx.measureText(ht).width;
      ctx.fillStyle = 'rgba(16,13,9,0.5)'; ctx.strokeStyle = 'rgba(201,162,75,0.22)';
      hp(W / 2 - tw / 2 - 10, H - 30, tw + 20, 19, 9);
      ctx.fillStyle = '#B8AE98'; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(ht, W / 2, H - 17); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    // banner 队列（#389 三槽分桶）：top=屏幕顶部 12+SA.t；mid=中央略上 1/3 处；bot=底部 64/205
    // 各槽限制条数：top 2 条（错开 28px） / mid 1 条 / bot 2 条（错开 26px）
    // 战局重要通知走 top 槽；单条中央信息走 mid；常规掉落/按键提示/警告走 bot
    {
      var _topN = 0, _midN = 0, _botN = 0;
      var _topY0 = 12 + SA.t;           // 顶部 1px 安全区
      var _midY  = Math.round(H * 0.32); // 屏幕中央略上 1/3 处
      var _botY0 = isMobile ? (H - 205 - SA.b) : (H - 64); // 底部提示行 + 留出 hint 行
      for (var bq2 = 0; bq2 < bannerQ.length; bq2++) {
        var bn2 = bannerQ[bq2];
        var pri2 = bn2.pri || 'bot';
        var slot = -1, by2 = 0;
        if (pri2 === 'top' && _topN < 2) { slot = 0; by2 = _topY0 + _topN * 28; _topN++; }
        else if (pri2 === 'mid' && _midN < 1) { slot = 1; by2 = _midY; _midN++; }
        else if (_botN < 2) { slot = 2; by2 = _botY0 - _botN * 26; _botN++; }
        else { continue; } // 槽满丢弃
        var aIn2 = clamp(bn2.age / 0.25, 0, 1);
        var fade2 = clamp(bn2.life / 0.5, 0, 1) * aIn2;
        ctx.globalAlpha = fade2;
        ctx.font = 'bold ' + (isMobile ? 10 : 11) + 'px sans-serif'; var bw3 = ctx.measureText(bn2.text).width;
        ctx.fillStyle = 'rgba(16,13,9,0.62)';
        // top 槽边框加重（重要战局信息），mid/bot 槽弱化
        ctx.strokeStyle = pri2 === 'top' ? (bn2.col ? hexToRgba(bn2.col, 0.7) : 'rgba(201,162,75,0.6)') : (bn2.col ? hexToRgba(bn2.col, 0.4) : 'rgba(201,162,75,0.35)');
        ctx.lineWidth = pri2 === 'top' ? 1.5 : 1;
        hp(W / 2 - bw3 / 2 - 12, by2, bw3 + 24, 22, 11);
        ctx.fillStyle = bn2.col || COL.gold; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(bn2.text, W / 2, by2 + 14.5); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      }
    }
    // Boss 血条（面板 + 渐变条 + 名字）
    if (boss) {
      var bw3 = isMobile ? Math.min(300, W - 260) : 340, bx = (W - bw3) / 2, by = _bossY;
      ctx.fillStyle = 'rgba(16,13,9,0.74)'; ctx.strokeStyle = 'rgba(232,220,196,0.22)';
      hp(bx - 6, by - 4, bw3 + 12, 30, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.strokeStyle = 'transparent'; hp(bx, by + 14, bw3, 10, 5);
      var bcol = boss.phase >= 3 ? '#C94F4F' : (boss.phase === 2 ? '#D96A7E' : '#8A6FB8');
      ctx.fillStyle = bcol; hp(bx, by + 14, Math.max(3, bw3 * (boss.hp / boss.maxhp)), 10, 5);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent';
      var bossBarName = { taowu: '梼杌·封印体', qiongqi: '穷奇·掠食', taotie: '饕餮·吞噬熔炉', hundun: '混沌·终焉虚空' }[boss.kind] || '梼杌·封印体'; // #M1 修复：四 kind 全量映射
      ctx.fillText(bossBarName + ' · 阶段' + boss.phase, W / 2, by + 12);
      ctx.textAlign = 'left';
    }
    drawBackpack();
    drawMinimap();
    drawConsumables();
    // UX：新手期操作提示（前 3 局常驻）
    if (!isMobile && meta.runs < 3 && run.time > 1.5) {
      ctx.fillStyle = 'rgba(143,166,179,0.9)'; ctx.font = '11px sans-serif';
      ctx.fillText('Q 丹药 · M 合成 · Shift 冲刺 · P 暂停', 14, 148);
    }
    // UX：有可合成组合时提示（移动端改由合成键呼吸光效提示，纯图标无键盘文案）
    if (hasMergeable() && !isMobile) {
      // 提示挪到背包标题行下方：y = 背包顶(by)+14，避开小地图下半区；by 镜像 drawBackpack
      var _bpTop = (78 + SA.t) + Math.round(150 * WORLD_H / WORLD_W) + 8;
      ctx.fillStyle = '#D9B64A'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('💡 按 M 可合成', W - 22, _bpTop + 14); ctx.textAlign = 'left';
    }
    drawBounty(); // 动态悬赏面板（右侧小地图下方；桌面背包整块下方）
  }
  // 动态悬赏 HUD（右侧小地图下方；桌面避让背包整块，移动端避让小地图）
  function drawBounty() {
    if (!bounty) return;
    var bw = 150, bh = 42;
    var bx = W - 160 - SA.r;
    var by;
    if (isMobile) {
      by = 140 + SA.t; // 移动端无背包：小地图底≈126，留 14px 间隙
    } else {
      // 桌面：背包整块下方（镜像 drawBackpack 公式：cols=4,s=26,g=5；2 行 × (s+g) = 62；勿硬编码）
      var _mmw = 150, _mmh = Math.round(_mmw * WORLD_H / WORLD_W);
      var _bpTop = (78 + SA.t) + _mmh + 8;
      var _bpH = 2 * (26 + 5);
      by = _bpTop + _bpH + 8;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(18,14,10,0.8)';
    ctx.strokeStyle = bounty.completed ? '#7FB069' : 'rgba(201,162,75,0.4)';
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1;
    // 标题行
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = bounty.completed ? '#7FB069' : '#C9A24B';
    ctx.fillText(bounty.completed ? '★ 悬赏达成 (增益生效)' : '✦ 当局悬赏', bx + 10, by + 16);
    // 描述行
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#E8DCC4';
    ctx.fillText(bounty.desc + ' (' + bounty.progress + '/' + bounty.target + ')', bx + 10, by + 32);
  }
  // 屏幕边缘威胁箭头（增援 / 开箱护卫）：玩家可见来袭方向与威胁色
  function drawEdgeArrows() {
    var list = [];
    if (edgeArrow && edgeArrow.timer > 0) list.push({ ang: edgeArrow.ang, col: edgeArrow.color });
    if (lootArrow && lootArrow.timer > 0) list.push({ ang: lootArrow.ang, col: lootArrow.color });
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var sx = player.x + Math.cos(a.ang) * 700 - cam.x, sy = player.y + Math.sin(a.ang) * 700 - cam.y;
      var cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy, m = 44;
      if (Math.abs(dx) < W / 2 - m && Math.abs(dy) < H / 2 - m) continue; // 威胁已在屏内则不画
      var scale = Math.min((W / 2 - m) / (Math.abs(dx) || 1), (H / 2 - m) / (Math.abs(dy) || 1));
      var ex = cx + dx * scale, ey = cy + dy * scale;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a.ang + Math.PI / 2);
      ctx.fillStyle = a.col; ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(11, 9); ctx.lineTo(0, 3); ctx.lineTo(-11, 9); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  // 全图调色 shift：鎏金暖金+玄金边辉 / 余烬暗红火光暗角（§7.11-5，沉浸反馈 v12）
  function drawPhaseTint() {
    var _r = Math.round(201 + (200 - 201) * phaseMix);
    var _g = Math.round(162 + (100 - 162) * phaseMix);
    var _b = Math.round(75 + (42 - 75) * phaseMix);
    var _a = 0.05 + 0.06 * phaseMix;
    ctx.fillStyle = 'rgba(' + _r + ',' + _g + ',' + _b + ',' + _a + ')';
    ctx.fillRect(0, 0, W, H);
    if (phaseMix > 0.02) { // 余烬：暗红火光暗角 + 边角炽热
      var _va = phaseMix * 0.55;
      var _vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.75);
      _vg.addColorStop(0, 'rgba(0,0,0,0)'); _vg.addColorStop(0.7, 'rgba(40,8,4,' + (_va * 0.5) + ')'); _vg.addColorStop(1, 'rgba(12,4,2,' + _va + ')');
      ctx.fillStyle = _vg; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var _fc = 'rgba(200,90,40,' + (0.10 * phaseMix) + ')'; ctx.fillStyle = _fc;
      ctx.beginPath(); ctx.arc(0, 0, 120, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(W, 0, 120, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(0, H, 120, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(W, H, 120, 0, 7); ctx.fill();
      ctx.restore();
    } else { // 鎏金：边缘玄金辉光 + 六边形力场描边
      var _gv = 0.12 * (1 - phaseMix);
      var _gg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      _gg.addColorStop(0, 'rgba(0,0,0,0)'); _gg.addColorStop(1, 'rgba(201,162,75,' + _gv + ')');
      ctx.fillStyle = _gg; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(201,162,75,' + (0.10 * (1 - phaseMix)) + ')'; ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, W - 12, H - 12); ctx.restore();
    }
  }
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // 每帧重置 DPR 基准（防上帧 save/restore 残留丢失高清）
    if (scene !== 'mission') { drawGrid(); return; }
    var k = shake.t > 0 ? Math.min(shake.mag * Math.exp(-(shake.dur - shake.t) / shake.tau), 6) : 0;
    ctx.save();
    if (k > 0) ctx.translate(rand(-k, k), rand(-k, k)); // 随机短促偏移：一瞬轻晃，不持续不飘（移动跟手）
    ctx.translate(-cam.x, -cam.y); // 相机：把世界坐标平移到屏幕
    drawGrid(); drawObstacles(); drawVeins(); drawNodes(); drawVaults(); drawTotems(); drawLoot(); drawRift(); drawWeaverRifts(); drawExtract(); drawPhaseObjects(); drawEnemies(); if (boss) drawBoss(); drawVfxLines(); drawBulletTrails(); drawBullets(); drawParticles(); drawVfxSprites(); drawPlayer();
    ctx.restore();
    drawPhaseTint(); // 全图调色 shift（金暖 ↔ 余烬橙暗，性能优先单覆盖层）
    drawHUD();
    drawPickupList();
    drawEdgeArrows();
    if (tint.a > 0) { ctx.fillStyle = hexToRgba(tint.col, tint.a); ctx.fillRect(0, 0, W, H); }
    if (bossVig > 0) {
      var va = clamp(bossVig / 1.2, 0, 1) * 0.6;
      var grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(8,4,12,' + va + ')');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    }
    if (screenFlash.a > 0) {
      if (screenFlash.color === '#C94F4F') {
        // v12.7 受击反馈：暗红边缘 vignette 脉冲（中心透明、四周暗红，幅度随 screenFlash.a 衰减）
        var _vgrd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
        _vgrd.addColorStop(0, 'rgba(150,20,20,0)');
        _vgrd.addColorStop(1, 'rgba(150,20,20,' + screenFlash.a.toFixed(3) + ')');
        ctx.fillStyle = _vgrd; ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = hexToRgba(screenFlash.color, screenFlash.a); ctx.fillRect(0, 0, W, H);
      }
    }
    // 低血量警报：HP<30% 红色呼吸 vignette（边缘径向渐变，非全屏遮挡）
    if (scene === 'mission' && player && player.hp < player.maxhp * 0.3 && player.hp > 0) {
      var _lva = 0.3 + 0.3 * Math.sin(gameTime * 6);
      var lgrd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.62);
      lgrd.addColorStop(0, 'rgba(0,0,0,0)'); lgrd.addColorStop(1, 'rgba(201,79,79,' + _lva.toFixed(3) + ')');
      ctx.fillStyle = lgrd; ctx.fillRect(0, 0, W, H);
    }
    if (lastError && performance.now() - lastError.t < 5000) {
      ctx.fillStyle = 'rgba(140,0,0,0.88)'; ctx.fillRect(0, 0, W, 26);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('⚠ 运行异常已捕获（截图反馈即可）: ' + lastError.msg, W / 2, 17); ctx.textAlign = 'left';
    }
  }
  var last = performance.now();
  var lastError = null;
  function reportGameError(err) {
    try { console.error('[空域撤离] 运行时异常已捕获（游戏继续运行，可截图此信息反馈）:', err); } catch (e) {}
    lastError = { msg: (err && err.message) ? err.message : String(err), t: performance.now() };
  }
  // 2026-08-18：暂停死锁自恢复（保险丝）。若 paused===true 但所有合法暂停覆盖层均未实际展开（display!=='flex'），
  // 说明有覆盖层本应关闭却漏清 paused（或异常中断），自动解除暂停，避免整局冻结卡死。
  function autoClearStuckPause() {
    if (!paused || scene !== 'mission') return; // 仅战斗场景适用；非暂停态直接返回
    var owners = ['buffOverlay', 'mergeOverlay', 'pickupFilterOverlay', 'backpackOverlay', 'pauseOverlay', 'riftChoice', 'vaultPrompt'];
    for (var _oi = 0; _oi < owners.length; _oi++) {
      var _el = document.getElementById(owners[_oi]);
      if (_el && _el.style.display === 'flex') return; // 有合法暂停层展开 → 保持暂停
    }
    paused = false; // 无任何合法暂停层展开却仍 paused → 强制恢复
    console.warn('[空域撤离] 暂停死锁自愈：检测到 paused=true 但无展开中的暂停覆盖层，已自动恢复。');
  }
  function loop(now) {
    autoClearStuckPause();
    var realDt = Math.min(0.05, (now - last) / 1000); last = now;
    if (scene === 'mission' && !paused) {
      try {
        if (freeze > 0) { freeze -= realDt; } else { update(realDt); updateVfx(realDt); } // 顿帧：冻结世界（含粒子/飘字），不卡死渲染
        if (shake.t > 0) shake.t -= realDt;
        if (shake.cd > 0) shake.cd -= realDt;
        if (tint.a > 0) tint.a -= realDt * tint.rate;
        if (bossVig > 0) bossVig -= realDt;
      } catch (err) { reportGameError(err); }
    } else if (scene === 'mission') { for (var kk in keys) keys[kk] = false; } // 暂停/弹层期间一次性清空按键，杜绝恢复后卡键
    try { render(); } catch (err) { reportGameError(err); }
    updateMobileBtnStates();
    requestAnimationFrame(loop); // 异常绝不断裂 rAF 链：从此不再"需刷新才恢复"
  }
  requestAnimationFrame(loop);

  // ---------- 界面 ----------
  function hideAllOverlays() { ['title', 'base', 'buffOverlay', 'mergeOverlay', 'pauseOverlay', 'result', 'tutorial'].forEach(function (id) { document.getElementById(id).style.display = 'none'; }); }
  // B4 修复：首局（meta.runs===0 且未主动关闭过教学）进入基地时自动弹一次新手教学；已有局数或本会话已弹过则不再打扰
  var _autoTutDone = false;
  function maybeAutoTutorial() {
    if (_autoTutDone) return;
    if (!meta || meta.runs > 0 || meta.seenTutorial) return;
    _autoTutDone = true;
    var _t = document.getElementById('tutorial');
    if (_t) _t.style.display = 'flex';
  }
  function showScene(name) {
    scene = name; hideAllOverlays();
    if (name === 'base') { document.getElementById('base').style.display = 'flex'; renderBase(); maybeAutoTutorial(); }
    else if (name === 'title') { document.getElementById('title').style.display = 'flex'; }
    else if (name === 'result') { document.getElementById('result').style.display = 'flex'; }
    showMobileControls(); checkOrientation();
  }
  var selectedAircraft = 'a', selectedTier = 1;
  // 出击配置战力预览（机体+永久强化+已装法器）
  function calcLoadout() {
    var a = AIRCRAFT[selectedAircraft];
    var hp = a.hp + meta.up.hp * 22, dmg = a.dmg + meta.up.dmg * 3, spd = a.speed + meta.up.speed * 14, sh = 40 + meta.up.shield * 14;
    var fr = a.fireRate, pl = a.pellets, cc = 0.04, pierce = 0;
    SLOTS.forEach(function (slot) {
      var art = getArt(meta.equipped[slot]); if (!art) return;
      var m = art.mods;
      if (m.dmg) dmg += m.dmg; if (m.maxhp) hp += m.maxhp; if (m.maxshield) sh += m.maxshield;
      if (m.fireRate) fr += m.fireRate; if (m.critChance) cc += m.critChance;
      if (m.speed) spd += m.speed; if (m.pierce) pierce += m.pierce; if (m.pellets) pl = Math.min(9, pl + m.pellets);
    });
    return { hp: Math.round(hp), dmg: dmg, spd: Math.round(spd), sh: Math.round(sh), fr: fr, pl: pl, cc: cc, pierce: pierce };
  }
  // 武器等级图标：已预裁切为 15 张独立 PNG，按 (rarity 行, subtype 列) 命名。
  // 列映射：符箓速射器(0)=ballistic/homing，羽刃散射器(1)=spread，玉炮重炮(2)=splash/chain
  function weaponIconHtml(art, extraCls) {
    if (!art || art.slot !== 'weapon') return '';
    var colMap = { ballistic: 0, homing: 0, spread: 1, splash: 2, chain: 2 };
    var col = (art.subtype && colMap[art.subtype] !== undefined) ? colMap[art.subtype] : 0;
    var row = RAR.indexOf(art.rarity); if (row < 0) row = 0;
    return '<span class="wpn-icon ' + (extraCls || '') + '" style="background-image:url(\'assets/v4/weapons/weapon_r' + row + '_c' + col + '.png\')"></span>';
  }
  function gearIconHtml(art, extraCls) {
    if (!art || !/^(armor|core|ammo)$/.test(art.slot)) return '';
    var row = RAR.indexOf(art.rarity); if (row < 0) row = 0;
    return '<span class="gear-icon ' + (extraCls || '') + '" style="background-image:url(\'assets/v4/gear/gear_' + art.slot + '_' + art.rarity + '.png\')"></span>';
  }
  function renderHangarEquip() {
    var he = document.getElementById('hangarEquip');
    if (he) {
      var SLOTNAME = { weapon:'武器', armor:'护甲', core:'核心', ammo:'弹药' };
        var slots = '';
      SLOTS.forEach(function (slot) {
        var eq = getArt(meta.equipped[slot]);
        var state = eq ? 'selected' : 'normal';
        var iconHtml = '';
        if (eq) {
          if (eq.slot === 'weapon') iconHtml = weaponIconHtml(eq, 'wpn-icon-hangar');
          else iconHtml = gearIconHtml(eq, 'gear-icon-hangar');
        }
        var badgeHtml = eq ? '<span class="rarity-badge rarity-' + eq.rarity + '"></span>' : '';
        slots += '<div class="eq-slot" data-type="' + slot + '" data-state="' + state + '">' +
          '<div class="box"><img class="bg" src="assets/v3/ui/cropped/slot_' + slot + '_' + state + '.png" alt="">' + iconHtml + '</div>' +
          '<div class="en hangar-slot-name slot-label">' + badgeHtml + (eq ? eq.name : SLOTNAME[slot]) + '</div>' +
        '</div>';
      });
      he.innerHTML = slots;
    }
  }

  function renderBase() {
    if (selectedTier > meta.maxTier) selectedTier = meta.maxTier;
    // === 难度选择（深渊异变·导航器：◀▶ + 信息卡 + 阶梯点）===
    var tr = document.getElementById('tierRow');
    if (tr) {
      var affPills = '';
      var affKeys = tierAffixes(selectedTier);
      if (affKeys.length === 0) {
        affPills = '<span class="affix-none">无异变</span>';
      } else {
        affPills = affKeys.map(function (k) {
          for (var _ai = 0; _ai < AFFIX_DEFS.length; _ai++) if (AFFIX_DEFS[_ai].key === k) {
            var _a = AFFIX_DEFS[_ai];
            return '<span class="affix-pill" style="color:' + _a.col + ';border-color:' + _a.col + ';box-shadow:0 0 10px ' + _a.col + '55">' + _a.icon + ' ' + _a.name + '</span>';
          }
          return '';
        }).join('');
      }
      var dropPct = Math.round(tierDropBonus(selectedTier) * 100);
      var oreMul = tierOreBonus(selectedTier).toFixed(1);
      var hpMulTxt = '+' + Math.round((tierMul(selectedTier) - 1) * 100) + '%';
      var dmgMulTxt = '+' + Math.round((tierDmgMul(selectedTier) - 1) * 100) + '%';
      var bestBadge = '<div class="tier-best-badge">👑 历史最高通关：第 ' + (meta.bestLayer || 1) + ' 层</div>';
      var dots = '';
      for (var t = 1; t <= meta.maxTier; t++) {
        dots += '<div class="tier-dot' + (selectedTier === t ? ' on' : '') + '" data-ti="' + t + '">' + t + '</div>';
      }
      tr.innerHTML =
        '<div class="tier-navigator">' +
          '<button class="tier-prev" data-ti-prev="1"' + (selectedTier <= 1 ? ' disabled' : '') + ' aria-label="上一层">◀</button>' +
          '<div class="tier-card">' +
            bestBadge +
            '<div class="tier-card-title">' + tierTitle(selectedTier) + '</div>' +
            '<div class="tier-affixes">' + affPills + '</div>' +
            '<div class="tier-rewards">装备品质 +' + dropPct + '% · 灵矿产出 ×' + oreMul + '</div>' +
            '<div class="tier-muls">敌HP ' + hpMulTxt + ' · 敌ATK ' + dmgMulTxt + '</div>' +
          '</div>' +
          '<button class="tier-next" data-ti-next="1"' + (selectedTier >= meta.maxTier ? ' disabled' : '') + ' aria-label="下一层">▶</button>' +
        '</div>' +
        '<div class="tier-dots">' + dots + '</div>';
      var prevBtn = tr.querySelector('.tier-prev');
      var nextBtn = tr.querySelector('.tier-next');
      if (prevBtn) prevBtn.addEventListener('click', function () { if (selectedTier > 1) { selectedTier--; renderBase(); AudioSys.sfx.ui(); } });
      if (nextBtn) nextBtn.addEventListener('click', function () { if (selectedTier < meta.maxTier) { selectedTier++; renderBase(); AudioSys.sfx.ui(); } });
      var dotsEls = tr.querySelectorAll('.tier-dot');
      for (var di = 0; di < dotsEls.length; di++) {
        (function (dot) {
          dot.addEventListener('click', function () {
            var ti = parseInt(dot.dataset.ti) || 1;
            if (ti >= 1 && ti <= meta.maxTier) { selectedTier = ti; renderBase(); AudioSys.sfx.ui(); }
          });
        })(dotsEls[di]);
      }
    }
    // === 机体轮播 + 信息（V43 结构） ===
    renderHangarAircraft();
    // === 永久强化商店 ===
    var shop = document.getElementById('shopList');
    if (shop) {
      shop.innerHTML = '';
      var ICON = { hp:'icon_00', dmg:'icon_12', speed:'icon_11', shield:'icon_01', pickup:'icon_10' };
      var cards = '';
      UPGRADES.forEach(function (u) {
        var ulv = meta.up[u.key]; var maxed = ulv >= u.max; var cost = u.cost(ulv); var afford = meta.currency >= cost;
        var bg = maxed ? 'card_shop_locked' : 'card_shop_normal';
        cards += '<div class="shop-card' + (maxed ? ' locked' : '') + '" data-state="' + (maxed ? 'locked' : 'normal') + '">' +
          '<div class="box"><img class="bg" src="assets/v3/ui/cropped/' + bg + '.png" alt=""><img class="icon" src="assets/v3/ui/cropped/' + (ICON[u.key] || 'icon_00') + '.png" alt=""></div>' +
          '<div class="name">' + u.name + '</div>' +
          '<div class="lv">Lv' + ulv + ' · ' + (maxed ? '满级' : ('+' + (u.max - ulv) + '级')) + '</div>' +
        '</div>';
      });
      shop.innerHTML = cards;
      var shopCards = shop.querySelectorAll('.shop-card');
      UPGRADES.forEach(function (u, i) {
        var ulv = meta.up[u.key]; var maxed = ulv >= u.max; var cost = u.cost(ulv); var afford = meta.currency >= cost;
        if (!maxed && afford && shopCards[i]) {
          shopCards[i].onclick = function () { meta.currency -= cost; meta.up[u.key]++; saveMeta(); renderBase(); AudioSys.sfx.ui(); };
        }
      });
    }
    // === 机库法器展示 ===
    renderHangarEquip();
    // === 资源 & 其他页 ===
    var resJade = document.getElementById('resJade');
    if (resJade) resJade.textContent = meta.currency;
    var resOre = document.getElementById('resOre');
    if (resOre) resOre.textContent = (meta.ore || 0);
    var resArsenal = document.getElementById('resArsenal');
    if (resArsenal) resArsenal.textContent = meta.arsenal.length;
    var resProgress = document.getElementById('resProgress');
    if (resProgress) resProgress.textContent = '最高 ' + meta.bestLayer + ' 层';
    renderArsenal(); renderForge(); renderResearch(); renderCodex();
  }

  function goAircraft(n) {
    var acList = ['a','b','c'];
    var idx = acList.indexOf(selectedAircraft);
    if (idx < 0) idx = 0;
    var next = (idx + n + acList.length) % acList.length;
    selectedAircraft = acList[next];
    renderHangarAircraft();
    AudioSys.sfx.ui();
  }

  function renderHangarAircraft() {
    var portraitMap = { a:'acft_qingfalcon', b:'acft_xuanwu', c:'acft_chilan' };
    var acList = ['a','b','c'];
    if (acList.indexOf(selectedAircraft) < 0) selectedAircraft = acList[0];
    var idx = acList.indexOf(selectedAircraft);

    // slides
    var track = document.getElementById('acTrack');
    if (track) {
      var slides = '';
      acList.forEach(function(id){
        var a = AIRCRAFT[id];
        var locked = !meta.unlocked[id];
        var lockTxt = locked ? ('<div class="ap-lock">未解锁 · ' + a.unlockCost + ' 灵玉' + (a.requireTier ? ' · 第 ' + a.requireTier + ' 层' : '') + '</div>') : '';
        slides += '<div class="ap-slide' + (locked ? ' locked' : '') + '" data-aid="' + id + '"><img src="assets/v3/ui/portrait/' + (portraitMap[id] || 'acft_qingfalcon') + '.png?v=5" alt="' + a.name + '">' + lockTxt + '</div>';
      });
      track.innerHTML = slides;
      track.style.transform = 'translateX(' + (-idx * 100) + '%)';
    }

    // dots
    var dotsWrap = document.getElementById('acDots');
    if (dotsWrap) {
      dotsWrap.innerHTML = '';
      acList.forEach(function(id, i){
        var d = document.createElement('i');
        if (i === idx) d.classList.add('on');
        d.addEventListener('click', function(){
          if (meta.unlocked[id]) { selectedAircraft = id; renderHangarAircraft(); AudioSys.sfx.ui(); }
        });
        dotsWrap.appendChild(d);
      });
    }

    // arrows
    var prev = document.getElementById('acPrev');
    var next = document.getElementById('acNext');
    if (prev) prev.onclick = function(){ goAircraft(-1); };
    if (next) next.onclick = function(){ goAircraft(1); };

    // info / bars / desc（2026-08-19：装甲/机动/电容三维属性完整合并进右侧机体信息模块，紧跟弹道说明下方；左侧仅留立绘+轮播圆点）
    var acft = AIRCRAFT[selectedAircraft];
    var infoEl = document.getElementById('apInfo');
    var armorPct = Math.max(8, Math.min(100, Math.round(acft.hp / 200 * 100)));
    var mobPct = Math.max(8, Math.min(100, Math.round(acft.speed / 300 * 100)));
    var capPct = Math.max(8, Math.min(100, Math.round(acft.fireRate / 8 * 100)));
    var barsHtml =
      '<div class="ap-bars-inline">' +
      '<div class="ibar"><label>装甲</label><div class="track"><div class="fill" style="width:' + armorPct + '%"></div></div><div class="val">' + acft.hp + '</div></div>' +
      '<div class="ibar"><label>机动</label><div class="track"><div class="fill" style="width:' + mobPct + '%"></div></div><div class="val">' + acft.speed + '</div></div>' +
      '<div class="ibar"><label>电容</label><div class="track"><div class="fill" style="width:' + capPct + '%"></div></div><div class="val">' + acft.fireRate + '</div></div>' +
      '</div>';
    if (infoEl) {
      infoEl.innerHTML =
        '<div class="label">机体信息</div>' +
        '<div class="iname">' + acft.name + '</div>' +
        '<div class="itype">' + acft.desc + '</div>' +
        '<div class="imod">' + (acft.mod || '标准模组') + '</div>' +
        '<div class="iweapon"><b>主武器</b>' + acft.name + ' 标准武装</div>' +
        '<div class="iweapon"><b>弹道</b>' + (acft.homing ? '追踪' : (acft.spread ? '散射' : '直射')) + (acft.pellets > 1 ? ' + 散射' : '') + '</div>' +
        barsHtml;
    }
    var barsEl = document.getElementById('apBars');
    if (barsEl) barsEl.innerHTML = barsHtml;
    var descEl = document.getElementById('apDesc');
    if (descEl) {
      descEl.textContent = acft.name + '，' + acft.desc + '。配备标准武装，弹道' + (acft.homing ? '追踪' : (acft.spread ? '散射' : '直射')) + (acft.pellets > 1 ? '并带多重弹片' : '') + '。';
    }

    // 锁定机体出击拦截：选中未解锁机体时禁用出击按钮
    (function(){
      var sb = document.getElementById('startBtn');
      if (!sb) return;
      var selLocked = !meta.unlocked[selectedAircraft];
      sb.classList.toggle('locked', selLocked);
      sb.disabled = selLocked;
      var sm = sb.querySelector('.main'); if (sm) sm.textContent = selLocked ? '未解锁' : '出击';
    })();

    // touch swipe (init once)
    if (!window._hangarTouchInit) {
      window._hangarTouchInit = true;
      var car = document.querySelector('#tab-hangar .ap-carousel');
      if (car) {
        var sx = 0, dx = 0, drag = false, startY = 0;
        car.addEventListener('touchstart', function(e){
          sx = e.touches[0].clientX; startY = e.touches[0].clientY; dx = 0; drag = true;
          var t = document.getElementById('acTrack'); if (t) t.style.transition = 'none';
        }, {passive:true});
        car.addEventListener('touchmove', function(e){
          if (!drag) return;
          dx = e.touches[0].clientX - sx;
          var t = document.getElementById('acTrack');
          if (t) t.style.transform = 'translateX(calc(' + (-idx * 100) + '% + ' + dx + 'px))';
        }, {passive:true});
        car.addEventListener('touchend', function(){
          drag = false;
          var t = document.getElementById('acTrack');
          if (t) t.style.transition = '';
          if (Math.abs(dx) > 40) goAircraft(dx < 0 ? 1 : -1);
          else if (t) t.style.transform = 'translateX(' + (-idx * 100) + '%)';
        });
      }
    }
  }
  // ---------- 军械库 / 熔炼台 / 研究院 / 图鉴（ABC）----------
  function modsText(m) {
    var t = [];
    if (m.dmg) t.push('伤害+' + m.dmg); if (m.maxhp) t.push('HP+' + m.maxhp);
    if (m.maxshield) t.push('护盾+' + m.maxshield); if (m.regen) t.push('回盾+' + m.regen);
    if (m.fireRate) t.push('射速+' + m.fireRate); if (m.critChance) t.push('暴击+' + Math.round(m.critChance * 100) + '%');
    if (m.critMult) t.push('暴伤+' + m.critMult); if (m.bulletSpeed) t.push('弹速+' + m.bulletSpeed); if (m.speed) t.push('移速+' + m.speed);
    if (m.dodgeChance) t.push('闪避+' + Math.round(m.dodgeChance * 100) + '%'); if (m.pierce) t.push('穿透+' + m.pierce);
    if (m.burn) t.push('灼烧' + m.burn); if (m.pellets) t.push('弹片+' + m.pellets); if (m.explode) t.push('爆裂' + m.explode);
    if (m.lifesteal) t.push('吸血' + Math.round(m.lifesteal * 100) + '%');
    if (m.chain) t.push('连锁+' + m.chain); if (m.homing) t.push('追踪');
    if (m.thorns) t.push('反伤' + m.thorns); if (m.shieldRegen) t.push('护盾恢复+' + m.shieldRegen);
    if (m.dmgReduce) t.push('减伤' + Math.round(m.dmgReduce * 100) + '%');
    if (m.blockChance) t.push('格挡' + Math.round(m.blockChance * 100) + '%');
    if (m.dashCdReduce) t.push('冲刺CD-' + m.dashCdReduce + 's');
    if (m.jadeBonus) t.push('灵玉+' + Math.round(m.jadeBonus * 100) + '%');
    if (m.dropBonus) t.push('掉落+' + Math.round(m.dropBonus * 100) + '%');
    return t.join(' · ');
  }
  function getArt(id) { if (!id) return null; for (var i = 0; i < meta.arsenal.length; i++) if (meta.arsenal[i].id === id) return meta.arsenal[i]; return null; }
  function removeArt(id) { for (var i = 0; i < meta.arsenal.length; i++) if (meta.arsenal[i].id === id) { meta.arsenal.splice(i, 1); return; } }
  // 法器评分（用于排序）：稀有度阶梯权重 + 词条数值和
  function artifactScore(a) {
    var m = a.mods || {}, s = RAR.indexOf(a.rarity) * 100;
    s += (m.dmg || 0) * 1 + (m.maxhp || 0) * 0.5 + (m.maxshield || 0) * 0.5 + (m.regen || 0) * 2 +
      (m.fireRate || 0) * 3 + (m.critChance || 0) * 100 + (m.critMult || 0) * 30 + (m.bulletSpeed || 0) * 1 + (m.speed || 0) * 1 +
      (m.dodgeChance || 0) * 80 + (m.pierce || 0) * 8 + (m.pellets || 0) * 10;
    if (m.burn) s += m.burn; if (m.explode) s += m.explode * 0.3;
    if (m.lifesteal) s += m.lifesteal * 200; if (m.chain) s += m.chain * 12;
    if (m.homing) s += 15; if (m.thorns) s += m.thorns; if (m.shieldRegen) s += m.shieldRegen * 3;
    if (m.dmgReduce) s += m.dmgReduce * 200; if (m.blockChance) s += m.blockChance * 80;
    if (m.dashCdReduce) s += m.dashCdReduce * 20; if (m.jadeBonus) s += m.jadeBonus * 50; if (m.dropBonus) s += m.dropBonus * 80;
    if (a.isLegendaryWeapon) s += 200; // 传说武器加分
    if (a.setKey) s += 100; // 套装件加分
    return s;
  }
  function equipArtifact(slot, id) {
    meta.equipped[slot] = (meta.equipped[slot] === id) ? null : id; // 点已装备则卸下
    saveMeta(); renderBase(); renderHangarEquip();
  }
  function recycleArtifact(id) {
    var a = getArt(id); if (!a) return;
    SLOTS.forEach(function (s) { if (meta.equipped[s] === id) meta.equipped[s] = null; });
    removeArt(id); meta.currency += Math.round(RARVAL[RAR.indexOf(a.rarity)] * 0.5); saveMeta(); renderBase(); renderHangarEquip();
  }
  var forgeSel = [];
  var forgeFilterSlot = 'all'; // 'all' | weapon | armor | core | ammo
  var forgeFilterRarity = 'all'; // 'all' | white | green | blue | purple | orange
  var forgeResult = null; // 合成结果显示：{kind:'success'|'destroy'|'disallowed'|'fail', title, sub, color}
  var forgeProcess = false; // 是否正在播放合成过程动画
  var forgeOutputArt = null; // 合成最终产出的法器（成功时）
  var FORGE_ANIM_MS = 900; // 合成动画时长
  function clearForgeState() {
    forgeSel = [];
    forgeResult = null;
    forgeProcess = false;
    forgeOutputArt = null;
  }
  function onForgeClick(id) {
    // 新交互：点选只投料/取回（最多 3 件入炉），合成统一由右侧按钮按预览执行，不再自动合成
    if (forgeProcess) return;
    forgeResult = null; forgeOutputArt = null; // 重新选料即清除上一次合成结果
    var i = forgeSel.indexOf(id);
    if (i >= 0) { forgeSel.splice(i, 1); renderForge(); return; }
    if (forgeSel.length >= 3) return;
    forgeSel.push(id);
    renderForge();
  }
  // 熔炉预览：根据当前投料推衍产物（与按钮校验规则一致）
  // ---------- 熔炼台·自由合成（跨部位·跨品质）期望值点数矩阵（2026-08-19 重构）----------
  // Boss 指定品质点数表（common=白 … legendary=金）；与现有 RAR 键 white/green/blue/purple/orange 一一对应。
  var QUALITY_SCORE = { common: 1, fine: 2, rare: 4, epic: 8, legendary: 16 };
  var RAR_TO_QKEY = { white: 'common', green: 'fine', blue: 'rare', purple: 'epic', orange: 'legendary' };
  var QKEY_TO_RAR = { common: 'white', fine: 'green', rare: 'blue', epic: 'purple', legendary: 'orange' };
  function qScore(rar) { return QUALITY_SCORE[RAR_TO_QKEY[rar]] || 0; } // 任一品质点数
  // 品质阶数（0..4），用于期望值升阶计算
  var TIER_OF = { white: 0, green: 1, blue: 2, purple: 3, orange: 4 };
  // 产出品阶上限：默认允许传说(legendary, 金=阶4)；若经济需收紧改为 3（封顶史诗）
  var FORGE_CAP_TIER = 4;
  // 湮灭惩罚：保留 15% 三件全失（Boss 指定保留赌博机制）；确定性产出阶仍按期望值给定
  var FG_W_DESTROY = 0.15;
  // 期望值判定：三件阶数均值 +0.5 偏置四舍五入 → 期望产出阶（确定性）；跨品质按点数权重
  // 产出槽位：多数部位优先，平局取点数(稀有度)最高件
  function forgeExpected(arts) {
    var sumT = 0, sumScore = 0;
    arts.forEach(function (a) { sumT += (TIER_OF[a.rarity] || 0); sumScore += qScore(a.rarity); });
    var avgT = sumT / Math.max(1, arts.length);
    var outTier = Math.round(avgT + 0.5);
    if (outTier < 0) outTier = 0;
    if (outTier > FORGE_CAP_TIER) outTier = FORGE_CAP_TIER;
    var outRar = RAR[outTier];
    // 槽位：多数部位优先，平局取点数最高件
    var bySlot = {};
    arts.forEach(function (a) { bySlot[a.slot] = (bySlot[a.slot] || 0) + 1; });
    var bestSlot = arts[0].slot, bestCount = -1, bestScore = -1;
    arts.forEach(function (a) {
      var c = bySlot[a.slot];
      var sc = qScore(a.rarity);
      if (c > bestCount || (c === bestCount && sc > bestScore)) { bestCount = c; bestSlot = a.slot; bestScore = sc; }
    });
    return { outRar: outRar, slot: bestSlot, points: sumScore, avgT: avgT, outTier: outTier };
  }
  // ---- 局内 M 键战利品 3 合1 赌博（与基地熔炉自由合成相互独立，保留原概率规则与封顶；仅被 threeMergeFrom 使用）----
  var FG_CAP = RAR.length - 2; // = 3 紫；局内 3 合1 产出封顶（金不可熔）
  var FG_RM_W_DESTROY = 0.15, FG_RM_W1 = 0.76, FG_RM_W2 = 0.075, FG_RM_W3 = 0.015;
  function rollForge3(baseRar) {
    var ri = RAR.indexOf(baseRar);
    if (ri < 0 || ri >= FG_CAP) return { state: 'maxed' };
    var r = Math.random();
    if (r < FG_RM_W_DESTROY) return { state: 'destroy' };
    var rr = r - FG_RM_W_DESTROY;
    var d = (rr < FG_RM_W1) ? 1 : (rr < FG_RM_W1 + FG_RM_W2) ? 2 : 3;
    var out = Math.min(ri + d, FG_CAP);
    return { state: 'ok', out: RAR[out] };
  }
  // ---------- 数值继承合成（2026-08-17 v2）----------
  // 核心：把投入的低阶装备数值求和，按产出品质系数放大，沉淀为一件高阶装备。
  // 低品质数值 → 高品质数值，是熔炼台的核心滚雪球循环。
  var TIER_MULT = { white: 1.0, green: 1.2, blue: 1.45, purple: 1.75, orange: 2.0 };
  function cleanStat(v) {
    if (typeof v !== 'number' || isNaN(v)) return 0;
    if (Math.abs(v) >= 1) return Math.round(v);
    return Math.round(v * 100) / 100;
  }
  // 把 inputs 的数值汇总，并按产出品质 outRar 的系数放大；bonus 为额外词条（可选）
  function inheritMods(inputs, outRar, bonus) {
    var sum = {};
    for (var i = 0; i < inputs.length; i++) {
      var m = inputs[i].mods || {};
      for (var k in m) {
        if (k === '_prefix') continue;
        if (typeof m[k] !== 'number') { if (m[k]) sum[k] = true; continue; } // 布尔词条（如追踪）取并集
        sum[k] = (sum[k] || 0) + m[k];
      }
    }
    var mult = TIER_MULT[outRar] || 1;
    var out = {};
    for (var k2 in sum) {
      if (sum[k2] === true) { out[k2] = true; continue; }
      out[k2] = cleanStat(sum[k2] * mult);
    }
    if (bonus) { for (var b in bonus) { out[b] = cleanStat((out[b] || 0) + bonus[b]); } }
    return out;
  }
  // 三合随机额外词条池（成功时在继承数值之上追加一条）
  var FORGE_BONUS_POOL = [
    { dmg: 3 }, { maxhp: 14 }, { fireRate: 0.35 }, { speed: 0.25 },
    { critChance: 0.06 }, { pierce: 1 }, { dodgeChance: 0.04 }, { maxshield: 10 }
  ];
  function rollForgeBonus() { return FORGE_BONUS_POOL[randi(0, FORGE_BONUS_POOL.length - 1)]; }
  function forgePreview(arts) {
    if (arts.length === 0) return { ready: false, title: '熔炉', sub: '点击下方槽位或列表选择 2~3 件法宝投料' };
    if (arts.length === 1) return { ready: false, title: '已选 1 件', sub: '再选 2 件即可自由合成（任意部位·任意品质）' };
    if (arts.length === 2) {
      // 旧安全路径：同槽位·同稀有度 → 必升 1 阶（无湮灭）；跨槽/跨质需补第 3 件走自由合成
      if (arts[0].slot === arts[1].slot && arts[0].rarity === arts[1].rarity) {
        var ri = RAR.indexOf(arts[0].rarity);
        if (ri >= 0 && ri < RAR.length - 1) {
          var outRar2 = RAR[ri + 1];
          return { ready: true, title: RARNAME[outRar2] + '·' + SLOTNAME[arts[0].slot], sub: '二合一 · 必升一阶（安全·无湮灭）', color: RARCOL[outRar2], previewMods: inheritMods([arts[0], arts[1]], outRar2, null) };
        }
        return { ready: false, title: '已是最高阶', sub: '传说不可再升', color: RARCOL.orange };
      }
      return { ready: false, title: '需 3 件自由合成', sub: '2 件不同槽/不同质 → 补第 3 件跨部位合成' };
    }
    if (arts.length === 3) {
      // 自由合成：跨部位·跨品质，期望值点数矩阵判定（确定性产出阶 + 15% 湮灭保留）
      var exp = forgeExpected(arts);
      var dpct = Math.round(FG_W_DESTROY * 100);
      return {
        ready: true,
        title: RARNAME[exp.outRar] + '·' + SLOTNAME[exp.slot],
        sub: '跨部位·跨品质自由合成 → 期望 ' + RARNAME[exp.outRar] + '（点数 ' + exp.points + ' · 湮灭 ' + dpct + '%）',
        color: RARCOL[exp.outRar],
        previewMods: inheritMods(arts, exp.outRar, null)
      };
    }
    return { ready: false, title: '已选 ' + arts.length + ' 件', sub: '请选 2 件（同槽同质安全）或 3 件（自由合成）' };
  }
  function setForgeResult(kind, title, sub, color) {
    forgeResult = { kind: kind, title: title, sub: sub, color: color };
    renderForge();
  }
  function autoForgeMerge(count) {
    // 自动找 count 件同槽位同稀有度非橙色法器合成
    for (var ri = 0; ri < RAR.length - 1; ri++) {
      var candidates = meta.arsenal.filter(function (a) {
        return a.rarity === RAR[ri] && a.rarity !== 'orange';
      });
      // 按槽位分组
      var bySlot = {};
      candidates.forEach(function (a) {
        if (!bySlot[a.slot]) bySlot[a.slot] = [];
        bySlot[a.slot].push(a);
      });
      for (var s in bySlot) {
        if (bySlot[s].length >= count) {
          // 取分数最低的 count 件
          bySlot[s].sort(function (x, y) { return artifactScore(x) - artifactScore(y); });
          var ids = bySlot[s].slice(0, count).map(function (a) { return a.id; });
          if (count === 2) {
            var pairArts = ids.map(getArt).filter(Boolean);
            ids.forEach(function (id) { removeArt(id); });
            meta.arsenal.push(makeArtifact(s, RAR[ri + 1], RARNAME[RAR[ri + 1]] + '·' + SLOTNAME[s] + '(二合)', inheritMods(pairArts, RAR[ri + 1], null)));
          } else {
            forgeSel = ids.slice();
            var plan = planForgeMerge();
            if (plan.ok && plan.exec) plan.exec();
          }
          forgeSel = [];
          saveMeta();
          renderBase();
          return true;
        }
      }
    }
    return false;
  }
  var arsenalTab = 'weapon';
  var arsenalSort = 'power'; // 'power' | 'rarity' | 'name'
  function renderArsenal() {
    // === 装备槽（左栏 equipSlots） ===
    var slotsEl = document.getElementById('equipSlots');
    if (slotsEl) {
      slotsEl.innerHTML = '';
      if (arsenalTab !== 'all' && SLOTS.indexOf(arsenalTab) < 0) arsenalTab = SLOTS[0];
      var SLOTNAME = { weapon:'武器', armor:'护甲', core:'核心', ammo:'弹药' };
      SLOTS.forEach(function (slot) {
        var eq = getArt(meta.equipped[slot]);
        var cnt = meta.arsenal.filter(function (a) { return a.slot === slot; }).length;
        var active = slot === arsenalTab;
        var el = document.createElement('div'); el.className = 'eq-slot' + (active ? ' on' : ''); el.dataset.slot = slot;
        var iconHtml = '';
        if (eq) {
          if (eq.slot === 'weapon') iconHtml = weaponIconHtml(eq, 'wpn-icon-slot');
          else iconHtml = gearIconHtml(eq, 'gear-icon-slot');
        }
        var nameHtml = eq
          ? '<div class="eq-rarity"><span class="rarity-badge rarity-' + eq.rarity + '"></span><div class="eq-item-name" style="color:' + RARCOL[eq.rarity] + '">' + eq.name + '</div></div>' +
            '<span class="eq-off">✕</span>'
          : '<div class="eq-item-name empty">未装备</div>';
        var html =
          '<div class="eq-icon">' + iconHtml + '<div class="eq-count">' + cnt + '</div></div>' +
          '<div class="eq-info">' +
            '<div class="eq-type">' + SLOTNAME[slot] + '</div>' +
            nameHtml +
          '</div>';
        el.innerHTML = html;
        el.onclick = (function (s) { return function () { arsenalTab = s; renderArsenal(); }; })(slot);
        var off = el.querySelector('.eq-off');
        if (off) off.onclick = (function (s) { return function (ev) { ev.stopPropagation(); equipArtifact(s, meta.equipped[s]); }; })(slot);
        slotsEl.appendChild(el);
      });
    }
    // === 仓库列表（中央 arsenalList） ===
    var box = document.getElementById('arsenalList'); if (!box) return; box.innerHTML = '';
    var slot = arsenalTab;
    var inv = (arsenalTab === 'all') ? meta.arsenal.slice() : meta.arsenal.filter(function (a) { return a.slot === slot; });
    // 筛选条
    var fbar = document.createElement('div'); fbar.className = 'arsenal-filter';
    ['all'].concat(SLOTS).forEach(function (s) {
      var c = document.createElement('span'); c.className = 'fchip' + (arsenalTab === s ? ' on' : '');
      c.textContent = s === 'all' ? '全部' : SLOTNAME[s];
      c.onclick = (function (ss) { return function () { arsenalTab = ss; renderArsenal(); }; })(s);
      fbar.appendChild(c);
    });
    var sortWrap = document.createElement('div'); sortWrap.className = 'sort-toggle';
    [['power', '战力'], ['rarity', '稀有度'], ['name', '名称']].forEach(function (o) {
      var s = document.createElement('span'); s.className = 'stoggle' + (arsenalSort === o[0] ? ' on' : '');
      s.textContent = o[1];
      s.onclick = (function (k) { return function () { arsenalSort = k; renderArsenal(); }; })(o[0]);
      sortWrap.appendChild(s);
    });
    fbar.appendChild(sortWrap);
    box.appendChild(fbar);
    // 应用排序（已装备始终置顶）；筛选已改由 arsenalTab(slot) 控制
    var shown = inv.slice();
    shown.sort(function (x, y) {
      if (arsenalSort === 'rarity') return RAR.indexOf(y.rarity) - RAR.indexOf(x.rarity) || artifactScore(y) - artifactScore(x);
      if (arsenalSort === 'name') return x.name < y.name ? -1 : (x.name > y.name ? 1 : 0);
      return artifactScore(y) - artifactScore(x);
    });
    var eqOn = meta.equipped[slot];
    shown = shown.filter(function (a) { return a.id !== eqOn; });
    if (eqOn) { var eo = getArt(eqOn); if (eo) shown.unshift(eo); }
    var list = document.createElement('div'); list.className = 'inv-list';
    if (shown.length === 0) {
      var empt = document.createElement('div'); empt.className = 'q-empty';
      empt.textContent = inv.length === 0
        ? (meta.arsenal.length === 0 ? '军械库空空如也，先去搜刮带回法器。' : ('暂无' + SLOTNAME[slot] + '类法器 · 点左侧其他槽位查看'))
        : ('当前筛选下没有匹配的' + SLOTNAME[slot] + '法器');
      list.appendChild(empt);
    } else {
      shown.forEach(function (a) {
        var on = a.id === meta.equipped[slot];
        var row = document.createElement('div'); row.className = 'inv-row' + (on ? ' on' : '');
        var iconBox = document.createElement('div'); iconBox.className = 'inv-icon';
        iconBox.innerHTML = a.slot === 'weapon' ? weaponIconHtml(a, 'wpn-icon-row') : gearIconHtml(a, 'gear-icon-row');
        var pow = document.createElement('span'); pow.className = 'inv-pow'; pow.textContent = '⚔' + artifactScore(a); iconBox.appendChild(pow);
        var txt = document.createElement('div'); txt.className = 'inv-txt';
        txt.innerHTML = '<div class="inv-1"><span class="an" style="color:' + RARCOL[a.rarity] + '">' + a.name + '</span><span class="rar">' + RARNAME[a.rarity] + '</span></div><div class="mods">' + modsText(a.mods) + '</div>';
        var act = document.createElement('div'); act.className = 'inv-act';
        var eqBtn = document.createElement('button'); eqBtn.className = 'inv-equip'; eqBtn.textContent = '装配';
        if (on) { eqBtn.disabled = true; eqBtn.style.opacity = '0.45'; eqBtn.style.cursor = 'default'; eqBtn.textContent = '已装备'; }
        else { eqBtn.onclick = (function (slot, id) { return function (ev) { ev.stopPropagation(); if (meta.equipped[slot] !== id) equipArtifact(slot, id); }; })(a.slot, a.id); }
        var recBtn = document.createElement('button'); recBtn.className = 'inv-rec'; recBtn.textContent = '回收';
        recBtn.onclick = (function (id) { return function (ev) { ev.stopPropagation(); recycleArtifact(id); }; })(a.id);
        act.appendChild(eqBtn); act.appendChild(recBtn);
        row.appendChild(iconBox); row.appendChild(txt); row.appendChild(act);
        row.onclick = function () { if (!on) equipArtifact(a.slot, a.id); };
        list.appendChild(row);
      });
    }
    box.appendChild(list);
  }
  function forgeIconHtml(art, extraCls) {
    if (!art) return '';
    var c = extraCls || 'forge-icon';
    if (art.slot === 'weapon') return weaponIconHtml(art, c + ' wpn-forge');
    return gearIconHtml(art, c + ' gear-forge');
  }
  function renderForge() {
    // === 左：材料列表 + 筛选 ===
    var filtersEl = document.getElementById('forgeFilters');
    if (filtersEl) {
      filtersEl.innerHTML = '';
      var wrap = document.createElement('div'); wrap.className = 'forge-filters';
      // 槽位筛选
      var slotRow = document.createElement('div'); slotRow.className = 'forge-filter-row';
      var slotLab = document.createElement('div'); slotLab.className = 'flabel'; slotLab.textContent = '类型';
      slotRow.appendChild(slotLab);
      [['all', '全部'], ['weapon', '武器'], ['armor', '护甲'], ['core', '核心'], ['ammo', '弹药']].forEach(function (o) {
        var c = document.createElement('span'); c.className = 'fchip' + (forgeFilterSlot === o[0] ? ' on' : '') + (o[0] === 'all' ? ' all' : '');
        c.textContent = o[1];
        c.onclick = function () { forgeFilterSlot = o[0]; renderForge(); };
        slotRow.appendChild(c);
      });
      wrap.appendChild(slotRow);
      // 品质筛选
      var rarRow = document.createElement('div'); rarRow.className = 'forge-filter-row';
      var rarLab = document.createElement('div'); rarLab.className = 'flabel'; rarLab.textContent = '品质';
      rarRow.appendChild(rarLab);
      [['all', '全部']].concat(RAR.map(function (r) { return [r, RARNAME[r]]; })).forEach(function (o) {
        var c = document.createElement('span'); c.className = 'fchip' + (forgeFilterRarity === o[0] ? ' on' : '') + (o[0] === 'all' ? ' all' : '');
        c.textContent = o[1];
        if (o[0] !== 'all') c.style.color = forgeFilterRarity === o[0] ? '#0c0a08' : RARCOL[o[0]];
        c.onclick = function () { forgeFilterRarity = o[0]; renderForge(); };
        rarRow.appendChild(c);
      });
      wrap.appendChild(rarRow);
      filtersEl.appendChild(wrap);
    }
    var box = document.getElementById('forgeList');
    if (box) {
      // 仅清空列表本身，保留上方筛选
      var listEls = box.querySelectorAll('.forge-mat-list, .forge-tip');
      listEls.forEach(function (el) { el.remove(); });
      var shown = meta.arsenal.filter(function (a) {
        return (forgeFilterSlot === 'all' || a.slot === forgeFilterSlot) &&
               (forgeFilterRarity === 'all' || a.rarity === forgeFilterRarity);
      });
      if (shown.length === 0 && meta.arsenal.length === 0) {
        var empty = document.createElement('div'); empty.className = 'mini forge-tip'; empty.textContent = '军械库空空，先去搜刮带回法器';
        box.appendChild(empty);
      } else if (shown.length === 0) {
        var noMatch = document.createElement('div'); noMatch.className = 'mini forge-tip'; noMatch.textContent = '当前筛选没有匹配材料';
        box.appendChild(noMatch);
      } else {
        var tip = document.createElement('div'); tip.className = 'forge-tip';
        tip.textContent = '点选材料投料（最多 3 件）：投入装备的数值会被继承并放大到产出上。任意 2 件同槽同质 → 安全升 1 阶；任意 3 件（跨部位·跨品质）→ 期望值点数矩阵判定产出阶（15% 湮灭）。';
        box.appendChild(tip);
        var list = document.createElement('div'); list.className = 'forge-mat-list';
        shown.forEach(function (a) {
          var el = document.createElement('div'); el.className = 'art' + (forgeSel.indexOf(a.id) >= 0 ? ' on' : '');
          el.innerHTML = '<div class="artline"><span class="an" style="color:' + RARCOL[a.rarity] + '">' + a.name + '</span><span class="rar">' + SLOTNAME[a.slot] + '·' + RARNAME[a.rarity] + '</span></div><div class="mini">' + modsText(a.mods) + '</div>';
          el.onclick = function () { onForgeClick(a.id); };
          list.appendChild(el);
        });
        box.appendChild(list);
      }
    }
    // === 中：熔炉舞台（三槽投料 + 过程动画 + 顶部结果） ===
    var stage = document.getElementById('forgeStage');
    if (stage) {
      stage.innerHTML = '';
      var arts = forgeSel.map(getArt).filter(Boolean);
      for (var i = 0; i < 3; i++) {
        var s = document.createElement('div');
        s.className = 'fg-slot forge-slot-hitbox' + (arts[i] ? '' : ' empty') + (forgeProcess ? ' melting' : '');
        s.setAttribute('data-pos', i);
        s.style.pointerEvents = 'auto'; // 圆盘相对百分比透明热区：点击即弹底抽选料（任意朝向）
        s.onclick = (function (p) { return function () { openForgeDrawer(p); }; })(i);
        if (arts[i]) {
          s.innerHTML = forgeIconHtml(arts[i], 'forge-slot-icon');
        }
        stage.appendChild(s);
      }
      // 合成过程：中心光球 + 扩散环
      if (forgeProcess) {
        var pulse = document.createElement('div');
        pulse.className = 'fg-process';
        stage.appendChild(pulse);
        var ring = document.createElement('div');
        ring.className = 'fg-process-ring';
        stage.appendChild(ring);
        var sparks = document.createElement('div');
        sparks.className = 'fg-process-sparks';
        stage.appendChild(sparks);
      }
      // 合成最终结果 + 状态文字：合并为单 .forge-result-preview（flex-column 上下两行），消除旧版 fg-output(top:24%)+fg-result(top:36%) 两层 absolute 居中堆叠导致的文字重叠穿插
      var output = document.createElement('div');
      if (forgeResult) {
        output.className = 'forge-result-preview show ' + forgeResult.kind;
        var oTitle = forgeResult.kind === 'success' && forgeOutputArt ? forgeOutputArt.name : forgeResult.title;
        var oAttrs = forgeResult.sub;
        if (forgeResult.kind === 'success' && forgeOutputArt) oAttrs += '\n' + modsText(forgeOutputArt.mods);
        output.innerHTML = '<div class="forge-result-title">' + oTitle + '</div><div class="forge-result-attrs">' + oAttrs + '</div>';
      } else {
        var pv = forgePreview(arts);
        output.className = 'forge-result-preview' + (pv.ready ? ' glow' : '');
        var pTitle = pv.title;
        var pAttrs = pv.sub;
        if (pv.previewMods) pAttrs += '\n预计产出：' + modsText(pv.previewMods);
        output.innerHTML = '<div class="forge-result-title">' + pTitle + '</div><div class="forge-result-attrs">' + pAttrs + '</div>';
      }
      stage.appendChild(output);
    }
    // === 右：合成按钮提示 / 结果 ===
    var hint = document.getElementById('forgeHint');
    if (hint) {
      if (forgeResult) {
        var h = '<span style="color:' + forgeResult.color + ';font-weight:800">' + forgeResult.title + '：</span>' + forgeResult.sub;
        if (forgeResult.kind === 'success' && forgeOutputArt) h += '<br><span style="font-size:10px;color:#E8DCC4">' + modsText(forgeOutputArt.mods) + '</span>';
        hint.innerHTML = h;
      } else {
        var arts = forgeSel.map(getArt).filter(Boolean);
        if (forgeSel.length === 0) hint.innerHTML = '请选择 2 件（同槽同质安全升阶）或 3 件（跨部位·跨品质自由合成）';
        else if (forgeSel.length === 1) hint.innerHTML = '再选 1 件同槽同质 → 安全升阶<br>或再选 2 件任意部位品质 → 自由合成';
        else {
          var pv = forgePreview(arts);
          if (pv.ready) hint.innerHTML = '<span style="color:' + (pv.color || 'var(--paper)') + '">可合成：' + pv.sub + '</span>';
          else hint.innerHTML = pv.sub;
        }
      }
    }
    // 合成按钮激活门槛：投满 2~3 件材料才可执行（不足 2 件禁用置灰）
    var _fcBtn = document.getElementById('forgeCraft'); if (_fcBtn) _fcBtn.disabled = !(forgeSel.length >= 2);
  }
  // ---------- 熔炼台·竖屏底抽弹窗（点击熔炉槽位 → 选料填入对应槽位；PC 宽屏由 orientation 守卫不启用，逻辑不变） ----------
  var forgeDrawerPos = -1;
  function ensureForgeDrawer() {
    if (document.getElementById('forgeDrawer')) return;
    var d = document.createElement('div'); d.id = 'forgeDrawer'; d.className = 'forge-drawer';
    d.innerHTML = '<div class="fd-mask" id="forgeDrawerMask"></div>' +
      '<div class="fd-panel"><div class="fd-head"><span>选择法器投料</span><i class="fd-close" id="forgeDrawerClose">✕</i></div>' +
      '<div class="fd-body" id="forgeDrawerBody"></div></div>';
    document.body.appendChild(d);
    var mask = document.getElementById('forgeDrawerMask'); if (mask) mask.onclick = closeForgeDrawer;
    var x = document.getElementById('forgeDrawerClose'); if (x) x.onclick = closeForgeDrawer;
  }
  function openForgeDrawer(pos) {
    // 2026-08-19：废除竖屏 orientation 守卫 —— 任意朝向（含 PC）点击熔炉圆盘热区均可弹底抽选料；PC 侧栏列表保留双通道
    forgeDrawerPos = pos;
    ensureForgeDrawer();
    renderForgeDrawer();
    var d = document.getElementById('forgeDrawer'); if (d) d.classList.add('open');
  }
  function closeForgeDrawer() {
    var d = document.getElementById('forgeDrawer'); if (d) d.classList.remove('open');
  }
  function fillForgeSlot(pos, id) {
    var i = forgeSel.indexOf(id);
    if (i >= 0) { forgeSel.splice(i, 1); renderForge(); closeForgeDrawer(); return; } // 已选 → 取消
    var arr = forgeSel.filter(Boolean);
    var p = Math.max(0, Math.min(pos, arr.length));
    arr.splice(p, 0, id);
    if (arr.length > 3) arr = arr.slice(0, 3);
    forgeSel = arr;
    renderForge(); closeForgeDrawer();
  }
  function renderForgeDrawer() {
    var body = document.getElementById('forgeDrawerBody'); if (!body) return;
    body.innerHTML = '';
    var slotRow = document.createElement('div'); slotRow.className = 'forge-filter-row';
    slotRow.innerHTML = '<span class="flabel">类型</span>';
    [['all', '全部'], ['weapon', '武器'], ['armor', '护甲'], ['core', '核心'], ['ammo', '弹药']].forEach(function (o) {
      var c = document.createElement('span'); c.className = 'fchip' + (forgeFilterSlot === o[0] ? ' on' : ''); c.textContent = o[1];
      c.onclick = function () { forgeFilterSlot = o[0]; renderForgeDrawer(); };
      slotRow.appendChild(c);
    });
    body.appendChild(slotRow);
    var rarRow = document.createElement('div'); rarRow.className = 'forge-filter-row';
    rarRow.innerHTML = '<span class="flabel">品质</span>';
    [['all', '全部']].concat(RAR.map(function (r) { return [r, RARNAME[r]]; })).forEach(function (o) {
      var c = document.createElement('span'); c.className = 'fchip' + (forgeFilterRarity === o[0] ? ' on' : ''); c.textContent = o[1];
      if (o[0] !== 'all') c.style.color = forgeFilterRarity === o[0] ? '#0c0a08' : RARCOL[o[0]];
      c.onclick = function () { forgeFilterRarity = o[0]; renderForgeDrawer(); };
      rarRow.appendChild(c);
    });
    body.appendChild(rarRow);
    var shown = meta.arsenal.filter(function (a) {
      return (forgeFilterSlot === 'all' || a.slot === forgeFilterSlot) && (forgeFilterRarity === 'all' || a.rarity === forgeFilterRarity);
    });
    if (shown.length === 0) {
      var e = document.createElement('div'); e.className = 'mini'; e.style.color = 'var(--muted)';
      e.textContent = meta.arsenal.length === 0 ? '军械库空空，先去搜刮带回法器' : '当前筛选没有匹配材料';
      body.appendChild(e); return;
    }
    var list = document.createElement('div'); list.className = 'forge-mat-list';
    shown.forEach(function (a) {
      var el = document.createElement('div'); el.className = 'art' + (forgeSel.indexOf(a.id) >= 0 ? ' on' : '');
      el.innerHTML = '<div class="artline"><span class="an" style="color:' + RARCOL[a.rarity] + '">' + a.name + '</span><span class="rar">' + SLOTNAME[a.slot] + '·' + RARNAME[a.rarity] + '</span></div><div class="mini">' + modsText(a.mods) + '</div>';
      el.onclick = function () { fillForgeSlot(forgeDrawerPos, a.id); };
      list.appendChild(el);
    });
    body.appendChild(list);
  }
  // 研究院节点图标（v3 切图）：锋锐→雷刃 会心→星盘 体魄→盾 磁吸→聚合 撤离→转换
  var RES_ICONS = { dmg1: 'icon_22', crit1: 'icon_33', hp1: 'icon_30', mag1: 'icon_20', ext1: 'icon_13' };
  var TECH_ICONS = { hp: 'icon_30', dmg: 'icon_22', flip: 'icon_33', bag: 'icon_10' };
  function renderResearch() {
    var box = document.getElementById('researchList'); if (!box) return; box.innerHTML = ''; // 防御：元素缺失不炸整条 renderBase 链
    // === 天梯科技（多级永久升级 · 消耗灵玉+灵矿碎屑）===
    var techHeader = document.createElement('div'); techHeader.className = 'research-section-header';
    techHeader.innerHTML = '<span>天梯科技</span><i>消耗灵玉+灵矿碎屑永久升级，每局生效</i>';
    box.appendChild(techHeader);
    TECH_TREE.forEach(function (tk) {
      var lv = (meta.tech && meta.tech[tk.key]) || 0;
      var maxed = lv >= tk.max;
      var costJ = tk.costJade(lv), costO = tk.costOre(lv);
      var afford = meta.currency >= costJ && (meta.ore || 0) >= costO && !maxed;
      var el = document.createElement('div'); el.className = 'research-card' + (maxed ? ' maxed' : (afford ? ' canbuy' : ' cant'));
      var statusTxt = maxed ? ('✓ 满级 Lv' + lv) : ('Lv' + lv + ' → ' + (lv + 1) + ' · 需 ' + costJ + ' 灵玉 + ' + costO + ' 碎屑');
      el.innerHTML = '<div class="rc-icon"><img src="assets/v3/ui/cropped/' + (TECH_ICONS[tk.key] || 'icon_32') + '.png" alt=""></div>' +
        '<div class="rc-name">' + tk.name + ' <span style="color:#C9A24B">Lv' + lv + '/' + tk.max + '</span></div>' +
        '<div class="rc-desc">' + tk.desc + '</div>' +
        '<div class="rc-status">' + statusTxt + '</div>';
      el.title = tk.name + '：' + tk.desc + '（当前 Lv' + lv + '/' + tk.max + '）';
      if (!maxed && afford) el.onclick = function () {
        meta.currency -= costJ; meta.ore = (meta.ore || 0) - costO;
        meta.tech[tk.key] = lv + 1; saveMeta(); renderBase(); AudioSys.sfx.merge();
      };
      // 不可购/满级也给点击反馈（避免"点了没反应"——Boss 反馈的缺 UI 交互根因之一）
      else if (maxed) el.onclick = function () { setBanner('该科技已满级', 1.2); };
      else el.onclick = function () {
        if (meta.currency < costJ) setBanner('灵玉不足（需 ' + costJ + '）', 1.4);
        else if ((meta.ore || 0) < costO) setBanner('灵矿碎屑不足（需 ' + costO + '）', 1.4);
        else setBanner('资源不足，先去深渊搜刮', 1.4);
      };
      box.appendChild(el);
    });
    // === 基础研究（一次性解锁）===
    var resHeader = document.createElement('div'); resHeader.className = 'research-section-header';
    resHeader.innerHTML = '<span>基础研究</span><i>一次性灵玉解锁，永久生效</i>';
    box.appendChild(resHeader);
    RESEARCH.forEach(function (r) {
      var done = !!meta.research[r.key];
      var reqOk = meta.maxTier >= (r.reqTier || 1);
      var afford = meta.currency >= r.cost && reqOk;
      var el = document.createElement('div'); el.className = 'research-card' + (done ? ' maxed' : (reqOk ? (afford ? ' canbuy' : ' cant') : ' locked'));
      var reqTxt = reqOk ? ('需 ' + r.cost + ' 灵玉') : ('需通关第 ' + r.reqTier + ' 层');
      el.innerHTML = '<div class="rc-icon"><img src="assets/v3/ui/cropped/' + (RES_ICONS[r.key] || 'icon_32') + '.png" alt=""></div>' +
        '<div class="rc-name">' + r.name + '</div>' +
        '<div class="rc-desc">' + r.desc + '</div>' +
        '<div class="rc-status">' + (done ? '✓ 已解锁' : reqTxt) + '</div>';
      el.title = r.name + '：' + r.desc;
      if (!done && afford) el.onclick = function () { meta.currency -= r.cost; meta.research[r.key] = true; saveMeta(); renderBase(); };
      // 不可解锁也给点击反馈
      else if (done) el.onclick = function () { setBanner('该研究已解锁', 1.2); };
      else if (!reqOk) el.onclick = function () { setBanner('需先通关第 ' + r.reqTier + ' 层', 1.4); };
      else el.onclick = function () { setBanner('灵玉不足（需 ' + r.cost + '）', 1.4); };
      box.appendChild(el);
    });
  }
  // ---------- 图鉴：六分类（敌怪/战利品/套装/传说武器/机体/研究） ----------
  var codexCat = 'enemies';
  var CODEX_CATS = [
    { key: 'enemies', name: '敌怪', icon: 'icon_33', sub: '深渊击杀记录' },
    { key: 'loot', name: '战利品', icon: 'icon_00', sub: '法器收集进度' },
    { key: 'sets', name: '套装', icon: 'icon_30', sub: 'BOSS 遗物套装' },
    { key: 'legendary', name: '传说武器', icon: 'icon_12', sub: '宝库传说兵刃' },
    { key: 'aircraft', name: '机体', icon: 'icon_23', sub: '机库档案' },
    { key: 'research', name: '研究', icon: 'icon_21', sub: '卷轴课题' }
  ];
  function hasArtNamed(name) {
    return meta.arsenal.some(function (a) { return a.name === name; });
  }
  function renderCodex() {
    // 左页：六分类卡位
    var catsBox = document.getElementById('codexCats');
    if (catsBox) {
      catsBox.innerHTML = '';
      CODEX_CATS.forEach(function (c) {
        var el = document.createElement('div');
        el.className = 'fchip' + (codexCat === c.key ? ' on' : '');
        el.textContent = c.name;
        el.onclick = function () { codexCat = c.key; renderCodex(); };
        catsBox.appendChild(el);
      });
    }
    var cat = null;
    for (var ci = 0; ci < CODEX_CATS.length; ci++) if (CODEX_CATS[ci].key === codexCat) cat = CODEX_CATS[ci];
    if (!cat) cat = CODEX_CATS[0];
    // 右页：大图 / 标题 / 副标
    var art = document.getElementById('codexArt');
    if (art) art.src = 'assets/v3/ui/cropped/' + cat.icon + '.png';
    var head = document.getElementById('codexHead');
    if (head) head.textContent = cat.name;
    var sub = document.getElementById('codexSub');
    if (sub) sub.textContent = cat.sub;
    // 右页：详情
    var box = document.getElementById('codexBox');
    if (!box) return;
    var html = '';
    if (cat.key === 'enemies') {
      var enN = { ram: '冲撞怪', shoot: '游猎怪', gunship: '炮艇', heal: '游医', split: '分裂体', elite: '精英', looter: '劫掠者', boss: 'BOSS' };
      var ep = [];
      for (var k in meta.codex.enemies) if (meta.codex.enemies[k] > 0) ep.push((enN[k] || k) + ' ×' + meta.codex.enemies[k]);
      html = ep.length ? '<div class="cx-sec">' + ep.join(' · ') + '</div>' : '<div class="cx-sec cx-miss">尚未击杀任何敌人，出击深渊后再来翻阅。</div>';
    } else if (cat.key === 'loot') {
      var parts = [];
      ['white', 'green', 'blue', 'purple', 'orange'].forEach(function (r) {
        var n = meta.codex.loot[r] || 0;
        parts.push('<span style="color:' + (n > 0 ? RARCOL[r] : '#8a7a60') + '">' + RARNAME[r] + ' ×' + n + '</span>');
      });
      html = '<div class="cx-sec">' + parts.join('<br>') + '</div>';
    } else if (cat.key === 'sets') {
      for (var boss in BOSS_RELICS) {
        var relics = BOSS_RELICS[boss];
        var gname = relics[0].name.split('·')[0];
        var rows = relics.map(function (rc) {
          var got = hasArtNamed(rc.name);
          return '<div>' + (got ? '<span class="cx-got">✓ ' : '<span class="cx-miss">✧ ') + rc.name + '（' + SLOTNAME[rc.slot] + '）</span></div>';
        }).join('');
        html += '<div class="cx-sec"><div class="cx-t">' + gname + '</div>' + rows + '</div>';
      }
    } else if (cat.key === 'legendary') {
      for (var lname in LEGENDARY_WEAPONS) {
        var lw = LEGENDARY_WEAPONS[lname];
        var lgot = hasArtNamed(lname);
        html += '<div class="cx-sec">' + (lgot ? '<span class="cx-got">✓ ' : '<span class="cx-miss">✧ ') + lname + '</span>' +
          '<div class="cx-desc">' + (lw.passiveDesc || '') + '</div></div>';
      }
    } else if (cat.key === 'aircraft') {
      for (var aid in AIRCRAFT) {
        var ac = AIRCRAFT[aid];
        var un = !!meta.unlocked[aid];
        var lockTxt = un ? '' : ('<div class="cx-desc">解锁：' + ac.unlockCost + ' 灵玉' + (ac.requireTier ? ' + 通关第 ' + ac.requireTier + ' 层' : '') + '</div>');
        html += '<div class="cx-sec">' + (un ? '<span class="cx-got">✓ ' : '<span class="cx-miss">✧ ') + ac.name + '（' + ac.desc + '）</span>' + lockTxt + '</div>';
      }
    } else if (cat.key === 'research') {
      RESEARCH.forEach(function (r) {
        var done = !!meta.research[r.key];
        html += '<div class="cx-sec">' + (done ? '<span class="cx-got">✓ ' : '<span class="cx-miss">✧ ') + r.name + '</span>' +
          '<div class="cx-desc">' + r.desc + (done ? '' : ' · ' + r.cost + ' 灵玉') + '</div></div>';
      });
    }
    box.innerHTML = html;
  }
  // ---------- 基地 Tab 切换 ----------
  function switchBaseTab(name) {
    baseTab = name;
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('data-tab') === name) tabs[i].classList.add('on');
      else tabs[i].classList.remove('on');
    }
    var panes = ['hangar', 'arsenal', 'forge', 'lab', 'codex'];
    for (var j = 0; j < panes.length; j++) {
      var el = document.getElementById('tab-' + panes[j]);
      if (el) el.className = 'tab-pane' + (panes[j] === name ? ' on' : '');
    }
  }
  // 出击加载遮罩（鎏金暗色 · 简易 DOM 遮罩）：图片未全部就绪时先显示，就绪/超时后继续出击并淡出
  var loadMaskEl = null;
  function ensureLoadMask() {
    if (loadMaskEl) return loadMaskEl;
    try {
      loadMaskEl = document.createElement('div');
      loadMaskEl.id = 'loadMask';
      loadMaskEl.style.cssText = 'position:fixed;inset:0;z-index:999;display:none;align-items:center;justify-content:center;background:rgba(14,11,8,0.94);transition:opacity 0.3s ease;';
      var t = document.createElement('div');
      t.style.cssText = 'color:#C9A24B;font-size:18px;font-weight:800;letter-spacing:4px;text-shadow:0 0 14px rgba(201,162,75,.55);';
      t.textContent = '灵脉加载中…';
      loadMaskEl.appendChild(t);
      if (document.body && document.body.appendChild) document.body.appendChild(loadMaskEl);
    } catch (e) { loadMaskEl = null; }
    return loadMaskEl;
  }
  function showLoadMask() { var m = ensureLoadMask(); if (m) { m.style.display = 'flex'; m.style.opacity = '1'; } }
  function hideLoadMask() {
    var m = loadMaskEl; if (!m) return;
    m.style.opacity = '0';
    setTimeout(function () { if (loadMaskEl) loadMaskEl.style.display = 'none'; }, 320); // 0.3s 淡出后移除
  }
  // 统一就绪判定：Canvas 资产（AssetManager）+ HTML UI 资产（HtmlAssets）双轨全就绪
  function AllAssetsReady() {
    return AssetManager.isReady() && HtmlAssets.isReady();
  }
  // 全资产等待：rAF 轮询 + 5s 超时兜底（坏图/404 也放行，不卡死启动）
  function waitForAllAssets(cb) {
    if (AllAssetsReady()) { if (cb) cb(); return; }
    var t0 = performance.now();
    var poll = function () {
      if (AllAssetsReady()) { if (cb) cb(); return; }
      if (performance.now() - t0 > 5000) { if (cb) cb(); return; }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }
  // 启动级全局加载门：鎏金遮罩 → 全部资产就绪（或 5s 超时）→ 淡出遮罩 + 进基地。
  // 修复 Boss 反馈「首次刷新基地资产不加载」：之前两处启动直接 showScene('base')，
  // 未等 HTML <img>/CSS background-image 从网络加载完，导致首刷闪空白/破图。
  function enterBase() {
    if (AllAssetsReady()) { showScene('base'); return; }
    showLoadMask();
    // 遮罩显示期间确保 base 不显示（防首刷白屏残留，即使此前已渲染过）
    var b = document.getElementById('base'); if (b) b.style.display = 'none';
    waitForAllAssets(function () {
      hideLoadMask();
      showScene('base');
    });
  }
  function doStartMission() { forgeSel = []; newRun(selectedAircraft, selectedTier); showScene('mission'); if (isMobile) { enterImmersive(true); autoFire = false; } } // 双摇杆架构：开火由右摇杆主导，autoFire 默认关（暂停菜单仍可手动开启）
  function startMission() {
    if (!meta.unlocked[selectedAircraft]) { return; }
    // 异步图片预加载门：未就绪先显示加载遮罩，就绪（或 3s 超时兜底）后继续出击
    if (!AssetManager.isReady()) {
      showLoadMask();
      AssetManager.waitForAll(function () {
        doStartMission();
        hideLoadMask();
      });
      return;
    }
    doStartMission();
  }
  function showResult(outcome, kept, lostLoot, killReward, unlockedNew, oreReward) {
    var label = outcome === 'success' ? '撤离成功' : (outcome === 'abandon' ? '主动弃局' : '阵亡');
    document.getElementById('resultTitle').textContent = outcome === 'success' ? '撤离成功！' : (outcome === 'abandon' ? '已弃局撤离' : '机体被击毁…');
    document.getElementById('resultTitle').style.color = outcome === 'success' ? COL.extract : (outcome === 'abandon' ? COL.gold : COL.enemy);
    var html = '';
    // ★ 结算面板重构：击杀数 / 物资清单 / 灵玉碎屑 / 历史最高层 / 引导
    html += '<div class="stat-card big"><span>结局</span><b>' + label + '（第 ' + run.tier + ' 层 · ' + tierName(run.tier) + '）</b></div>';
    html += '<div class="stat-card"><span>本局击杀</span><b>' + run.kills + ' 体</b></div>';
    if (outcome === 'success') html += '<div class="stat-card ok"><span>战利品</span><b>全部入库：+' + kept + ' 件法器</b></div>';
    // B5 联动：弃局/阵亡比例按实际保留率动态显示（有 ext1 时弃局 0.3+0.15=45%；阵亡恒 15%）
    else if (outcome === 'abandon') html += '<div class="stat-card bad"><span>弃局带回 ' + Math.round(lootKeepRate('abandon') * 100) + '%</span><b>+' + kept + ' 件（损失 ' + lostLoot + '）</b></div>';
    else html += '<div class="stat-card bad"><span>阵亡带回 ' + Math.round(lootKeepRate('death') * 100) + '%</span><b>+' + kept + ' 件（损失 ' + lostLoot + '）</b></div>';
    // 灵玉 + 灵矿碎屑
    html += '<div class="stat-card"><span>获得灵玉</span><b>+' + killReward + '</b></div>';
    if (oreReward > 0) html += '<div class="stat-card"><span>获得灵矿碎屑</span><b>+' + oreReward + '</b></div>';
    if (run.killedBoss) html += '<div class="stat-card ok"><span>本局击破 BOSS</span><b>奖励丰厚</b></div>';
    // ★ 解锁新层提示
    if (unlockedNew) html += '<div class="stat-card ok"><span>新层解锁</span><b>第 ' + meta.maxTier + ' 层「' + tierName(meta.maxTier) + '」</b></div>';
    // ★ 历史最高通关层
    html += '<div class="stat-card"><span>历史最高通关</span><b>第 ' + meta.bestLayer + ' 层 · ' + tierName(meta.bestLayer) + '</b></div>';
    // 本局战利品清单（成就感）
    var dist = { white: 0, green: 0, blue: 0, purple: 0, orange: 0 }, nm = [], relicNames = [];
    run.loot.forEach(function (it) { dist[it.rarity]++; if (it.relicMods) relicNames.push(it.name); if (nm.length < 5) nm.push(it.name); });
    var badges = [];
    ['orange', 'purple', 'blue', 'green', 'white'].forEach(function (r) { if (dist[r] > 0) badges.push('<span style="color:' + RARCOL[r] + '">' + RARNAME[r] + '×' + dist[r] + '</span>'); });
    html += '<div class="stat-card"><span>本局战利品</span><b>' + run.loot.length + ' 件</b></div>';
    html += '<div class="mini" style="text-align:right">' + badges.join(' · ') + '</div>';
    if (relicNames.length) html += '<div class="mini" style="text-align:right;color:#FFE9A8">★ 遗物：' + relicNames.join('、') + '</div>';
    else if (nm.length) html += '<div class="mini" style="text-align:right">' + nm.join('、') + '…</div>';
    var _bs = bondSummary();
    if (_bs.length) html += '<div class="stat-card"><span>本局羁绊</span><b>' + _bs.join(' · ') + '</b></div>';
    html += '<div class="stat-card"><span>当前库存</span><b>' + meta.arsenal.length + ' 件法器 · ' + meta.currency + ' 灵玉 · ' + (meta.ore || 0) + ' 灵矿碎屑</b></div>';
    // ★ 引导玩家形成闭环
    var guide = '回基地「军械库」装载法器、「熔炼台」合成升稀、「研究院」消耗灵矿碎屑+灵玉永久升级科技。';
    if (unlockedNew) guide = '新层已解锁！回基地整备后挑战第 ' + meta.maxTier + ' 层「' + tierName(meta.maxTier) + '」获取更高品质掉落。';
    else if (meta.ore >= 15) guide = '灵矿碎屑充足！前往「研究院」升级天工机体/聚灵核心等永久科技，提升下局战力。';
    else if (meta.arsenal.length >= 3) guide = '法器库存充裕！前往「熔炼台」3合1合成高阶装备，或「军械库」装配更强法器。';
    html += '<div class="muted" style="margin-top:12px">' + guide + ' 本局拾取符文 ' + player.runes.length + ' 枚。</div>';
    document.getElementById('resultBody').innerHTML = html;
  }

  // ---------- 按钮 ----------
  // 基地 Tab 点击绑定
  var baseTabs = document.querySelectorAll('.tab');
  for (var ti = 0; ti < baseTabs.length; ti++) {
    (function (btn) {
      btn.onclick = function () { switchBaseTab(btn.getAttribute('data-tab')); AudioSys.sfx.ui(); };
    })(baseTabs[ti]);
  }
  document.getElementById('titleStart').onclick = function () { if (isMobile) enterImmersive(true); enterBase(); };
  document.getElementById('tutorialClose').onclick = function () { meta.seenTutorial = true; saveMeta(); document.getElementById('tutorial').style.display = 'none'; };
  // 出击按钮：机库用 id，其他标签页用 .launch-start 类
  var startBtns = document.querySelectorAll('#startBtn, .launch-start');
  for (var si = 0; si < startBtns.length; si++) startBtns[si].onclick = startMission;
  // 帮助按钮：机库用 id，其他标签页用 .launch-help 类
  var helpBtns = document.querySelectorAll('#helpBtn, .launch-help');
  for (var hi = 0; hi < helpBtns.length; hi++) helpBtns[hi].onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };
  // 移动端弹层文案去 PC 键位：合成层关闭键 / 三选一提示（移动端纯图标/点按语义）
  if (isMobile) {
    var _mc2 = document.getElementById('mergeClose'); if (_mc2) _mc2.textContent = '关闭';
    var _bh2 = document.querySelector('#buffOverlay .muted'); if (_bh2) _bh2.textContent = '点击卡片选择强化';
  }
  document.getElementById('mergeClose').onclick = function () { document.getElementById('mergeOverlay').style.display = 'none'; paused = false; showMobileControls(); };
  document.getElementById('merge3btn').onclick = function () { doThreeMerge(); };
  // #197 拾取筛选浮层按钮
  var pfClose = document.getElementById('pickupFilterClose'); if (pfClose) pfClose.onclick = function () { document.getElementById('pickupFilterOverlay').style.display = 'none'; paused = false; showMobileControls(); };
  var pfAll = document.getElementById('pfAll'); if (pfAll) pfAll.onclick = function () { if (run) { run.pickupFilter = [true, true, true, true, true]; if (meta) { meta.pickupFilter = run.pickupFilter.slice(); saveMeta(); } renderPickupFilter(); } };
  var pfNone = document.getElementById('pfNone'); if (pfNone) pfNone.onclick = function () { if (run) { run.pickupFilter = [false, false, false, false, false]; if (meta) { meta.pickupFilter = run.pickupFilter.slice(); saveMeta(); } renderPickupFilter(); } };
  // #198 背包浮层按钮
  var bpClose = document.getElementById('backpackClose'); if (bpClose) bpClose.onclick = function () { document.getElementById('backpackOverlay').style.display = 'none'; paused = false; showMobileControls(); };
  var bpSort = document.getElementById('backpackSort'); if (bpSort) bpSort.onclick = function () { sortBackpack(); };
  document.getElementById('backBtn').onclick = function () { showScene('base'); };
  document.getElementById('pauseResume').onclick = closePause;
  document.getElementById('pauseQuit').onclick = function () { closePause(); finishRun('abandon'); };
  document.getElementById('pauseHelp').onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };
  var pauseAutoFireBtn = document.getElementById('pauseAutoFire');
  if (pauseAutoFireBtn) { pauseAutoFireBtn.onclick = function () { autoFire = !autoFire; this.textContent = '自动开火：' + (autoFire ? '开' : '关'); }; }
  var rotDismissBtn = document.getElementById('rotDismiss');
  if (rotDismissBtn) { rotDismissBtn.onclick = function () { rotHintDismissed = true; var rp = document.getElementById('rotatePrompt'); if (rp) rp.style.display = 'none'; }; }

  // 撤离反制按钮（IIFE 内需显式绑定，内联 onclick 取不到函数）
  var ex1 = document.getElementById('exfilClear'); if (ex1) ex1.onclick = function () { commitExfil('clear'); };
  var ex2 = document.getElementById('exfilSilent'); if (ex2) ex2.onclick = function () { commitExfil('silent'); };
  var ex3 = document.getElementById('exfilQuick'); if (ex3) ex3.onclick = function () { commitExfil('quick'); };
  // 裂隙确认按钮
  var rb1 = document.getElementById('riftEnter'); if (rb1) rb1.onclick = function () { commitRift(true); };
  var rb2 = document.getElementById('riftCancel'); if (rb2) rb2.onclick = function () { commitRift(false); };
  // #381-③ #riftLeaveBtn 已移除离场交互（改传送门出口），不再绑定 onclick（防死锁走 updateRift 60s 自动安全阀 / Ctrl+Q 隐藏键）
  // 磁锁秘库按钮
  var vf1 = document.getElementById('vaultFeedBtn'); if (vf1) vf1.onclick = function () { vaultFeed(); };
  var vf2 = document.getElementById('vaultJadeBtn'); if (vf2) vf2.onclick = function () { vaultJade(); };
  var vf3 = document.getElementById('vaultCancel'); if (vf3) vf3.onclick = function () { closeVaultPrompt(false); };


  // 熔炼台操作按钮：只保留「合成」，根据投料数量自动 2 合或 3 合
  var fCraft = document.getElementById('forgeCraft');
  function finishForgeMerge(res) {
    forgeProcess = false;
    var art = null;
    if (res.exec) art = res.exec();
    forgeResult = { kind: res.kind, title: res.title, sub: res.sub, color: res.color };
    forgeOutputArt = art || res.art || null;
    forgeSel = [];
    if (res.kind === 'destroy') {
      burst(W / 2, H / 2, '#C94F4F', 16);
      try { tone(110, 0.32, 'sawtooth', 0.14); } catch (e) {}
      setBanner('熔炼失败·材料湮灭！', 1.7);
    } else if (res.kind === 'success') {
      burst(W / 2, H / 2, res.color, 16);
      try { AudioSys.sfx.merge(); } catch (e) {}
      setBanner('⚡' + res.title + ' → ' + res.sub, 1.6);
    }
    saveMeta(); renderBase();
  }
  function planForgeMerge() {
    if (forgeSel.length === 2) {
      var a1 = getArt(forgeSel[0]), a2 = getArt(forgeSel[1]);
      if (a1 && a2 && a1.slot === a2.slot && a1.rarity === a2.rarity) {
        if (a1.rarity === 'orange' || RAR.indexOf(a1.rarity) >= RAR.length - 1) {
          return { ok: false, kind: 'disallowed', title: '不允许', sub: a1.rarity === 'orange' ? '传说不可熔' : '已是最高阶', color: '#C8642A' };
        }
        var ri = RAR.indexOf(a1.rarity), slot = a1.slot;
        return {
          ok: true, kind: 'success', title: '成功',
          sub: RARNAME[RAR[ri + 1]] + '·' + SLOTNAME[slot], color: RARCOL[RAR[ri + 1]],
          exec: function () {
            removeArt(a1.id); removeArt(a2.id);
            var newArt = makeArtifact(slot, RAR[ri + 1], RARNAME[RAR[ri + 1]] + '·' + SLOTNAME[slot] + '(二合)', inheritMods([a1, a2], RAR[ri + 1], null));
            meta.arsenal.push(newArt);
            return newArt;
          }
        };
      }
      return { ok: false, kind: 'fail', title: '失败', sub: '需同槽位·同稀有度 ×2', color: '#C94F4F' };
    }
    if (forgeSel.length === 3) {
      // 自由合成：跨部位·跨品质，期望值点数矩阵判定（确定性产出阶）+ 15% 湮灭保留
      var arts = forgeSel.map(getArt).filter(Boolean);
      if (arts.length < 3) return { ok: false, kind: 'disallowed', title: '不允许', sub: '材料丢失', color: '#C8642A' };
      var exp = forgeExpected(arts);
      if (Math.random() < FG_W_DESTROY) {
        // 湮灭赌博：三件材料全失、无产出
        return {
          ok: true, kind: 'destroy', title: '湮灭', sub: '三件全失·无产出（期望 ' + RARNAME[exp.outRar] + '·' + SLOTNAME[exp.slot] + '）', color: '#C94F4F',
          exec: function () {
            forgeSel.forEach(function (id) { removeArt(id); });
            return null;
          }
        };
      }
      return {
        ok: true, kind: 'success', title: '成功',
        sub: RARNAME[exp.outRar] + '·' + SLOTNAME[exp.slot] + '（期望升阶）',
        color: RARCOL[exp.outRar],
        exec: function () {
          forgeSel.forEach(function (id) { removeArt(id); });
          var bm = rollForgeBonus();
          var newArt = makeArtifact(exp.slot, exp.outRar, RARNAME[exp.outRar] + '·' + SLOTNAME[exp.slot] + '(自由合)', inheritMods(arts, exp.outRar, bm));
          meta.arsenal.push(newArt);
          return newArt;
        }
      };
    }
    return { ok: false, kind: 'disallowed', title: '不允许', sub: forgeSel.length === 0 ? '请先选择材料' : '请选 2 或 3 件', color: '#C8642A' };
  }
  if (fCraft) fCraft.onclick = function () {
    if (forgeProcess) return;
    forgeResult = null; forgeOutputArt = null;
    var plan = planForgeMerge();
    if (!plan.ok) {
      finishForgeMerge(plan);
      return;
    }
    forgeProcess = true;
    renderForge();
    setTimeout(function () {
      finishForgeMerge(plan);
    }, FORGE_ANIM_MS);
  };
  var fClear = document.getElementById('forgeClear');
  if (fClear) fClear.onclick = function () {
    clearForgeState();
    renderBase();
  };

  var tryLsBtn2 = document.getElementById('tryLandscape');
  if (tryLsBtn2) tryLsBtn2.onclick = tryLandscape;

  // ---------- 浏览器冒烟只读钩子（puppeteer 断言 run.affixes 与所选 tier 匹配用；无副作用，仅暴露只读副本）----------
  if (typeof window !== 'undefined') {
    try {
      if (!window.__v15run) Object.defineProperty(window, '__v15run', { configurable: true, get: function () { return run ? { tier: run.tier, affixes: run.affixes ? run.affixes.slice() : [] } : null; } });
    } catch (e) {}
  }

  // ---------- STUB 校验钩子（Node 内存桩测试专用；浏览器下无副作用）----------
  if (typeof global !== 'undefined' && global.__stub) {
    global.__stub.api = {
      startMission: startMission,
      scene: function () { return scene; },
      paused: function () { return paused; },
      run: function () { return run; },
      player: function () { return player; },
      runPhase: function () { return runPhase; },
      boss: function () { return boss; },
      enemies: function () { return enemies; },
      tick: function (n) { for (var i = 0; i < (n || 1); i++) update(1 / 60); },
      nodesCount: function () { var n = 0; nodes.forEach(function (x) { if (!x.collected) n++; }); return n; },
      collectNearest: function () { var best = null; nodes.forEach(function (nd) { if (!nd.collected) best = nd; }); if (best) collectNode(best); },
      killEnemy: function (i) { var e = enemies[i || 0]; if (e && !e.dead) onEnemyDeath(e); },
      addElem: function (el, n) { for (var i = 0; i < (n || 1); i++) player.elements[el] = (player.elements[el] || 0) + 1; recalcBonds(); },
      castUlt: castUlt,
      damagePlayer: damagePlayer,
      veins: function () { return veins; },
      absorbNearestVein: function () { var best = null, bd = Infinity; veins.forEach(function (v) { if (v.cd <= 0) { var d = dist2(player.x, player.y, v.x, v.y); if (d < bd) { bd = d; best = v; } } }); if (best) absorbVein(best); },
      veinAura: veinAuraMul,
      renderFrame: function () { render(); },
      setBanner: setBanner,
      bannerQ: function () { return bannerQ; },
      overlaysOpen: overlaysOpen,
      toggleMerge: toggleMerge,
      togglePause: togglePause,
      hasMergeable: hasMergeable,
      isMobile: function () { return isMobile; },
      autoFire: function () { return autoFire; },
      orient: function () { return document.body.dataset.orient; },
      // 双摇杆测试桩：暴露摇杆/朝向/开火状态，供 stub_mobile.js 断言多点触控
      joyState: function () { return { active: joy.active, mag: joy.mag, dx: joy.dx, dy: joy.dy }; },
      aimJoyState: function () { return { active: aimJoy.active, mag: aimJoy.mag, dx: aimJoy.dx, dy: aimJoy.dy, tapT: aimJoy.tapT }; },
      playerAng: function () { return player.ang; },
      aimTapFireState: function () { return aimTapFire; },
      firedT: function () { return player.firedT || 0; },
      // 右摇杆（瞄准+开火一体）状态：供桩断言按住开火链路
      rightStickActiveState: function () { return aimJoy.active; },
      openForgeDrawer: openForgeDrawer,
      fillForgeSlot: fillForgeSlot,
      closeForgeDrawer: closeForgeDrawer,
      forgeSelCount: function () { return forgeSel.length; },
      forgeCraftDisabled: function () { var b = document.getElementById('forgeCraft'); return b ? !!b.disabled : null; },
      // 研究院/熔炼台渲染钩子：供桩断言卡片化链路（renderBase → renderResearch/renderForge 已挂载）
      renderBase: renderBase,
      renderResearch: renderResearch,
      renderForge: renderForge,
      // AssetManager 钩子：供桩断言异步预加载门（桩内 Image 无 complete → 同步就绪；force/resolve 走 rAF 轮询放行路径）
      assetReady: function () { return AssetManager.isReady(); },
      assetTotal: function () { return AssetManager.total; },
      assetLoaded: function () { return AssetManager.loaded; },
      forceAssetPending: function () {
        AssetManager.done = false;
        var fake = { complete: false, naturalWidth: 0 };
        AssetManager._imgs.push(fake);
        AssetManager._pendingFake = fake;
        return AssetManager._imgs.length;
      },
      resolveAssetPending: function () {
        if (AssetManager._pendingFake) { AssetManager._pendingFake.complete = true; AssetManager._pendingFake = null; }
        return AssetManager.isReady();
      },
      loadMaskVisible: function () { return !!(loadMaskEl && loadMaskEl.style && loadMaskEl.style.display === 'flex'); },
      // HtmlAssets 双轨预加载器 + 启动级全局加载门钩子：供桩断言（桩内 Image 无 complete → 同步就绪；
      // force/resolve 走 rAF 轮询放行路径，与 AssetManager 15a/15b 同构）
      htmlAssetTotal: function () { return HtmlAssets.total; },
      htmlAssetLoaded: function () { return HtmlAssets.loaded; },
      htmlAssetsReady: function () { return HtmlAssets.isReady(); },
      htmlAssetPaths: function () { return HtmlAssets.paths || []; },
      forceHtmlAssetPending: function () {
        HtmlAssets.done = false;
        var fake = { complete: false, naturalWidth: 0 };
        HtmlAssets._imgs.push(fake);
        HtmlAssets._pendingFake = fake;
        return HtmlAssets._imgs.length;
      },
      resolveHtmlAssetPending: function () {
        if (HtmlAssets._pendingFake) { HtmlAssets._pendingFake.complete = true; HtmlAssets._pendingFake = null; }
        return HtmlAssets.isReady();
      },
      allAssetsReady: function () { return AllAssetsReady(); },
      enterBase: enterBase,
      baseVisible: function () { var b = document.getElementById('base'); return !!(b && b.style && b.style.display === 'flex'); },
      // 锚点簇 PCG / 视线遮挡：暴露障碍/楼顶/LOS，供 stub_los.js 断言
      obstacles: function () { return obstacles; },
      buildingRooftops: function () { return buildingRooftops; },
      checkLineOfSight: checkLineOfSight,
      generateObstacles: generateObstacles,
      spawnSniper: function () { var e = spawnEnemy(player.x + 320, player.y - 120, 1); e.arche = 'sniper'; e.alert = 2; e.homeX = e.x; e.homeY = e.y; e.patrolAng = rand(0, 6.28); return e; },
      forceWall: function (x, y, hw, hh) { obstacles.push({ type: 'wall', x: x, y: y, hw: hw, hh: hh, building: true }); },
      // 测试桩：强制清场到纯净 mission 态（关掉所有弹层/提示，复位 paused/keys/pickupOpen），
      // 供桩回归测试在随机模拟后获得确定性起点，避免升级/buff/裂隙/秘库等干扰开关断言。
      cleanState: function () {
        ['buffOverlay', 'mergeOverlay', 'pauseOverlay', 'pickupFilterOverlay', 'backpackOverlay', 'riftChoice', 'vaultPrompt', 'title', 'result', 'tutorial'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
        paused = false; riftPrompt = false; vaultPrompt = false; buffChoices = []; pickupOpen = false;
        for (var kk in keys) keys[kk] = false;
        joy.active = false; joy.dx = 0; joy.dy = 0; joy.mag = 0;
        aimJoy.active = false; aimJoy.dx = 0; aimJoy.dy = 0; aimJoy.mag = 0; aimJoy.tapT = 0; hideAimJoystick();
        aimTapFire = false;
        showMobileControls();
      },
      // === v12.6 深度玩法重构 · 测试桩钩子（撤离锁死/beacon/自毁/维度撕裂/翻相免伤/金盾反弹/自爆）===
      extractPoints: function () { return extractPoints; },
      spawnBoss: spawnBoss,
      killBoss: killBoss,
      activateEvacBeacon: activateEvacBeacon,
      selfDestruct: function () { return run ? run.selfDestruct : 0; },
      evacBeacon: function () { return run ? !!run.evacBeacon : false; },
      // === 371 审计修复 · 测试桩钩子（S1/S2/A1/B2/C1 断言用；仅 STUB 环境暴露）===
      loot: function () { return loot; },
      riftLoot: function () { return riftLoot; },
      inRift: function () { return inRift; },
      bankLoot: bankLoot,
      lootKeepRate: lootKeepRate,
      finishRun: finishRun,
      enterRift: enterRift,
      exitRift: exitRift,
      dieInRift: dieInRift,
      forceExitRift: forceExitRift,
      dropOre: dropOre,
      dropLoot: dropLoot,
      riftSdFrozen: function () { return run ? (run._riftSdFrozen || 0) : 0; },
      // === #381 Boss 反馈 6 项修复 · 测试桩钩子（周期刷怪/秘库距离/裂隙出口/秘库概率/相位柱5根/单摇杆 断言用）===
      spawnTimerState: function () { return { t: spawnTimer, int: SPAWN_INT[runPhase] }; },
      phasePillars: function () { return phasePillars; },
      secretVault: function () { return secretVault; },
      riftExit: function () { return riftExit; },
      riftRoom: function () { return riftRoom; },
      riftWaves: function () { return riftWaves; },
      vaultState: function () { return { exists: !!secretVault, opened: secretVault ? !!secretVault.opened : null, prompt: vaultPrompt }; },
      forceVault: function (x, y) { secretVault = { x: (x == null ? player.x + 500 : x), y: (y == null ? player.y : y), r: 34, opened: false }; vaultCd = 0; },
      movePlayer: function (x, y) { player.x = x; player.y = y; },
      closeVaultPrompt: closeVaultPrompt,
      portraitNow: portraitNow,
      phaseDurNow: phaseDurNow,
      spawnArche: function (arche, x, y) { return spawnEnemy((x == null ? player.x + 300 : x), (y == null ? player.y : y), run.tier || 1, { arche: arche }); },
      PHASE_GOLD: function () { return PHASE.GOLD; },
      PHASE_EMBER: function () { return PHASE.EMBER; },
      phase: function () { return player.phase; },
      flip: function (target) { doFlip(target == null ? PHASE.GOLD : target, { active: false, source: 'pillar' }); },
      iframe: function () { return player.iframe || 0; },
      FLIP_IFRAME: function () { return FLIP_IFRAME; },
      weaverRifts: function () { return weaverRifts; },
      bossDimTear: function () { return boss ? boss.dimTear : null; },
      bossDimTearDone: function () { return boss ? !!boss.dimTearDone : false; },
      setBossHp: function (frac) { if (boss) boss.hp = boss.maxhp * (frac == null ? 0.5 : frac); },
      clearBullets: function () { bullets.length = 0; },
      setPlayerHp: function (v) { player.hp = v; if (player.maxhp < v) player.maxhp = v; },
      setIframe: function (v) { player.iframe = v; },
      // v12.7 战斗平衡重构 · 测试桩钩子（伤害校准 / iframe上限 / 护甲上限 / 吸血ICD / 精英重击阈值 / 站定威慑）
      playerHp: function () { return player.hp; },
      playerMaxhp: function () { return player.maxhp; },
      setDmgReduce: function (v) { player.dmgReduce = v; },
      setLifesteal: function (v) { player.lifesteal = v; },
      lsCd: function () { return _lsCd; },
      standStillReduce: function (v) { player.setStandStillReduce = v; player.standStillT = (player.setStandStillTime || 1.5); },
      testLifesteal: function (baseDmg) {
        player.iframe = 0; // 等价 setIframe(0)：对象字面量方法内无法直接按裸名调用兄弟属性 setIframe
        var dmg0 = baseDmg;
        var _heal = Math.min(dmg0 * (player.lifesteal || 0), dmg0 * 0.03); // 单次回复 ≤ 造成伤害的 3%
        player.hp = Math.min(player.maxhp, player.hp + Math.round(_heal));
        _lsCd = 0.2; // 0.2s 内置冷却
        return { heal: _heal, lsCdAfter: _lsCd };
      },
      // 翻相免伤门（相位狙击手 / 维度撕裂 共用 player.iframe<=0 闸门）：翻相后 0.35s 内 lethal 命中应被免疫
      hitscanGate: function (dmg) {
        var before = player.hp;
        if (player.iframe <= 0) damagePlayer(dmg);
        return { applied: player.hp < before, iframe: player.iframe || 0 };
      },
      // 相位狙击手·翻相 0.35s 免伤：玩家位于狙击手正左方同 y，刚翻相(iframe=0.35)时贯穿光束应被免疫；清掉无敌帧后应被命中掉血
      testSniperFlipImmunity: function () {
        enemies.length = 0; obstacles.length = 0; weaverRifts.length = 0; gravityRifts.length = 0; bullets.length = 0;
        var sx = player.x + 300, sy = player.y;
        var e = spawnEnemy(sx, sy, run.tier || 1, { arche: 'phaseSniper' });
        e.wake = 0; e.alert = 2; e.vx = 0; e.vy = 0; e.sniperCharge = 1.2; e.sniperBeamFlash = 0; e.fireCd = 0;
        phase = PHASE.GOLD; player.phase = PHASE.GOLD;
        player.iframe = FLIP_IFRAME; // 模拟刚翻相
        var hp0 = player.hp;
        for (var i = 0; i < 20; i++) { e.x = sx; e.y = sy; e.vx = 0; e.vy = 0; e.sniperCharge = 1.2; e.sniperAim = Math.atan2(player.y - e.y, player.x - e.x); update(1 / 60); }
        var immune = (player.hp === hp0);
        player.iframe = 0; e.sniperCharge = 1.2; e.sniperBeamFlash = 0; e.fireCd = 0;
        var hp1 = player.hp;
        for (var j = 0; j < 20; j++) { e.x = sx; e.y = sy; e.vx = 0; e.vy = 0; e.sniperCharge = 1.2; e.sniperAim = Math.atan2(player.y - e.y, player.x - e.x); update(1 / 60); }
        var hit = (player.hp < hp1);
        return { immuneWithFlip: immune, hitWithoutFlip: hit, iframe0: FLIP_IFRAME };
      },
      // 鎏金重盾巨舰·正面 120° 金盾反弹：玩家在鎏金相朝巨舰正面发射直射弹，应被反弹(from→enemy)且巨舰不掉血
      testBastionReflect: function () {
        enemies.length = 0; bullets.length = 0; weaverRifts.length = 0; gravityRifts.length = 0;
        var b = spawnEnemy(player.x + 90, player.y, run.tier || 1, { arche: 'bastion' });
        b.wake = 0; b.alert = 0; b.vx = 0; b.vy = 0; b.hp = b.maxhp;
        phase = PHASE.GOLD; player.phase = PHASE.GOLD;
        var bl = { x: player.x + 20, y: player.y, vx: 600, vy: 0, r: 6, from: 'player', dmg: 20, elem: null, pierce: 0, homing: false, life: 1, crit: false };
        bullets.push(bl);
        var beforeHp = b.hp;
        for (var i = 0; i < 10; i++) { b.x = player.x + 90; b.y = player.y; b.vx = 0; b.vy = 0; update(1 / 60); }
        return { reflected: bl.from === 'enemy', bastionTookDamage: b.hp < beforeHp - 0.5, phase: player.phase };
      },
      // === v13 屏幕自适应 · 测试桩钩子（DPR 高清化 / 逻辑坐标 / 丹药槽底部居中 / Safe Area）===
      dpr: function () { return DPR; },
      logicalW: function () { return W; },
      logicalH: function () { return H; },
      canvasW: function () { return canvas.width; },
      canvasH: function () { return canvas.height; },
      canvasCssW: function () { return parseInt(canvas.style.width) || 0; },
      canvasCssH: function () { return parseInt(canvas.style.height) || 0; },
      safeArea: function () { return { t: SA.t, r: SA.r, b: SA.b, l: SA.l }; },
      // 计算丹药槽期望居中位置（供桩断言：drawConsumables 内部 bx = (W-totalW)/2）
      consumablesCenter: function () {
        var n = 3, size = isMobile ? 30 : 38, gap = isMobile ? 6 : 10, totalW = n * size + (n - 1) * gap;
        return { bx: (W - totalW) / 2, by: H - size - (isMobile ? 24 + SA.b : 16), totalW: totalW, size: size };
      },
      // === v14 局内动态目标 + 局外永久成长 · 测试桩钩子 ===
      bounty: function () { return bounty; },
      bountyProgress: bountyProgress,
      generateBounty: generateBounty,
      completeBounty: completeBounty,
      meta: function () { return meta; },
      tech: function () { return meta.tech || {}; },
      tierName: tierName,
      // === v15 深渊异变·词缀系统 · 测试桩钩子 ===
      tierAffixes: tierAffixes,
      tierAffixCount: tierAffixCount,
      affixPool: function () { return AFFIX_DEFS; },
      tierDropBonus: tierDropBonus,
      tierOreBonus: tierOreBonus,
      tierTitle: tierTitle,
      hasAffix: hasAffix,
      setSelectedTier: function (t) { selectedTier = Math.max(1, Math.min(meta.maxTier, t || 1)); },
      selectedTier: function () { return selectedTier; },
      runAffixes: function () { return run ? run.affixes : []; },
      phaseTimerVal: function () { return phaseTimer; },
      phaseGoldDur: function () { return PHASE_GOLD_DUR; },
      phaseEmberDur: function () { return PHASE_EMBER_DUR; },
      phaseSpeedMulVal: function () { return phaseSpeedMul; },
      gravityRifts: function () { return gravityRifts; },
      bestLayer: function () { return meta.bestLayer || 1; },
      maxTier: function () { return meta.maxTier; },
      buyTech: function (key) {
        var tk = TECH_TREE.find(function (t) { return t.key === key; });
        if (!tk) return { ok: false, reason: 'not_found' };
        var lv = (meta.tech && meta.tech[key]) || 0;
        if (lv >= tk.max) return { ok: false, reason: 'maxed' };
        var cj = tk.costJade(lv), co = tk.costOre(lv);
        if (meta.currency < cj || (meta.ore || 0) < co) return { ok: false, reason: 'insufficient' };
        meta.currency -= cj; meta.ore = (meta.ore || 0) - co; meta.tech[key] = lv + 1; saveMeta();
        return { ok: true, key: key, level: lv + 1, jadeSpent: cj, oreSpent: co };
      },
      // 模拟完成本局并结算（供桩断言 oreReward / bestLayer / maxTier 推进）
      simFinishRun: function (outcome, killBoss) {
        if (scene !== 'mission') startMission(); // 确保处于 mission 态（桩测试中 scene 可能已被前序用例改为 result）
        if (!run) return { ok: false };
        if (killBoss) { run.killedBoss = true; run.kills += 5; }
        run.oreCollected = (run.oreCollected || 0) + 20;
        var mt0 = meta.maxTier, bl0 = meta.bestLayer, ore0 = meta.ore;
        finishRun(outcome);
        return { ok: true, maxTierBefore: mt0, maxTierAfter: meta.maxTier, bestLayerBefore: bl0, bestLayerAfter: meta.bestLayer, oreBefore: ore0, oreAfter: meta.ore };
      }
    };
  }

  // ---------- 启动级全局加载门：预加载 HTML UI 资产 → 等双轨就绪 → 进基地 ----------
  // 首次刷新（含强刷清缓存）时 HTML <img>/CSS background-image 从网络加载慢，base 若先渲染会闪空白。
  // 故先预热全部 base UI 资产并显示鎏金遮罩，就绪（或 5s 超时兜底）后才 showScene('base')。
  HtmlAssets.preload();

  // ---------- 移动端启动遮罩：首次点击触发全屏+横屏 ----------
  var enterOverlay = document.getElementById('enterOverlay');
  if (enterOverlay && isMobile) {
    // 移动端：先显示启动遮罩，隐藏标题页
    enterOverlay.style.display = 'flex';
    document.getElementById('title').style.display = 'none';
    var enterDone = false;
    function doEnter() {
      if (enterDone) return;
      enterDone = true;
      enterOverlay.style.display = 'none';
      AudioSys.unlock();
      enterImmersive(true);
      enterBase(); // 2026-08-18 去掉开场标题，直接进基地（走启动级加载门：遮罩→资产就绪→进基地）
      checkOrientation();
    }
    enterOverlay.addEventListener('touchend', function (e) { e.preventDefault(); doEnter(); }, { passive: false });
    enterOverlay.addEventListener('click', function () { doEnter(); });
  } else {
    enterBase(); // 2026-08-18 去掉开场标题，直接进基地（走启动级加载门：遮罩→资产就绪→进基地）
  }
  // 确保初始尺寸正确
  resize();
  checkOrientation();
})();
