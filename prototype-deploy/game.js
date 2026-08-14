'use strict';
/* 空域撤离 - 浏览器 MVP v7 (内容大扩展)
   打飞机 + 搜刮 + 合成 + 肉鸽 + Boss + 搜打撤
   v7 新增：真实战利品命名 / 5系28符文 / 武器形态差异化 /
   敌人原型扩张(炮艇·游医·分裂体) / 第2Boss穷奇 / 丹药消耗品 / 3合1合成 */
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0;
  var WORLD_W = 1600, WORLD_H = 1100; // 世界尺寸（比屏幕大，靠相机滚动浏览）
  var cam = { x: 0, y: 0 };           // 相机左上角（世界坐标）
  function resize() { W = canvas.width = Math.max(640, window.innerWidth); H = canvas.height = Math.max(480, window.innerHeight); }
  window.addEventListener('resize', resize); resize();
  window.addEventListener('resize', function () { checkOrientation(); showMobileControls(); });
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
      extract: function () { playFile('extract'); },
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
    var idx = RAR.indexOf(rarity), s = [0.4, 0.7, 1.0, 1.4, 1.9][idx], m = {};
    if (slot === 'weapon') {
      if (idx >= 2) m.dmg = Math.round(3 * s);
      if (idx >= 1) m.fireRate = +(0.35 * s).toFixed(2);
      m.critChance = +(0.03 * s).toFixed(3);
      if (idx >= 3) m.bulletSpeed = Math.round(30 * s);
    } else if (slot === 'armor') {
      m.maxhp = Math.round(12 * s); m.maxshield = Math.round(8 * s);
      if (idx >= 1) m.regen = +(1.2 * s).toFixed(1);
    } else if (slot === 'core') {
      m.speed = Math.round(8 * s); m.dodgeChance = +(0.02 * s).toFixed(3);
      if (idx >= 2) m.pierce = 1; if (idx >= 3) m.burn = 6;
    } else { // ammo
      if (idx >= 1) m.pellets = 1;
      if (idx >= 2) m.pierce = Math.max(m.pierce || 0, 1);
      if (idx >= 3) m.explode = 40;
    }
    return m;
  }
  function makeArtifact(slot, rarity, name) {
    var pool = LOOT_NAMES[rarity] || LOOT_NAMES.white;
    var nm = name || pool[randi(0, pool.length - 1)];
    return { id: 'art' + (Date.now().toString(36)) + (artSeq++).toString(36), slot: slot, rarity: rarity, name: nm, mods: rollMods(slot, rarity) };
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
  }
  // 出击时把已装备法器 + 研究院被动叠加到 player
  function applyEquipped() {
    for (var si = 0; si < SLOTS.length; si++) {
      var id = meta.equipped[SLOTS[si]]; if (!id) continue;
      var art = null; for (var i = 0; i < meta.arsenal.length; i++) if (meta.arsenal[i].id === id) { art = meta.arsenal[i]; break; }
      if (art) applyArtifactMods(art.mods);
    }
    if (meta.research.dmg1) player.dmg = Math.min(240, player.dmg * 1.1);
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
      if (Math.random() > keep) continue;
      meta.arsenal.push(makeArtifact(it.slot || pickSlot(), it.rarity, it.name)); kept++;
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
    { name: '烈焰符·火', elem: '火', desc: '伤害+22%', apply: function () { player.dmg = Math.min(220, player.dmg * 1.22); } },
    { name: '爆裂符·火', elem: '火', desc: '子弹命中产生小爆炸', apply: function () { player.explode = 48; } },
    { name: '灼烧符·火', elem: '火', desc: '命中附加灼烧', apply: function () { player.burn = 9; } },
    { name: '焚天符·火', elem: '火', desc: '暴击率+18%', apply: function () { player.critChance = Math.min(0.7, player.critChance + 0.18); } },
    { name: '散射符·火', elem: '火', desc: '弹片+2', apply: function () { player.pellets = Math.min(9, player.pellets + 2); } },
    { name: '赤焰核·火', elem: '火', desc: '伤害+12%·弹速+12%', apply: function () { player.dmg = Math.min(220, player.dmg * 1.12); player.bulletSpeed *= 1.12; } },
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

  // ---------- 战利品命名池（真实"道具"，按稀有度出名字）----------
  var LOOT_NAMES = {
    white:  ['灵玉砂', '符纸', '兽牙', '残羽', '锈铁'],
    green:  ['青羽', '铜符', '露珠', '石胆', '藤甲'],
    blue:   ['玄铁', '水精', '雷纹', '风铃', '玉髓'],
    purple: ['梼杌鳞', '赤焰核', '幽蓝晶', '摄魂珠', '山海图残页'],
    orange: ['穷奇牙', '山海图·全', '太初灵玉', '烛龙睛', '九婴泪']
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
  loadImg('ply_a_boost_sheet', 'assets/v3/player/qingfalcon_boost_sheet.png');
  loadImg('ply_b', A1 + 'player/ply_guardian_b.png');
  loadImg('ply_b_sheet', 'assets/v3/player/xuanwu_idle_sheet.png');
  loadImg('ply_b_boost_sheet', 'assets/v3/player/xuanwu_boost_sheet.png');
  loadImg('ply_c', A1 + 'player/ply_dancer_c.png');
  loadImg('ply_c_sheet', 'assets/v3/player/fan_dancer_idle_sheet.png');
  loadImg('ply_c_boost_sheet', 'assets/v3/player/fan_dancer_boost_sheet.png');
  loadImg('enm_ram', A1 + 'enemy/enm_ram.png');
  loadImg('enm_shoot', A1 + 'enemy/enm_shooter.png');
  loadImg('enm_turret', A1 + 'enemy/enm_turret.png');
  loadImg('enm_gunship', A1 + 'enemy/enm_gunship.png');
  loadImg('enm_heal', A1 + 'enemy/enm_healer.png');
  loadImg('enm_split', A1 + 'enemy/enm_splitter.png');
  loadImg('enm_looter', A1 + 'enemy/enm_looter.png');
  loadImg('enm_elite', A1 + 'enemy/enm_elite.png');
  loadImg('boss_taowu', A1 + 'enemy/boss_taowu.png');
  loadImg('boss_qiongqi', A1 + 'enemy/boss_qiongqi.png');
  loadImg('chest_common', A1 + 'environment/loot_common_chest.png');
  loadImg('chest_vault', A1 + 'environment/loot_vault_chest.png');
  loadImg('bul_player', A1 + 'effects/prj_player.png');
  loadImg('bul_enemy', A1 + 'effects/prj_enemy.png');
  loadImg('bul_boss', A1 + 'effects/prj_boss.png');
  loadImg('bul_buff', A1 + 'effects/prj_buff.png');
  loadImg('loot_common', A1 + 'effects/loot_common_pickup.png');
  loadImg('loot_rare', A1 + 'effects/loot_rare_pickup.png');
  var A2 = 'assets/v2/items/icons/';
  loadImg('con_bomb', A2 + 'con_bomb.png');
  loadImg('con_heal', A2 + 'con_heal.png');
  loadImg('con_shield', A2 + 'con_shield.png');
  loadImg('con_slow', A2 + 'con_slow.png');
  var A3 = 'assets/v3/vfx/';
  loadImg('vfx_hit_spark', A3 + 'vfx_hit_spark.png');
  loadImg('vfx_crit_flash', A3 + 'vfx_crit_flash.png');
  loadImg('vfx_buff_aura', A3 + 'vfx_buff_aura.png');
  loadImg('vfx_frost', A3 + 'vfx_frost.png');
  loadImg('vfx_explosion_smoke', A3 + 'vfx_explosion_smoke.png');
  loadImg('vfx_explosion_sheet', A3 + 'vfx_explosion_sheet.png');
  loadImg('vfx_enemy_death', A3 + 'vfx_enemy_death.png');
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
  var PSIZE = { a: 50, b: 56, c: 50 };
  var ESIZE = { ram: 42, shoot: 42, turret: 60, gunship: 60, heal: 46, split: 40, looter: 42 };
  function enemySprite(e) {
    if (e.arche === 'turret') return 'enm_turret';
    if (e.arche === 'gunship') return 'enm_gunship';
    if (e.arche === 'heal') return 'enm_heal';
    if (e.arche === 'split') return 'enm_split';
    if (e.arche === 'looter') return 'enm_looter';
    if (e.arche === 'shoot') return 'enm_shoot';
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

    // 1) Fullscreen API（Android Chrome / 桌面有效，iOS Safari 无效）
    var reqFs = el.requestFullscreen || el.webkitRequestFullscreen;
    if (reqFs) {
      var p = reqFs.call(el);
      if (p && p.then) {
        p.then(function () {
          if (wantLandscape && screen.orientation && screen.orientation.lock)
            screen.orientation.lock('landscape').catch(function () {});
        }).catch(function () { hideBrowserBars(); });
      }
    } else {
      // iOS Safari fallback
      hideBrowserBars();
    }

    // 2) iOS Safari 地址栏隐藏 trick：临时允许滚动 → 滚一像素 → 恢复锁定
    hideBrowserBars();

    // 3) 横屏锁定（如果请求）
    if (wantLandscape && screen.orientation && screen.orientation.lock)
      screen.orientation.lock('landscape').catch(function () {});
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
    }, 50);
  }

  // 兼容旧调用
  function tryLandscape() { enterImmersive(true); }
  function checkOrientation() {
    if (!isMobile) return;
    var rp = document.getElementById('rotatePrompt');
    if (!rp) return;
    var portrait = window.innerHeight > window.innerWidth;
    rp.style.display = (portrait && scene === 'mission' && !paused && !overlaysOpen()) ? 'flex' : 'none';
  }
  window.addEventListener('orientationchange', function () { setTimeout(checkOrientation, 100); });

  // ---------- 全局状态 ----------
  var scene = 'title';
  var baseTab = 'hangar';
  var tipTimer = 0, tipEl = null;
  var paused = false;
  var player, bullets, enemies, loot, nodes, particles, floaters, extractPoints, exfil, boss, bossSpawned, vaults, totems;
  var run, spawnTimer, buffTimer, buffPending, buffHold, buffSafe, gameTime, hintTimer, banner, killForBuff, runeCount, screenFlash;
  var enemiesSlowT = 0, enemiesSlowFactor = 1;
  var lootCap = 22;

  function tierMul() { return 1 + (run.tier - 1) * 0.5; }
  function tierDmgMul() { return 1 + (run.tier - 1) * 0.35; }

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
          if (sealActive) { v.state = 'opening'; v.prog = 0; v.defT = 0; v.defN = 0; banner = { text: '封印解封中…顶住围堵！', life: 1.4 }; }
        } else if (v.state === 'opening') {
          if (!sealActive) { v.state = 'locked'; v.prog = Math.max(0, v.prog - dt * 1.6); continue; }
          v.prog += dt / VAULT.channel;
          v.defT -= dt;
          if (v.defT <= 0 && v.defN < VAULT.sealDefenders && enemies.length < 26) {
            v.defT = VAULT.sealDefender; var ang = rand(0, 6.28), dd = rand(150, 260);
            var ge = spawnEnemy(clamp(v.x + Math.cos(ang) * dd, 30, WORLD_W - 30), clamp(v.y + Math.sin(ang) * dd, 30, WORLD_H - 30), Math.min(2, run.tier));
            ge.wake = 0.4; ge.fireCd = rand(1.6, 2.8); v.defN++;
          }
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
      critChance: 0.04, critMult: 2.0, burn: 0, lifesteal: 0, chain: 0,
      dodgeChance: 0, reflect: 0, magnet: false, slowAuraR: 0, slowFactor: 1,
      drones: 0, droneList: [], droneCd: 0,
      color: a.color, ang: -Math.PI / 2, buffs: [], runes: [], elements: {}, flash: 0, bank: 0, extractBonus: 0,
      consumables: [],
      bondTiers: {}, killExplode: 0, freezeChance: 0, skyStrike: 0, skyCd: 0, skyT: 0, gale: false, galeActive: false, outOfCombatT: 0,
      execute: 0, overload: 0, undying: false, undyingUsed: false, guardShock: 0
    };
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    bullets = []; enemies = []; loot = []; resetParticles(); resetFloaters(); nodes = []; vaults = []; totems = [];
    extractPoints = []; exfil = false; boss = null; bossSpawned = false;
    run = { loot: [], kills: 0, picked: 0, time: 0, aircraft: aircraftId, tier: tier, nodes: 0, killedBoss: false, enemyKills: {} };
    spawnTimer = 2.5; buffTimer = 0; buffPending = false; buffHold = 0; buffSafe = 0; gameTime = 0; hintTimer = 6; banner = null; runeCount = 0; killForBuff = runeNextReq(0); screenFlash = { color: '#fff', a: 0 };
    enemiesSlowT = 0;
    genMapLayout(); // 空域：清空障碍并设出生点
    player.x = spawnPoint.x; player.y = spawnPoint.y; // 出生在空域下方中央
    cam.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W)); cam.y = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
    placeNodes(6 + tier);
    applyEquipped(); // 把已装备法器 + 研究院被动实打实叠到这局属性上
    if (meta.runs === 0) showTip('<b>目标：</b>搜刮战利品 → 撤离带回法器。天空有<b>礁石掩体/隔断墙</b>可当掩护；<b>封印宝箱</b>按住[E]解封（会刷敌）、<b>符文宝箱</b>击破环绕符文柱解锁，都在特殊位置、保底高品质。撤离点<b>限时开放</b>（光柱亮起才能走）', 9);
    vfxLines.length = 0;
    recalcBonds();
    initExtractPoints(); // 三角洲式：限时开放撤离点（开局为关闭，按时间窗循环开放）
    generateObstacles(); // 程序化散布掩体礁石 + 灵脉裂隙 + 隔断墙（避开出生/节点/撤离/BOSS通道）
    placeVaults(tier); // 特殊位置放置封印/符文宝箱（好宝箱，需做任务解锁）
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
  function rollRarity(tier) {
    var r = Math.random();
    var t = (tier - 1) * 0.03; // 高层略升，但不过度侵蚀白绿
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
    var ram = 0.26, shoot = 0.22, turret = 0.08 + tier * 0.03, heal = 0.07 + tier * 0.02, gunship = 0.07 + tier * 0.04, split = 0.07 + tier * 0.02;
    // 劫掠者：只在玩家已捡到战利品时才进入抽卡池（没东西可偷就不浪费出场）
    var looter = (run && run.loot.length > 0) ? (0.06 + tier * 0.02) : 0;
    var sum = ram + shoot + turret + heal + gunship + split + looter; r *= sum;
    if (r < ram) return 'ram'; r -= ram;
    if (r < shoot) return 'shoot'; r -= shoot;
    if (r < turret) return 'turret'; r -= turret;
    if (r < heal) return 'heal'; r -= heal;
    if (r < gunship) return 'gunship'; r -= gunship;
    if (r < split) return 'split'; r -= split;
    return 'looter';
  }
  function spawnEnemy(x, y, etier) {
    var ex = x, ey = y;
    if (ex === undefined) {
      // 空域：在天空随机生成，远离玩家
      var st2 = 0;
      do { ex = rand(80, WORLD_W - 80); ey = rand(80, WORLD_H - 80); st2++; } while (dist2(ex, ey, player.x, player.y) < 360 * 360 && st2 < 90);
      if (st2 >= 90) { ex = spawnPoint.x + rand(-150, 150); ey = spawnPoint.y; }
    }
    etier = etier || clamp(1 + Math.floor(gameTime / 28), 1, 4);
    var arche = pickArchetype(etier);
    var elite = !x && Math.random() < 0.08;
    var baseHp = (16 + etier * 9) * tierMul();
    if (arche === 'turret') baseHp *= 2.2; else if (arche === 'heal') baseHp *= 1.25; else if (arche === 'split') baseHp *= 0.9; else if (arche === 'gunship') baseHp *= 3.4; else if (arche === 'looter') baseHp *= 1.15;
    if (elite) baseHp *= 3;
    var RAD = { turret: 22, gunship: 30, split: 22, heal: 20, looter: 17, ram: 15 };
    var r = RAD[arche] || 17;
    var ecol = arche === 'heal' ? COL.extract : (arche === 'split' ? RARCOL.purple : (arche === 'looter' ? '#E0B84A' : COL.enemy));
    var eedge = arche === 'heal' ? COL.ink : (arche === 'split' ? '#2a0a2a' : (arche === 'looter' ? '#8a5f1a' : COL.enemyEdge));
    var e = {
      x: ex, y: ey, vx: 0, vy: 0, hp: baseHp, maxhp: baseHp, r: r,
      fireCd: rand(1.6, 3.0), tier: etier, arche: arche, ram: arche === 'ram' || arche === 'split',
      elite: elite, healCd: rand(2.5, 4.5), burst: 0,
      zig: arche === 'looter' ? rand(0, 6.28) : 0, fleeing: false, lootStolen: null,
      rarity: elite ? (Math.random() < 0.5 ? 'purple' : 'blue') : rollRarity(etier),
      flash: 0, wake: 0, dmgMul: tierDmgMul() * (elite ? 1.2 : 1),
      burn: 0, burnT: 0, small: false, col: ecol, edge: eedge, bigBullet: arche === 'gunship',
      hitT: 0, hitMag: 0
    };
    if (arche === 'looter' && !run.looterWarned) { run.looterWarned = true; banner = { text: '⚠ 劫掠者出现！它会偷走你已捡的战利品，快击落它夺回！', life: 3.2 }; AudioSys.sfx.stolen(); }
    enemies.push(e); return e;
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
    bullets.push({ x: x, y: y, lastx: x, lasty: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: dmg, from: from, r: br, life: 3,
      pierce: opts.pierce || 0, homing: !!opts.homing, explode: opts.explode || 0, crit: !!opts.crit, burn: opts.burn || 0, lifesteal: opts.lifesteal || 0, chain: opts.chain || 0, boss: !!opts.boss, kind: bkind, elem: opts.elem || null });
  }
  function dropLoot(x, y, rarity) {
    var pool = LOOT_NAMES[rarity] || LOOT_NAMES.white;
    var name = pool[randi(0, pool.length - 1)];
    loot.push({ x: x, y: y, rarity: rarity, name: name, slot: pickSlot(), vx: rand(-18, 18), vy: rand(-18, 18), life: 22, age: 0 });
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
      var el = document.createElement('div'); el.className = 'chip r-' + it.rarity;
      el.title = RARNAME[it.rarity] + ' · ' + it.name + ' · 价值' + RARVAL[RAR.indexOf(it.rarity)];
      el.textContent = it.name.charAt(0);
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
    if (affix === 0) player.dmg = Math.min(220, player.dmg * 1.05);
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
        x: ap.x - 65, y: ap.y - 65, w: 130, h: 130,
        label: String.fromCharCode(65 + i), // A / B / C
        state: 'closed',
        timer: 35 + i * 18 + rand(0, 8), // 首轮错开，避免所有点同时开
        prog: 0, guardCd: EXTRACT.guardCd
      });
    }
  }
  function updateExtractPoints(dt) {
    for (var i = 0; i < extractPoints.length; i++) {
      var z = extractPoints[i];
      z.timer -= dt;
      if (z.state === 'closed') {
        if (z.timer <= 0) { z.state = 'warning'; z.timer = EXTRACT.warnDur; }
      } else if (z.state === 'warning') {
        if (z.timer <= 0) {
          z.state = 'open'; z.timer = EXTRACT.openDur; z.guardCd = EXTRACT.guardCd * 0.5;
          banner = { text: '撤离点 ' + z.label + ' 已开放！冲入光柱读条 2.8s 带出战利品（敌人正在围堵）', life: 3 };
        }
      } else if (z.state === 'open') {
        // 围堵增援：开放期在撤离点周围刷守卫，制造冲入压力
        z.guardCd -= dt;
        if (z.guardCd <= 0 && enemies.length < 30) {
          z.guardCd = EXTRACT.guardCd;
          var ga = rand(0, 6.28), gd = rand(170, 300);
          var gx = clamp(z.x + z.w / 2 + Math.cos(ga) * gd, 30, WORLD_W - 30);
          var gy = clamp(z.y + z.h / 2 + Math.sin(ga) * gd, 30, WORLD_H - 30);
          var ge = spawnEnemy(gx, gy, 1 + (run.tier - 1));
          ge.wake = 0; // 直接激活，立即向玩家压上
        }
        if (z.timer <= 0) { z.state = 'closed'; z.timer = rand(EXTRACT.gapMin, EXTRACT.gapMax); z.prog = 0; banner = { text: '撤离点 ' + z.label + ' 已关闭', life: 2.2 }; }
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
    banner = { text: b.kind === 'qiongqi' ? ('穷奇·阶段 ' + p + '！') : (p === 2 ? 'BOSS 狂暴！' : (p === 3 ? 'BOSS 末路！弹幕倾泻' : 'BOSS 阶段 ' + p)), life: 1.5 };
    AudioSys.sfx.bossPhase();
  }
  function spawnBoss() {
    bossSpawned = true;
    var qiongqi = run.tier >= 3;
    var hp = (620 + Math.floor(gameTime) * 5) * (1 + (run.tier - 1) * 0.7);
    if (qiongqi) hp *= 0.92;
    boss = { kind: qiongqi ? 'qiongqi' : 'taowu', x: WORLD_W / 2, y: -60, hp: hp, maxhp: hp, r: qiongqi ? 50 : 46, phase: 1, atkCd: 2.6, burstCd: 4.0, flash: 0, wake: 1.2, ang: 0,
      summonCd: 6, dashCd: 4, dashing: 0, dashWarn: 0, summonWarn: 0, invuln: 0, hitT: 0, hitMag: 0 };
    banner = { text: qiongqi ? '⚠ 穷奇·掠食 来袭！（突进+召唤）' : '⚠ BOSS 来袭！击败可获大量战利品', life: 2.4 };
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
    if (b.kind === 'qiongqi') updateQiongqi(b, dt, dx, dy, d); else updateTaowu(b, dt, dx, dy, d);
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
  function killBoss() {
    if (!boss) return;
    run.killedBoss = true; if (!meta.bossCleared) meta.bossCleared = true; saveMeta();
    run.enemyKills.boss = (run.enemyKills.boss || 0) + 1;
    // 死亡反馈：白闪 + 大爆裂双环 + 长抖 + 长顿帧
    burst(boss.x, boss.y, '#B37FD0', 30, { ring: true, ringR: 90, r0: 10 });
    burst(boss.x, boss.y, '#B03A3A', 16, { ring: true, ringR: 60 });
    addShake(6, 420, 150, true); addFreeze(180); addTint('#ffffff', 0.4); screenFlash = { color: '#ffffff', a: 0.4 };
    AudioSys.sfx.bossDie();
    var drops = boss.kind === 'qiongqi'
      ? ['orange', 'purple', 'purple', 'blue', 'blue', 'green']
      : ['purple', 'purple', 'orange', 'blue', 'blue', 'green'];
    for (var i = 0; i < drops.length; i++) dropLoot(boss.x + rand(-45, 45), boss.y + rand(-45, 45), drops[i]);
    if (boss.kind === 'qiongqi') dropLoot(boss.x, boss.y, 'orange'); // 穷奇牙
    floatText(boss.x, boss.y - 30, 'BOSS 击破！', '#B37FD0');
    banner = { text: '★ BOSS 击破！搜刮战利品并撤离带出', life: 2.6 };
    // 保底：击破后强制开放至少一个撤离点，避免打完无路可撤
    var anyOpen = extractPoints.some(function (p) { return p.state === 'open'; });
    if (!anyOpen && extractPoints.length) {
      var zb = extractPoints[0];
      zb.state = 'open'; zb.timer = EXTRACT.openDur; zb.guardCd = EXTRACT.guardCd * 0.5; zb.prog = 0;
      banner = { text: '★ BOSS 击破！撤离点 ' + zb.label + ' 已开启，立即撤离带出战利品', life: 3.6 };
    }
    boss = null;
  }

  // ---------- 结算 ----------
  function finishRun(outcome) {
    if (scene !== 'mission') return;
    showScene('result');
    var killReward = Math.floor(run.kills * 2) + (outcome === 'success' ? 30 : outcome === 'abandon' ? 10 : 0);
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
    for (var i = enemies.length - 1; i >= 0; i--) { var e = enemies[i]; if (e.wake > 0) continue; e.hp -= player.dmg * 1.2; e.flash = 0.1; e.hitT = 0.1; e.hitMag = 2; if (e.hp <= 0) onEnemyDeath(e, true); }
    if (boss) { boss.hp -= player.dmg * 1.2; boss.flash = 0.12; }
    screenFlash = { color: '#CFE8FF', a: 0.3 }; addShake(3, 180, 70); AudioSys.sfx.explode();
    for (var s2 = 0; s2 < 5; s2++) { var lx = rand(40, W - 40); spawnParticle({ x: lx, y: -10, vx: 0, vy: 620, life: 0.5, color: '#CFE8FF', r: 2 }); }
  }
  function onEnemyDeath(e, fromExpl) {
    if (!e || e.dead) return;
    e.dead = true;
    spawnVfx('vfx_enemy_death', e.x, e.y, 56, 0.5, rand(0, 6.28));
    if (!fromExpl && player.killExplode > 0) explodeAt(e.x, e.y, player.killExplode, Math.max(10, player.dmg * 0.9));
    if (e.arche === 'looter' && e.lootStolen) { run.loot.push({ rarity: e.lootStolen.rarity, name: e.lootStolen.name, slot: e.lootStolen.slot || pickSlot() }); run.picked++; floatText(e.x, e.y - 18, '夺回战利品!', COL.extract, 'crit'); }
    if (e.elite) { burst(e.x, e.y, COL.elite, 18, { ring: true, ringR: 60 }); spawnVfx('vfx_explosion_sheet', e.x, e.y, 80, 0.7, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 12 }); addShake(4, 200, 90); addFreeze(90); AudioSys.sfx.eliteDie(); }
    else if (e.arche === 'split' && !e.small) { burst(e.x, e.y, RARCOL.purple, 12, { ring: true, ringR: 44 }); spawnVfx('vfx_explosion_sheet', e.x, e.y, 64, 0.6, rand(0, 6.28), 0, { cols: 4, rows: 2, fps: 12 }); addShake(3.5, 160, 70); addFreeze(90); AudioSys.sfx.enemyDie(); }
    else { burst(e.x, e.y, e.col || COL.enemy, 6); addFreeze(90); AudioSys.sfx.enemyDie(); }
    dropLoot(e.x, e.y, e.rarity);
    if (e.elite) dropLoot(e.x + 10, e.y, 'green');
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
    var targetvx = dirx * curSpeed * mag, targetvy = diry * curSpeed * mag;
    var k = Math.min(1, 9 * dt);
    player.vx += (targetvx - player.vx) * k; player.vy += (targetvy - player.vy) * k;
    if (mag < 0.05) { player.vx *= Math.pow(0.02, dt); player.vy *= Math.pow(0.02, dt); }
    if (player.dashCd > 0) player.dashCd -= dt;
    if ((keys['shift'] || dashBtnPressed) && player.dashCd <= 0) {
      player.vx *= 2.3; player.vy *= 2.3; player.iframe = 0.3; player.dashCd = 1.5;
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
    if (player.galeActive) player.iframe = Math.max(player.iframe, 0.1);
    if (player.flash > 0) player.flash -= dt;
    if (muzzle.life > 0) muzzle.life -= dt;
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
    player.ang = Math.atan2(aimy, aimx); player.fireCd -= dt;
    var firing = isMobile ? fireBtn.active : (mouse.down || keys[' ']);
    if (firing && player.fireCd <= 0) {
      var res = elemResonance();
      var shotElem = pickOwnedElem();
      for (var p = 0; p < player.pellets; p++) {
        var off = player.pellets === 1 ? 0 : (p - (player.pellets - 1) / 2) * 0.16;
        var ang = player.ang + off;
        var crit = Math.random() < player.critChance;
        var dmg = player.dmg * res * (crit ? player.critMult : 1);
        fireBullet(player.x + Math.cos(ang) * 18, player.y + Math.sin(ang) * 18, ang, 'player', dmg, player.bulletSpeed,
          { pierce: player.pierce, homing: player.homing, explode: player.explode, crit: crit, burn: player.burn, lifesteal: player.lifesteal, chain: player.chain, elem: shotElem });
      }
      AudioSys.sfx.shoot();
      player.fireCd = 1 / player.fireRate;
      // 枪口闪光 + 开火轻抖（§2.1）
      muzzle.x = player.x + Math.cos(player.ang) * 20; muzzle.y = player.y + Math.sin(player.ang) * 20; muzzle.ang = player.ang; muzzle.life = 0.05;
    }
    if (player.shield < player.maxshield) player.shield = Math.min(player.maxshield, player.shield + player.regen * dt);

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

    // 刷怪
    spawnTimer -= dt;
    var interval = clamp(3.4 - gameTime * 0.006, 1.6, 3.4) / (1 + (run.tier - 1) * 0.3);
    if (spawnTimer <= 0 && enemies.length < 28 && !exfil) { spawnEnemy(); spawnTimer = interval; }

    // 搜刮点
    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni]; nd.pulse += dt * 3;
      if (nd.collected) { nd.respawn -= dt; if (nd.respawn <= 0) relocateNode(nd); continue; }
      if (dist2(nd.x, nd.y, player.x, player.y) < (nd.r + player.pickR * 0.6) * (nd.r + player.pickR * 0.6)) collectNode(nd);
    }
    updateExtractPoints(dt); // 撤离点限时开放状态机 + 围堵
    updateVaults(dt); // 封印/符文宝箱状态机（解封/击柱解锁）
    if (!bossSpawned && run.nodes >= 3 + run.tier) spawnBoss();

    // 撤离（三角洲式：仅「开放」点可读条；关闭/预兆飞入无效）
    exfil = false;
    if (extractPoints && extractPoints.length) {
      for (var ei2 = 0; ei2 < extractPoints.length; ei2++) {
        var ez = extractPoints[ei2];
        if (ez.state !== 'open') continue;
        var inside = player.x > ez.x && player.x < ez.x + ez.w && player.y > ez.y && player.y < ez.y + ez.h;
        if (inside) {
          exfil = true; ez.prog = Math.min(1, ez.prog + dt / 2.8);
          if (ez.prog >= 1) { AudioSys.sfx.extract(); finishRun('success'); }
        } else { ez.prog = Math.max(0, ez.prog - dt / 4); }
      }
    }

    // 敌人
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.burnT > 0) { e.hp -= e.burn * dt; e.burnT -= dt; if (e.hp <= 0) { onEnemyDeath(e); continue; } }
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
      var es = (e.elite ? 1.3 : 1) * (e.boost || 1);
      var ef = (enemiesSlowT > 0 ? enemiesSlowFactor : 1);
      if (player.slowAuraR > 0 && d < player.slowAuraR) ef *= player.slowFactor;
      var baseSpeed = (e.arche === 'turret' ? 22 : (e.arche === 'gunship' ? 45 : (e.arche === 'heal' ? 40 : (e.ram ? 70 + e.tier * 8 : 52 + e.tier * 6))));
      if (e.arche === 'shoot' || e.arche === 'heal') {
        var keep = e.arche === 'heal' ? 320 : 250;
        var av = avoidObstacles(e, e.r, player.x, player.y);
        e.x += av.x * baseSpeed * es * ef * dt * (d > keep ? 1 : -0.6);
        e.y += av.y * baseSpeed * es * ef * dt * (d > keep ? 1 : -0.6);
      } else if (e.arche === 'turret') {
        var av2 = avoidObstacles(e, e.r, player.x, player.y);
        e.x += av2.x * baseSpeed * es * ef * dt; e.y += av2.y * baseSpeed * es * ef * dt;
      } else { // ram / split
        var av3 = avoidObstacles(e, e.r, player.x, player.y);
        e.x += av3.x * baseSpeed * es * ef * dt; e.y += av3.y * baseSpeed * es * ef * dt;
      }
      resolveObstacles(e, e.r);
      // 空域：敌人受障碍与边界约束
      for (var oi2 = 0; oi2 < obstacles.length; oi2++) { var ob2 = obstacles[oi2]; if (ob2.type === 'rift' && dist2(e.x, e.y, ob2.x, ob2.y) < (ob2.r + e.r) * (ob2.r + e.r)) e.hp -= ob2.dps * dt; }
      if (e.hp <= 0 && !e.dead) { onEnemyDeath(e, true); continue; }
      if (e.flash > 0) e.flash -= dt;
      if (e.hitT > 0) e.hitT -= dt;
      // 开火
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
      if (e.arche === 'heal') {
        e.healCd -= dt;
        if (e.healCd <= 0) {
          var healed = false;
          for (var h = 0; h < enemies.length; h++) { var o = enemies[h]; if (o !== e && dist2(o.x, o.y, e.x, e.y) < 130 * 130 && o.hp < o.maxhp) { o.hp = Math.min(o.maxhp, o.hp + 22); healed = true; } }
          if (healed) { burst(e.x, e.y, '#8FD8C0', 8, { ring: true, ringR: 30 }); }
          e.healCd = 3.5;
        }
      }
    }
    if (boss) updateBoss(dt);

    // 子弹
    for (var b = bullets.length - 1; b >= 0; b--) {
      var bl = bullets[b];
      bl.lastx = bl.x; bl.lasty = bl.y;
      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
      // 空域：子弹由下方岩石/隔断墙碰撞处理，天空不做实体拦截
      if (bl.life <= 0 || bl.x < -60 || bl.x > WORLD_W + 60 || bl.y < -60 || bl.y > WORLD_H + 60) { bullets.splice(b, 1); continue; }
      var _blk = false, _bsr = bl.r || 3;
      for (var oi3 = 0; oi3 < obstacles.length; oi3++) {
        var _ob = obstacles[oi3];
        if (_ob.type === 'rock') { if (dist2(bl.x, bl.y, _ob.x, _ob.y) < _ob.r * _ob.r) { _blk = true; break; } }
        else if (_ob.type === 'wall') { if (bl.x > _ob.x - _ob.hw - _bsr && bl.x < _ob.x + _ob.hw + _bsr && bl.y > _ob.y - _ob.hh - _bsr && bl.y < _ob.y + _ob.hh + _bsr) { _blk = true; break; } }
      }
      if (_blk) { if (bl.from === 'player') burst(bl.x, bl.y, '#9fd0e0', 3); bullets.splice(b, 1); continue; }
      // 符文柱（符文宝箱解谜目标）：玩家子弹可击破
      if (bl.from === 'player' && totems.length) {
        for (var _ti = totems.length - 1; _ti >= 0; _ti--) {
          var _tm = totems[_ti]; if (_tm.dead) continue;
          if (dist2(bl.x, bl.y, _tm.x, _tm.y) < (_tm.r + _bsr) * (_tm.r + _bsr)) {
            _tm.hp -= bl.dmg * (bl.crit ? 1.8 : 1); burst(bl.x, bl.y, '#B06FD0', 3);
            if (_tm.hp <= 0) { _tm.dead = true; burst(_tm.x, _tm.y, '#C79BE8', 14, { ring: true, ringR: 32 }); AudioSys.sfx.hit(); checkVaultTotems(_tm.vid); }
            break;
          }
        }
      }
      if (bl.from === 'player') {
        if (bl.homing) {
          var tgt = nearestEnemy(bl.x, bl.y);
          if (tgt) { var desired = Math.atan2(tgt.y - bl.y, tgt.x - bl.x); var cur = Math.atan2(bl.vy, bl.vx); var nd2 = cur + clamp(angDiff(desired, cur), -4 * dt, 4 * dt); var sp = Math.hypot(bl.vx, bl.vy); bl.vx = Math.cos(nd2) * sp; bl.vy = Math.sin(nd2) * sp; }
        }
        var consumed = false;
        if (boss && boss.wake <= 0 && dist2(bl.x, bl.y, boss.x, boss.y) < (boss.r + bl.r) * (boss.r + bl.r)) {
          var bdmg = bl.dmg;
          if (player.execute && boss.hp < boss.maxhp * 0.5) bdmg *= 2;
          boss.hp -= bdmg; boss.flash = 0.08; boss.hitT = 0.12; boss.hitMag = 1.4;
          if (bl.elem) handleElement(boss, bl.elem, bdmg);
          AudioSys.sfx.hit();
          burst(bl.x, bl.y, BULLET_COL.boss, bl.crit ? 10 : 6, { smin: 80, smax: 240, lmin: 0.2, lmax: 0.35 });
          floatText(boss.x, boss.y - boss.r - 8, '-' + Math.round(bdmg), bl.crit ? BULLET_COL.buff : '#F4EFE6', bl.crit ? 'crit' : 'normal');
          if (bl.lifesteal > 0) { var hb = Math.round(bl.dmg * bl.lifesteal); player.hp = Math.min(player.maxhp, player.hp + hb); floatText(player.x, player.y - 20, '+' + hb, '#8FD8C0', 'heal'); }
          if (boss.hp <= 0) killBoss();
          if (bl.pierce > 0) bl.pierce--; else { bullets.splice(b, 1); consumed = true; }
        }
        if (!consumed) {
          for (var ei = 0; ei < enemies.length; ei++) {
            var en = enemies[ei];
            if (dist2(bl.x, bl.y, en.x, en.y) < (en.r + bl.r) * (en.r + bl.r)) {
              var dmg0 = bl.dmg;
              if (player.execute && en.hp < en.maxhp * 0.5) dmg0 *= 2;
              en.hp -= dmg0; en.flash = 0.08; en.hitT = 0.1; en.hitMag = bl.crit ? 3 : 2.2;
              spawnVfx('vfx_hit_spark', bl.x, bl.y, 26, 0.28);
              if (bl.elem) handleElement(en, bl.elem, dmg0);
              if (player.freezeChance > 0 && Math.random() < player.freezeChance && en.wake <= 0) { en.freezeT = 1.1; spawnVfx('vfx_frost', en.x, en.y, 34, 0.55, rand(0, 6.28)); }
              if (bl.crit) AudioSys.sfx.crit(); else AudioSys.sfx.hit();
              var dnum = Math.round(dmg0);
              burst(bl.x, bl.y, bl.crit ? BULLET_COL.buff : COL.enemy, bl.crit ? 10 : 5, { smin: 60, smax: bl.crit ? 260 : 200, lmin: 0.18, lmax: bl.crit ? 0.4 : 0.32 });
              if (bl.crit) { addTint('#ffffff', 0.12); spawnRing(en.x, en.y, '#FFE9A8', 22); spawnVfx('vfx_crit_flash', en.x, en.y, 48, 0.4); floatText(en.x, en.y - en.r - 6, '暴击 -' + dnum, BULLET_COL.buff, 'crit'); }
              else { floatText(en.x, en.y - en.r - 6, '-' + dnum, '#F4EFE6', 'normal'); }
              if (bl.explode > 0) { for (var ex2 = 0; ex2 < enemies.length; ex2++) { if (ex2 !== ei && dist2(en.x, en.y, enemies[ex2].x, enemies[ex2].y) < bl.explode * bl.explode) { enemies[ex2].hp -= bl.dmg * 0.6; enemies[ex2].flash = 0.06; enemies[ex2].hitT = 0.08; enemies[ex2].hitMag = 1.5; } } burst(bl.x, bl.y, '#D98A3D', 10); AudioSys.sfx.explode(); }
              if (bl.chain > 0) { var chained = 0; for (var cx = 0; cx < enemies.length && chained < bl.chain; cx++) { if (cx !== ei && dist2(en.x, en.y, enemies[cx].x, enemies[cx].y) < 140 * 140) { enemies[cx].hp -= bl.dmg * 0.5; enemies[cx].flash = 0.05; enemies[cx].hitT = 0.08; enemies[cx].hitMag = 1.5; chained++; } } }
              if (player.overload && bl.crit) { for (var ox = 0; ox < enemies.length; ox++) { if (ox !== ei && dist2(en.x, en.y, enemies[ox].x, enemies[ox].y) < 160 * 160) { enemies[ox].hp -= dmg0 * 0.7; enemies[ox].flash = 0.06; enemies[ox].hitT = 0.08; enemies[ox].hitMag = 1.5; if (enemies[ox].hp <= 0) onEnemyDeath(enemies[ox], true); } } spawnRing(en.x, en.y, '#CFE8FF', 20); }
              if (bl.burn > 0) { en.burn = Math.max(en.burn || 0, bl.burn); en.burnT = 3; }
              if (dmg0 > bl.dmg && en.hp > 0) floatText(en.x, en.y - en.r - 20, '噬魂!', '#C94F4F', 'crit');
              if (bl.lifesteal > 0) { var h1 = Math.round(bl.dmg * bl.lifesteal); player.hp = Math.min(player.maxhp, player.hp + h1); floatText(player.x, player.y - 20, '+' + h1, '#8FD8C0', 'heal'); }
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
        if (run.loot.length < lootCap) {
          run.loot.push({ rarity: it.rarity, name: it.name, slot: it.slot || pickSlot() }); run.picked++;
          AudioSys.sfx.pickup(it.rarity);
          var v = RARVAL[RAR.indexOf(it.rarity)]; floatText(it.x, it.y, '+' + v + ' ' + RARNAME[it.rarity], RARCOL[it.rarity]);
          // 概率掉落丹药（金/紫箱更易出）
          if (Math.random() < (it.rarity === 'orange' ? 0.5 : it.rarity === 'purple' ? 0.32 : it.rarity === 'blue' ? 0.18 : 0.07)) {
            var ck = ['bomb', 'shield', 'heal', 'slow'][randi(0, 3)]; addConsumable(ck);
          }
        }
        var pr = it.rarity;
        if (pr === 'orange') { burst(it.x, it.y, RARCOL.orange, 16, { ring: true, ringR: 34 }); spawnRing(it.x, it.y, RARCOL.orange, 30); }
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
    nd.collected = true; nd.respawn = 13; run.nodes++;
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
    var guards = c.key === 'secret' ? 2 : (c.key === 'gold' ? 2 : (run.nodes <= 3 ? 1 : randi(1, 2)));
    for (var g = 0; g < guards; g++) { var ang = rand(0, 6.28), dd = rand(300, 430); var gx = clamp(nd.x + Math.cos(ang) * dd, 24, WORLD_W - 24); var gy = clamp(nd.y + Math.sin(ang) * dd, 24, WORLD_H - 24); var ge = spawnEnemy(gx, gy, c.key === 'secret' ? 2 : 1); ge.wake = 1.0; ge.fireCd = rand(2.0, 3.4); }
    if (c.key !== 'wood') banner.life = Math.max(banner.life, 1.6);
  }
  function relocateNode(nd) {
    var x, y, t = 0;
    do { x = rand(W * 0.08, W * 0.92); y = rand(H * 0.08, H * 0.6); t++; } while ((dist2(x, y, player.x, player.y) < 170 * 170 || nodes.some(function (o) { return o !== nd && dist2(x, y, o.x, o.y) < 120 * 120; })) && t < 80);
    nd.x = x; nd.y = y; nd.collected = false; nd.chest = rollChestTier(); nd.pulse = rand(0, 6);
  }
  function damagePlayer(dmg) {
    player.flash = 0.13;
    if (exfil) dmg *= 0.9; // 撤离期间飞船掩护，小幅减伤
    if (player.shield > 0) { var ab = Math.min(player.shield, dmg); player.shield -= ab; dmg -= ab; if (player.undying && !player.undyingUsed && player.shield <= 0) { player.undyingUsed = true; player.hp = Math.min(player.maxhp, player.hp + Math.round(player.maxhp * 0.3)); floatText(player.x, player.y - 24, '厚德!', '#8FD8C0', 'heal'); AudioSys.sfx.heal(); } }
    if (dmg > 0) player.hp -= dmg;
    if (player.guardShock) explodeAt(player.x, player.y, player.guardShock, Math.max(8, player.dmg * 0.4)); // 土·山岳：受击范围震击
    addShake(3.2, 150, 60); screenFlash = { color: '#C94F4F', a: 0.22 };
    AudioSys.sfx.playerHit();
    if (player.hp <= 0) { player.hp = 0; burst(player.x, player.y, player.color, 16); addShake(6, 260, 120, true); AudioSys.sfx.playerDie(); finishRun('death'); }
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
  function drawVaults() {
    for (var i = 0; i < vaults.length; i++) {
      var v = vaults[i], done = v.state === 'done';
      ctx.save(); ctx.translate(v.x, v.y);
      ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(0, v.r * 0.5, v.r * 1.1, v.r * 0.5, 0, 0, 7); ctx.fill();
      var rgb = v.type === 'seal' ? '224,184,74' : '176,111,208';
      var ringA = done ? 0.15 : (v.state === 'opening' ? 0.6 + Math.sin(gameTime * 8) * 0.3 : 0.4);
      ctx.strokeStyle = 'rgba(' + rgb + ',' + ringA + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, v.r + 14, 0, 7); ctx.stroke();
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
    var bank = clamp(player.vx / 400, -0.5, 0.5);
    var craft = run.aircraft || 'a';
    var psz = PSIZE[craft] || 50;
    var speed = Math.hypot(player.vx, player.vy);
    var boosting = player.iframe > 0 || speed > player.speed * 0.58;
    var sheetKey = 'ply_' + craft + (boosting ? '_boost_sheet' : '_sheet');
    var frame = Math.floor(gameTime * (boosting ? 14 : 10)) % 8;
    var drawn = blitSheet(sheetKey, player.x, player.y, psz, psz, player.ang + Math.PI / 2, 4, 2, frame);
    if (!drawn && !blit('ply_' + craft, player.x, player.y, psz, psz, player.ang + Math.PI / 2)) {
      ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.ang + Math.PI / 2 + bank * 0.3);
      ctx.shadowColor = player.color; ctx.shadowBlur = 10; ctx.fillStyle = player.iframe > 0 ? '#fff' : player.color; ctx.strokeStyle = COL.playerEdge; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(11, 13); ctx.lineTo(0, 7); ctx.lineTo(-11, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore(); ctx.shadowBlur = 0;
    }
    if (player.iframe > 0) { ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(player.x, player.y, psz * 0.46, 0, 7); ctx.fill(); ctx.restore(); }
    if (player.flash > 0) { ctx.fillStyle = 'rgba(201,79,79,0.3)'; ctx.beginPath(); ctx.arc(player.x, player.y, 20, 0, 7); ctx.fill(); }
    if (glowOn && muzzle.life > 0) { ctx.save(); ctx.translate(muzzle.x, muzzle.y); ctx.rotate(muzzle.ang); ctx.globalAlpha = clamp(muzzle.life / 0.05, 0, 1); ctx.drawImage(getGlow('#cffcff'), -14, -14, 28, 28); ctx.globalAlpha = 1; ctx.restore(); }
    for (var di = 0; di < player.droneList.length; di++) { var dr = player.droneList[di]; ctx.fillStyle = '#A8E8D5'; ctx.shadowColor = '#A8E8D5'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(dr.x, dr.y, 5, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    if (player.shield > 0) {
      var bua = IMG['vfx_buff_aura'];
      if (bua && bua.complete && bua.naturalWidth > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + Math.sin(gameTime * 4) * 0.18;
        ctx.translate(player.x, player.y); ctx.rotate(gameTime * 0.4); ctx.drawImage(bua, -42, -42, 84, 84); ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      } else { ctx.save(); ctx.globalAlpha = 0.4 + Math.sin(gameTime * 4) * 0.15; ctx.strokeStyle = '#C9A24B'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, 26, 0, 7); ctx.stroke(); ctx.restore(); }
    }
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
      var esz = (e.small ? 24 : (ESIZE[e.arche] || 42)) + (e.elite ? 10 : 0);
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
        } else {
          // ram / shoot：六边形
          var n = 6; ctx.beginPath(); for (var k = 0; k < n; k++) { var a = (k / n) * 6.28; var rr = e.r * (k % 2 ? 0.7 : 1); var px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      if (e.elite) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, 7); ctx.stroke(); }
      ctx.restore(); ctx.shadowBlur = 0;
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
    var bhx = 0, bhy = 0;
    if (b.hitT > 0) { var bhk = b.hitMag * (b.hitT / 0.12); bhx = rand(-bhk, bhk); bhy = rand(-bhk, bhk); }
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
    var bsz = b.r * 2.5;
    var qang = Math.atan2(player.y - b.y, player.x - b.x);
    var bok = (b.kind === 'qiongqi') ? blit('boss_qiongqi', 0, 0, bsz, bsz, qang)
                                     : blit('boss_taowu', 0, 0, bsz, bsz, gameTime * 0.25);
    if (!bok) {
      // 回退：原几何 Boss
      ctx.shadowColor = col; ctx.shadowBlur = 16;
      ctx.fillStyle = b.flash > 0 ? '#fff' : col; ctx.strokeStyle = '#2a0a2a'; ctx.lineWidth = 3;
      if (b.kind === 'qiongqi') {
        // 前倾捕食箭头 / 双翼刃
        ctx.rotate(qang);
        ctx.beginPath(); ctx.moveTo(b.r, 0); ctx.lineTo(-b.r * 0.7, -b.r * 0.85); ctx.lineTo(-b.r * 0.3, 0); ctx.lineTo(-b.r * 0.7, b.r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#8A6FB8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.r, 0); ctx.lineTo(-b.r * 0.3, 0); ctx.stroke();
      } else {
        // 梼杌：旋转八尖 + 封印冠 + 弱点核心
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
  function drawBullets() {
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
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
      var ang = Math.atan2(b.vy, b.vx);
      var bsz = Math.max(13, b.r * 3.4);
      if (!blit(bulletSprite(b), b.x, b.y, bsz, bsz, ang)) {
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
      var it = loot[i]; var age = it.age || 0; var col = RARCOL[it.rarity];
      var bob = Math.sin(age * 3 + i) * 2;
      var rot = age * (it.rarity === 'purple' ? 1.6 : (it.rarity === 'orange' ? 1.2 : 0.8));
      var lk = (it.rarity === 'purple' || it.rarity === 'orange') ? 'loot_rare' : 'loot_common';
      if (blit(lk, it.x, it.y + bob, 22, 22, rot)) continue;
      ctx.save(); ctx.translate(it.x, it.y + bob); ctx.rotate(rot);
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
    for (var pi = 0; pi < extractPoints.length; pi++) {
      var z = extractPoints[pi], cx = z.x + z.w / 2, cy = z.y + z.h / 2;
      if (z.state === 'open') {
        var col = COL.extract;
        // 光柱 beacon：从地面射向天空的半透明青柱
        var bg = ctx.createLinearGradient(0, z.y + z.h, 0, z.y - 140);
        bg.addColorStop(0, 'rgba(143,216,192,0.55)'); bg.addColorStop(1, 'rgba(143,216,192,0)');
        ctx.fillStyle = bg; ctx.fillRect(z.x - 12, z.y - 140, z.w + 24, z.h + 140);
        // 读条填充（站住越久越亮）
        ctx.fillStyle = 'rgba(143,216,192,' + (0.18 + 0.42 * z.prog) + ')';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        var period = 1.1, tt = (gameTime % period) / period;
        ctx.strokeStyle = col; ctx.globalAlpha = (1 - tt) * 0.5 + 0.5; ctx.lineWidth = 3; ctx.strokeRect(z.x, z.y, z.w, z.h); ctx.globalAlpha = 1;
        ctx.fillStyle = col; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('撤离点' + z.label + ' ' + Math.floor(z.prog * 100) + '%', cx, z.y - 12);
        ctx.font = '11px sans-serif'; ctx.fillText('开放 ' + Math.ceil(z.timer) + 's', cx, z.y + z.h + 16); ctx.textAlign = 'left';
      } else if (z.state === 'warning') {
        // 预兆：橙色虚线闪烁 + 倒计时
        var a = 0.4 + 0.6 * Math.abs(Math.sin(gameTime * 8));
        ctx.strokeStyle = '#E0B84A'; ctx.globalAlpha = a; ctx.lineWidth = 3; ctx.setLineDash([9, 6]); ctx.strokeRect(z.x, z.y, z.w, z.h); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.fillStyle = '#E0B84A'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('撤离点' + z.label + ' 即将开放 ' + Math.ceil(z.timer) + 's', cx, z.y - 10); ctx.textAlign = 'left';
      } else {
        // 关闭：暗灰细框 + 静默倒计时
        ctx.strokeStyle = 'rgba(120,130,140,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(z.x, z.y, z.w, z.h);
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
    if (extractPoints) for (var mpi = 0; mpi < extractPoints.length; mpi++) {
      var mz = extractPoints[mpi];
      var pulse = 1.4 + Math.sin(gameTime * 5) * 0.9; // 呼吸脉冲，撤离点更醒目
      var mc = mz.state === 'open' ? COL.extract : (mz.state === 'warning' ? '#E0B84A' : 'rgba(120,130,140,0.85)');
      ctx.fillStyle = mc;
      ctx.fillRect(mx + mz.x * sx - pulse * 0.5, my + mz.y * sy - pulse * 0.5, mz.w * sx + pulse, mz.h * sy + pulse);
    }
    for (var oi = 0; oi < obstacles.length; oi++) { var ob = obstacles[oi]; ctx.fillStyle = ob.type === 'rock' ? 'rgba(150,160,175,0.9)' : (ob.type === 'wall' ? 'rgba(120,130,145,0.9)' : 'rgba(176,111,208,0.9)'); var os = ob.type === 'rock' ? 3 : (ob.type === 'wall' ? 7 : 2.5); if (ob.type === 'wall') ctx.fillRect(mx + (ob.x - ob.hw) * sx, my + (ob.y - ob.hh) * sy, ob.hw * 2 * sx, ob.hh * 2 * sy); else ctx.fillRect(mx + ob.x * sx - os / 2, my + ob.y * sy - os / 2, os, os); }
    for (var vi2 = 0; vi2 < vaults.length; vi2++) { var vz = vaults[vi2]; if (vz.state === 'done') continue; ctx.fillStyle = vz.type === 'seal' ? '#E0B84A' : '#B06FD0'; ctx.save(); ctx.translate(mx + vz.x * sx, my + vz.y * sy); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
    for (var ti2 = 0; ti2 < totems.length; ti2++) { var tz = totems[ti2]; if (tz.dead) continue; ctx.fillStyle = '#C79BE8'; ctx.fillRect(mx + tz.x * sx - 1.5, my + tz.y * sy - 1.5, 3, 3); }
    if (boss) { ctx.fillStyle = '#B37FD0'; ctx.beginPath(); ctx.arc(mx + boss.x * sx, my + boss.y * sy, 4, 0, 7); ctx.fill(); }
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
    else if (res > 1) { runeLine = '系共鸣 +10% 伤害'; runeCol = '#D9B64A'; }
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
  function render() {
    if (scene !== 'mission') { drawGrid(); return; }
    var k = shake.t > 0 ? Math.min(shake.mag * Math.exp(-(shake.dur - shake.t) / shake.tau), 6) : 0;
    ctx.save();
    if (k > 0) ctx.translate(rand(-k, k), rand(-k, k)); // 随机短促偏移：一瞬轻晃，不持续不飘（移动跟手）
    ctx.translate(-cam.x, -cam.y); // 相机：把世界坐标平移到屏幕
    drawGrid(); drawObstacles(); drawNodes(); drawVaults(); drawTotems(); drawLoot(); drawExtract(); drawEnemies(); if (boss) drawBoss(); drawVfxLines(); drawBullets(); drawParticles(); drawVfxSprites(); drawPlayer();
    ctx.restore();
    drawHUD();
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
  function renderBase() {
    if (selectedTier > meta.maxTier) selectedTier = meta.maxTier;
    var tr = document.getElementById('tierRow'); tr.innerHTML = '';
    for (var t = 1; t <= 3; t++) {
      var unlocked = t <= meta.maxTier;
      var el = document.createElement('div'); el.className = 'tcard' + (selectedTier === t ? ' picked' : '') + (unlocked ? '' : ' locked');
      el.innerHTML = '<div class="ttitle">第 ' + t + ' 层</div><div class="muted">' + TIERNAME[t - 1] + '</div>' + (unlocked ? '' : '<div class="lock">需通关上层</div>');
      if (unlocked) el.onclick = (function (tt) { return function () { selectedTier = tt; renderBase(); }; })(t);
      tr.appendChild(el);
    }
    var box = document.getElementById('aircraftList'); box.innerHTML = '';
    var grid = document.createElement('div'); grid.className = 'acft-grid';
    ['a', 'b', 'c'].forEach(function (id) {
      var a = AIRCRAFT[id]; var unlocked = meta.unlocked[id];
      var el = document.createElement('div'); el.className = 'acft-card' + (selectedAircraft === id ? ' picked' : '') + (unlocked ? '' : ' locked');
      el.innerHTML = '<div class="acft-ship" style="color:' + a.color + '">' + (SHIP_SVG[id] || SHIP_SVG.a) + '</div>' +
        '<div class="acft-name" style="color:' + a.color + '">' + a.name + '</div>' +
        '<div class="acft-desc">' + a.desc + '</div>' +
        '<div class="acft-stats">HP ' + a.hp + ' · 速度 ' + a.speed + '<br>射速 ' + a.fireRate + ' · 伤害 ' + a.dmg + ' · 弹片 ' + a.pellets + '</div>' +
        (unlocked ? '' : '<div class="acft-lock">需通关第 ' + (a.requireTier || 1) + ' 层 · ' + a.unlockCost + ' 灵玉</div>');
      if (unlocked) el.onclick = function () { selectedAircraft = id; renderBase(); AudioSys.sfx.ui(); };
      grid.appendChild(el);
    });
    box.appendChild(grid);
    var shop = document.getElementById('shopList'); shop.innerHTML = '';
    UPGRADES.forEach(function (u) {
      var lv = meta.up[u.key]; var maxed = lv >= u.max; var cost = u.cost(lv); var afford = meta.currency >= cost;
      var el = document.createElement('div'); el.className = 'shop' + (maxed ? ' maxed' : (afford ? ' canbuy' : ' cant'));
      el.innerHTML = '<div class="sname">' + u.name + '</div><div class="muted">' + u.desc + '</div>' +
        '<div class="lvlbar"><div class="lvlfill" style="width:' + (lv / u.max * 100) + '%"></div></div>' +
        '<div class="slevel">Lv ' + lv + '/' + u.max + ' · ' + (maxed ? '已满级' : ('需 ' + cost + ' 灵玉')) + '</div>';
      if (!maxed && afford) el.onclick = function () { meta.currency -= cost; meta.up[u.key]++; saveMeta(); renderBase(); };
      shop.appendChild(el);
    });
    document.getElementById('resJade').textContent = meta.currency;
    document.getElementById('resArsenal').textContent = meta.arsenal.length;
    document.getElementById('resProgress').textContent = meta.maxTier + '/3';
    document.getElementById('metaInfo').innerHTML = '出击 ' + meta.runs + ' 次 · 最佳击杀 ' + meta.bestKills + (meta.maxTier >= 3 && meta.bossCleared ? ' · <span class="ok">✓ 已通关深渊层</span>' : ' · 目标：逐层通关至第 3 层');
    // 战力预览
    var lv = calcLoadout();
    var lpEl = document.getElementById('loadoutPreview');
    if (lpEl) lpEl.innerHTML = '本局战力：<b>HP ' + lv.hp + '</b> · 伤害 <b>' + lv.dmg.toFixed(1) + '</b> · 射速 <b>' + lv.fr.toFixed(1) + '</b> · 移速 <b>' + lv.spd + '</b> · 护盾 <b>' + lv.sh + '</b> · 弹片 <b>' + lv.pl + '</b> · 暴击 ' + Math.round(lv.cc * 100) + '%' + (lv.pierce ? ' · 穿透 ' + lv.pierce : '');
    renderArsenal(); renderForge(); renderResearch(); renderCodex();
  }
  // ---------- 军械库 / 熔炼台 / 研究院 / 图鉴（ABC）----------
  function modsText(m) {
    var t = [];
    if (m.dmg) t.push('伤害+' + m.dmg); if (m.maxhp) t.push('HP+' + m.maxhp);
    if (m.maxshield) t.push('护盾+' + m.maxshield); if (m.regen) t.push('回盾+' + m.regen);
    if (m.fireRate) t.push('射速+' + m.fireRate); if (m.critChance) t.push('暴击+' + Math.round(m.critChance * 100) + '%');
    if (m.bulletSpeed) t.push('弹速+' + m.bulletSpeed); if (m.speed) t.push('移速+' + m.speed);
    if (m.dodgeChance) t.push('闪避+' + Math.round(m.dodgeChance * 100) + '%'); if (m.pierce) t.push('穿透+' + m.pierce);
    if (m.burn) t.push('灼烧'); if (m.pellets) t.push('弹片+' + m.pellets); if (m.explode) t.push('爆裂');
    return t.join(' · ');
  }
  function getArt(id) { if (!id) return null; for (var i = 0; i < meta.arsenal.length; i++) if (meta.arsenal[i].id === id) return meta.arsenal[i]; return null; }
  function removeArt(id) { for (var i = 0; i < meta.arsenal.length; i++) if (meta.arsenal[i].id === id) { meta.arsenal.splice(i, 1); return; } }
  // 法器评分（用于排序）：稀有度阶梯权重 + 词条数值和
  function artifactScore(a) {
    var m = a.mods || {}, s = RAR.indexOf(a.rarity) * 100;
    s += (m.dmg || 0) * 1 + (m.maxhp || 0) * 0.5 + (m.maxshield || 0) * 0.5 + (m.regen || 0) * 2 +
      (m.fireRate || 0) * 3 + (m.critChance || 0) * 100 + (m.bulletSpeed || 0) * 1 + (m.speed || 0) * 1 +
      (m.dodgeChance || 0) * 80 + (m.pierce || 0) * 8 + (m.pellets || 0) * 10;
    if (m.burn) s += 12; if (m.explode) s += 14;
    return s;
  }
  function equipArtifact(slot, id) {
    meta.equipped[slot] = (meta.equipped[slot] === id) ? null : id; // 点已装备则卸下
    saveMeta(); renderBase();
  }
  function recycleArtifact(id) {
    var a = getArt(id); if (!a) return;
    SLOTS.forEach(function (s) { if (meta.equipped[s] === id) meta.equipped[s] = null; });
    removeArt(id); meta.currency += Math.round(RARVAL[RAR.indexOf(a.rarity)] * 0.5); saveMeta(); renderBase();
  }
  var forgeSel = [];
  function onForgeClick(id) {
    var i = forgeSel.indexOf(id);
    if (i >= 0) { forgeSel.splice(i, 1); renderForge(); return; }
    if (forgeSel.length === 1) {
      var a1 = getArt(forgeSel[0]), a2 = getArt(id);
      if (a1 && a2 && a1.slot === a2.slot && a1.rarity !== 'orange' && a2.rarity !== 'orange') {
        var ri = RAR.indexOf(a1.rarity);
        removeArt(a1.id); removeArt(a2.id);
        meta.arsenal.push(makeArtifact(a1.slot, RAR[ri + 1])); // 同类 2 合 1 → 升一阶（同槽位）
        forgeSel = []; saveMeta(); renderBase(); return;
      }
      forgeSel = [id];
    } else { forgeSel = [id]; }
    renderForge();
  }
  var arsenalTab = 'weapon';
  var arsenalFilter = 'all'; // 'all' | white | green | blue | purple | orange
  var arsenalSort = 'power'; // 'power' | 'rarity' | 'name'
  function renderArsenal() {
    var box = document.getElementById('arsenalList'); box.innerHTML = '';
    if (SLOTS.indexOf(arsenalTab) < 0) arsenalTab = SLOTS[0];
    // 顶部 4 槽 = 选项卡：点击切换队列；已装备的可点「卸下」
    var strip = document.createElement('div'); strip.className = 'eq-strip';
    SLOTS.forEach(function (slot) {
      var eq = getArt(meta.equipped[slot]);
      var cnt = meta.arsenal.filter(function (a) { return a.slot === slot; }).length;
      var active = slot === arsenalTab;
      var el = document.createElement('div'); el.className = 'eq-slot' + (active ? ' on' : '');
      if (active) {
        el.style.borderColor = SLOTCOL[slot];
        el.style.boxShadow = '0 0 14px ' + SLOTCOL[slot] + '44';
        el.style.background = 'linear-gradient(180deg,' + SLOTCOL[slot] + '1F, rgba(8,16,32,0.95))';
      }
      var html = '<div class="eq-title" style="color:' + SLOTCOL[slot] + '">' + (SLOT_SVG[slot] || '') +
        '<span>' + SLOTNAME[slot] + '</span><span class="eq-count">' + cnt + '</span></div>';
      if (eq) {
        html += '<div class="eq-item"><b style="color:' + RARCOL[eq.rarity] + '">' + eq.name + '</b>' +
          '<span class="mini">' + RARNAME[eq.rarity] + '</span><span class="eq-off">卸下</span></div>';
      } else {
        html += '<div class="eq-empty">未装备</div>';
      }
      el.innerHTML = html;
      el.onclick = (function (s) { return function () { arsenalTab = s; renderArsenal(); }; })(slot);
      var off = el.querySelector('.eq-off');
      if (off) off.onclick = (function (s) { return function (ev) { ev.stopPropagation(); equipArtifact(s, meta.equipped[s]); }; })(slot);
      strip.appendChild(el);
    });
    box.appendChild(strip);
    // 只渲染当前选中槽位的队列
    var slot = arsenalTab;
    var inv = meta.arsenal.filter(function (a) { return a.slot === slot; });
    var q = document.createElement('div'); q.className = 'slot-queue';
    var head = document.createElement('div'); head.className = 'slot-qhead';
    head.innerHTML = '<span class="qico" style="color:' + SLOTCOL[slot] + '">' + (SLOT_SVG[slot] || '') + '</span>' +
      '<span class="qname" style="color:' + SLOTCOL[slot] + '">' + SLOTNAME[slot] + '队列</span>' +
      '<span class="qcount">' + inv.length + ' 件</span>';
    q.appendChild(head);
    // 筛选条：稀有度过滤 + 排序切换
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
    q.appendChild(fbar);
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
        ? (meta.arsenal.length === 0 ? '军械库空空如也，先去搜刮带回法器。' : ('暂无' + SLOTNAME[slot] + '类法器 · 点上方其他槽位查看'))
        : ('当前筛选下没有匹配的' + SLOTNAME[slot] + '法器');
      list.appendChild(empt);
    } else {
      shown.forEach(function (a) {
        var on = a.id === meta.equipped[slot];
        var row = document.createElement('div'); row.className = 'inv-row' + (on ? ' on' : '');
        var left = document.createElement('div'); left.style.cssText = 'flex:1;min-width:0;';
        left.innerHTML = '<div class="artline"><span class="an" style="color:' + RARCOL[a.rarity] + '">' + a.name + '</span><span class="rar">' + RARNAME[a.rarity] + '</span></div><div class="mods">' + modsText(a.mods) + '</div>';
        var rec = document.createElement('span'); rec.className = 'rec'; rec.textContent = '回收';
        rec.onclick = function (ev) { ev.stopPropagation(); recycleArtifact(a.id); };
        row.appendChild(left); row.appendChild(rec);
        row.onclick = function () { equipArtifact(a.slot, a.id); };
        list.appendChild(row);
      });
    }
    q.appendChild(list);
    box.appendChild(q);
  }
  function renderForge() {
    var box = document.getElementById('forgeList'); box.innerHTML = '';
    if (meta.arsenal.length === 0) { box.innerHTML = '<div class="mini">军械库空空，先去搜刮带回法器</div>'; return; }
    box.innerHTML = '<div class="mini">点选 2 件<b>同槽位</b>法器 → 合成更高一阶（如两件蓝武器→一件紫武器）；点「回收」可折价换灵玉。</div>';
    var list = document.createElement('div');
    meta.arsenal.forEach(function (a) {
      var el = document.createElement('div'); el.className = 'art' + (forgeSel.indexOf(a.id) >= 0 ? ' on' : '');
      var main = document.createElement('div');
      main.innerHTML = '<div class="artline"><span class="an" style="color:' + RARCOL[a.rarity] + '">' + a.name + '</span><span class="rar">' + SLOTNAME[a.slot] + '·' + RARNAME[a.rarity] + '</span></div><div class="mini">' + modsText(a.mods) + '</div>';
      main.style.cursor = 'pointer'; main.onclick = function () { onForgeClick(a.id); };
      var rec = document.createElement('span'); rec.textContent = ' 回收'; rec.style.color = '#C9A227'; rec.style.cursor = 'pointer';
      rec.onclick = function (ev) { ev.stopPropagation(); recycleArtifact(a.id); };
      main.querySelector('.mini').appendChild(rec);
      el.appendChild(main); list.appendChild(el);
    });
    box.appendChild(list);
  }
  function renderResearch() {
    var box = document.getElementById('researchList'); box.innerHTML = '';
    RESEARCH.forEach(function (r) {
      var done = !!meta.research[r.key];
      var reqOk = meta.maxTier >= (r.reqTier || 1);
      var afford = meta.currency >= r.cost && reqOk;
      var el = document.createElement('div'); el.className = 'shop' + (done ? ' maxed' : (reqOk ? (afford ? ' canbuy' : ' cant') : ' locked'));
      var reqTxt = reqOk ? ('需 ' + r.cost + ' 灵玉') : ('需通关第 ' + r.reqTier + ' 层');
      el.innerHTML = '<div class="sname">' + r.name + '</div><div class="muted">' + r.desc + '</div><div class="slevel">' + (done ? '✓ 已解锁' : reqTxt) + '</div>';
      if (!done && afford) el.onclick = function () { meta.currency -= r.cost; meta.research[r.key] = true; saveMeta(); renderBase(); };
      box.appendChild(el);
    });
  }
  function renderCodex() {
    var box = document.getElementById('codexBox');
    var parts = [];
    ['white', 'green', 'blue', 'purple', 'orange'].forEach(function (r) {
      var n = meta.codex.loot[r] || 0; if (n > 0) parts.push('<span style="color:' + RARCOL[r] + '">' + RARNAME[r] + '×' + n + '</span>');
    });
    var enN = { ram: '冲撞怪', shoot: '游猎怪', gunship: '炮艇', heal: '游医', split: '分裂体', elite: '精英', looter: '劫掠者', boss: 'BOSS' };
    var ep = [];
    for (var k in meta.codex.enemies) if (meta.codex.enemies[k] > 0) ep.push((enN[k] || k) + '×' + meta.codex.enemies[k]);
    var html = '<div class="codex-sec"><div class="codex-title" style="color:#5FBFA3">法器收集</div><div class="codex-body">' + (parts.length ? parts.join(' · ') : '暂未收集') + '</div></div>';
    html += '<div class="codex-sec"><div class="codex-title" style="color:#C9A227">敌怪图鉴</div><div class="codex-body">' + (ep.length ? ep.join(' · ') : '尚未击杀任何敌人') + '</div></div>';
    box.innerHTML = html;
  }
  // ---------- 基地 Tab 切换 ----------
  function switchBaseTab(name) {
    baseTab = name;
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].className = 'tab' + (tabs[i].getAttribute('data-tab') === name ? ' on' : '');
    var panes = ['hangar', 'arsenal', 'forge', 'lab', 'codex'];
    for (var j = 0; j < panes.length; j++) {
      var el = document.getElementById('tab-' + panes[j]);
      if (el) el.className = 'tab-pane' + (panes[j] === name ? ' on' : '');
    }
  }
  function startMission() { forgeSel = []; newRun(selectedAircraft, selectedTier); showScene('mission'); if (isMobile) enterImmersive(false); }
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
    var dist = { white: 0, green: 0, blue: 0, purple: 0, orange: 0 }, nm = [];
    run.loot.forEach(function (it) { dist[it.rarity]++; if (nm.length < 5) nm.push(it.name); });
    var badges = [];
    ['orange', 'purple', 'blue', 'green', 'white'].forEach(function (r) { if (dist[r] > 0) badges.push('<span style="color:' + RARCOL[r] + '">' + RARNAME[r] + '×' + dist[r] + '</span>'); });
    html += '<div class="stat-card"><span>本局战利品</span><b>' + run.loot.length + ' 件</b></div>';
    html += '<div class="mini" style="text-align:right">' + badges.join(' · ') + '</div>';
    if (nm.length) html += '<div class="mini" style="text-align:right">' + nm.join('、') + '…</div>';
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
  document.getElementById('titleStart').onclick = function () { if (isMobile) enterImmersive(false); if (!meta.seenTutorial) { showScene('base'); document.getElementById('tutorial').style.display = 'flex'; } else showScene('base'); };
  document.getElementById('titleHelp').onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };
  document.getElementById('tutorialClose').onclick = function () { meta.seenTutorial = true; saveMeta(); document.getElementById('tutorial').style.display = 'none'; };
  document.getElementById('startBtn').onclick = startMission;
  document.getElementById('helpBtn').onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };
  document.getElementById('mergeClose').onclick = function () { document.getElementById('mergeOverlay').style.display = 'none'; paused = false; showMobileControls(); };
  document.getElementById('merge3btn').onclick = function () { doThreeMerge(); };
  document.getElementById('backBtn').onclick = function () { showScene('base'); };
  document.getElementById('pauseResume').onclick = closePause;
  document.getElementById('pauseQuit').onclick = function () { closePause(); finishRun('abandon'); };
  document.getElementById('pauseHelp').onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };

  // 移动端横屏按钮
  var titleLsBtn = document.getElementById('titleLandscape');
  if (titleLsBtn) { if (isMobile) titleLsBtn.style.display = ''; titleLsBtn.onclick = tryLandscape; }
  var tryLsBtn2 = document.getElementById('tryLandscape');
  if (tryLsBtn2) tryLsBtn2.onclick = tryLandscape;

  showScene('title');
})();
