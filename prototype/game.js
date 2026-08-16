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
  var W = 0, H = 0;
  var WORLD_W = 1600, WORLD_H = 1100; // 世界尺寸（比屏幕大，靠相机滚动浏览）
  var cam = { x: 0, y: 0 };           // 相机左上角（世界坐标）
  function resize() {
    // 优先使用 visualViewport（更准确地反映实际可见区域，排除浏览器栏）
    var vv = window.visualViewport;
    if (vv) {
      W = canvas.width = Math.max(320, Math.floor(vv.width));
      H = canvas.height = Math.max(240, Math.floor(vv.height));
    } else {
      W = canvas.width = Math.max(320, window.innerWidth);
      H = canvas.height = Math.max(240, window.innerHeight);
    }
    // canvas CSS 尺寸也同步，确保不出现拉伸
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
    window.visualViewport.addEventListener('scroll', resize);
  }
  window.addEventListener('resize', function () { checkOrientation(); showMobileControls(); hideBrowserBars(); });
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b + 1)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 6.2831853; while (d < -Math.PI) d += 6.2831853; return d; }
  function roundRectPath(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  var COL = {
    bg: '#0D0F12', grid: 'rgba(95,191,163,0.06)', player: '#5FBFA3', playerEdge: '#0A2E26',
    bulletP: '#A8E8D5', enemy: '#C94F4F', enemyEdge: '#3D1515', bulletE: '#E8907C',
    extract: '#8FD8C0', gold: '#C9A227', node: '#C9A227', elite: '#D9B64A',
    ink: '#0E1424', paper: '#F4EFE6', jade: '#8FD8C0', iron: '#7A8794', sha: '#B03A3A'
  };
  var RAR = ['white', 'green', 'blue', 'purple', 'orange'];
  var RARNAME = { white: '普通', green: '精良', blue: '稀有', purple: '史诗', orange: '传说' };
  var RARCOL = { white: '#D8D6CE', green: '#4E9A7E', blue: '#4E8FC7', purple: '#8A6FB8', orange: '#D98A3D' };
  var RARVAL = [10, 25, 60, 140, 320];
  var TIERNAME = ['入门', '进阶', '深渊'];
  // 八卦五行：巽(风) · 震(雷) · 坎(水) · 离(火) · 坤(土)
  var ELEMCOL = { '火': '#C94F3E', '水': '#4E8FC7', '雷': '#D9B64A', '风': '#5FBFA3', '土': '#B07D45' };
  var TRIGRAM = { '风': '巽', '雷': '震', '水': '坎', '火': '离', '土': '坤' };

  // ---------- 打击感 & 特效基础设施（美术圣经 visual-feel-vfx.md §2/§6）----------
  var BULLET_COL = { player: '#A8E8D5', enemy: '#E8907C', boss: '#D96A7E', buff: '#FFE9A8' };

  // 粒子对象池：512 硬上限，环形回收最老，杜绝每帧 new / push / splice
  var POOL = 512;
  var particles = new Array(POOL);
  for (var _pi = 0; _pi < POOL; _pi++) particles[_pi] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#fff', r: 2, ring: false, r0: 0, rmax: 0 };
  var pCur = 0;
  function resetParticles() { for (var i = 0; i < POOL; i++) particles[i].alive = false; pCur = 0; }
  function spawnParticle(o) {
    var p = particles[pCur]; pCur = (pCur + 1) % POOL;
    p.alive = true; p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = o.life; p.maxLife = o.life; p.color = o.color; p.r = o.r || 2;
    p.ring = !!o.ring; p.rmax = o.rmax || 0; p.r0 = o.r0 || (o.r || 2);
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
    return { currency: 0, unlocked: { a: true, b: false, c: false }, runs: 0, bestKills: 0,
      maxTier: 1, bossCleared: false, seenTutorial: false,
      up: { hp: 0, dmg: 0, speed: 0, shield: 0, pickup: 0 },
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
    try { var s = localStorage.getItem('kongyu_meta'); if (s) { var m = Object.assign(defaultMeta(), JSON.parse(s)); m.up = Object.assign({ hp: 0, dmg: 0, speed: 0, shield: 0, pickup: 0 }, m.up || {}); m.unlocked = Object.assign({ a: true, b: false, c: false }, m.unlocked || {}); m.equipped = Object.assign({ weapon: null, armor: null, core: null, ammo: null }, m.equipped || {}); if (!m.arsenal) m.arsenal = []; if (!m.research) m.research = {}; if (!m.bondBest) m.bondBest = {}; if (!m.codex) m.codex = { loot: {}, enemies: {} }; return m; } } catch (e) {}
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
      ui: function () { playFile('ui'); }
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
  var SLOTCOL = { weapon: '#FF7A59', armor: '#5AA9FF', core: '#B27BFF', ammo: '#8FD8C0' };
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
  function applyArtifactMods(m) {
    if (!m) return;
    if (m.dmg) player.dmg += m.dmg;
    if (m.maxhp) { player.maxhp += m.maxhp; player.hp += m.maxhp; }
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
  // 应用子类型基础属性
  function applySubtypeBonus(art) {
    var b = art.subBonus; if (!b) return;
    var s = art.subtype;
    // 武器子类型
    if (s === 'ballistic') { player.dmg = Math.round(player.dmg * (b.dmgMult || 1)); player.bulletSpeed = Math.round(player.bulletSpeed * (b.bulletSpeedMult || 1)); }
    else if (s === 'spread') { player.pellets = Math.min(9, player.pellets + (b.pellets || 0)); player.spreadAngle = b.spreadAngle; player.falloff = b.falloff; }
    else if (s === 'homing') { player.homing = true; player.homingTurnRate = b.turnRate; player.dmg = Math.round(player.dmg * (b.dmgMult || 1)); }
    else if (s === 'splash') { player.explode = Math.max(player.explode, b.explodeR); player.splashRatio = b.splashRatio; }
    else if (s === 'chain') { player.chain = (player.chain || 0) + (b.chainJump || 0); player.chainDecay = b.chainDecay; player.chainRange = b.chainRange; }
    // 护甲子类型
    else if (s === 'heavy') { player.maxhp = Math.round(player.maxhp * (b.hpMult || 1)); player.hp = player.maxhp; player.speed = Math.round(player.speed * (1 - (b.speedPenalty || 0))); }
    else if (s === 'light') { player.maxhp = Math.round(player.maxhp * (b.hpMult || 1)); player.hp = player.maxhp; player.dodgeChance = Math.min(0.6, player.dodgeChance + (b.dodgeBonus || 0)); }
    else if (s === 'regen') { player.maxhp = Math.round(player.maxhp * (b.hpMult || 1)); player.hp = player.maxhp; player.regen *= (b.regenMult || 1); }
    else if (s === 'shield') { player.maxhp = Math.round(player.maxhp * (b.hpMult || 1)); player.hp = player.maxhp; player.maxshield = Math.round(player.maxshield * (b.shieldMult || 1)); player.shieldBreakIframe = b.breakIframe; }
    // 核心子类型
    else if (s === 'mobility') { player.speed += (b.speedBonus || 0); player.dashCdReduce = (player.dashCdReduce || 0) + (b.dashCdReduce || 0); }
    else if (s === 'crit') { player.critChance = Math.min(0.85, player.critChance + (b.critBonus || 0)); player.critMult += (b.critMultBonus || 0); }
    else if (s === 'element') { player.elemBoost = (player.elemBoost || 0) + (b.elemBoost || 0); }
    else if (s === 'support') { player.pickR += (b.pickBonus || 0); player.jadeBonus = (player.jadeBonus || 0) + (b.jadeBonus || 0); player.dropBonus = (player.dropBonus || 0) + (b.dropBonus || 0); }
    else if (s === 'thorns') { player.thorns = (player.thorns || 0) + Math.round(player.maxhp * (b.thornsRatio || 0)); player.maxhp += (b.hpBonus || 0); player.hp += (b.hpBonus || 0); }
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
  }
  // 结算：战利品按 outcome 比例入库为法器（研究院撤离研究可加成）
  function bankLoot(outcome) {
    var base = outcome === 'success' ? 1 : outcome === 'abandon' ? 0.3 : 0.15;
    var keep = Math.min(1, base + (player.extractBonus || 0));
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

  // ---------- 机体（武器形态差异化）----------
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
    { name: '磁力符·风', elem: '风', desc: '战利品自动吸取', apply: function () { player.magnet = true; } },
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
          banner = { text: '羁绊·' + el + tier.need + '阶「' + tier.name + '」', life: 1.4 };
          AudioSys.sfx.runePick();
        }
      }
    }
    for (var c = 0; c < CROSS_BONDS.length; c++) {
      var cb = CROSS_BONDS[c], ok = true;
      for (var k in cb.need) if ((player.elements[k] || 0) < cb.need[k]) ok = false;
      if (ok && !player.bondTiers[cb.key]) { player.bondTiers[cb.key] = true; cb.apply(); banner = { text: '交叉羁绊「' + cb.name + '」', life: 1.6 }; AudioSys.sfx.runePick(); }
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
  function loadImg(key, path) { var im = new Image(); im.src = path; IMG[key] = im; return im; }
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
  loadImg('boss_taowu', 'assets/v4/bosses/boss_taowu.png');
  loadImg('boss_qiongqi', 'assets/v4/bosses/boss_qiongqi.png');
  loadImg('boss_taotie', 'assets/v4/bosses/boss_taotie.png');
  loadImg('boss_hundun', 'assets/v4/bosses/boss_hundun.png');
  loadImg('chest_common', A1 + 'environment/loot_common_chest.png');
  loadImg('chest_vault', A1 + 'environment/loot_vault_chest.png');
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
    if (e.key.toLowerCase() === 'n') { AudioSys.setMuted(!AudioSys.isMuted()); banner = { text: '声音 ' + (AudioSys.isMuted() ? '已静音' : '已开启') + '（按 N 切换）', life: 1.4 }; return; }
    if (scene === 'mission') {
      if (riftPrompt) {
        if (e.key === '1' || e.key === 'Enter') { commitRift(true); return; }
        if (e.key === '2' || e.key === 'Escape') { commitRift(false); return; }
      }
      if (e.key === '1') chooseBuff(0);
      if (e.key === '2') chooseBuff(1);
      if (e.key === '3') chooseBuff(2);
      if (e.key.toLowerCase() === 'm') toggleMerge();
      if (e.key.toLowerCase() === 'q') useConsumable();
      if (e.key.toLowerCase() === 'g') { glowOn = !glowOn; banner = { text: '辉光/拖尾 ' + (glowOn ? '开启' : '关闭'), life: 1.2 }; }
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') { if (overlaysOpen()) return; togglePause(); }
    }
  });
  function overlaysOpen() { return document.getElementById('buffOverlay').style.display === 'flex' || document.getElementById('mergeOverlay').style.display === 'flex'; }
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  canvas.addEventListener('mousemove', function (e) { var r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.addEventListener('mousedown', function () { AudioSys.unlock(); mouse.down = true; });
  window.addEventListener('mouseup', function () { mouse.down = false; });

  // ---------- 移动端检测 & 虚拟操控 ----------
  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  var isMobile = isTouch && (Math.min(window.innerWidth, window.innerHeight) < 700 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  // 虚拟摇杆状态
  var joy = { active: false, touchId: null, baseX: 0, baseY: 0, dx: 0, dy: 0, mag: 0 };
  var fireBtn = { active: false };
  var dashBtnPressed = false;
  var consBtnPressed = false;
  // DOM 引用
  var mcEl = document.getElementById('mobileControls');
  var joyBaseEl = document.getElementById('joyBase');
  var joyKnobEl = document.getElementById('joyKnob');
  var fireBtnEl = document.getElementById('fireBtn');
  var dashBtnEl = document.getElementById('dashBtn');
  var consBtnEl = document.getElementById('consBtn');

  function showMobileControls() {
    if (!mcEl) return;
    var show = isMobile && scene === 'mission' && !paused && !overlaysOpen();
    mcEl.className = show ? 'on' : '';
    if (!show) { joy.active = false; joy.dx = 0; joy.dy = 0; joy.mag = 0; fireBtn.active = false; hideJoystick(); }
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
  function updateMobileBtnStates() {
    if (!isMobile || scene !== 'mission') return;
    if (dashBtnEl) { if (player && player.dashCd > 0) dashBtnEl.classList.add('cd'); else dashBtnEl.classList.remove('cd'); }
    if (consBtnEl && player) {
      var has = false;
      for (var i = 0; i < 3; i++) if (player.consumables && player.consumables[i]) { has = true; break; }
      consBtnEl.classList.toggle('empty', !has);
    }
  }

  // Canvas 触摸 → 左半屏虚拟摇杆（动态出现）
  canvas.addEventListener('touchstart', function (e) {
    AudioSys.unlock();
    if (!isMobile) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var r = canvas.getBoundingClientRect();
      var x = t.clientX - r.left, y = t.clientY - r.top;
      if (x < W * 0.45 && !joy.active) {
        joy.active = true; joy.touchId = t.identifier;
        joy.baseX = x; joy.baseY = y;
        joy.dx = 0; joy.dy = 0; joy.mag = 0;
        showJoystick(x, y);
      }
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (!isMobile) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === joy.touchId) {
        var r = canvas.getBoundingClientRect();
        var x = t.clientX - r.left, y = t.clientY - r.top;
        var dx = x - joy.baseX, dy = y - joy.baseY;
        var dist = Math.hypot(dx, dy);
        var maxR = 55;
        if (dist > maxR) { dx = dx / dist * maxR; dy = dy / dist * maxR; dist = maxR; }
        joy.dx = dx / maxR; joy.dy = dy / maxR; joy.mag = dist / maxR;
        updateJoystickKnob(dx, dy);
      }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    if (!isMobile) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joy.touchId) {
        joy.active = false; joy.touchId = null;
        joy.dx = 0; joy.dy = 0; joy.mag = 0;
        hideJoystick();
      }
    }
  }, { passive: true });
  canvas.addEventListener('touchcancel', function () {
    if (!isMobile) return;
    joy.active = false; joy.touchId = null;
    joy.dx = 0; joy.dy = 0; joy.mag = 0; hideJoystick();
  }, { passive: true });

  // 火力按钮（多触摸独立追踪）
  if (fireBtnEl) {
    fireBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); fireBtn.active = true; this.classList.add('on'); }, { passive: false });
    fireBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); fireBtn.active = false; this.classList.remove('on'); }, { passive: false });
    fireBtnEl.addEventListener('touchcancel', function () { fireBtn.active = false; this.classList.remove('on'); }, { passive: false });
  }
  // 冲刺按钮
  if (dashBtnEl) {
    dashBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); dashBtnPressed = true; this.classList.add('on'); }, { passive: false });
    dashBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
  }
  // 丹药按钮
  if (consBtnEl) {
    consBtnEl.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); consBtnPressed = true; this.classList.add('on'); }, { passive: false });
    consBtnEl.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('on'); }, { passive: false });
  }
  // 暂停按钮（移动端）
  var pauseBtnMobile = document.getElementById('pauseBtnMobile');
  if (pauseBtnMobile) {
    pauseBtnMobile.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); if (scene === 'mission' && !overlaysOpen()) togglePause(); }, { passive: false });
    pauseBtnMobile.addEventListener('click', function () { if (scene === 'mission' && !overlaysOpen()) togglePause(); });
  }

  // 横屏锁定 + 沉浸模式（收起浏览器边栏）
  function enterImmersive(wantLandscape) {
    var el = document.documentElement;

    // 1) Fullscreen API（Android Chrome / 桌面有效，iOS Safari 部分有效）
    var reqFs = el.requestFullscreen || el.webkitRequestFullscreen;
    if (reqFs) {
      try {
        var p = reqFs.call(el);
        if (p && p.then) {
          p.then(function () {
            if (wantLandscape && screen.orientation && screen.orientation.lock)
              screen.orientation.lock('landscape').catch(function () {});
            resize();
            hideBrowserBars();
          }).catch(function () { hideBrowserBars(); });
        }
      } catch (e) { hideBrowserBars(); }
    } else {
      // iOS Safari fallback
      hideBrowserBars();
    }

    // 2) iOS Safari 地址栏隐藏 trick：临时允许滚动 → 滚一像素 → 恢复锁定
    hideBrowserBars();

    // 3) 横屏锁定（如果请求）
    if (wantLandscape && screen.orientation && screen.orientation.lock) {
      try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
    }

    // 延迟再隐藏一次，等全屏过渡完成
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
    if (!isMobile) return;
    var rp = document.getElementById('rotatePrompt');
    if (!rp) return;
    var portrait = window.innerHeight > window.innerWidth;
    // 竖屏时全场景显示旋转提示（不只是 mission）
    rp.style.display = portrait ? 'flex' : 'none';
  }
  window.addEventListener('orientationchange', function () { setTimeout(function () { checkOrientation(); hideBrowserBars(); resize(); }, 100); });
  // 从后台切回前台时重新隐藏浏览器栏
  document.addEventListener('visibilitychange', function () { if (!document.hidden && isMobile) { setTimeout(function () { hideBrowserBars(); resize(); checkOrientation(); }, 200); } });

  // ---------- 全局状态 ----------
  var scene = 'title';
  var baseTab = 'hangar';
  var tipTimer = 0, tipEl = null;
  var paused = false;
  var player, bullets, enemies, loot, nodes, particles, floaters, extractPoints, exfil, boss, bossSpawned, vaults, totems;
  var run, spawnTimer, buffTimer, buffPending, buffHold, buffSafe, gameTime, hintTimer, banner, killForBuff, runeCount, screenFlash;
  // 敌机行为 / 撤离惊动（规则圣经 v1）全局状态
  var pendingSpawns = [], lootArrow = null, edgeArrow = null;
  var exfilChoicePending = null, exfilStarted = false, exfilPoint = null, exfilChoice = null, exfilJadePenalty = 0, exfilAlarmT = 0, exfilCenter = null, exfilAutoT = 0;
  // 裂隙 / 黑洞系统全局状态
  var rifts = [], inRift = false, riftReturn = null, riftSnapshot = null, riftRoom = null, riftLoot = [], riftPrompt = false, riftExit = null, riftWaves = null, riftTrapT = 0, riftHidden = null, riftRect = null;
  var combatTimer = 0;
  var enemiesSlowT = 0, enemiesSlowFactor = 1;
  var lootCap = 22;

  function tierMul() { return 1 + (run.tier - 1) * 0.5; }
  function tierDmgMul() { return 1 + (run.tier - 1) * 0.35; }

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
    var critMul = crit ? player.critMult : 1;
    var rar = rarityCoeff();
    var exec = (player.execute && target && target.hp < target.maxhp * 0.5) ? 2.0 : 1.0;
    var rawMulti = atkMult * bond * critMul * rar * exec;
    var rawBonus = rawMulti - 1;
    var cappedBonus = rawBonus > DMG_CAP_BONUS ? DMG_CAP_BONUS + (rawBonus - DMG_CAP_BONUS) * DMG_CAP_DECAY : rawBonus;
    return baseDmg * (1 + cappedBonus);
  }

  // ---------- 地形障碍（山海墨玉：掩体礁石 + 灵脉裂隙）----------
  var obstacles = [];
  // 空域：开阔天空，无房间/走廊结构。飞机在天空自由飞行，仅受障碍物与地图边界约束。
  var spawnPoint = { x: WORLD_W / 2, y: WORLD_H - 150 };

  function genMapLayout() {
    obstacles = [];
    spawnPoint = { x: WORLD_W / 2, y: WORLD_H - 150 };
  }


  function generateObstacles() {
    // 空域：仅散布掩体礁石/裂隙/隔断墙；obstacles 已由 genMapLayout 在开局清空
    var t = run ? run.tier : 1;
    var rockN = 12 + t * 3, riftN = 3 + Math.floor(t / 2);
    var safe = [{ x: player.x, y: player.y, r: 200 }]; // 出生点留白
    for (var ni = 0; ni < nodes.length; ni++) safe.push({ x: nodes[ni].x, y: nodes[ni].y, r: 120 });
    if (extractPoints) for (var zi = 0; zi < extractPoints.length; zi++) { var z = extractPoints[zi]; safe.push({ x: z.x + z.w / 2, y: z.y + z.h / 2, r: z.w / 2 + 110 }); }
    safe.push({ x: WORLD_W / 2, y: WORLD_H * 0.16, r: 175 }); // BOSS 出生通道留白
    function ok(x, y, r) {
      if (x < 72 || x > WORLD_W - 72 || y < 72 || y > WORLD_H - 72) return false;
      // 空域：掩体可落在天空任意处（仅受边界与间距约束）
      for (var s = 0; s < safe.length; s++) if (dist2(x, y, safe[s].x, safe[s].y) < (r + safe[s].r) * (r + safe[s].r)) return false;
      for (var o = 0; o < obstacles.length; o++) {
        var ob0 = obstacles[o];
        if (ob0.type === 'wall') { if (Math.abs(x - ob0.x) < r + ob0.hw + 8 && Math.abs(y - ob0.y) < r + ob0.hh + 8) return false; }
        else if (dist2(x, y, ob0.x, ob0.y) < (r + ob0.r + 26) * (r + ob0.r + 26)) return false;
      }
      return true;
    }
    var tries = 0;
    while (obstacles.length < rockN && tries < 700) {
      tries++;
      var rr = rand(26, 54), rx = rand(80, WORLD_W - 80), ry = rand(80, WORLD_H - 80);
      if (!ok(rx, ry, rr)) continue;
      var verts = [], nv = 7 + (Math.random() * 3 | 0);
      for (var v = 0; v < nv; v++) { var a = v / nv * 6.283, rad = rr * (0.82 + Math.random() * 0.22); verts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad }); }
      obstacles.push({ type: 'rock', x: rx, y: ry, r: rr, verts: verts });
    }
    tries = 0;
    while (obstacles.length < rockN + riftN && tries < 600) {
      tries++;
      var r2 = rand(42, 72), rx2 = rand(90, WORLD_W - 90), ry2 = rand(90, WORLD_H - 90);
      if (!ok(rx2, ry2, r2)) continue;
      obstacles.push({ type: 'rift', x: rx2, y: ry2, r: r2, dps: 9 + t * 2, col: '#B06FD0', pulse: rand(0, 6.28) });
    }
    // 隔断墙（矩形实体）：挡子弹 + 挡人，作空域掩体
    var wallN = 4 + t, wtry = 0;
    function wallBad(wx, wy, hw, hh) {
      if (wx - hw < 60 || wx + hw > WORLD_W - 60 || wy - hh < 60 || wy + hh > WORLD_H - 60) return true;
      // 空域：隔断墙可建在天空任意处（仅受边界与间距约束）
      for (var s = 0; s < safe.length; s++) if (Math.abs(wx - safe[s].x) < hw + safe[s].r && Math.abs(wy - safe[s].y) < hh + safe[s].r) return true;
      for (var o2 = 0; o2 < obstacles.length; o2++) { var ob2 = obstacles[o2]; if (ob2.type === 'wall' && Math.abs(wx - ob2.x) < hw + ob2.hw + 12 && Math.abs(wy - ob2.y) < hh + ob2.hh + 12) return true; }
      return false;
    }
    while (obstacles.filter(function (o) { return o.type === 'wall'; }).length < wallN && wtry < 600) {
      wtry++;
      var horiz = Math.random() < 0.5, wl = rand(170, 340), wt = 30;
      var wx = rand(120, WORLD_W - 120), wy = rand(120, WORLD_H - 120);
      var hw = horiz ? wl / 2 : wt / 2, hh = horiz ? wt / 2 : wl / 2;
      if (wallBad(wx, wy, hw, hh)) continue;
      obstacles.push({ type: 'wall', x: wx, y: wy, hw: hw, hh: hh });
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
    banner = { text: (v.type === 'seal' ? '封印宝箱' : '符文宝箱') + ' 开启 · 获得高品质战利品', life: 2.4 };
  }
  function updateVaults(dt) {
    for (var vi = 0; vi < vaults.length; vi++) {
      var v = vaults[vi]; if (v.state === 'done') continue;
      var d = Math.hypot(player.x - v.x, player.y - v.y), inRange = d < v.r + 42;
      if (v.type === 'seal') {
        var sealActive = isMobile ? inRange : (inRange && keys['e']);
        if (v.state === 'locked') {
          if (sealActive) { v.state = 'opening'; v.prog = 0; banner = { text: '封印解封中…顶住围堵！', life: 1.4 }; for (var ei = 0; ei < enemies.length; ei++) { if (enemies[ei].vaultGuard === v.idx) { enemies[ei].wake = 0.4; enemies[ei].fireCd = rand(1.6, 2.8); } } }
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
    WORLD_W = Math.max(1600, Math.round(W * 2.2)); WORLD_H = Math.max(1100, Math.round(H * 2.2));
    var a = AIRCRAFT[aircraftId]; var up = meta.up;
    var hp = a.hp + up.hp * 22, spd = a.speed + up.speed * 14, dmg = a.dmg + up.dmg * 3;
    var sh = 40 + up.shield * 14, pick = 46 * (1 + up.pickup * 0.15);
    player = {
      x: WORLD_W / 2, y: WORLD_H * 0.8, vx: 0, vy: 0, r: 14, hp: hp, maxhp: hp, shield: 0, maxshield: sh, regen: 5,
      speed: spd, fireRate: a.fireRate, dmg: dmg, bulletSpeed: a.bulletSpeed,
      fireCd: 0, pickR: pick, iframe: 0, dashCd: 0,
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
      drones: 0, droneList: [], droneCd: 0,
      color: a.color, ang: -Math.PI / 2, buffs: [], runes: [], elements: {}, flash: 0, bank: 0, bankSmooth: 0, extractBonus: 0,
      attackAnimT: 0, attackSeq: 0, attackSide: 0, attackFired: [false, false], dashAnimT: 0, engineT: 0,
      consumables: [],
      bondTiers: {}, killExplode: 0, freezeChance: 0, skyStrike: 0, skyCd: 0, skyT: 0, gale: false, galeActive: false, outOfCombatT: 0,
      execute: 0, overload: 0, undying: false, undyingUsed: false, guardShock: 0
    };
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    bullets = []; enemies = []; loot = []; resetParticles(); resetFloaters(); nodes = []; vaults = []; totems = [];
    extractPoints = []; exfil = false; boss = null; bossSpawned = false;
    combatTimer = 0; exfilStarted = false; exfilChoice = null; exfilChoicePending = null; exfilJadePenalty = 0; exfilAlarmT = 0; exfilCenter = null; exfilAutoT = 0; lootArrow = null; edgeArrow = null;
    rifts = []; inRift = false; riftReturn = null; riftSnapshot = null; riftRoom = null; riftLoot = []; riftPrompt = false; riftExit = null; riftWaves = null; riftTrapT = 0; riftHidden = null;
    run = { loot: [], kills: 0, picked: 0, time: 0, aircraft: aircraftId, tier: tier, nodes: 0, killedBoss: false, enemyKills: {}, pity: 0, lootBonus: 0 };
    spawnTimer = 2.5; buffTimer = 0; buffPending = false; buffHold = 0; buffSafe = 0; gameTime = 0; hintTimer = 6; banner = null; runeCount = 0; killForBuff = runeNextReq(0); screenFlash = { color: '#fff', a: 0 };
    enemiesSlowT = 0;
    genMapLayout(); // 空域：清空障碍并设出生点
    player.x = spawnPoint.x; player.y = spawnPoint.y; // 出生在空域下方中央
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    placeNodes(6 + tier);
    applyEquipped(); // 把已装备法器 + 研究院被动实打实叠到这局属性上
    if (meta.runs === 0) showTip('<b>目标：</b>搜刮战利品 → 撤离带回法器。天空有<b>礁石掩体/隔断墙</b>可当掩护；<b>封印宝箱</b>按住[E]解封（会刷敌）、<b>符文宝箱</b>击破环绕符文柱解锁，都在特殊位置、保底高品质。撤离点<b>限时开放</b>（光柱亮起才能走）', 5);
    vfxLines.length = 0;
    recalcBonds();
    initExtractPoints(); // 三角洲式：限时开放撤离点（开局为关闭，按时间窗循环开放）
    generateObstacles(); // 程序化散布掩体礁石 + 灵脉裂隙 + 隔断墙（避开出生/节点/撤离/BOSS通道）
    placeVaults(tier); // 特殊位置放置封印/符文宝箱（好宝箱，需做任务解锁）
    placeEncounters(); // 遭遇制：按地点固定布置敌人（宝箱护卫 + 少量游荡机）
    placeRifts(); // 角落/边缘放置 1-2 个裂隙入口
  }

  function placeNodes(n) {
    var tries = 0;
    while (nodes.length < n && tries < 400) {
      tries++;
      var x = rand(WORLD_W * 0.08, WORLD_W * 0.92), y = rand(WORLD_H * 0.08, WORLD_H * 0.6);
      // 空域：节点可落在天空任意处
      if (dist2(x, y, player.x, player.y) < 220 * 220) continue;
      if (nodes.some(function (nd) { return dist2(x, y, nd.x, nd.y) < 130 * 130; })) continue;
      var tier = clamp(1 + Math.floor(gameTime / 28), 1, 4);
      nodes.push({ x: x, y: y, r: 18, collected: false, respawn: 0, chest: rollChestTier(), pulse: rand(0, 6) });
    }
  }
  // bonus: 0~0.12 表现加成，越高越偏向高品质（层级/连杀进度/无伤）
  function rollRarity(tier, bonus) {
    var r = Math.random() - (bonus || 0);
    var t = (tier - 1) * 0.05; // 高层影响加大
    if (r > 0.95 - t) return 'orange';
    if (r > 0.85 - t) return 'purple';
    if (r > 0.62 - t) return 'blue';
    if (r > 0.32 - t) return 'green';
    return 'white';
  }
  // ---------- 宝箱分级与开箱反馈 ----------
  var CHESTS = {
    wood:   { key: 'wood',   name: '木箱', color: '#8B95A0', edge: '#5b6470', glow: 6,  min: 2, max: 3, floor: 1, flash: '#cdd8e2', guard: 1 },
    silver: { key: 'silver', name: '银箱', color: '#CFE0DC', edge: '#7fa6c0', glow: 11, min: 3, max: 4, floor: 2, flash: '#dff0ff', guard: 1 },
    gold:   { key: 'gold',   name: '金箱', color: '#C9A227', edge: '#8A6A1E', glow: 16, min: 4, max: 6, floor: 3, flash: '#C9A227', guard: 2 },
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
    var w = [ floor >= 1 ? 0 : 10, floor >= 2 ? 5 : 16, floor >= 3 ? 12 : 16, floor >= 4 ? 22 : 16, floor >= 4 ? 30 : 12 ];
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
    var sum = ram + shoot + turret + heal + gunship + split + looter + sniper + shielder + swarm; r *= sum;
    if (r < ram) return 'ram'; r -= ram;
    if (r < shoot) return 'shoot'; r -= shoot;
    if (r < turret) return 'turret'; r -= turret;
    if (r < heal) return 'heal'; r -= heal;
    if (r < gunship) return 'gunship'; r -= gunship;
    if (r < split) return 'split'; r -= split;
    if (r < looter) return 'looter'; r -= looter;
    if (r < sniper) return 'sniper'; r -= sniper;
    if (r < shielder) return 'shielder'; r -= shielder;
    return 'swarm';
  }
  function spawnEnemy(x, y, etier) {
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
      entryWake = 0.6; // 边缘飞入 / 裂缝钻出 入场动画（drawEnemies 已有入场环表现）
    }
    etier = etier || clamp(1 + Math.floor(gameTime / 28), 1, 4);
    var arche = pickArchetype(etier);
    var elite = !x && Math.random() < 0.08;
    var baseHp = (16 + etier * 9) * tierMul();
    if (arche === 'turret') baseHp *= 2.2; else if (arche === 'heal') baseHp *= 1.25; else if (arche === 'split') baseHp *= 0.9; else if (arche === 'gunship') baseHp *= 3.4; else if (arche === 'looter') baseHp *= 1.15;
    else if (arche === 'sniper') baseHp *= 0.8; else if (arche === 'shielder') baseHp *= 1.8; else if (arche === 'swarm') baseHp *= 0.35;
    if (elite) baseHp *= 3;
    var RAD = { turret: 22, gunship: 30, split: 22, heal: 20, looter: 17, ram: 15, sniper: 18, shielder: 22, swarm: 10 };
    var r = RAD[arche] || 17;
    var ecol = arche === 'heal' ? COL.extract : (arche === 'split' ? RARCOL.purple : (arche === 'looter' ? '#E0B84A' : (arche === 'sniper' ? '#E8A050' : (arche === 'shielder' ? '#5B9FD0' : (arche === 'swarm' ? '#A8C84E' : COL.enemy)))));
    var eedge = arche === 'heal' ? COL.ink : (arche === 'split' ? '#2a0a2a' : (arche === 'looter' ? '#8a5f1a' : (arche === 'sniper' ? '#6a4520' : (arche === 'shielder' ? '#1a4a70' : (arche === 'swarm' ? '#4a6020' : COL.enemyEdge)))));
    var e = {
      x: ex, y: ey, vx: 0, vy: 0, hp: baseHp, maxhp: baseHp, r: r,
      fireCd: rand(1.6, 3.0), tier: etier, arche: arche, ram: arche === 'ram' || arche === 'split' || arche === 'swarm',
      elite: elite, healCd: rand(2.5, 4.5), burst: 0,
      zig: arche === 'looter' || arche === 'swarm' ? rand(0, 6.28) : 0, fleeing: false, lootStolen: null,
      rarity: elite ? (Math.random() < 0.5 ? 'purple' : 'blue') : rollRarity(etier),
      flash: 0, wake: entryWake, dmgMul: tierDmgMul() * (elite ? 1.2 : 1),
      burn: 0, burnT: 0, small: arche === 'swarm', col: ecol, edge: eedge, bigBullet: arche === 'gunship',
      hitT: 0, hitMag: 0,
      // —— 警戒 / 感知 / 追击（规则圣经 v1）——
      alert: 0, alertClock: 0, decayT: 0, quietT: 0,      // 0=无察觉 1=警觉 2=锁定
      homeX: ex, homeY: ey, patrolAng: rand(0, 6.28),     // 巡逻锚点
      pursueStage: 0, pursueT: 0, alarmIgnored: false,    // 追击三阶段 / 狂暴区忽略距离上限
      chestTrig: false, forceAlert: arche === 'swarm',     // 蜂群天生警觉
      // —— 新敌人特有字段 ——
      sniperCharge: 0, sniperAim: 0,     // 狙击手：充能计时 + 瞄准角度
      shieldRadius: 120, shieldPulse: 0, // 护盾兵：护盾范围 + 脉冲动画
      swarmId: 0,                         // 蜂群：群体编号
      // —— 精英修饰词 ——
      eliteMod: elite ? pickEliteMod() : null,  // 'volatile' / 'adaptive' / 'frenzied'
      lastElemHit: null, elemResist: 0,         // 适应：最后被命中的元素 + 抗性
      frenzyTriggered: false                    // 狂暴：是否已触发
    };
    if (arche === 'swarm') {
      // 蜂群成群出现：直接创建2-4只额外蜂群成员（不递归调用spawnEnemy避免无限循环）
      var swarmCount = randi(2, 4);
      for (var si = 0; si < swarmCount; si++) {
        var sx = clamp(ex + rand(-30, 30), 40, WORLD_W - 40), sy = clamp(ey + rand(-30, 30), 40, WORLD_H - 40);
        var se = {
          x: sx, y: sy, vx: 0, vy: 0, hp: Math.round(baseHp), maxhp: Math.round(baseHp), r: 10,
          fireCd: 99, tier: etier, arche: 'swarm', ram: true, elite: false, healCd: 99, burst: 0,
          zig: rand(0, 6.28), fleeing: false, lootStolen: null, rarity: rollRarity(etier),
          flash: 0, wake: 0.3, dmgMul: tierDmgMul(), burn: 0, burnT: 0, small: true,
          col: '#A8C84E', edge: '#4a6020', bigBullet: false, hitT: 0, hitMag: 0,
          alert: 2, alertClock: 0, decayT: 0, quietT: 0,
          homeX: sx, homeY: sy, patrolAng: rand(0, 6.28),
          pursueStage: 0, pursueT: 0, alarmIgnored: false,
          chestTrig: false, forceAlert: true,
          sniperCharge: 0, sniperAim: 0, shieldRadius: 120, shieldPulse: 0, swarmId: 0,
          eliteMod: null, lastElemHit: null, elemResist: 0, frenzyTriggered: false
        };
        enemies.push(se);
      }
    }
    if (arche === 'looter' && !run.looterWarned) { run.looterWarned = true; banner = { text: '⚠ 劫掠者出现！它会偷走你已捡的战利品，快击落它夺回！', life: 3.2 }; AudioSys.sfx.stolen(); }
    if (arche === 'sniper' && !run.sniperWarned) { run.sniperWarned = true; banner = { text: '⚠ 狙击手出现！注意躲避红色激光瞄准线！', life: 2.8 }; }
    if (arche === 'shielder' && !run.shielderWarned) { run.shielderWarned = true; banner = { text: '⚠ 护盾兵出现！优先击破它以解除友军护盾！', life: 2.8 }; }
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
    if (d < ALERT.detectCore) { e.alert = 2; e.alertClock = 0; e.quietT = 0; e.pursueStage = 0; e.pursueT = 0; }
    else if (stim) {
      e.quietT = 0; e.decayT = 0; e.chestTrig = false;
      if (e.alert === 0) { e.alert = 1; e.alertClock = 0; }
      else if (e.alert === 1) { e.alertClock += dt; if (e.alertClock >= ALERT.lv1To2) { e.alert = 2; e.pursueStage = 0; e.pursueT = 0; } }
      else { e.pursueStage = 0; e.pursueT = 0; }
    } else {
      e.chestTrig = false;
      if (e.alert === 1) { e.decayT += dt; if (e.decayT >= ALERT.decay1) { e.alert = 0; e.alertClock = 0; } }
      else if (e.alert === 2) {
        if (d > 500 && !e.alarmIgnored) {
          e.quietT += dt;
          if (e.quietT >= ALERT.decay2quiet) { e.decayT += dt; if (e.decayT >= ALERT.decay2) { e.alert = 0; e.alertClock = 0; } }
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
  function nearestEnemy(x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < enemies.length; i++) { var d = dist2(x, y, enemies[i].x, enemies[i].y); if (d < bd) { bd = d; best = enemies[i]; } }
    if (boss && boss.wake <= 0) { var db = dist2(x, y, boss.x, boss.y); if (db < bd) best = boss; }
    return best;
  }
  function fireBullet(x, y, ang, from, dmg, speed, opts) {
    opts = opts || {};
    var br = from === 'player' ? 4.5 : (opts.big ? 10 : 5.5);
    var bkind = opts.boss ? 'boss' : (from === 'enemy' ? 'enemy' : (opts.crit ? 'crit' : (opts.homing ? 'homing' : (opts.pierce > 0 ? 'pierce' : (opts.explode > 0 ? 'explode' : 'normal')))));
    var b = { x: x, y: y, lastx: x, lasty: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: dmg, from: from, r: br, life: 3, age: 0,
      pierce: opts.pierce || 0, homing: !!opts.homing, explode: opts.explode || 0, crit: !!opts.crit, burn: opts.burn || 0, lifesteal: opts.lifesteal || 0, chain: opts.chain || 0, boss: !!opts.boss, kind: bkind, elem: opts.elem || null, xuanwu: !!opts.xuanwu, chilan: !!opts.chilan,
      homingTurnRate: opts.homingTurnRate || 0, splashRatio: opts.splashRatio || 0, chainRange: opts.chainRange || 140, chainDecay: opts.chainDecay || 0.5, falloff: opts.falloff || 0 };
    if (from === 'player' && opts.elem && ELEM_VFX[opts.elem]) b.trail = { elem: opts.elem, age: 0, fps: 18, size: 46 };
    bullets.push(b);
  }
  // type: 'artifact'(法器) | 'jade'(灵玉砂) | 'consumable'(丹药) | 'legendary'(传说核心) | 'bossrelic'(Boss遗物) | 'legendary_weapon'(传说武器)
  function dropLoot(x, y, rarity, type, relicData) {
    type = type || 'artifact';
    var el = { x: x, y: y, type: type, rarity: rarity || 'white', slot: pickSlot(), vx: rand(-18, 18), vy: rand(-18, 18), life: type === 'bossrelic' ? 45 : (type === 'legendary' || type === 'legendary_weapon' ? 32 : 22), age: 0 };
    if (type === 'jade') { el.amount = 8 + Math.floor((run ? run.tier : 1) * 4) + randi(0, 7); }
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
  }
  function burst(x, y, color, n, opt) {
    opt = opt || {};
    var ring = opt.ring, ringR = opt.ringR || 46;
    for (var i = 0; i < n; i++) { var a = rand(0, 6.28), s = rand(opt.smin || 60, opt.smax || 220); spawnParticle({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(opt.lmin || 0.25, opt.lmax || 0.6), color: color, r: rand(opt.rmin || 1.3, opt.rmax || 3) }); }
    if (ring) spawnParticle({ x: x, y: y, vx: 0, vy: 0, life: 0.3, color: color, r: 3, ring: true, rmax: ringR, r0: opt.r0 || 6 });
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
  function safeToOffer() {
    var R = 86, R2 = R * R;
    for (var i = 0; i < bullets.length; i++) { var b = bullets[i]; if (b.from !== 'player' && dist2(b.x, b.y, player.x, player.y) < R2) return false; }
    for (var j = 0; j < enemies.length; j++) { var e = enemies[j]; if (e.ram && !e.small && dist2(e.x, e.y, player.x, player.y) < R2) return false; }
    return true;
  }
  // ---------- 符文（随机强化，替代原BUFFS）----------
  var buffChoices = [];
  function offerBuff() {
    buffChoices = []; var pool = RUNES.slice();
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
      el.style.borderColor = ELEMCOL[b.elem];
      var have = player.elements[b.elem] || 0, nx = null; BOND_TIERS[b.elem].forEach(function (t) { if (have < t.need) nx = nx === null ? t : nx; });
      el.innerHTML = '<div class="big" style="color:' + ELEMCOL[b.elem] + '">' + (TRIGRAM[b.elem] || '') + b.elem + '</div><div class="bname">' + b.name + '</div><div class="muted">' + b.desc + '</div>' +
        (nx ? '<div class="buff-meta">' + (TRIGRAM[b.elem] || '') + b.elem + '系 ' + have + ' 枚 · 再 ' + (nx.need - have) + ' 枚解锁「' + nx.name + '」</div>' : '<div class="buff-have">' + (TRIGRAM[b.elem] || '') + b.elem + '系已满阶羁绊</div>');
      el.onclick = function () { chooseBuff(idx); };
      document.getElementById('buffList').appendChild(el);
    });
  }
  function chooseBuff(idx) {
    if (!paused || !buffChoices[idx]) return;
    var b = buffChoices[idx]; b.apply();
    player.buffs.push(b.name); player.runes.push(b.name);
    runeCount++; buffTimer = 0; killForBuff = runeNextReq(runeCount); // 每次取符文后，下一枚所需击杀数依次叠加（封顶）
    player.elements[b.elem] = (player.elements[b.elem] || 0) + 1;
    recalcBonds();
    banner = { text: '获得符文：' + b.name, life: 1.5 };
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
      '点 2 个同色 → 2合1 升阶；凑齐 3 个同色可点下方「⚡3合1」升级并+随机词条';
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
        banner = { text: '2合1 → ' + RARNAME[RAR[ri + 1]], life: 1.3 };
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
    var ri = RAR.indexOf(run.loot[idxs[0]].rarity);
    var sl3 = run.loot[idxs[0]].slot || pickSlot();
    idxs.sort(function (a, b) { return b - a; }).forEach(function (k) { run.loot.splice(k, 1); });
    run.loot.push({ rarity: RAR[ri + 1], name: pickName(RAR[ri + 1]), slot: sl3 });
    // 随机小词条（微小永久增益本局）
    var affix = randi(0, 3);
    if (affix === 0) player.atkMult *= 1.05;
    else if (affix === 1) player.fireRate = Math.min(15, player.fireRate * 1.05);
    else if (affix === 2) { player.maxhp += 8; player.hp += 8; }
    else player.bulletSpeed *= 1.05;
    burst(player.x, player.y, RARCOL[RAR[ri + 1]], 14);
    AudioSys.sfx.merge();
    banner = { text: '⚡3合1 → ' + RARNAME[RAR[ri + 1]] + ' (+词条)', life: 1.6 };
  }
  function doThreeMerge() {
    for (var ri = 0; ri < 4; ri++) {
      var idxs = [];
      run.loot.forEach(function (it, k) { if (it.rarity === RAR[ri]) idxs.push(k); });
      if (idxs.length >= 3) { threeMergeFrom(idxs.slice(0, 3)); renderMerge(); return; }
    }
  }
  function refreshSel() { var chips = document.getElementById('mergeGrid').children; for (var k = 0; k < chips.length; k++) chips[k].classList.remove('sel'); mergeSel.forEach(function (ix) { if (chips[ix]) chips[ix].classList.add('sel'); }); }

  // ---------- 丹药消耗品 ----------
  function addConsumable(key) {
    if (player.consumables.length >= 3) { floatText(player.x, player.y - 24, '丹药已满', '#D98A3D'); return; }
    player.consumables.push(key);
    var c = CONSUMABLES[key];
    floatText(player.x, player.y - 24, '获得丹药：' + c.name, '#D9B64A');
    banner = { text: '获得丹药：' + c.name + '（按 Q 使用）', life: 1.4 };
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
      player.hp = Math.min(player.maxhp, player.hp + player.maxhp * 0.4); burst(player.x, player.y, '#8FD8C0', 14);
      AudioSys.sfx.heal();
    } else if (key === 'slow') {
      enemiesSlowT = 3; enemiesSlowFactor = 0.4; banner = { text: '凝时！敌人减速', life: 1.4 };
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
    gapMin: 25, gapMax: 45 // 关闭后到下一轮预兆的间隔
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
        state: 'closed',
        timer: 35 + i * 18 + rand(0, 8), // 首轮错开，避免所有点同时开
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
    var silent = (choice === 'silent');
    if (silent && run.loot.length > 0) { run.loot.pop(); run.picked = Math.max(0, run.picked - 1); floatText(player.x, player.y - 30, '静默启动：消耗 1 件战利品', '#C9A227'); }
    if (choice === 'quick') { exfilJadePenalty = EXFIL2.quickJade; floatText(player.x, player.y - 30, '急速读条！', '#8FD8C0'); }
    if (choice === 'clear') { floatText(player.x, player.y - 30, '提前清场撤离', '#8FD8C0'); }
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
    banner = { text: '撤离惊动！灵能脉冲唤醒敌机（红=狂暴死追·黄=波及）', life: 2.6 };
  }
  function abortExfil(ez) {
    for (var i = 0; i < enemies.length; i++) { var e = enemies[i]; if (e.alarmIgnored) { e.alert = 0; e.alarmIgnored = false; e.alertClock = 0; e.decayT = 0; e.pursueT = 0; } }
    ez.prog = 0; ez.state = 'cooldown'; ez.cd = EXFIL2.abortCd;
    exfilStarted = false; exfilChoice = null; exfilCenter = null; exfilAutoT = 0;
    banner = { text: '撤离中断！被惊动敌机撤退，撤离点冷却 ' + Math.ceil(EXFIL2.abortCd) + 's', life: 2.8 };
  }
  function updateExtractPoints(dt) {
    for (var i = 0; i < extractPoints.length; i++) {
      var z = extractPoints[i];
      z.timer -= dt;
      if (z.state === 'closed') {
        if (z.timer <= 0) { z.state = 'warning'; z.timer = EXTRACT.warnDur; }
      } else if (z.state === 'warning') {
        if (z.timer <= 0) {
          z.state = 'open'; z.timer = EXTRACT.openDur;
          banner = { text: '撤离点 ' + z.label + ' 已开放！冲入光柱读条 2.8s 带出战利品（敌人正在围堵）', life: 3 };
          for (var egi = 0; egi < enemies.length; egi++) { if (enemies[egi].extractGuard === i) { enemies[egi].wake = 0; enemies[egi].alert = 1; } }
        }
      } else if (z.state === 'open') {
        if (z.timer <= 0) { z.state = 'closed'; z.timer = rand(EXTRACT.gapMin, EXTRACT.gapMax); z.prog = 0; banner = { text: '撤离点 ' + z.label + ' 已关闭', life: 2.2 }; }
      } else if (z.state === 'cooldown') {
        z.cd -= dt;
        if (z.cd <= 0) { z.state = 'closed'; z.timer = rand(EXTRACT.gapMin, EXTRACT.gapMax); z.prog = 0; banner = { text: '撤离点 ' + z.label + ' 冷却结束（已关闭）', life: 2.0 }; }
      }
    }
  }

  // ---------- 暂停 ----------
  function togglePause() {
    if (document.getElementById('pauseOverlay').style.display === 'flex') { closePause(); return; }
    paused = true; document.getElementById('pauseOverlay').style.display = 'flex';
    var st = document.getElementById('pauseStats');
    if (st && run) st.innerHTML = '本局：击杀 <b>' + run.kills + '</b> · 战利品 <b>' + run.loot.length + '</b> 件 · 已搜刮 <b>' + run.nodes + '/' + (3 + run.tier) + '</b> 点 · <b>' + Math.floor(run.time) + '</b> 秒';
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
    banner = { text: txt, life: 1.5 };
    AudioSys.sfx.bossPhase();
  }
  function spawnBoss() {
    bossSpawned = true;
    var kinds = ['taowu', 'qiongqi', 'taotie', 'hundun'];
    var kind = kinds[randi(0, kinds.length - 1)];
    var hpMul = { taowu: 1.0, qiongqi: 0.92, taotie: 1.08, hundun: 0.95 };
    var radius = { taowu: 46, qiongqi: 50, taotie: 52, hundun: 48 };
    var hp = (620 + Math.floor(gameTime) * 5) * (1 + (run.tier - 1) * 0.7) * hpMul[kind];
    var names = { taowu: '梼杌', qiongqi: '穷奇', taotie: '饕餮', hundun: '混沌' };
    var tips = {
      taowu: '⚠ 梼杌·重甲堡垒 来袭！（弹幕+阶段强化）',
      qiongqi: '⚠ 穷奇·高速掠食 来袭！（突进+召唤）',
      taotie: '⚠ 饕餮·吞噬熔炉 来袭！（扇形火柱+吸引）',
      hundun: '⚠ 混沌·终焉虚空 来袭！（螺旋弹幕+旋转甲胄）'
    };
    boss = { kind: kind, x: WORLD_W / 2, y: -60, hp: hp, maxhp: hp, r: radius[kind], phase: 1, atkCd: 2.6, burstCd: 4.0, flash: 0, wake: 1.2, ang: 0,
      summonCd: 6, dashCd: 4, dashing: 0, dashWarn: 0, summonWarn: 0, invuln: 0, hitT: 0, hitMag: 0 };
    banner = { text: tips[kind], life: 2.4 };
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
      for (var s = 0; s < shots; s++) { var off = (s - (shots - 1) / 2) * 0.16; fireBullet(b.x, b.y, base + off, 'enemy', 10 * tierDmgMul(), 200, { boss: true }); }
      b.atkCd = rate;
    }
    b.burstCd -= dt;
    if (b.burstCd <= 0) {
      var n = b.phase === 3 ? 22 : (b.phase === 2 ? 18 : 12), spd = b.phase === 3 ? 175 : 145; b.ang += 0.35;
      for (var i = 0; i < n; i++) { var a = b.ang + (i / n) * 6.28; fireBullet(b.x, b.y, a, 'enemy', 9 * tierDmgMul(), spd, { boss: true }); }
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
      for (var s = 0; s < shots; s++) { var off = (s - (shots - 1) / 2) * 0.12; fireBullet(b.x, b.y, base + off, 'enemy', 9 * tierDmgMul(), 240, { boss: true }); }
      b.atkCd = rate;
    }
    b.summonCd -= dt;
    if (b.summonWarn > 0) {
      b.summonWarn -= dt;
      if (b.summonWarn <= 0) {
        if (enemies.length < 40) {
          var cnt = b.phase >= 2 ? 3 : 2;
          for (var k = 0; k < cnt; k++) spawnEnemy(b.x + rand(-40, 40), b.y + rand(-40, 40), b.tier || run.tier);
        }
        b.summonCd = b.phase >= 3 ? 4 : 7; banner = { text: '穷奇召唤眷属！', life: 1.2 };
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
      for (var s = 0; s < shots; s++) { var off = (s - (shots - 1) / 2) * 0.18; fireBullet(b.x, b.y, base + off, 'enemy', 11 * tierDmgMul(), 160, { boss: true }); }
      b.atkCd = rate;
    }
    b.burstCd -= dt;
    if (b.burstCd <= 0) {
      var n = b.phase === 3 ? 28 : (b.phase === 2 ? 22 : 16), spd = b.phase === 3 ? 150 : 120; b.ang += 0.25;
      for (var i = 0; i < n; i++) { var a = b.ang + (i / n) * 6.28; fireBullet(b.x, b.y, a, 'enemy', 8 * tierDmgMul(), spd, { boss: true }); }
      b.burstCd = b.phase === 3 ? 2.6 : (b.phase === 2 ? 3.4 : 4.4);
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
      for (var s = 0; s < shots; s++) { var off = (s - (shots - 1) / 2) * 0.22; fireBullet(b.x, b.y, base + off, 'enemy', 9 * tierDmgMul(), 210, { boss: true }); }
      b.atkCd = rate;
    }
    b.burstCd -= dt;
    if (b.burstCd <= 0) {
      var n = b.phase === 3 ? 36 : (b.phase === 2 ? 28 : 20), spd = 130; b.ang += 0.42;
      for (var i = 0; i < n; i++) { var a = b.ang + (i / n) * 6.28 * (b.phase === 3 ? 2.5 : 1.8); fireBullet(b.x, b.y, a, 'enemy', 7 * tierDmgMul(), spd + i * 2, { boss: true }); }
      b.burstCd = b.phase === 3 ? 2.0 : (b.phase === 2 ? 2.6 : 3.4);
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
    // 常规战利品
    var dropsByKind = {
      qiongqi: ['orange', 'purple', 'purple', 'blue', 'blue', 'green'],
      taowu:   ['purple', 'purple', 'orange', 'blue', 'blue', 'green'],
      taotie:  ['orange', 'purple', 'blue', 'blue', 'green', 'green'],
      hundun:  ['orange', 'orange', 'purple', 'blue', 'green', 'green']
    };
    var drops = dropsByKind[boss.kind] || dropsByKind.taowu;
    for (var i = 0; i < drops.length; i++) dropLoot(boss.x + rand(-45, 45), boss.y + rand(-45, 45), drops[i]);
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
    banner = { text: '★ BOSS 击破！获得遗物「' + relic.name + '」 · 搜刮战利品并撤离带出', life: 3.2 };
    // 保底：击破后强制开放至少一个撤离点，避免打完无路可撤
    var anyOpen = extractPoints.some(function (p) { return p.state === 'open'; });
    if (!anyOpen && extractPoints.length) {
      var zb = extractPoints[0];
      zb.state = 'open'; zb.timer = EXTRACT.openDur; zb.prog = 0;
      banner = { text: '★ BOSS 击破！撤离点 ' + zb.label + ' 已开启，立即撤离带出战利品', life: 3.6 };
      var zbIdx = extractPoints.indexOf(zb);
      for (var bei = 0; bei < enemies.length; bei++) { if (enemies[bei].extractGuard === zbIdx) { enemies[bei].wake = 0; enemies[bei].alert = 1; } }
    }
    boss = null;
  }

  // ---------- 结算 ----------
  function finishRun(outcome) {
    if (scene !== 'mission') return;
    showScene('result');
    var killReward = Math.floor(run.kills * 2) + (outcome === 'success' ? 30 : outcome === 'abandon' ? 10 : 0);
    if (outcome === 'success' && exfilJadePenalty > 0) killReward = Math.floor(killReward * (1 - exfilJadePenalty)); // 急速读条折损
    var kept = bankLoot(outcome);                 // 战利品入库为法器（按 outcome 比例，带研究院撤离加成）
    var lostLoot = run.loot.length - kept;        // 被没收的战利品件数
    meta.currency += killReward; meta.runs += 1;  // 灵玉仅来自击杀（用于回收/研究院/永久强化）
    if (run.kills > meta.bestKills) meta.bestKills = run.kills;
    var unlockedNew = false;
    if (outcome === 'success' && run.killedBoss && run.tier === meta.maxTier && meta.maxTier < 3) { meta.maxTier++; unlockedNew = true; }
    checkUnlocks();
    for (var ek in run.enemyKills) { meta.codex.enemies[ek] = (meta.codex.enemies[ek] || 0) + run.enemyKills[ek]; } // 敌怪图鉴入库
    saveMeta();
    showResult(outcome, kept, lostLoot, killReward, unlockedNew);
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
  function onEnemyDeath(e, fromExpl) {
    if (!e || e.dead) return;
    e.dead = true;
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
        var volDmg = Math.round((12 + e.tier * 4) * tierDmgMul());
        damagePlayer(volDmg);
        floatText(player.x, player.y - 22, '爆裂 -' + volDmg, '#FF6A2A', 'crit');
      }
    }
    // 战利品丰富化：类型分流 + 保底(每8杀蓝+) + 表现加成
    run.pity = (run.pity || 0) + 1;
    var pitied = run.pity >= 8; if (pitied) run.pity = 0;
    run.lootBonus = Math.min(0.12, (run.tier - 1) * 0.02 + Math.min(0.06, (run.kills || 0) * 0.0012) + (player.hp >= player.maxhp ? 0.02 : 0));
    var dr = Math.random();
    if (dr < 0.20) { dropLoot(e.x, e.y, 'blue', 'jade'); }              // 灵玉砂（货币）
    else if (dr < 0.28) { dropLoot(e.x, e.y, 'green', 'consumable'); }  // 丹药（消耗品）
    else {
      var rar = pitied ? 'blue' : rollRarity(run.tier, run.lootBonus);
      if (e.elite && RAR.indexOf(rar) < 2) rar = 'blue';
      dropLoot(e.x, e.y, rar, 'artifact');
    }
    if (e.elite) dropLoot(e.x + 10, e.y, 'green', 'artifact');
    if (e.arche === 'split' && !e.small) {
      for (var s = 0; s < 2; s++) { var ne = spawnEnemy(e.x + rand(-20, 20), e.y + rand(-20, 20), e.tier); ne.arche = 'split'; ne.small = true; ne.r = 9; ne.hp = ne.maxhp = Math.round(e.maxhp * 0.4); ne.ram = true; ne.col = RARCOL.purple; ne.edge = '#2a0a2a'; }
    }
    run.kills++; buffTimer++;
    run.enemyKills[e.arche] = (run.enemyKills[e.arche] || 0) + 1; // 敌怪图鉴计数
    if (runeCount < RUNE_CAP && buffTimer >= killForBuff) { buffTimer = 0; buffPending = true; } // 充满后不硬弹，等安全窗口再给；达到总数上限后不再触发
    var idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
  }

  // ---------- 更新 ----------
  function update(dt) {
    gameTime += dt; run.time += dt;
    if (enemiesSlowT > 0) enemiesSlowT -= dt;
    if (hintTimer > 0) hintTimer -= dt;
    if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
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
    if (isMobile && joy.active) {
      dirx = joy.dx; diry = joy.dy; mag = joy.mag;
    } else {
      var mx = 0, my = 0;
      if (keys['w'] || keys['arrowup']) my -= 1;
      if (keys['s'] || keys['arrowdown']) my += 1;
      if (keys['a'] || keys['arrowleft']) mx -= 1;
      if (keys['d'] || keys['arrowright']) mx += 1;
      if (mx || my) { var ml = Math.hypot(mx, my); dirx = mx / ml; diry = my / ml; mag = 1; }
    }
    var curSpeed = player.speed * (player.galeActive ? 1.6 : 1);
    // 倒退减速：移动方向与朝向夹角>100°时降速至65%
    if (mag > 0.05) {
      var facingDot = dirx * Math.cos(player.ang) + diry * Math.sin(player.ang);
      if (facingDot < -0.17) curSpeed *= 0.6; // cos(100°)≈-0.17，超过100°算倒退
    }
    var targetvx = dirx * curSpeed * mag, targetvy = diry * curSpeed * mag;
    // --- 加速/摩擦模型（替代 lerp，消除"飘"感）---
    if (mag > 0.05) {
      // 有输入：线性加速到目标速度
      var dvx = targetvx - player.vx, dvy = targetvy - player.vy;
      var dvLen = Math.hypot(dvx, dvy);
      // 方向反转时加速更快（急转手感）；同向时正常加速
      var dot = player.vx * dirx + player.vy * diry;
      var accelRate = curSpeed * (dot < 0 ? 22 : 15);
      var maxStep = accelRate * dt;
      if (dvLen <= maxStep) { player.vx = targetvx; player.vy = targetvy; }
      else { player.vx += (dvx / dvLen) * maxStep; player.vy += (dvy / dvLen) * maxStep; }
    } else {
      // 无输入：摩擦减速（保留微量滑行=重量感）
      var spd = Math.hypot(player.vx, player.vy);
      if (spd > 0.5) {
        var decelRate = curSpeed * 9;
        var newSpd = Math.max(0, spd - decelRate * dt);
        player.vx = (player.vx / spd) * newSpd;
        player.vy = (player.vy / spd) * newSpd;
      } else { player.vx = 0; player.vy = 0; }
    }
    // 引擎尾焰粒子（移动时）
    var spdNow = Math.hypot(player.vx, player.vy);
    if (spdNow > curSpeed * 0.15 && player.iframe <= 0) {
      player.engineT += dt;
      if (player.engineT > 0.03) {
        player.engineT = 0;
        var eAng = Math.atan2(player.vy, player.vx);
        var eCraft = run.aircraft || 'a';
        var trailCol = eCraft === 'a' ? '#5EC8F0' : (eCraft === 'b' ? '#7EAD9A' : '#E8A0B0');
        spawnParticle({ x: player.x - Math.cos(eAng) * 14, y: player.y - Math.sin(eAng) * 14,
          vx: -Math.cos(eAng) * 35 + rand(-12, 12), vy: -Math.sin(eAng) * 35 + rand(-12, 12),
          life: 0.22, color: trailCol, r: rand(1.2, 2.6) });
      }
    }
    if (player.dashCd > 0) player.dashCd -= dt;
    // 侧倾平滑（与帧率无关）
    var targetBank = clamp(player.vx / Math.max(180, player.speed * 1.0), -0.35, 0.35);
    player.bankSmooth += (targetBank - player.bankSmooth) * Math.min(1, 6 * dt);
    if ((keys['shift'] || dashBtnPressed) && player.dashCd <= 0) {
      player.vx *= 2.5; player.vy *= 2.5; player.iframe = 0.38; player.dashCd = 1.5;
      player.dashAnimT = 0.42; // 8帧@18fps ≈ 0.44s，青隼/玄武冲刺单次动画
      AudioSys.sfx.dash();
    }
    dashBtnPressed = false;
    if (consBtnPressed) { useConsumable(); consBtnPressed = false; }
    player.px = player.x; player.py = player.y;
    player.x = clamp(player.x + player.vx * dt, 16, WORLD_W - 16);
    player.y = clamp(player.y + player.vy * dt, 16, WORLD_H - 16);
    resolveObstacles(player, player.r);
    // 空域：玩家仅受障碍物与地图边界约束（上方已 clamp 到世界范围）
    for (var oi = 0; oi < obstacles.length; oi++) { var ob = obstacles[oi]; if (ob.type === 'rift' && dist2(player.x, player.y, ob.x, ob.y) < (ob.r + player.r) * (ob.r + player.r)) { damagePlayer(ob.dps * dt); addTint(ob.col, 0.10); } }
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W));
    cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    if (player.iframe > 0) player.iframe -= dt;
    if (player.attackAnimT > 0) player.attackAnimT -= dt;
    if (player.dashAnimT > 0) player.dashAnimT -= dt;
    if (player.galeActive) player.iframe = Math.max(player.iframe, 0.1);
    if (player.flash > 0) player.flash -= dt;
    if (screenFlash.a > 0) screenFlash.a = Math.max(0, screenFlash.a - dt * 1.6);

    // 瞄准 & 开火
    var aimWX, aimWY;
    if (isMobile) {
      // 自动瞄准最近敌人（含 Boss），无敌人时朝移动方向
      var nearestE = null, ndist2 = 1e9;
      for (var ne = 0; ne < enemies.length; ne++) {
        var d2e = dist2(enemies[ne].x, enemies[ne].y, player.x, player.y);
        if (d2e < ndist2) { ndist2 = d2e; nearestE = enemies[ne]; }
      }
      if (boss) { var d2b = dist2(boss.x, boss.y, player.x, player.y); if (d2b < ndist2) { ndist2 = d2b; nearestE = boss; } }
      if (nearestE && ndist2 < 520 * 520) { aimWX = nearestE.x; aimWY = nearestE.y; }
      else if (mag > 0.1) { aimWX = player.x + dirx * 100; aimWY = player.y + diry * 100; }
      else { aimWX = player.x + Math.cos(player.ang) * 100; aimWY = player.y + Math.sin(player.ang) * 100; }
    } else {
      aimWX = mouse.x + cam.x; aimWY = mouse.y + cam.y;
    }
    var aimx = aimWX - player.x, aimy = aimWY - player.y;
    var targetAng = Math.atan2(aimy, aimx);
    var diff = targetAng - player.ang;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    player.ang += diff * Math.min(1, 4 * dt);
    player.fireCd -= dt;
    if (player.firedT > 0) player.firedT -= dt;
    var firing = isMobile ? fireBtn.active : (mouse.down || keys[' ']);
    if (firing) player.firedT = 0.35;   // 开火窗口：用于敌机「开火惊动」感知
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
      for (var di = 0; di < player.droneList.length; di++) { var dr = player.droneList[di]; dr.ang += 2.2 * dt; dr.x = player.x + Math.cos(dr.ang) * 46; dr.y = player.y + Math.sin(dr.ang) * 46; }
      if (player.droneCd <= 0) {
        for (var dj = 0; dj < player.droneList.length; dj++) {
          var d2 = player.droneList[dj]; var tgt = nearestEnemy(d2.x, d2.y);
          if (tgt) { var da = Math.atan2(tgt.y - d2.y, tgt.x - d2.x); fireBullet(d2.x, d2.y, da, 'player', player.dmg * 0.5, player.bulletSpeed, { pierce: player.pierce, homing: player.homing, elem: pickOwnedElem() }); }
        }
        player.droneCd = 0.5;
      }
    }

    // 遭遇制：敌人已在关卡生成时按地点固定布置（宝箱护卫 + 少量游荡机），见 placeEncounters()
    // 不再无限刷怪 / 不再战斗增援——一个地点的怪清完就没了。
    if (inRift) { updateRift(dt); }

    // 搜刮点（遭遇制：护卫清空前锁定，不再重生）
    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni]; nd.pulse += dt * 3;
      if (nd.collected) continue;
      if (nd.locked) {
        var gAlive = nd.guards.some(function (g) { return enemies.indexOf(g) >= 0; });
        if (!gAlive) { nd.locked = false; floatText(nd.x, nd.y - 26, '护卫已清！可开箱', CHESTS[nd.chest].color, 'crit'); }
        else if (dist2(nd.x, nd.y, player.x, player.y) < (nd.r + player.pickR * 0.6) * (nd.r + player.pickR * 0.6)) banner = { text: '⚠ 先清除护卫机再开箱', life: 1.0 };
        continue;
      }
      if (dist2(nd.x, nd.y, player.x, player.y) < (nd.r + player.pickR * 0.6) * (nd.r + player.pickR * 0.6)) collectNode(nd);
    }
    // 裂隙入口触碰（主图）
    if (!inRift && !riftPrompt) {
      for (var ri = 0; ri < rifts.length; ri++) {
        var rf = rifts[ri];
        if (rf.state === 'idle' && dist2(rf.x, rf.y, player.x, player.y) < (rf.r + player.pickR * 0.5) * (rf.r + player.pickR * 0.5)) { showRiftChoice(); break; }
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
        if (ez.state !== 'open') continue;
        var inside = player.x > ez.x && player.x < ez.x + ez.w && player.y > ez.y && player.y < ez.y + ez.h;
        if (inside) {
          exfil = true;
          // 首次进入 → 触发惊动
          if (!exfilStarted || exfilPoint !== ez) {
            exfilStarted = true; exfilPoint = ez; exfilChoice = 'clear';
            triggerAlarm(ez, false);
            banner = { text: '撤离读条中…留在光柱内！', life: 1.8 };
          }
          var castTime = 2.8;
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

    // 敌人
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
      if (e.wake > 0) { e.wake -= dt; continue; }
      if (e.freezeT > 0) { e.freezeT -= dt; e.flash = Math.max(0, e.flash - dt); if (e.hitT > 0) e.hitT -= dt; continue; }
      if (e.arche === 'looter') {
        if (e.hitT > 0) e.hitT -= dt;
        e.zig += dt * 6;
        var tx2, ty2;
        if (e.fleeing) { tx2 = e.x + (e.x - WORLD_W / 2); ty2 = e.y + (e.y - WORLD_H / 2); } else { tx2 = player.x; ty2 = player.y; }
        e.px = e.x; e.py = e.y;
        var ldd = Math.hypot(tx2 - e.x, ty2 - e.y) || 1, ls = e.fleeing ? 170 : 135;
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
      var dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
      updateAlert(e, d, dt);
      var es = (e.elite ? 1.3 : 1) * (e.boost || 1);
      var ef = (enemiesSlowT > 0 ? enemiesSlowFactor : 1);
      if (player.slowAuraR > 0 && d < player.slowAuraR) ef *= player.slowFactor;
      var baseSpeed = (e.arche === 'turret' ? 22 : (e.arche === 'gunship' ? 45 : (e.arche === 'heal' ? 40 : (e.arche === 'sniper' ? 55 : (e.arche === 'shielder' ? 38 : (e.arche === 'swarm' ? 95 + e.tier * 10 : (e.ram ? 70 + e.tier * 8 : 52 + e.tier * 6)))))));
      // 精英·狂暴：血量低于50%时速度+40%
      if (e.eliteMod === 'frenzied' && !e.frenzyTriggered && e.hp < e.maxhp * 0.5) { e.frenzyTriggered = true; e.boost = 1.4; floatText(e.x, e.y - e.r - 12, '狂暴!', '#E0503A', 'crit'); }
      var av = avoidObstacles(e, e.r, player.x, player.y);
      if (e.alert === 0) {
        // 巡逻：绕 home 缓慢游荡，无视玩家（敌人是环境变量，不是惩罚）
        var hdx = e.homeX - e.x, hdy = e.homeY - e.y, hd = Math.hypot(hdx, hdy);
        if (hd > 70) { e.x += (hdx / hd) * baseSpeed * 0.32 * es * ef * dt; e.y += (hdy / hd) * baseSpeed * 0.32 * es * ef * dt; }
        else { e.x += Math.cos(e.patrolAng) * baseSpeed * 0.22 * dt; e.y += Math.sin(e.patrolAng) * baseSpeed * 0.22 * dt; e.patrolAng += dt * 0.8; }
      } else {
        // 警觉/锁定：朝玩家；锁定×1.2，脱离试探×0.8（不射击）
        var mult = (e.alert === 2) ? (e.pursueStage === 1 ? 0.8 : 1.2) : 0.5;
        e.x += av.x * baseSpeed * mult * es * ef * dt; e.y += av.y * baseSpeed * mult * es * ef * dt;
        // 追击距离上限（狂暴区除外）：超距强制放弃
        if (e.alert === 2 && !e.alarmIgnored) {
          var hdHome = Math.hypot(e.x - e.homeX, e.y - e.homeY);
          if (hdHome > ALERT.pursueDist) { e.alert = 0; e.alertClock = 0; e.decayT = 0; }
        }
      }
      resolveObstacles(e, e.r);
      // 空域：敌人受障碍与边界约束
      for (var oi2 = 0; oi2 < obstacles.length; oi2++) { var ob2 = obstacles[oi2]; if (ob2.type === 'rift' && dist2(e.x, e.y, ob2.x, ob2.y) < (ob2.r + e.r) * (ob2.r + e.r)) e.hp -= ob2.dps * dt; }
      if (e.hp <= 0 && !e.dead) { onEnemyDeath(e, true); continue; }
      if (e.flash > 0) e.flash -= dt;
      if (e.hitT > 0) e.hitT -= dt;
      // 开火（仅锁定态、非脱离试探阶段才射击；警觉态不开火）
      var canFire = (e.alert === 2 && e.pursueStage === 0);
      if (canFire) {
        if (e.arche === 'shoot' || e.arche === 'turret') {
          e.fireCd -= dt;
          if (e.fireCd <= 0 && d < 560) {
            if (e.arche === 'turret') { for (var tb = -1; tb <= 1; tb++) fireBullet(e.x, e.y, Math.atan2(dy, dx) + tb * 0.12, 'enemy', (8 + e.tier * 2) * e.dmgMul, 180); e.fireCd = rand(2.0, 3.0); }
            else { fireBullet(e.x, e.y, Math.atan2(dy, dx), 'enemy', (7 + e.tier * 2) * e.dmgMul, 175); e.fireCd = rand(1.6, 3.0); }
          }
        } else if (e.arche === 'gunship') {
          e.fireCd -= dt;
          if (e.fireCd <= 0 && d < 640) { fireBullet(e.x, e.y, Math.atan2(dy, dx), 'enemy', (10 + e.tier * 3) * e.dmgMul, 130, { big: true }); e.fireCd = rand(2.4, 3.6); }
        }
      }
      if (e.arche === 'heal') {
        e.healCd -= dt;
        if (e.healCd <= 0) {
          var healed = false;
          for (var h = 0; h < enemies.length; h++) { var o = enemies[h]; if (o !== e && dist2(o.x, o.y, e.x, e.y) < 130 * 130 && o.hp < o.maxhp) { o.hp = Math.min(o.maxhp, o.hp + 22); healed = true; } }
          if (healed) { burst(e.x, e.y, '#8FD8C0', 8, { ring: true, ringR: 30 }); }
          e.healCd = 3.5;
        }
      }
      // —— 狙击手：保持距离 + 激光瞄准 + 高伤单发 ——
      if (e.arche === 'sniper' && e.alert === 2) {
        // 保持500-700距离：太近就后退，太远就靠近
        if (d < 480) { e.x -= av.x * baseSpeed * 0.8 * es * ef * dt; e.y -= av.y * baseSpeed * 0.8 * es * ef * dt; }
        else if (d > 700) { e.x += av.x * baseSpeed * 0.5 * es * ef * dt; e.y += av.y * baseSpeed * 0.5 * es * ef * dt; }
        // 充能阶段
        if (e.sniperCharge < 1.2) {
          e.sniperCharge += dt;
          e.sniperAim = Math.atan2(dy, dx); // 持续追踪
        } else {
          // 发射！高伤单发，弹速快
          fireBullet(e.x, e.y, e.sniperAim, 'enemy', (18 + e.tier * 4) * e.dmgMul, 420, { big: true });
          burst(e.x, e.y, '#E8A050', 6, { smin: 80, smax: 200 });
          addShake(1.5, 100, 40);
          e.sniperCharge = 0;
          e.fireCd = rand(2.5, 4.0);
        }
      }
      // —— 护盾兵：跟随最近友军 + 投射护盾 ——
      if (e.arche === 'shielder') {
        e.shieldPulse += dt * 3;
        // 找最近友军跟随
        var nearestAlly = null, nad = Infinity;
        for (var sa = 0; sa < enemies.length; sa++) {
          if (enemies[sa] === e || enemies[sa].arche === 'shielder') continue;
          var sad = dist2(e.x, e.y, enemies[sa].x, enemies[sa].y);
          if (sad < nad) { nad = sad; nearestAlly = enemies[sa]; }
        }
        if (nearestAlly && nad > 80 * 80) {
          var aAng = Math.atan2(nearestAlly.y - e.y, nearestAlly.x - e.x);
          e.x += Math.cos(aAng) * baseSpeed * 0.6 * es * ef * dt;
          e.y += Math.sin(aAng) * baseSpeed * 0.6 * es * ef * dt;
        }
      }
      // —— 蜂群：快速Z字追踪 ——
      if (e.arche === 'swarm') {
        e.zig += dt * 10;
        // 直接朝玩家冲，加Z字偏移
        e.x += av.x * baseSpeed * 1.3 * es * ef * dt + Math.cos(e.zig) * 60 * dt;
        e.y += av.y * baseSpeed * 1.3 * es * ef * dt + Math.sin(e.zig) * 60 * dt;
      }
    }
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
          if (bl.lifesteal > 0) { var hb = Math.round(bdmg * bl.lifesteal); player.hp = Math.min(player.maxhp, player.hp + hb); floatText(player.x, player.y - 20, '+' + hb, '#8FD8C0', 'heal'); }
          if (boss.hp <= 0) killBoss();
          if (bl.pierce > 0) bl.pierce--; else { bullets.splice(b, 1); consumed = true; }
        }
        if (!consumed) {
          for (var ei = 0; ei < enemies.length; ei++) {
            var en = enemies[ei];
            if (dist2(bl.x, bl.y, en.x, en.y) < (en.r + bl.r) * (en.r + bl.r)) {
              var dmg0 = calcDamage(bl.dmg, bl.crit, en);
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
              en.hp -= dmg0; en.flash = 0.08; en.hitT = 0.1; en.hitMag = bl.crit ? 3 : 2.2;
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
              if (bl.lifesteal > 0) { var h1 = Math.round(dmg0 * bl.lifesteal); player.hp = Math.min(player.maxhp, player.hp + h1); floatText(player.x, player.y - 20, '+' + h1, '#8FD8C0', 'heal'); }
              if (bl.pierce > 0) { bl.pierce--; } else { bullets.splice(b, 1); consumed = true; }
              if (en.hp <= 0) { onEnemyDeath(en); ei--; } // 敌人被移除，回退索引避免跳过下一个
              if (bl.pierce <= 0) break;
            }
          }
        }
      } else {
        if (dist2(bl.x, bl.y, player.x, player.y) < (13 + bl.r) * (13 + bl.r)) {
          bullets.splice(b, 1);
          if (player.iframe <= 0) {
            if (player.dodgeChance > 0 && Math.random() < player.dodgeChance) { player.flash = 0.1; floatText(player.x, player.y - 20, '闪避', '#5FBFA3'); }
            else if (player.reflect > 0 && Math.random() < player.reflect) { var rt = nearestEnemy(player.x, player.y); if (rt) fireBullet(player.x, player.y, Math.atan2(rt.y - player.y, rt.x - player.x), 'player', bl.dmg * 2, player.bulletSpeed, {}); floatText(player.x, player.y - 20, '反震', '#4E8FC7'); }
            else damagePlayer(bl.dmg);
          }
        }
      }
    }

    // 接触
    for (var ci = enemies.length - 1; ci >= 0; ci--) {
      var ec = enemies[ci];
      if (dist2(ec.x, ec.y, player.x, player.y) < (ec.r + 13) * (ec.r + 13)) {
        if (player.iframe <= 0) {
          if (player.dodgeChance > 0 && Math.random() < player.dodgeChance) { player.flash = 0.1; }
          else damagePlayer((ec.ram ? 13 : 7) * ec.dmgMul);
        }
        if (ec.ram) { burst(ec.x, ec.y, COL.enemy, 5); onEnemyDeath(ec); }
      }
    }
    if (boss && boss.wake <= 0 && dist2(boss.x, boss.y, player.x, player.y) < (boss.r + 14) * (boss.r + 14)) { if (player.iframe <= 0) damagePlayer(16 * tierDmgMul()); }

    // 战利品
    for (var l = loot.length - 1; l >= 0; l--) {
      var it = loot[l]; it.life -= dt; it.age += dt;
      if (player.magnet) { var mdx = player.x - it.x, mdy = player.y - it.y, md = Math.hypot(mdx, mdy) || 1; if (md < 300) { it.x += (mdx / md) * 220 * dt; it.y += (mdy / md) * 220 * dt; } }
      else { it.x += it.vx * dt; it.y += it.vy * dt; it.vx *= 0.9; it.vy *= 0.9; }
      if (it.life <= 0) { loot.splice(l, 1); continue; }
      if (dist2(it.x, it.y, player.x, player.y) < player.pickR * player.pickR) {
        if (it.type === 'jade') {
          var jamt = it.amount || 10; meta.currency += jamt;
          floatText(it.x, it.y, '+' + jamt + ' 灵玉', '#C9A227');
          AudioSys.sfx.pickup('blue'); burst(it.x, it.y, '#C9A227', 8, { ring: true, ringR: 20 });
        } else if (it.type === 'consumable') {
          addConsumable(it.consKey); burst(it.x, it.y, '#D9B64A', 8);
        } else { // artifact / legendary / bossrelic / legendary_weapon
          var tgt = inRift ? riftLoot : run.loot;
          if (tgt.length < lootCap) {
            var lootItem = { rarity: it.rarity, name: it.name, slot: it.slot || pickSlot(), rift: inRift };
            if (it.type === 'bossrelic' && it.relicMods) lootItem.relicMods = it.relicMods;
            if (it.type === 'legendary_weapon' && it.relicMods) { lootItem.relicMods = it.relicMods; lootItem.isLegendaryWeapon = true; lootItem.legendaryPassive = it.legendaryPassive; lootItem.subtype = it.subtype; }
            tgt.push(lootItem); if (!inRift) run.picked++;
            AudioSys.sfx.pickup(it.rarity);
            var v = RARVAL[RAR.indexOf(it.rarity)]; floatText(it.x, it.y, '+' + v + ' ' + RARNAME[it.rarity], RARCOL[it.rarity]);
            if (it.type === 'legendary') { var lg = 200 + run.tier * 50; meta.currency += lg; floatText(it.x, it.y - 14, '传说核心! +' + lg + ' 灵玉', '#E0B84A'); }
            if (it.type === 'bossrelic') { floatText(it.x, it.y - 16, '★ 遗物!', '#FFE9A8', 'crit'); }
            if (it.type === 'legendary_weapon') { floatText(it.x, it.y - 20, '★★ 传说武器!', '#FFE9A8', 'crit'); }
            // 概率掉落丹药（金/紫更易出）
            if (Math.random() < (it.rarity === 'orange' ? 0.5 : it.rarity === 'purple' ? 0.32 : it.rarity === 'blue' ? 0.18 : 0.07)) {
              var ck = ['bomb', 'shield', 'heal', 'slow'][randi(0, 3)]; addConsumable(ck);
            }
          } else { meta.currency += 5; floatText(it.x, it.y, '+5 灵玉', '#C9A227'); }
        }
        var pr = it.rarity;
        if (it.type === 'legendary_weapon') { burst(it.x, it.y, '#FFE9A8', 34, { ring: true, ringR: 60 }); spawnRing(it.x, it.y, '#FFE9A8', 80); burst(it.x, it.y, '#E0B84A', 20, { ring: true, ringR: 44 }); }
        else if (it.type === 'bossrelic') { burst(it.x, it.y, '#FFE9A8', 28, { ring: true, ringR: 50 }); spawnRing(it.x, it.y, '#E0B84A', 50); burst(it.x, it.y, '#E0B84A', 16, { ring: true, ringR: 36 }); }
        else if (it.type === 'legendary') { burst(it.x, it.y, '#E0B84A', 22, { ring: true, ringR: 40 }); spawnRing(it.x, it.y, '#E0B84A', 40); }
        else if (pr === 'orange') { burst(it.x, it.y, RARCOL.orange, 16, { ring: true, ringR: 34 }); spawnRing(it.x, it.y, RARCOL.orange, 30); }
        else if (pr === 'purple') { burst(it.x, it.y, RARCOL.purple, 10, { ring: true, ringR: 26 }); }
        else if (pr === 'blue') { burst(it.x, it.y, RARCOL.blue, 6); }
        else if (pr === 'green') { burst(it.x, it.y, RARCOL.green, 4); }
        else { burst(it.x, it.y, RARCOL.white, 3); }
        loot.splice(l, 1);
      }
    }
    for (var p2 = 0; p2 < POOL; p2++) { var pa = particles[p2]; if (!pa.alive) continue; pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.vx *= 0.92; pa.vy *= 0.92; pa.life -= dt; if (pa.life <= 0) pa.alive = false; }
    for (var f = 0; f < FPOOL; f++) { var fl = floaters[f]; if (!fl.alive) continue; fl.y += fl.vy * dt; fl.life -= dt; if (fl.life <= 0) fl.alive = false; }
    for (var vl = vfxLines.length - 1; vl >= 0; vl--) { vfxLines[vl].life -= dt; if (vfxLines[vl].life <= 0) vfxLines.splice(vl, 1); }
    reapDead();
  }
  function collectNode(nd) {
    nd.collected = true; run.nodes++;
    var c = CHESTS[nd.chest]; if (!c) return;
    var cnt = randi(c.min, c.max), got = [];
    for (var i = 0; i < cnt; i++) { var rar = pickRarityWeighted(c.floor); run.loot.push({ rarity: rar, name: pickName(rar), slot: pickSlot() }); run.picked++; got.push(rar); }
    var hasFloor = got.some(function (g) { return RAR.indexOf(g) >= c.floor; });
    if (!hasFloor) { run.loot.push({ rarity: RAR[c.floor], name: pickName(RAR[c.floor]), slot: pickSlot() }); run.picked++; got.push(RAR[c.floor]); }
    if (c.key === 'secret' && !got.some(function (g) { return g === 'orange'; })) { run.loot.push({ rarity: 'orange', name: pickName('orange'), slot: pickSlot() }); run.picked++; got.push('orange'); }
    burst(nd.x, nd.y, c.color, c.key === 'wood' ? 10 : 18, { ring: c.key !== 'wood', ringR: 40 });
    AudioSys.sfx.chestOpen(c.floor);
    if (meta.runs === 0 && run.picked === 1) showTip('开箱获得<b>战利品</b>！同色战利品按 <b>M</b> 可合成升级（2合1/3合1）', 4.5);
    for (var s = 0; s < (c.key === 'wood' ? 5 : 12); s++) { var sa = rand(0, 6.28), sp = rand(60, 210); spawnParticle({ x: nd.x, y: nd.y, vx: Math.cos(sa) * sp, vy: Math.sin(sa) * sp, life: rand(0.4, 0.9), color: c.color, r: rand(1.5, 3) }); }
    screenFlash = { color: c.flash, a: c.key === 'wood' ? 0.12 : (c.key === 'silver' ? 0.24 : 0.42) };
    addShake(c.key === 'wood' ? 1.8 : 3, 90, 40);
    if (c.key !== 'wood') addFreeze(40);
    if (c.key === 'wood') floatText(nd.x, nd.y - 22, '+' + got.length + ' 件战利品', c.color);
    else banner = { text: chestBannerText(c, got), life: c.key === 'secret' ? 2.6 : 2.0 };
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
    for (var i = 0; i < count && i < corners.length; i++) rifts.push({ x: corners[i].x, y: corners[i].y, r: 34, state: 'idle' });
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
        var ge = spawnEnemy(gx, gy, (nd.chest === 'secret' || nd.chest === 'gold') ? 2 : 1);
        ge.wake = 0; ge.alert = 0; ge.homeX = gx; ge.homeY = gy; ge.patrolAng = rand(0, 6.28);
        if ((nd.chest === 'gold' || nd.chest === 'secret') && g === 0) { ge.elite = true; ge.hp = ge.maxhp = Math.round(ge.maxhp * 3); }
        nd.guards.push(ge);
      }
    }
    var ambient = 4 + run.tier * 2;
    for (var a = 0; a < ambient; a++) {
      var x, y, t = 0;
      do { x = rand(120, WORLD_W - 120); y = rand(120, WORLD_H - 120); t++; } while ((dist2(x, y, player.x, player.y) < 300 * 300 || nodes.some(function (n) { return dist2(x, y, n.x, n.y) < 120 * 120; })) && t < 60);
      var ae = spawnEnemy(x, y, 1 + (run.tier - 1));
      ae.wake = 0; ae.alert = 0; ae.homeX = x; ae.homeY = y; ae.patrolAng = rand(0, 6.28);
    }
  }
  function showRiftChoice() {
    var el = document.getElementById('riftChoice'); if (!el) return;
    var info = document.getElementById('riftInfo');
    if (info) info.innerHTML = '当前战利品 <b>' + run.loot.length + '</b> 件 · 估值约 <b style="color:#C9A227">' + lootValue(run.loot) + '</b> 灵玉<br><span style="opacity:.8;font-size:12px">进入后战利品冻结；裂隙内收益豁免「未撤离即丢」，阵亡保底 50%</span>';
    el.style.display = 'flex'; riftPrompt = true; paused = true;
  }
  function hideRiftChoice() { var el = document.getElementById('riftChoice'); if (el) el.style.display = 'none'; riftPrompt = false; paused = false; for (var kk in keys) keys[kk] = false; }
  function commitRift(confirm) { hideRiftChoice(); if (confirm) enterRift(); }
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
    var fire = hasElem('火'); var cnt = (n === 1) ? 2 : 3;
    for (var i = 0; i < cnt; i++) {
      var ang = rand(0, 6.28), dd = rand(40, 160);
      var x = clamp(cx + Math.cos(ang) * dd, RR.RX + 40, RR.RX + RR.RW - 40);
      var y = clamp(cy + Math.sin(ang) * dd, RR.RY + 40, RR.RY + RR.RH - 40);
      var e = spawnEnemy(x, y, run.tier);
      e.wake = 0; e.alert = 2; e.homeX = x; e.homeY = y; e.patrolAng = rand(0, 6.28);
      if (fire) e.boost = 1.2;               // 火系引燃敌意：+20% 移速
      if (n >= 2 && i === 0) { e.elite = true; e.hp = e.maxhp = Math.round(e.maxhp * 2); }
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
    inRift = true; riftLoot = []; riftExit = null; riftHidden = null; riftWaves = null; riftTrapT = 0;
    enemies = []; bullets = []; loot = []; nodes = []; obstacles = []; totems = []; vaults = []; extractPoints = []; boss = null; bossSpawned = false;
    var RW = Math.min(WORLD_W * 0.66, 880), RH = Math.min(WORLD_H * 0.66, 620);
    var RX = (WORLD_W - RW) / 2, RY = (WORLD_H - RH) / 2; riftRect = { RX: RX, RY: RY, RW: RW, RH: RH };
    player.x = WORLD_W / 2; player.y = RY + RH - 70; player.vx = 0; player.vy = 0; player.iframe = 0.5;
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    var r = Math.random();
    if (r < 0.4) {
      riftRoom = { type: 'treasury', done: false, chest: { x: WORLD_W / 2, y: RY + RH * 0.38, r: 20, chest: 'secret' } };
      banner = { text: '🎁 宝库房 · 安全（触碰中央秘宝获取战利品）', life: 2.6 };
    } else if (r < 0.8) {
      addRiftWalls(RX, RY, RW, RH);
      riftRoom = { type: 'arena', done: false }; riftWaves = { wave: 1, gap: 0 };
      spawnArenaWave(1);
      banner = { text: '⚔️ 竞技房 · 第 1 / 3 波（清完才能离开）', life: 2.6 };
    } else {
      addRiftWalls(RX, RY, RW, RH);
      riftRoom = { type: 'trap', done: false, warn: 3, active: 0, dur: 15 };
      riftHidden = { x: RX + 50, y: RY + 50, r: 16, taken: false };
      banner = { text: '☠️ 陷阱房 · 3 秒后毒雾来袭（角落藏有紫装）', life: 2.8 };
    }
    AudioSys.sfx.extract();
  }
  function updateRift(dt) {
    var RR = riftRect;
    if (riftRoom.type === 'treasury') {
      var ch = riftRoom.chest;
      if (!riftRoom.done && dist2(ch.x, ch.y, player.x, player.y) < (ch.r + player.pickR * 0.6) * (ch.r + player.pickR * 0.6)) {
        riftRoom.done = true;
        var rar = Math.random() < 0.3 ? 'orange' : 'purple';
        riftLoot.push({ rarity: rar, name: pickName(rar), slot: pickSlot(), rift: true });
        // ★ 3%概率额外掉落随机传说武器
        if (Math.random() < 0.03) {
          var legKeys = Object.keys(LEGENDARY_WEAPONS);
          var legName = legKeys[randi(0, legKeys.length - 1)];
          var lw = LEGENDARY_WEAPONS[legName];
          riftLoot.push({ rarity: lw.rarity, name: legName, slot: lw.slot, rift: true, relicMods: lw.mods, isLegendaryWeapon: true, legendaryPassive: lw.passive, subtype: lw.subtype });
          burst(ch.x, ch.y, '#FFE9A8', 30, { ring: true, ringR: 60 });
          spawnRing(ch.x, ch.y, '#FFE9A8', 80);
          floatText(ch.x, ch.y - 40, '★★ 传说武器!', '#FFE9A8', 'crit');
          banner = { text: '★★ 罕见！宝库房发现传说武器「' + legName + '」！', life: 3.6 };
        }
        burst(ch.x, ch.y, CHESTS.secret.color, 18, { ring: true, ringR: 40 }); AudioSys.sfx.chestOpen(4); screenFlash = { color: CHESTS.secret.flash, a: 0.42 }; addShake(3, 90, 40);
        banner = { text: '✦ 秘宝现世！获得 ' + RARNAME[rar] + ' 等 1 件', life: 2.6 };
        riftExit = { x: WORLD_W / 2, y: RR.RY + 60, r: 30 };
      }
    } else if (riftRoom.type === 'arena') {
      if (!riftRoom.done && enemies.length === 0 && !boss) {
        if (riftWaves.wave < 3) {
          riftWaves.gap -= dt;
          if (riftWaves.gap <= 0) { riftWaves.wave++; spawnArenaWave(riftWaves.wave); riftWaves.gap = 3; banner = { text: '⚔️ 竞技房 · 第 ' + riftWaves.wave + ' / 3 波', life: 2.2 }; }
        } else { riftRoom.done = true; spawnRiftDrops(); riftExit = { x: WORLD_W / 2, y: RR.RY + 60, r: 30 }; banner = { text: '✓ 竞技房清空！传送门已开启', life: 2.6 }; }
      }
    } else if (riftRoom.type === 'trap') {
      if (!riftRoom.done) {
        if (riftRoom.warn > 0) { riftRoom.warn -= dt; if (riftRoom.warn <= 0) { riftRoom.active = riftRoom.dur; addShake(2, 120, 40); } }
        else if (riftRoom.active > 0) {
          riftRoom.active -= dt; riftTrapT -= dt;
          if (riftTrapT <= 0) { riftTrapT = 1; damagePlayer(hasElem('风') ? 4 : 8); if (!inRift) return; } // 风系驱散减半；若毒雾致死则已弹回主图，直接退出本帧
          if (riftRoom.active <= 0) { riftRoom.done = true; riftExit = { x: WORLD_W / 2, y: RR.RY + 60, r: 30 }; banner = { text: '✓ 毒雾消散！传送门已开启', life: 2.6 }; }
        }
        if (riftHidden && !riftHidden.taken && dist2(riftHidden.x, riftHidden.y, player.x, player.y) < (riftHidden.r + player.pickR * 0.6) * (riftHidden.r + player.pickR * 0.6)) {
          riftHidden.taken = true; riftLoot.push({ rarity: 'purple', name: pickName('purple'), slot: pickSlot(), rift: true });
          burst(riftHidden.x, riftHidden.y, RARCOL.purple, 14, { ring: true, ringR: 36 }); floatText(riftHidden.x, riftHidden.y - 20, '隐藏紫装!', RARCOL.purple, 'crit');
        }
      }
    }
    if (riftRoom.done && riftExit && dist2(riftExit.x, riftExit.y, player.x, player.y) < (riftExit.r + player.pickR * 0.5) * (riftExit.r + player.pickR * 0.5)) exitRift();
  }
  function exitRift() {
    var ret = riftReturn;
    restoreWorld(riftSnapshot);
    inRift = false; riftRoom = null; riftExit = null; riftWaves = null; riftTrapT = 0; riftHidden = null; riftRect = null;
    player.x = ret.x; player.y = ret.y; player.vx = 0; player.vy = 0;
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    for (var i = 0; i < riftLoot.length; i++) run.loot.push(riftLoot[i]);
    for (var k = 0; k < rifts.length; k++) { if (dist2(rifts[k].x, rifts[k].y, ret.x, ret.y) < 80 * 80) { rifts.splice(k, 1); break; } }
    riftLoot = [];
    banner = { text: '裂隙收益已并入战利品（阵亡保底 50%）', life: 2.6 };
  }
  function dieInRift() {
    var ret = riftReturn;
    restoreWorld(riftSnapshot);
    inRift = false; player.x = ret.x; player.y = ret.y; player.vx = 0; player.vy = 0;
    player.hp = Math.round(player.maxhp * 0.3); player.shield = 0; player.iframe = 2;
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    for (var i = 0; i < riftLoot.length; i++) run.loot.push(riftLoot[i]);
    for (var k = 0; k < rifts.length; k++) { if (dist2(rifts[k].x, rifts[k].y, ret.x, ret.y) < 80 * 80) { rifts.splice(k, 1); break; } }
    riftLoot = []; riftRoom = null; riftExit = null; riftWaves = null; riftTrapT = 0; riftHidden = null; riftRect = null;
    banner = { text: '裂隙内阵亡！被弹回主图（HP 30%），裂隙已关闭', life: 3 };
  }

  function damagePlayer(dmg) {
    player.flash = 0.13;
    if (exfil) dmg *= 0.9; // 撤离期间飞船掩护，小幅减伤
    if (player.shield > 0) { var ab = Math.min(player.shield, dmg); player.shield -= ab; dmg -= ab; if (player.undying && !player.undyingUsed && player.shield <= 0) { player.undyingUsed = true; player.hp = Math.min(player.maxhp, player.hp + Math.round(player.maxhp * 0.3)); floatText(player.x, player.y - 24, '厚德!', '#8FD8C0', 'heal'); AudioSys.sfx.heal(); } }
    if (dmg > 0) player.hp -= dmg;
    if (player.guardShock) explodeAt(player.x, player.y, player.guardShock, Math.max(8, player.dmg * 0.4)); // 土·山岳：受击范围震击
    // 反伤词条：受击时对周围敌人造成固定伤害
    if (player.thorns) { burst(player.x, player.y, '#FF7A59', 8, { ring: true, ringR: 40 }); for (var ti = 0; ti < enemies.length; ti++) { if (dist2(enemies[ti].x, enemies[ti].y, player.x, player.y) < 50 * 50) { enemies[ti].hp -= player.thorns; } } if (boss && dist2(boss.x, boss.y, player.x, player.y) < 60 * 60) { boss.hp -= player.thorns; boss.flash = 0.08; } }
    addShake(3.2, 150, 60); screenFlash = { color: '#C94F4F', a: 0.22 };
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
      ctx.strokeStyle = 'rgba(143,216,192,0.5)'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
    }
  }
  // (空域无设施地板，drawMapLayout 已移除)
  function drawObstacles() {
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      if (ob.type === 'rock') {
        ctx.save(); ctx.translate(ob.x, ob.y);
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, ob.r * 0.5, ob.r * 1.02, ob.r * 0.5, 0, 0, 7); ctx.fill(); // 接地阴影
        ctx.beginPath();
        for (var v = 0; v < ob.verts.length; v++) { var p = ob.verts[v]; if (v === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
        ctx.closePath();
        ctx.fillStyle = '#39404e'; ctx.fill();
        ctx.strokeStyle = '#5b6678'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(150,170,190,0.18)'; ctx.beginPath(); ctx.arc(-ob.r * 0.25, -ob.r * 0.3, ob.r * 0.42, 0, 7); ctx.fill(); // 顶部高光
        ctx.restore();
      } else if (ob.type === 'wall') {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(ob.x - ob.hw, ob.y - ob.hh + 6, ob.hw * 2, ob.hh * 2); // 接地阴影
        var grd = ctx.createLinearGradient(ob.x, ob.y - ob.hh, ob.x, ob.y + ob.hh);
        grd.addColorStop(0, '#4a5260'); grd.addColorStop(1, '#2c323d');
        ctx.fillStyle = grd; ctx.fillRect(ob.x - ob.hw, ob.y - ob.hh, ob.hw * 2, ob.hh * 2);
        ctx.strokeStyle = '#6b7686'; ctx.lineWidth = 2; ctx.strokeRect(ob.x - ob.hw, ob.y - ob.hh, ob.hw * 2, ob.hh * 2);
        ctx.fillStyle = 'rgba(170,190,210,0.16)'; ctx.fillRect(ob.x - ob.hw + 3, ob.y - ob.hh + 3, ob.hw * 2 - 6, Math.min(8, ob.hh)); // 顶部高光
        ctx.restore();
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
    else if (riftRoom.type === 'arena') label = '⚔️ 竞技房 · 第 ' + riftWaves.wave + ' / 3 波' + (riftRoom.done ? ' · 已清空' : '');
    else if (riftRoom.type === 'trap') { if (riftRoom.warn > 0) label = '☠️ 陷阱房 · 毒雾 ' + Math.ceil(riftRoom.warn) + 's'; else if (riftRoom.active > 0) label = '☠️ 陷阱房 · 毒雾 ' + Math.ceil(riftRoom.active) + 's'; else label = '☠️ 陷阱房 · 已消散'; }
    if (riftRoom.done) label += ' · 踏入传送门离开';
    ctx.save(); ctx.fillStyle = 'rgba(20,12,30,0.72)'; ctx.fillRect(W / 2 - 180, 10, 360, 26); ctx.fillStyle = '#E0C8FF'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, W / 2, 23); ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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
      if (riftRoom && riftRoom.type === 'trap' && riftRoom.warn <= 0 && riftRoom.active > 0) {
        ctx.fillStyle = 'rgba(120,200,120,' + (0.10 + 0.05 * Math.abs(Math.sin(gameTime * 5))) + ')'; ctx.fillRect(cam.x, cam.y, W, H);
      }
      if (riftHidden && !riftHidden.taken) {
        ctx.save(); ctx.translate(riftHidden.x, riftHidden.y); ctx.rotate(gameTime * 2); ctx.fillStyle = RARCOL.purple; ctx.shadowColor = RARCOL.purple; ctx.shadowBlur = 16;
        ctx.beginPath(); for (var st = 0; st < 8; st++) { var a2 = st * Math.PI / 4, rad = st % 2 ? 4 : 9, px = Math.cos(a2) * rad, py = Math.sin(a2) * rad; if (st === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.restore(); ctx.shadowBlur = 0;
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
    var psz = (PSIZE[craft] || 50) * ICON_SCALE;
    var speed = Math.hypot(player.vx, player.vy);
    var moving = speed > player.speed * 0.25;
    var dashing = player.dashAnimT > 0;
    var attacking = player.attackAnimT > 0;
    var sheetKey, frame, fps;

    if (craft === 'a' && dashing) {
      // 青隼冲刺：单次 8 帧 @ 18 fps
      sheetKey = 'ply_a_dash_sheet';
      fps = 18;
      var dashProgress = 1 - clamp(player.dashAnimT / 0.42, 0, 1);
      frame = Math.min(7, Math.floor(dashProgress * 8));
      bank *= 0.3; // 冲刺时机身更稳
    } else if (craft === 'b' && dashing) {
      // 玄武冲刺：单次 8 帧 @ 16 fps
      sheetKey = 'ply_b_dash_sheet';
      fps = 16;
      var dashProgressB = 1 - clamp(player.dashAnimT / 0.42, 0, 1);
      frame = Math.min(7, Math.floor(dashProgressB * 8));
    } else if (craft === 'c' && dashing) {
      // 赤鸾冲刺：单次 8 帧 @ 18 fps
      sheetKey = 'ply_c_dash_sheet';
      fps = 18;
      var dashProgressC = 1 - clamp(player.dashAnimT / 0.42, 0, 1);
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
    var drawn = blitSheet(sheetKey, player.x, player.y, psz, psz, player.ang + Math.PI / 2 + bank, 4, 2, frame);
    if (!drawn && !blit('ply_' + craft, player.x, player.y, psz, psz, player.ang + Math.PI / 2)) {
      ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.ang + Math.PI / 2 + bank);
      ctx.shadowColor = player.color; ctx.shadowBlur = 10; ctx.fillStyle = player.iframe > 0 ? '#fff' : player.color; ctx.strokeStyle = COL.playerEdge; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(11, 13); ctx.lineTo(0, 7); ctx.lineTo(-11, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore(); ctx.shadowBlur = 0;
    }
    if (player.flash > 0) { ctx.fillStyle = 'rgba(201,79,79,0.3)'; ctx.beginPath(); ctx.arc(player.x, player.y, 20, 0, 7); ctx.fill(); }
    for (var di = 0; di < player.droneList.length; di++) { var dr = player.droneList[di]; ctx.fillStyle = '#A8E8D5'; ctx.shadowColor = '#A8E8D5'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(dr.x, dr.y, 5, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    // 机体护盾光环先禁用：旧资产未抠干净
    // if (player.shield > 0) {
    //   var bua = IMG['vfx_buff_aura'];
    //   if (bua && bua.complete && bua.naturalWidth > 0) {
    //     ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + Math.sin(gameTime * 4) * 0.18;
    //     ctx.translate(player.x, player.y); ctx.rotate(gameTime * 0.4); ctx.drawImage(bua, -42, -42, 84, 84); ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    //   } else { ctx.save(); ctx.globalAlpha = 0.4 + Math.sin(gameTime * 4) * 0.15; ctx.strokeStyle = '#C9A24B'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, 26, 0, 7); ctx.stroke(); ctx.restore(); }
    // }
  }
  function drawEnemies() {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.wake > 0) { var pr = 1 + Math.sin(gameTime * 12) * 0.15; ctx.globalAlpha = 0.8; ctx.strokeStyle = e.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10 + pr * 4, 0, 7); ctx.stroke(); ctx.globalAlpha = 0.4; ctx.fillStyle = e.col; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; continue; }
      var hx = 0, hy = 0;
      if (e.hitT > 0) { var hk = e.hitMag * (e.hitT / 0.1); hx = rand(-hk, hk); hy = rand(-hk, hk); }
      ctx.save(); ctx.translate(e.x + hx, e.y + hy);
      ctx.shadowColor = e.elite ? COL.elite : e.col; ctx.shadowBlur = e.elite ? 14 : 8;
      var fill = e.flash > 0 ? '#fff' : e.col;
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
      // 狙击手激光瞄准线（充能时显示）
      if (e.arche === 'sniper' && e.sniperCharge > 0 && e.alert === 2) {
        var laserA = e.sniperAim || 0;
        var laserAlpha = Math.min(0.8, e.sniperCharge / 1.2 * 0.8);
        var laserW = 1 + e.sniperCharge * 2;
        ctx.save(); ctx.strokeStyle = 'rgba(232,160,80,' + laserAlpha + ')'; ctx.lineWidth = laserW;
        ctx.setLineDash([8, 6]); ctx.lineDashOffset = -gameTime * 30;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(laserA) * 800, e.y + Math.sin(laserA) * 800); ctx.stroke();
        ctx.setLineDash([]);
        // 充能满时变实线+加粗
        if (e.sniperCharge >= 1.0) { ctx.strokeStyle = 'rgba(255,80,40,' + (0.6 + 0.4 * Math.sin(gameTime * 30)) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(laserA) * 800, e.y + Math.sin(laserA) * 800); ctx.stroke(); }
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
        ctx.save(); ctx.strokeStyle = 'rgba(143,216,192,0.7)'; ctx.lineWidth = 2; ctx.globalAlpha = (exfilAlarmT / 1.2) * 0.8;
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
    ctx.restore(); ctx.shadowBlur = 0;
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
      var bsz = Math.max(13, b.r * 3.4);
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
          ctx.beginPath(); ctx.arc(0, 0, b.r + 4 + ((gameTime * 6) % 1) * 4, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        } else if (b.kind === 'pierce') {
          ctx.globalAlpha = 0.35; ctx.fillRect(-b.r * 3, -b.r * 0.4, b.r * 3, b.r * 0.8); ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.moveTo(b.r * 1.6, 0); ctx.lineTo(-b.r, -b.r * 0.7); ctx.lineTo(-b.r, b.r * 0.7); ctx.closePath(); ctx.fill();
        } else if (b.kind === 'homing') {
          ctx.beginPath(); ctx.moveTo(b.r * 0.9, 0); ctx.lineTo(-b.r * 0.4, -b.r * 0.6); ctx.lineTo(-b.r * 0.1, 0); ctx.lineTo(-b.r * 0.4, b.r * 0.6); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.5; ctx.fillRect(-b.r * 1.4, -b.r * 0.15, b.r * 0.8, b.r * 0.3); ctx.globalAlpha = 1;
        } else if (b.kind === 'crit') {
          ctx.beginPath(); ctx.moveTo(b.r * 2.2, 0); ctx.lineTo(-b.r, -b.r * 0.8); ctx.lineTo(-b.r * 0.5, 0); ctx.lineTo(-b.r, b.r * 0.8); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(0, 0, b.r * 1.8, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        } else {
          // 普通：尖头光梭（机型色）
          ctx.beginPath(); ctx.moveTo(b.r * 1.8, 0); ctx.lineTo(-b.r, -b.r * 0.7); ctx.lineTo(-b.r * 0.4, 0); ctx.lineTo(-b.r, b.r * 0.7); ctx.closePath(); ctx.fill();
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
      // 特殊掉落物视觉
      if (it.type === 'jade') {
        ctx.save(); ctx.translate(it.x, it.y + bob); ctx.scale(ICON_SCALE, ICON_SCALE); ctx.shadowColor = '#C9A227'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#E8D68C'; ctx.strokeStyle = '#C9A227'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#231a05'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('玉', 0, 0.5);
        ctx.shadowBlur = 0; ctx.restore(); continue;
      }
      if (it.type === 'consumable') {
        var cc = CONSUMABLES[it.consKey]; ctx.save(); ctx.translate(it.x, it.y + bob); ctx.shadowColor = '#7EAD9A'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#1c2e26'; ctx.strokeStyle = '#7EAD9A'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8FD8C0'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cc ? cc.glyph : '丹', 0, 0.5);
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
      if (exfilAlarmT > 0) { var pr2 = (1.2 - exfilAlarmT) / 1.2; ctx.globalAlpha = (exfilAlarmT / 1.2) * 0.7; ctx.strokeStyle = '#8FD8C0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(exfilCenter.x, exfilCenter.y, pr2 * rp, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.restore();
    }
    for (var pi = 0; pi < extractPoints.length; pi++) {
      var z = extractPoints[pi], cx = z.x + z.w / 2, cy = z.y + z.h / 2;
      if (z.state === 'open') {
        // 法阵贴图（青）作为撤离点主体；整圈发光晕替代原光柱；站住越久越亮（替代原读条方框）
        var prog = z.prog || 0;
        var sealSz = 176;
        var glowA = 0.28 + 0.4 * prog + Math.sin(gameTime * 3) * 0.08;
        // 整圈发光晕
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, sealSz * 0.62);
        g.addColorStop(0, 'rgba(143,216,192,' + (glowA * 0.9) + ')');
        g.addColorStop(0.55, 'rgba(143,216,192,' + (glowA * 0.4) + ')');
        g.addColorStop(1, 'rgba(143,216,192,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, sealSz * 0.62, 0, 7); ctx.fill();
        // 法阵主体
        ctx.globalAlpha = clamp(0.45 + 0.45 * prog + Math.sin(gameTime * 3) * 0.1, 0, 1);
        blit('seal_circle_teal', cx, cy, sealSz, sealSz, gameTime * 0.35);
        ctx.globalAlpha = 1;
        ctx.fillStyle = COL.extract; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('撤离点' + z.label + ' ' + Math.floor(prog * 100) + '%', cx, z.y - 12);
        ctx.font = '11px sans-serif'; ctx.fillText('开放 ' + Math.ceil(z.timer) + 's', cx, z.y + z.h + 16); ctx.textAlign = 'left';
      } else if (z.state === 'warning') {
        // 预兆：青色法阵极淡浮现 + 柔和光晕，逆时针微转（无虚线方框、无光柱）
        var sealSz2 = 176;
        var wg = 0.12 + 0.1 * Math.abs(Math.sin(gameTime * 8));
        var g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, sealSz2 * 0.62);
        g2.addColorStop(0, 'rgba(143,216,192,' + (wg * 0.8) + ')');
        g2.addColorStop(0.55, 'rgba(143,216,192,' + (wg * 0.35) + ')');
        g2.addColorStop(1, 'rgba(143,216,192,0)');
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
    for (var i = 0; i < POOL; i++) {
      var p = particles[i]; if (!p.alive) continue;
      var a = clamp(p.life / p.maxLife, 0, 1);
      if (p.ring) {
        var rr = Math.max(0, p.r0 + (p.rmax - p.r0) * (1 - a));
        ctx.globalAlpha = a * 0.8; ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, 3 * a);
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.stroke();
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
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
  function drawMinimap() {
    var mw = isMobile ? 92 : 150, mh = Math.round(mw * WORLD_H / WORLD_W), mx = 10, my = 10;
    ctx.fillStyle = 'rgba(8,14,28,0.7)'; ctx.fillRect(mx, my, mw, mh); ctx.strokeStyle = 'rgba(95,191,163,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(mx, my, mw, mh);
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
      var mc = mz.state === 'open' ? COL.extract : (mz.state === 'warning' ? '#E0B84A' : 'rgba(120,130,140,0.85)');
      ctx.fillStyle = mc;
      ctx.fillRect(mx + mz.x * sx - pulse * 0.5, my + mz.y * sy - pulse * 0.5, mz.w * sx + pulse, mz.h * sy + pulse);
    }
    for (var oi = 0; oi < obstacles.length; oi++) { var ob = obstacles[oi]; ctx.fillStyle = ob.type === 'rock' ? 'rgba(150,160,175,0.9)' : (ob.type === 'wall' ? 'rgba(120,130,145,0.9)' : 'rgba(176,111,208,0.9)'); var os = ob.type === 'rock' ? 3 : (ob.type === 'wall' ? 7 : 2.5); if (ob.type === 'wall') ctx.fillRect(mx + (ob.x - ob.hw) * sx, my + (ob.y - ob.hh) * sy, ob.hw * 2 * sx, ob.hh * 2 * sy); else ctx.fillRect(mx + ob.x * sx - os / 2, my + ob.y * sy - os / 2, os, os); }
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
  }
  function drawConsumables() {
    var lpW = isMobile ? 180 : 236, lpH = isMobile ? 52 : 66, lpY = H - lpH - (isMobile ? 10 : 14);
    var n = 3, size = isMobile ? 30 : 38, gap = isMobile ? 6 : 10, totalW = n * size + (n - 1) * gap;
    var bx = 10 + lpW + (isMobile ? 8 : 12), by = lpY + (lpH - size) / 2;
    for (var i = 0; i < n; i++) {
      var x = bx + i * (size + gap);
      ctx.fillStyle = 'rgba(8,14,28,0.7)'; ctx.fillRect(x, by, size, size);
      ctx.strokeStyle = 'rgba(201,162,39,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, by, size, size);
      var key = player.consumables[i];
      if (key) {
        var c = CONSUMABLES[key];
        if (!blit('con_' + key, x + size / 2, by + size / 2 - 4, size - 12, size - 12, 0)) {
          ctx.fillStyle = '#D9B64A'; ctx.font = 'bold ' + (isMobile ? 14 : 18) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(c.glyph, x + size / 2, by + size / 2 - 4); ctx.textBaseline = 'alphabetic';
        }
        ctx.fillStyle = '#D8E4DC'; ctx.font = (isMobile ? 9 : 10) + 'px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(c.name, x + size / 2, by + size - 5); ctx.textAlign = 'left';
      }
    }
    if (!isMobile) { ctx.fillStyle = '#8B95A0'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Q 键使用丹药', bx + totalW / 2, by - 4); ctx.textAlign = 'left'; }
  }
  function drawHUD() {
    function hp(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke(); }
    var lootVal = run.loot.reduce(function (s, it) { return s + RARVAL[RAR.indexOf(it.rarity)]; }, 0);
    // 顶部：撤离点开放状态（三角洲式限时开放倒计时）
    if (extractPoints && extractPoints.length) {
      var openZ = [], warnZ = [];
      for (var zz = 0; zz < extractPoints.length; zz++) { var p = extractPoints[zz]; if (p.state === 'open') openZ.push(p); else if (p.state === 'warning') warnZ.push(p); }
      if (openZ.length) {
        var ot = openZ.map(function (q) { return '撤离点' + q.label + ' 开放 ' + Math.ceil(q.timer) + 's'; }).join('   ·   ');
        ctx.font = 'bold 14px sans-serif'; var ow = ctx.measureText(ot).width;
        ctx.fillStyle = 'rgba(6,12,24,0.72)'; ctx.strokeStyle = 'rgba(143,216,192,0.55)'; ctx.lineWidth = 1;
        hp(W / 2 - ow / 2 - 16, 48, ow + 32, 26, 13);
        ctx.fillStyle = COL.extract; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(ot, W / 2, 66); ctx.textAlign = 'left';
      } else if (warnZ.length) {
        var wt = warnZ.map(function (q) { return '撤离点' + q.label + ' ' + Math.ceil(q.timer) + 's 后开放'; }).join('   ·   ');
        ctx.font = 'bold 13px sans-serif'; var ww = ctx.measureText(wt).width;
        ctx.fillStyle = 'rgba(6,12,24,0.7)'; ctx.strokeStyle = 'rgba(224,184,74,0.55)'; ctx.lineWidth = 1;
        hp(W / 2 - ww / 2 - 16, 48, ww + 32, 24, 12);
        ctx.fillStyle = '#E0B84A'; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(wt, W / 2, 64); ctx.textAlign = 'left';
      }
    }
    // 左下：状态面板（HP + 护盾）
    var lpW = isMobile ? 180 : 236, lpH = isMobile ? 52 : 66;
    var lpX = 10, lpY = H - lpH - (isMobile ? 10 : 14);
    ctx.fillStyle = 'rgba(6,12,24,0.74)'; ctx.strokeStyle = 'rgba(95,191,163,0.4)'; ctx.lineWidth = 1;
    hp(lpX, lpY, lpW, lpH, 10);
    // HP 条（红渐变 + 圆角）
    var hpBarW = lpW - 20;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; hp(lpX + 10, lpY + 10, hpBarW, isMobile ? 10 : 14, 7);
    var hpw = hpBarW * Math.max(0, Math.min(1, player.hp / player.maxhp));
    var hpg = ctx.createLinearGradient(lpX + 10, 0, lpX + 10 + hpBarW, 0); hpg.addColorStop(0, '#D96A7E'); hpg.addColorStop(1, '#C81E3E');
    ctx.fillStyle = hpg; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; hp(lpX + 10, lpY + 10, Math.max(4, hpw), isMobile ? 10 : 14, 7);
    // 护盾条
    var shY = lpY + (isMobile ? 23 : 29);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.strokeStyle = 'transparent'; hp(lpX + 10, shY, hpBarW, isMobile ? 7 : 9, 4.5);
    var shw = hpBarW * Math.max(0, Math.min(1, player.shield / player.maxshield));
    ctx.fillStyle = '#4E8FC7'; hp(lpX + 10, shY, Math.max(3, shw), isMobile ? 7 : 9, 4.5);
    ctx.fillStyle = '#E8E4D8'; ctx.font = 'bold ' + (isMobile ? 10 : 12) + 'px sans-serif'; ctx.strokeStyle = 'transparent';
    ctx.fillText('HP ' + Math.ceil(player.hp) + '/' + player.maxhp, lpX + 12, lpY + (isMobile ? 40 : 49));
    ctx.fillStyle = '#A8D8C8'; ctx.fillText('第' + run.tier + '层 · 击杀 ' + run.kills, lpX + (isMobile ? 100 : 120), lpY + (isMobile ? 40 : 49));
    // 右上：羁绊条（风雷水火土，常驻，显示各系已持枚数 / 最高阶）
    var _els = ['风', '雷', '水', '火', '土'], _bw = isMobile ? 48 : 64, _bh = isMobile ? 18 : 22, _gap = isMobile ? 3 : 5;
    var _totalW = _els.length * _bw + (_els.length - 1) * _gap;
    var _sx = W - _totalW - 10, _sy = 10;
    for (var _bi = 0; _bi < _els.length; _bi++) {
      var _el = _els[_bi], _cnt = player.elements[_el] || 0, _mx = 0;
      BOND_TIERS[_el].forEach(function (t) { if (player.bondTiers[t.key]) _mx = t.need; });
      var _xx = _sx + _bi * (_bw + _gap);
      ctx.fillStyle = 'rgba(6,12,24,0.72)'; ctx.strokeStyle = _mx > 0 ? ELEMCOL[_el] : 'rgba(95,191,163,0.25)'; ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_xx, _sy, _bw, _bh, 5); ctx.fill(); ctx.stroke(); } else { ctx.fillRect(_xx, _sy, _bw, _bh); ctx.strokeRect(_xx, _sy, _bw, _bh); }
      ctx.fillStyle = ELEMCOL[_el]; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText((TRIGRAM[_el] || '') + _el, _xx + 6, _sy + 15);
      ctx.fillStyle = _cnt > 0 ? '#E8E4D8' : '#6B7A72'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(_cnt + (_mx ? ('·' + _mx + '阶') : '·—'), _xx + _bw - 7, _sy + 15);
    }
    ctx.textAlign = 'left';
    // 右上：状态面板（在羁绊条下方）
    var rpW = isMobile ? 170 : 258, rpH = isMobile ? 50 : 78;
    var rpX2 = W - rpW - 10, rpY2 = isMobile ? 34 : 40;
    ctx.fillStyle = 'rgba(6,12,24,0.74)'; ctx.strokeStyle = 'rgba(95,191,163,0.4)';
    hp(rpX2, rpY2, rpW, rpH, 10);
    ctx.textAlign = 'right';
    var rpX = W - 18;
    ctx.fillStyle = '#D8E4DC'; ctx.font = (isMobile ? 11 : 13) + 'px sans-serif'; ctx.strokeStyle = 'transparent';
    ctx.fillText('战利品 ' + run.loot.length + '/' + lootCap, rpX, rpY2 + (isMobile ? 16 : 20));
    ctx.fillStyle = COL.gold; ctx.font = 'bold ' + (isMobile ? 12 : 14) + 'px sans-serif'; ctx.fillText('价值 ' + lootVal, rpX, rpY2 + (isMobile ? 32 : 40));
    if (!isMobile) {
    var res = elemResonance();
    var runeLine, runeCol;
    if (runeCount >= RUNE_CAP) { runeLine = '符文已封顶 ' + RUNE_CAP + '/' + RUNE_CAP; runeCol = '#6B7A72'; }
    else if (buffPending) { runeLine = '符文已就绪 · 安全时弹出'; runeCol = '#9AD6C4'; }
    else if (res > 1) { runeLine = '系共鸣 +' + Math.round((res - 1) * 100) + '% 伤害'; runeCol = '#D9B64A'; }
    else { runeLine = '再击杀 ' + (killForBuff - buffTimer) + ' → 符文 (' + runeCount + '/' + RUNE_CAP + ')'; runeCol = '#D8E4DC'; }
    ctx.fillStyle = runeCol; ctx.font = '12px sans-serif'; ctx.fillText(runeLine, W - 22, rpY2 + 58);
    // 搜刮进度
    var need = 3 + run.tier;
    ctx.fillStyle = '#8B95A0'; ctx.font = '11px sans-serif';
    ctx.fillText('搜刮 ' + Math.min(run.nodes, need) + '/' + need + ' → BOSS', W - 22, rpY2 + 73);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.strokeStyle = 'transparent'; hp(W - 168, rpY2 + 77, 146, 6, 3);
    ctx.fillStyle = '#8FD8C0'; hp(W - 168, rpY2 + 77, 146 * Math.min(1, run.nodes / need), 6, 3);
    } else {
      var needM = 3 + run.tier;
      ctx.fillStyle = '#8FD8C0'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('搜刮 ' + Math.min(run.nodes, needM) + '/' + needM, rpX, rpY2 + 46);
    }
    ctx.textAlign = 'left';
    // 特殊宝箱交互提示（就近显示）
    var nearV = null, nd2 = 1e9;
    for (var _v = 0; _v < vaults.length; _v++) { var _vv = vaults[_v]; if (_vv.state === 'done') continue; var _dd = Math.hypot(player.x - _vv.x, player.y - _vv.y); if (_dd < _vv.r + 64 && _dd < nd2) { nd2 = _dd; nearV = _vv; } }
    if (nearV) {
      var vtxt;
      if (nearV.type === 'seal') vtxt = nearV.state === 'opening' ? ('解封中 ' + Math.floor(nearV.prog * 100) + '% · ' + (isMobile ? '靠近顶住围堵' : '按住 [E] 顶住围堵')) : (isMobile ? '靠近解封封印宝箱（持续刷敌，顶住 5 秒）' : '按住 [E] 解封封印宝箱（持续刷敌，顶住 5 秒）');
      else { var totAlive = nearV.totems.filter(function (t) { return !t.dead; }).length; vtxt = '击破符文柱解锁（剩余 ' + totAlive + '/' + nearV.totems.length + '）'; }
      ctx.font = 'bold ' + (isMobile ? 12 : 15) + 'px sans-serif'; var vtw = ctx.measureText(vtxt).width;
      ctx.fillStyle = 'rgba(6,12,24,0.78)'; ctx.strokeStyle = nearV.type === 'seal' ? 'rgba(224,184,74,0.6)' : 'rgba(176,111,208,0.6)';
      var vpY = isMobile ? H - 180 : H - 104;
      hp(W / 2 - vtw / 2 - 18, vpY, vtw + 36, isMobile ? 24 : 30, 15);
      ctx.fillStyle = nearV.type === 'seal' ? '#E0B84A' : '#C79BE8'; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(vtxt, W / 2, vpY + (isMobile ? 16 : 20)); ctx.textAlign = 'left';
    }
    // 底部提示行（胶囊底）
    if (hintTimer > 0 && !isMobile) {
      ctx.globalAlpha = clamp(hintTimer / 2, 0, 1);
      var ht = '隔断墙可卡视角放风筝 · 封印宝箱按住[E]解封 / 符文宝箱击破柱解锁 · 搜够 ' + (3 + run.tier) + ' 个触发 BOSS → 等撤离点开放（光柱亮起）→ 飞入读条 2.8s 撤离';
      ctx.font = '14px sans-serif'; var tw = ctx.measureText(ht).width;
      ctx.fillStyle = 'rgba(6,12,24,0.66)'; ctx.strokeStyle = 'rgba(95,191,163,0.35)';
      hp(W / 2 - tw / 2 - 16, H - 72, tw + 32, 28, 14);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(ht, W / 2, H - 52); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    // banner（金色胶囊背景条）
    if (banner) {
      ctx.globalAlpha = clamp(banner.life, 0, 1);
      ctx.font = 'bold 21px sans-serif'; var bw2 = ctx.measureText(banner.text).width;
      ctx.fillStyle = 'rgba(6,12,24,0.7)'; ctx.strokeStyle = 'rgba(201,162,39,0.45)';
      hp(W / 2 - bw2 / 2 - 20, 98, bw2 + 40, 38, 19);
      ctx.fillStyle = COL.gold; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent'; ctx.fillText(banner.text, W / 2, 123); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    // Boss 血条（面板 + 渐变条 + 名字）
    if (boss) {
      var bw3 = 340, bx = (W - bw3) / 2, by = 14;
      ctx.fillStyle = 'rgba(6,12,24,0.74)'; ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      hp(bx - 6, by - 4, bw3 + 12, 30, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.strokeStyle = 'transparent'; hp(bx, by + 14, bw3, 10, 5);
      var bcol = boss.phase >= 3 ? '#C94F4F' : (boss.phase === 2 ? '#D96A7E' : '#8A6FB8');
      ctx.fillStyle = bcol; hp(bx, by + 14, Math.max(3, bw3 * (boss.hp / boss.maxhp)), 10, 5);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = 'transparent';
      ctx.fillText((boss.kind === 'qiongqi' ? '穷奇·掠食' : '梼杌·封印体') + ' · 阶段' + boss.phase, W / 2, by + 12);
      ctx.textAlign = 'left';
    }
    drawMinimap();
    drawConsumables();
    // UX：新手期操作提示（前 3 局常驻）
    if (!isMobile && meta.runs < 3 && run.time > 1.5) {
      ctx.fillStyle = 'rgba(143,166,179,0.9)'; ctx.font = '11px sans-serif';
      ctx.fillText('Q 丹药 · M 合成 · Shift 冲刺 · P 暂停', 14, 124);
    }
    // UX：有可合成组合时提示
    if (hasMergeable()) {
      ctx.fillStyle = '#D9B64A'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('💡 按 M 可合成', W - 22, 132); ctx.textAlign = 'left';
    }
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
  function render() {
    if (scene !== 'mission') { drawGrid(); return; }
    var k = shake.t > 0 ? Math.min(shake.mag * Math.exp(-(shake.dur - shake.t) / shake.tau), 6) : 0;
    ctx.save();
    if (k > 0) ctx.translate(rand(-k, k), rand(-k, k)); // 随机短促偏移：一瞬轻晃，不持续不飘（移动跟手）
    ctx.translate(-cam.x, -cam.y); // 相机：把世界坐标平移到屏幕
    drawGrid(); drawObstacles(); drawNodes(); drawVaults(); drawTotems(); drawLoot(); drawRift(); drawExtract(); drawEnemies(); if (boss) drawBoss(); drawVfxLines(); drawBulletTrails(); drawBullets(); drawParticles(); drawVfxSprites(); drawPlayer();
    ctx.restore();
    drawHUD();
    drawEdgeArrows();
    if (tint.a > 0) { ctx.fillStyle = hexToRgba(tint.col, tint.a); ctx.fillRect(0, 0, W, H); }
    if (bossVig > 0) {
      var va = clamp(bossVig / 1.2, 0, 1) * 0.6;
      var grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(8,4,12,' + va + ')');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    }
    if (screenFlash.a > 0) { ctx.fillStyle = hexToRgba(screenFlash.color, screenFlash.a); ctx.fillRect(0, 0, W, H); }
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
  function loop(now) {
    var realDt = Math.min(0.05, (now - last) / 1000); last = now;
    if (scene === 'mission' && !paused) {
      try {
        if (freeze > 0) { freeze -= realDt; } else { update(realDt); updateVfx(realDt); } // 顿帧：冻结世界（含粒子/飘字），不卡死渲染
        if (shake.t > 0) shake.t -= realDt;
        if (shake.cd > 0) shake.cd -= realDt;
        if (tint.a > 0) tint.a -= realDt * tint.rate;
        if (bossVig > 0) bossVig -= realDt;
      } catch (err) { reportGameError(err); }
    }
    try { render(); } catch (err) { reportGameError(err); }
    updateMobileBtnStates();
    requestAnimationFrame(loop); // 异常绝不断裂 rAF 链：从此不再"需刷新才恢复"
  }
  requestAnimationFrame(loop);

  // ---------- 界面 ----------
  function hideAllOverlays() { ['title', 'base', 'buffOverlay', 'mergeOverlay', 'pauseOverlay', 'result', 'tutorial'].forEach(function (id) { document.getElementById(id).style.display = 'none'; }); }
  function showScene(name) {
    scene = name; hideAllOverlays();
    if (name === 'base') { document.getElementById('base').style.display = 'flex'; renderBase(); }
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
          '<div class="en">' + badgeHtml + (eq ? eq.name : SLOTNAME[slot]) + '</div>' +
        '</div>';
      });
      he.innerHTML = slots;
    }
  }

  function renderBase() {
    if (selectedTier > meta.maxTier) selectedTier = meta.maxTier;
    // === 难度选择 ===
    var tr = document.getElementById('tierRow');
    if (tr) {
      var tierLvMap = {1:'Lv1',2:'Lv3',3:'Lv6'};
      var tnames = '';
      for (var t = 1; t <= TIERNAME.length; t++) {
        var unlocked = t <= meta.maxTier;
        var cls = 'tname-row' + (selectedTier === t ? ' selected' : '') + (unlocked ? '' : ' locked');
        tnames += '<div class="' + cls + '" data-t="' + TIERNAME[t-1] + '"><span>' + TIERNAME[t-1] + '</span></div>';
      }
      var curT = TIERNAME[selectedTier - 1];
      var rewardMul = ['×1.0','×1.4','×2.0'][selectedTier - 1] || '×1.0';
      tr.innerHTML =
        '<div class="tier-names">' + tnames + '</div>' +
        '<div class="tier-preview"><div class="inner">' +
          '<div class="tname">' + curT + '</div>' +
          '<div class="tlv">' + (tierLvMap[selectedTier] || ('Lv'+selectedTier)) + '</div>' +
          '<div class="tdesc">精英密度随层级提升<br>奖励倍率 ' + rewardMul + '</div>' +
        '</div></div>' +
        '<div class="tier-lv">' +
          '<div class="tlv-box">Lv1</div><div class="tlv-box">Lv3</div><div class="tlv-box">Lv6</div>' +
        '</div>';
      var trows = tr.querySelectorAll('.tname-row');
      for (var tri = 0; tri < trows.length; tri++) {
        (function (row) {
          row.addEventListener('click', function () {
            if (row.classList.contains('locked')) return;
            selectedTier = TIERNAME.indexOf(row.dataset.t) + 1; renderBase(); AudioSys.sfx.ui();
          });
        })(trows[tri]);
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
    var resArsenal = document.getElementById('resArsenal');
    if (resArsenal) resArsenal.textContent = meta.arsenal.length;
    var resProgress = document.getElementById('resProgress');
    if (resProgress) resProgress.textContent = meta.maxTier + '/3';
    renderArsenal(); renderForge(); renderResearch(); renderCodex();
  }

  function goAircraft(n) {
    var acList = ['a','b','c'].filter(function(id){ return meta.unlocked[id]; });
    if (acList.length === 0) acList = ['a'];
    var idx = acList.indexOf(selectedAircraft);
    if (idx < 0) idx = 0;
    var next = (idx + n + acList.length) % acList.length;
    selectedAircraft = acList[next];
    renderHangarAircraft();
    AudioSys.sfx.ui();
  }

  function renderHangarAircraft() {
    var portraitMap = { a:'acft_qingfalcon', b:'acft_xuanwu', c:'acft_chilan' };
    var acList = ['a','b','c'].filter(function(id){ return meta.unlocked[id]; });
    if (acList.length === 0) acList = ['a'];
    if (acList.indexOf(selectedAircraft) < 0) selectedAircraft = acList[0];
    var idx = acList.indexOf(selectedAircraft);

    // slides
    var track = document.getElementById('acTrack');
    if (track) {
      var slides = '';
      acList.forEach(function(id){
        var a = AIRCRAFT[id];
        slides += '<div class="ap-slide" data-aid="' + id + '"><img src="assets/v3/ui/portrait/' + (portraitMap[id] || 'acft_qingfalcon') + '.png?v=5" alt="' + a.name + '"></div>';
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

    // info / bars / desc
    var acft = AIRCRAFT[selectedAircraft];
    var infoEl = document.getElementById('apInfo');
    if (infoEl) {
      infoEl.innerHTML =
        '<div class="label">机体信息</div>' +
        '<div class="iname">' + acft.name + '</div>' +
        '<div class="itype">' + acft.desc + '</div>' +
        '<div class="imod">' + (acft.mod || '标准模组') + '</div>' +
        '<div class="iweapon"><b>主武器</b>' + acft.name + ' 标准武装</div>' +
        '<div class="iweapon"><b>弹道</b>' + (acft.homing ? '追踪' : (acft.spread ? '散射' : '直射')) + (acft.pellets > 1 ? ' + 散射' : '') + '</div>';
    }
    var barsEl = document.getElementById('apBars');
    if (barsEl) {
      var armorPct = Math.max(8, Math.min(100, Math.round(acft.hp / 200 * 100)));
      var mobPct = Math.max(8, Math.min(100, Math.round(acft.speed / 300 * 100)));
      var capPct = Math.max(8, Math.min(100, Math.round(acft.fireRate / 8 * 100)));
      barsEl.innerHTML =
        '<div class="ibar"><label>装甲</label><div class="track"><div class="fill" style="width:' + armorPct + '%"></div></div><div class="val">' + acft.hp + '</div></div>' +
        '<div class="ibar"><label>机动</label><div class="track"><div class="fill" style="width:' + mobPct + '%"></div></div><div class="val">' + acft.speed + '</div></div>' +
        '<div class="ibar"><label>电容</label><div class="track"><div class="fill" style="width:' + capPct + '%"></div></div><div class="val">' + acft.fireRate + '</div></div>';
    }
    var descEl = document.getElementById('apDesc');
    if (descEl) {
      descEl.textContent = acft.name + '，' + acft.desc + '。配备标准武装，弹道' + (acft.homing ? '追踪' : (acft.spread ? '散射' : '直射')) + (acft.pellets > 1 ? '并带多重弹片' : '') + '。';
    }

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
  function onForgeClick(id) {
    // 新交互：点选只投料/取回（最多 3 件入炉），合成统一由右侧按钮按预览执行，不再自动合成
    var i = forgeSel.indexOf(id);
    if (i >= 0) { forgeSel.splice(i, 1); renderForge(); return; }
    if (forgeSel.length >= 3) return;
    forgeSel.push(id);
    renderForge();
  }
  // 熔炉预览：根据当前投料推衍产物（与按钮校验规则一致）
  function forgePreview(arts) {
    if (arts.length === 0) return { ready: false, title: '熔炉', sub: '点选左侧材料投料' };
    var slot = arts[0].slot;
    var sameSlot = arts.every(function (a) { return a.slot === slot; });
    var hasOrange = arts.some(function (a) { return a.rarity === 'orange'; });
    if (hasOrange) return { ready: false, title: '不可熔炼', sub: '传说法器禁止入炉' };
    if (arts.length === 2) {
      if (sameSlot && arts[0].rarity === arts[1].rarity) {
        var ri = RAR.indexOf(arts[0].rarity);
        if (ri >= 0 && ri < RAR.length - 1) return { ready: true, title: RARNAME[RAR[ri + 1]] + '·' + SLOTNAME[slot], sub: '二合一 · 升稀一阶', color: RARCOL[RAR[ri + 1]] };
      }
      return { ready: false, title: '无法合成', sub: '需同槽位·同稀有度 ×2' };
    }
    if (arts.length === 3) {
      if (sameSlot) {
        var ri2 = RAR.indexOf(arts[0].rarity);
        if (ri2 >= 0 && ri2 < RAR.length - 1) return { ready: true, title: RARNAME[RAR[ri2 + 1]] + '·' + SLOTNAME[slot], sub: '三合一 · 升阶 + 额外词条', color: RARCOL[RAR[ri2 + 1]] };
      }
      return { ready: false, title: '无法合成', sub: '需同槽位 ×3' };
    }
    return { ready: false, title: '已选 ' + arts.length + ' 件', sub: '同槽×2 升稀 / 同槽×3 升级' };
  }
  function forge3MergeBase() {
    if (forgeSel.length < 3) return false;
    var arts = forgeSel.map(getArt).filter(Boolean);
    if (arts.length < 3) { forgeSel = []; renderForge(); return false; }
    var slot = arts[0].slot;
    var allSame = arts.every(function (a) { return a.slot === slot; });
    var notOrange = arts.every(function (a) { return a.rarity !== 'orange'; });
    if (!allSame || !notOrange) { forgeSel = []; renderForge(); return false; }
    var ri = RAR.indexOf(arts[0].rarity);
    if (ri < 0 || ri >= RAR.length - 1) { forgeSel = []; renderForge(); return false; }
    // 移除三件材料
    forgeSel.forEach(function (id) { removeArt(id); });
    // 生成升阶法器（3合1 → 升一阶，附带额外随机词条）
    var newArt = makeArtifact(slot, RAR[ri + 1]);
    // 额外加一条随机小词条
    var bonusMods = [
      { dmg: 2 }, { maxhp: 10 }, { fireRate: 0.3 }, { speed: 0.2 },
      { critChance: 0.05 }, { pierce: 1 }, { dodgeChance: 0.03 }
    ];
    var bm = bonusMods[randi(0, bonusMods.length - 1)];
    for (var k in bm) newArt.mods[k] = (newArt.mods[k] || 0) + bm[k];
    newArt.name = RARNAME[RAR[ri + 1]] + '·' + SLOTNAME[slot] + '(三合)';
    meta.arsenal.push(newArt);
    forgeSel = [];
    saveMeta();
    renderBase();
    return true;
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
            ids.forEach(function (id) { removeArt(id); });
            meta.arsenal.push(makeArtifact(s, RAR[ri + 1]));
          } else {
            forgeSel = ids.slice();
            forge3MergeBase();
          }
          saveMeta();
          renderBase();
          return true;
        }
      }
    }
    return false;
  }
  var arsenalTab = 'weapon';
  var arsenalFilter = 'all'; // 'all' | white | green | blue | purple | orange
  var arsenalSort = 'power'; // 'power' | 'rarity' | 'name'
  function renderArsenal() {
    // === 装备槽（左栏 equipSlots） ===
    var slotsEl = document.getElementById('equipSlots');
    if (slotsEl) {
      slotsEl.innerHTML = '';
      if (SLOTS.indexOf(arsenalTab) < 0) arsenalTab = SLOTS[0];
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
            '<span class="eq-off">卸下</span>'
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
    var inv = meta.arsenal.filter(function (a) { return a.slot === slot; });
    // 筛选条
    var fbar = document.createElement('div'); fbar.className = 'arsenal-filter';
    ['all'].concat(RAR).forEach(function (r) {
      var c = document.createElement('span'); c.className = 'fchip' + (arsenalFilter === r ? ' on' : '');
      c.textContent = r === 'all' ? '全部' : RARNAME[r];
      if (r !== 'all') c.style.color = RARCOL[r];
      c.onclick = (function (rr) { return function () { arsenalFilter = rr; renderArsenal(); }; })(r);
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
    // 应用筛选 + 排序（已装备始终置顶）
    var shown = inv.filter(function (a) { return arsenalFilter === 'all' || a.rarity === arsenalFilter; });
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
        var left = document.createElement('div'); left.style.cssText = 'flex:1;min-width:0;';
        var gearIcon = a.slot === 'weapon' ? weaponIconHtml(a, 'wpn-icon-row') : gearIconHtml(a, 'gear-icon-row');
        left.innerHTML = '<span class="rarity-badge rarity-' + a.rarity + '"></span><div class="artline"><span class="wpn-left">' + gearIcon + '<span class="an" style="color:' + RARCOL[a.rarity] + '">' + a.name + '</span></span><span class="rar">' + RARNAME[a.rarity] + '</span></div><div class="mods">' + modsText(a.mods) + '</div>';
        var rec = document.createElement('span'); rec.className = 'rec'; rec.textContent = '回收';
        rec.onclick = function (ev) { ev.stopPropagation(); recycleArtifact(a.id); };
        row.appendChild(left); row.appendChild(rec);
        row.onclick = function () { equipArtifact(a.slot, a.id); };
        list.appendChild(row);
      });
    }
    box.appendChild(list);
  }
  function renderForge() {
    // === 左：材料列表 ===
    var box = document.getElementById('forgeList');
    if (box) {
      box.innerHTML = '';
      if (meta.arsenal.length === 0) {
        box.innerHTML = '<div class="mini">军械库空空，先去搜刮带回法器</div>';
      } else {
        var tip = document.createElement('div'); tip.className = 'forge-tip';
        tip.textContent = '点选材料投料（最多 3 件）：同槽位·同稀有度 ×2 升稀一阶；同槽位 ×3 升阶并附加额外词条；「回收」将所选折价换灵玉。';
        box.appendChild(tip);
        var list = document.createElement('div'); list.className = 'forge-mat-list';
        meta.arsenal.forEach(function (a) {
          var el = document.createElement('div'); el.className = 'art' + (forgeSel.indexOf(a.id) >= 0 ? ' on' : '');
          el.innerHTML = '<div class="artline"><span class="an" style="color:' + RARCOL[a.rarity] + '">' + a.name + '</span><span class="rar">' + SLOTNAME[a.slot] + '·' + RARNAME[a.rarity] + '</span></div><div class="mini">' + modsText(a.mods) + '</div>';
          el.onclick = function () { onForgeClick(a.id); };
          list.appendChild(el);
        });
        box.appendChild(list);
      }
    }
    // === 中：熔炉舞台（三槽投料 + 顶盘预览） ===
    var stage = document.getElementById('forgeStage');
    if (stage) {
      stage.innerHTML = '';
      var arts = forgeSel.map(getArt).filter(Boolean);
      for (var i = 0; i < 3; i++) {
        var s = document.createElement('div');
        s.className = 'fg-slot' + (arts[i] ? '' : ' empty');
        s.setAttribute('data-pos', i);
        if (arts[i]) {
          s.innerHTML = '<div class="fname" style="color:' + RARCOL[arts[i].rarity] + '">' + arts[i].name + '</div><div class="fsub">' + SLOTNAME[arts[i].slot] + '·' + RARNAME[arts[i].rarity] + '</div>';
        } else {
          s.innerHTML = '<div class="fname">空槽</div>';
        }
        stage.appendChild(s);
      }
      var pv = forgePreview(arts);
      var r = document.createElement('div');
      r.className = 'fg-result' + (pv.ready ? ' glow' : '');
      r.innerHTML = '<div class="fname"' + (pv.color ? ' style="color:' + pv.color + '"' : '') + '>' + pv.title + '</div><div class="fsub">' + pv.sub + '</div>';
      stage.appendChild(r);
    }
  }
  // 研究院节点图标（v3 切图）：锋锐→雷刃 会心→星盘 体魄→盾 磁吸→聚合 撤离→转换
  var RES_ICONS = { dmg1: 'icon_22', crit1: 'icon_33', hp1: 'icon_30', mag1: 'icon_20', ext1: 'icon_13' };
  function renderResearch() {
    var box = document.getElementById('researchList'); box.innerHTML = '';
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
      box.appendChild(el);
    });
    var soon = document.createElement('div'); soon.className = 'research-card locked';
    soon.innerHTML = '<div class="rc-icon"><img src="assets/v3/ui/cropped/icon_32.png" alt=""></div>' +
      '<div class="rc-name">未尽研究</div>' +
      '<div class="rc-desc">后续章节揭晓</div>' +
      '<div class="rc-status">敬请期待</div>';
    box.appendChild(soon);
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
  function startMission() { forgeSel = []; newRun(selectedAircraft, selectedTier); showScene('mission'); if (isMobile) { enterImmersive(true); } }
  function showResult(outcome, kept, lostLoot, killReward, unlockedNew) {
    var label = outcome === 'success' ? '撤离成功' : (outcome === 'abandon' ? '主动弃局' : '阵亡');
    document.getElementById('resultTitle').textContent = outcome === 'success' ? '撤离成功！' : (outcome === 'abandon' ? '已弃局撤离' : '机体被击毁…');
    document.getElementById('resultTitle').style.color = outcome === 'success' ? COL.extract : (outcome === 'abandon' ? COL.gold : COL.enemy);
    var html = '';
    html += '<div class="stat-card big"><span>结局</span><b>' + label + '（第 ' + run.tier + ' 层）</b></div>';
    if (outcome === 'success') html += '<div class="stat-card ok"><span>战利品</span><b>全部入库：+' + kept + ' 件法器</b></div>';
    else if (outcome === 'abandon') html += '<div class="stat-card bad"><span>弃局带回 30%</span><b>+' + kept + ' 件（损失 ' + lostLoot + '）</b></div>';
    else html += '<div class="stat-card bad"><span>阵亡带回 15%</span><b>+' + kept + ' 件（损失 ' + lostLoot + '）</b></div>';
    html += '<div class="stat-card"><span>击杀灵玉</span><b>+' + killReward + '</b></div>';
    if (run.killedBoss) html += '<div class="stat-card ok"><span>本局击破 BOSS</span><b>奖励丰厚</b></div>';
    if (unlockedNew) html += '<div class="stat-card ok"><span>新层解锁</span><b>第 ' + meta.maxTier + ' 层「' + TIERNAME[meta.maxTier - 1] + '」</b></div>';
    if (run.tier === 3 && outcome === 'success' && run.killedBoss) html += '<div class="stat-card ok"><span>全层通关</span><b>你已征服深渊</b></div>';
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
    html += '<div class="stat-card"><span>库存</span><b>' + meta.arsenal.length + ' 件法器 · ' + meta.currency + ' 灵玉</b></div>';
    html += '<div class="muted" style="margin-top:12px">回基地「军械库」装载法器、「熔炼台」合成升稀、「研究院」解锁永久被动。本局拾取符文 ' + player.runes.length + ' 枚。</div>';
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
  document.getElementById('titleStart').onclick = function () { if (isMobile) enterImmersive(true); if (!meta.seenTutorial) { showScene('base'); document.getElementById('tutorial').style.display = 'flex'; } else showScene('base'); };
  document.getElementById('titleHelp').onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };
  document.getElementById('tutorialClose').onclick = function () { meta.seenTutorial = true; saveMeta(); document.getElementById('tutorial').style.display = 'none'; };
  // 出击按钮：机库用 id，其他标签页用 .launch-start 类
  var startBtns = document.querySelectorAll('#startBtn, .launch-start');
  for (var si = 0; si < startBtns.length; si++) startBtns[si].onclick = startMission;
  // 帮助按钮：机库用 id，其他标签页用 .launch-help 类
  var helpBtns = document.querySelectorAll('#helpBtn, .launch-help');
  for (var hi = 0; hi < helpBtns.length; hi++) helpBtns[hi].onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };
  document.getElementById('mergeClose').onclick = function () { document.getElementById('mergeOverlay').style.display = 'none'; paused = false; showMobileControls(); };
  document.getElementById('merge3btn').onclick = function () { doThreeMerge(); };
  document.getElementById('backBtn').onclick = function () { showScene('base'); };
  document.getElementById('pauseResume').onclick = closePause;
  document.getElementById('pauseQuit').onclick = function () { closePause(); finishRun('abandon'); };
  document.getElementById('pauseHelp').onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };

  // 撤离反制按钮（IIFE 内需显式绑定，内联 onclick 取不到函数）
  var ex1 = document.getElementById('exfilClear'); if (ex1) ex1.onclick = function () { commitExfil('clear'); };
  var ex2 = document.getElementById('exfilSilent'); if (ex2) ex2.onclick = function () { commitExfil('silent'); };
  var ex3 = document.getElementById('exfilQuick'); if (ex3) ex3.onclick = function () { commitExfil('quick'); };
  // 裂隙确认按钮
  var rb1 = document.getElementById('riftEnter'); if (rb1) rb1.onclick = function () { commitRift(true); };
  var rb2 = document.getElementById('riftCancel'); if (rb2) rb2.onclick = function () { commitRift(false); };

  // 军械库操作按钮
  var arsEquip = document.getElementById('arsenalEquip');
  if (arsEquip) arsEquip.onclick = function () {
    var slot = arsenalTab;
    var candidates = meta.arsenal.filter(function (a) { return a.slot === slot && a.id !== meta.equipped[slot]; });
    if (candidates.length === 0) return;
    candidates.sort(function (x, y) { return artifactScore(y) - artifactScore(x); });
    equipArtifact(slot, candidates[0].id);
  };
  var arsUnequip = document.getElementById('arsenalUnequip');
  if (arsUnequip) arsUnequip.onclick = function () {
    if (meta.equipped[arsenalTab]) equipArtifact(arsenalTab, meta.equipped[arsenalTab]);
  };
  var arsRecycle = document.getElementById('arsenalRecycle');
  if (arsRecycle) arsRecycle.onclick = function () {
    var slot = arsenalTab;
    var candidates = meta.arsenal.filter(function (a) { return a.slot === slot && a.id !== meta.equipped[slot]; });
    if (candidates.length === 0) return;
    candidates.sort(function (x, y) { return artifactScore(x) - artifactScore(y); });
    recycleArtifact(candidates[0].id);
  };

  // 熔炼台操作按钮
  var fMerge2 = document.getElementById('forgeMerge2');
  if (fMerge2) fMerge2.onclick = function () {
    if (forgeSel.length === 2) {
      var a1 = getArt(forgeSel[0]), a2 = getArt(forgeSel[1]);
      if (a1 && a2 && a1.slot === a2.slot && a1.rarity === a2.rarity && a1.rarity !== 'orange') {
        var ri = RAR.indexOf(a1.rarity);
        removeArt(a1.id); removeArt(a2.id);
        meta.arsenal.push(makeArtifact(a1.slot, RAR[ri + 1]));
        forgeSel = []; saveMeta(); renderBase();
        return;
      }
      forgeSel = []; renderForge(); return;
    }
    autoForgeMerge(2);
  };
  var fMerge3 = document.getElementById('forgeMerge3');
  if (fMerge3) fMerge3.onclick = function () {
    if (forgeSel.length >= 3) { forge3MergeBase(); return; }
    autoForgeMerge(3);
  };
  var fRecycle = document.getElementById('forgeRecycle');
  if (fRecycle) fRecycle.onclick = function () {
    if (forgeSel.length === 0) return;
    forgeSel.forEach(function (id) {
      var a = getArt(id); if (!a) return;
      SLOTS.forEach(function (s) { if (meta.equipped[s] === id) meta.equipped[s] = null; });
      removeArt(id);
      meta.currency += Math.round(RARVAL[RAR.indexOf(a.rarity)] * 0.5);
    });
    forgeSel = []; saveMeta(); renderBase();
  };

  // 移动端横屏按钮
  var titleLsBtn = document.getElementById('titleLandscape');
  if (titleLsBtn) { if (isMobile) titleLsBtn.style.display = ''; titleLsBtn.onclick = tryLandscape; }
  var tryLsBtn2 = document.getElementById('tryLandscape');
  if (tryLsBtn2) tryLsBtn2.onclick = tryLandscape;

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
      enterImmersive(true);  // 全屏 + 横屏锁定 + 隐藏导航栏
      showScene('title');
      checkOrientation();
    }
    enterOverlay.addEventListener('touchend', function (e) { e.preventDefault(); doEnter(); }, { passive: false });
    enterOverlay.addEventListener('click', function () { doEnter(); });
  } else {
    showScene('title');
  }
  // 确保初始尺寸正确
  resize();
  checkOrientation();
})();
