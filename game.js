'use strict';
/* 空域撤离 - 浏览器 MVP v4 (手感/节奏/耐玩/难度 大改)
   打飞机 + 搜刮 + 合成 + 肉鸽 + Boss + 搜打撤，三层难度。 */
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0;
  function resize() { W = canvas.width = Math.max(640, window.innerWidth); H = canvas.height = Math.max(480, window.innerHeight); }
  window.addEventListener('resize', resize); resize();
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b + 1)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  var COL = {
    bg: '#0b1020', grid: 'rgba(43,212,196,0.06)', player: '#2BD4C4', playerEdge: '#062b29',
    bulletP: '#9fefff', enemy: '#FF3B5C', enemyEdge: '#51101d', bulletE: '#ff8a5b',
    extract: '#3CFFA0', gold: '#FFC24B', node: '#FFC24B', elite: '#FFD24B'
  };
  var RAR = ['white', 'green', 'blue', 'purple', 'orange'];
  var RARNAME = { white: '普通', green: '精良', blue: '稀有', purple: '史诗', orange: '传说' };
  var RARCOL = { white: '#e8e8e8', green: '#4caf50', blue: '#3aa0ff', purple: '#b06bff', orange: '#ff9d2e' };
  var RARVAL = [10, 25, 60, 140, 320];
  var TIERNAME = ['入门', '进阶', '深渊'];

  // ---------- 元进度 ----------
  function defaultMeta() {
    return { currency: 0, unlocked: { a: true, b: false, c: false }, runs: 0, bestKills: 0,
      maxTier: 1, bossCleared: false, seenTutorial: false,
      up: { hp: 0, dmg: 0, speed: 0, shield: 0, pickup: 0 } };
  }
  function loadMeta() {
    try { var s = localStorage.getItem('kongyu_meta'); if (s) { var m = Object.assign(defaultMeta(), JSON.parse(s)); m.up = Object.assign({ hp: 0, dmg: 0, speed: 0, shield: 0, pickup: 0 }, m.up || {}); m.unlocked = Object.assign({ a: true, b: false, c: false }, m.unlocked || {}); return m; } } catch (e) {}
    return defaultMeta();
  }
  function saveMeta() { try { localStorage.setItem('kongyu_meta', JSON.stringify(meta)); } catch (e) {} }
  var meta = loadMeta();

  // 机体：降速、降射速，更沉稳
  var AIRCRAFT = {
    a: { id: 'a', name: '青隼', desc: '均衡·灵活', hp: 100, speed: 235, fireRate: 4.5, dmg: 11, bulletSpeed: 520, color: COL.player, unlockCost: 0 },
    b: { id: 'b', name: '玄龟', desc: '肉盾·慢速', hp: 165, speed: 180, fireRate: 3.8, dmg: 13, bulletSpeed: 470, color: '#7fd1c0', unlockCost: 300 },
    c: { id: 'c', name: '赤鸾', desc: '脆皮·高攻', hp: 72, speed: 275, fireRate: 6.5, dmg: 10, bulletSpeed: 600, color: '#ff9bb0', unlockCost: 800 }
  };
  var UPGRADES = [
    { key: 'hp', name: '生命强化', desc: '+22 最大HP/级', max: 6, cost: function (l) { return 140 * (l + 1); } },
    { key: 'dmg', name: '伤害强化', desc: '+3 伤害/级', max: 6, cost: function (l) { return 150 * (l + 1); } },
    { key: 'speed', name: '移速强化', desc: '+14 速度/级', max: 5, cost: function (l) { return 130 * (l + 1); } },
    { key: 'shield', name: '护盾强化', desc: '+14 护盾上限/级', max: 5, cost: function (l) { return 140 * (l + 1); } },
    { key: 'pickup', name: '拾取强化', desc: '+15% 拾取范围/级', max: 3, cost: function (l) { return 120 * (l + 1); } }
  ];

  // ---------- 输入 ----------
  var keys = {}; var mouse = { x: W / 2, y: H / 2, down: false };
  window.addEventListener('keydown', function (e) {
    keys[e.key.toLowerCase()] = true;
    if (scene === 'mission') {
      if (e.key === '1') chooseBuff(0);
      if (e.key === '2') chooseBuff(1);
      if (e.key === '3') chooseBuff(2);
      if (e.key.toLowerCase() === 'm') toggleMerge();
      if (e.key.toLowerCase() === 'e') tryExtract();
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') { if (overlaysOpen()) return; togglePause(); }
    }
  });
  function overlaysOpen() { return document.getElementById('buffOverlay').style.display === 'flex' || document.getElementById('mergeOverlay').style.display === 'flex'; }
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  canvas.addEventListener('mousemove', function (e) { var r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.addEventListener('mousedown', function () { mouse.down = true; });
  window.addEventListener('mouseup', function () { mouse.down = false; });
  var touchActive = false, touch = { x: W / 2, y: H / 2 };
  canvas.addEventListener('touchstart', function (e) { touchActive = true; updateTouch(e); }, { passive: false });
  canvas.addEventListener('touchmove', function (e) { e.preventDefault(); updateTouch(e); }, { passive: false });
  canvas.addEventListener('touchend', function () { touchActive = false; });
  function updateTouch(e) { if (!e.touches[0]) return; var r = canvas.getBoundingClientRect(); touch.x = e.touches[0].clientX - r.left; touch.y = e.touches[0].clientY - r.top; }

  // ---------- 全局状态 ----------
  var scene = 'title';
  var paused = false;
  var player, bullets, enemies, loot, nodes, particles, floaters, extractZone, boss, bossSpawned;
  var run, spawnTimer, buffTimer, extractUnlocked, gameTime, hintTimer, banner, killForBuff;

  function tierMul() { return 1 + (run.tier - 1) * 0.5; } // 敌人血量倍率
  function tierDmgMul() { return 1 + (run.tier - 1) * 0.35; }

  function newRun(aircraftId, tier) {
    var a = AIRCRAFT[aircraftId]; var up = meta.up;
    var hp = a.hp + up.hp * 22, spd = a.speed + up.speed * 14, dmg = a.dmg + up.dmg * 3;
    var sh = 40 + up.shield * 14, pick = 46 * (1 + up.pickup * 0.15);
    player = {
      x: W / 2, y: H * 0.8, vx: 0, vy: 0, hp: hp, maxhp: hp, shield: 0, maxshield: sh, regen: 5,
      speed: spd, fireRate: a.fireRate, dmg: dmg, bulletSpeed: a.bulletSpeed,
      fireCd: 0, pickR: pick, iframe: 0, dashCd: 0, multishot: 1, pierce: 0, magnet: false,
      color: a.color, ang: -Math.PI / 2, buffs: [], flash: 0, bank: 0
    };
    bullets = []; enemies = []; loot = []; particles = []; floaters = []; nodes = [];
    extractZone = null; boss = null; bossSpawned = false;
    run = { loot: [], kills: 0, picked: 0, time: 0, aircraft: aircraftId, tier: tier, nodes: 0, killedBoss: false };
    spawnTimer = 2.5; buffTimer = 0; extractUnlocked = false; gameTime = 0; hintTimer = 6; banner = null; killForBuff = 6;
    placeNodes(6 + tier);
  }

  function placeNodes(n) {
    var tries = 0;
    while (nodes.length < n && tries < 200) {
      tries++;
      var x = rand(W * 0.08, W * 0.92), y = rand(H * 0.08, H * 0.6);
      if (dist2(x, y, player.x, player.y) < 220 * 220) continue;
      if (nodes.some(function (nd) { return dist2(x, y, nd.x, nd.y) < 130 * 130; })) continue;
      var tier = clamp(1 + Math.floor(gameTime / 28), 1, 4);
      nodes.push({ x: x, y: y, r: 16, collected: false, respawn: 0, rarity: rollRarity(tier + 1 + (run.tier - 1)), pulse: rand(0, 6) });
    }
  }
  function rollRarity(tier) {
    var r = Math.random() + tier * 0.04;
    if (r > 0.97) return 'orange'; if (r > 0.9) return 'purple'; if (r > 0.72) return 'blue'; if (r > 0.45) return 'green'; return 'white';
  }
  function spawnEnemy(x, y, etier) {
    var ex = x, ey = y;
    if (ex === undefined) {
      var edge = randi(0, 3);
      if (edge === 0) { ex = rand(0, W); ey = -30; } else if (edge === 1) { ex = W + 30; ey = rand(0, H); }
      else if (edge === 2) { ex = rand(0, W); ey = H + 30; } else { ex = -30; ey = rand(0, H); }
    }
    etier = etier || clamp(1 + Math.floor(gameTime / 28), 1, 4);
    var rammer = Math.random() < 0.28;
    var elite = !x && Math.random() < 0.08; // 仅自然刷新的敌人可精英
    var baseHp = (16 + etier * 9) * tierMul();
    if (elite) baseHp *= 3;
    var e = { x: ex, y: ey, vx: 0, vy: 0, hp: baseHp, maxhp: baseHp, r: elite ? 26 : (rammer ? 15 : 17),
      fireCd: rand(1.6, 3.0), tier: etier, ram: rammer, elite: elite,
      rarity: elite ? (Math.random() < 0.5 ? 'purple' : 'blue') : rollRarity(etier),
      flash: 0, wake: 0, dmgMul: tierDmgMul() * (elite ? 1.2 : 1) };
    enemies.push(e); return e;
  }
  function fireBullet(x, y, ang, from, dmg, speed, pierce) {
    bullets.push({ x: x, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: dmg, from: from, r: from === 'player' ? 4.5 : 5.5, life: 3, pierce: pierce || 0 });
  }
  function dropLoot(x, y, rarity) { loot.push({ x: x, y: y, rarity: rarity, vx: rand(-18, 18), vy: rand(-18, 18), life: 22 }); }
  function burst(x, y, color, n) { for (var i = 0; i < n; i++) { var a = rand(0, 6.28), s = rand(35, 180); particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.7), color: color, r: rand(1.3, 3) }); } }
  function floatText(x, y, text, color) { floaters.push({ x: x, y: y, text: text, color: color, life: 1.1 }); }

  // ---------- 随机强化 ----------
  var BUFFS = [
    { name: '双发', desc: '一次射出2发', apply: function () { player.multishot = Math.min(5, player.multishot + 1); } },
    { name: '穿透弹', desc: '子弹贯穿+2', apply: function () { player.pierce += 2; } },
    { name: '磁力拾取', desc: '战利品自动吸来', apply: function () { player.magnet = true; } },
    { name: '攻速+25%', apply: function () { player.fireRate *= 1.25; } },
    { name: '伤害+25%', apply: function () { player.dmg *= 1.25; } },
    { name: '移速+15%', apply: function () { player.speed *= 1.15; } },
    { name: '最大HP+35', apply: function () { player.maxhp += 35; player.hp += 35; } },
    { name: '护盾+45', apply: function () { player.maxshield += 45; player.shield = player.maxshield; } },
    { name: '护盾快充', apply: function () { player.regen += 6; } }
  ];
  var buffChoices = [];
  function offerBuff() {
    buffChoices = []; var pool = BUFFS.slice();
    for (var i = 0; i < 3; i++) { var k = randi(0, pool.length - 1); buffChoices.push(pool.splice(k, 1)[0]); }
    paused = true; document.getElementById('buffOverlay').style.display = 'flex'; document.getElementById('buffList').innerHTML = '';
    buffChoices.forEach(function (b, idx) {
      var el = document.createElement('div'); el.className = 'card';
      el.innerHTML = '<div class="big">' + (idx + 1) + '</div><div class="bname">' + b.name + '</div><div class="muted">' + (b.desc || '') + '</div>';
      el.onclick = function () { chooseBuff(idx); };
      document.getElementById('buffList').appendChild(el);
    });
  }
  function chooseBuff(idx) {
    if (!paused || !buffChoices[idx]) return;
    buffChoices[idx].apply(); player.buffs.push(buffChoices[idx].name);
    banner = { text: '获得强化：' + buffChoices[idx].name, life: 1.5 };
    document.getElementById('buffOverlay').style.display = 'none'; paused = false; buffChoices = [];
  }

  // ---------- 合成 ----------
  function toggleMerge() {
    if (scene !== 'mission') return;
    if (paused && document.getElementById('mergeOverlay').style.display === 'flex') { document.getElementById('mergeOverlay').style.display = 'none'; paused = false; return; }
    if (paused) return;
    paused = true; renderMerge(); document.getElementById('mergeOverlay').style.display = 'flex';
  }
  var mergeSel = [];
  function renderMerge() {
    mergeSel = []; var box = document.getElementById('mergeGrid'); box.innerHTML = '';
    if (run.loot.length === 0) { box.innerHTML = '<div class="muted">背包空空，先去金色搜刮点捡战利品</div>'; }
    run.loot.forEach(function (it, idx) {
      var el = document.createElement('div'); el.className = 'chip r-' + it.rarity;
      el.title = RARNAME[it.rarity] + ' · 价值' + RARVAL[RAR.indexOf(it.rarity)];
      el.onclick = function () { onMergeClick(idx, el); };
      box.appendChild(el);
    });
    document.getElementById('mergeLegend').innerHTML = '白普通10 · 绿精良25 · 蓝稀有60 · 紫史诗140 · 橙传说320（越稀有越值钱，撤离带回越多）';
  }
  function onMergeClick(idx, el) {
    if (mergeSel.length === 1 && mergeSel[0] === idx) { mergeSel = []; refreshSel(); return; }
    mergeSel.push(idx);
    if (mergeSel.length === 2) {
      var i = mergeSel[0], j = mergeSel[1];
      if (run.loot[i].rarity === run.loot[j].rarity && run.loot[i].rarity !== 'orange') {
        var ri = RAR.indexOf(run.loot[i].rarity);
        run.loot.splice(j, 1); run.loot.splice(i, 1); run.loot.push({ rarity: RAR[ri + 1] });
        burst(player.x, player.y, RARCOL[RAR[ri + 1]], 8);
        banner = { text: '合成成功 → ' + RARNAME[RAR[ri + 1]], life: 1.3 };
      }
      mergeSel = []; renderMerge();
    } else refreshSel();
  }
  function refreshSel() { var chips = document.getElementById('mergeGrid').children; for (var k = 0; k < chips.length; k++) chips[k].classList.remove('sel'); mergeSel.forEach(function (ix) { if (chips[ix]) chips[ix].classList.add('sel'); }); }

  // ---------- 撤离 ----------
  function unlockExtract() {
    if (extractUnlocked) return;
    extractUnlocked = true; var x, y, t = 0;
    do { x = rand(W * 0.15, W * 0.85); y = rand(H * 0.12, H * 0.5); t++; } while (dist2(x, y, player.x, player.y) < 280 * 280 && t < 30);
    extractZone = { x: x, y: y, w: 120, h: 120, prog: 0 };
    banner = { text: '撤离点已开启！搜够就飞进绿框带出', life: 2.2 };
  }
  function tryExtract() { if (extractZone && extractZone.prog >= 1) finishRun('success'); }

  // ---------- 暂停 ----------
  function togglePause() { if (document.getElementById('pauseOverlay').style.display === 'flex') { closePause(); return; } paused = true; document.getElementById('pauseOverlay').style.display = 'flex'; }
  function closePause() { document.getElementById('pauseOverlay').style.display = 'none'; paused = false; }

  // ---------- Boss ----------
  function spawnBoss() {
    bossSpawned = true;
    var hp = (620 + Math.floor(gameTime) * 5) * (1 + (run.tier - 1) * 0.7);
    boss = { x: W / 2, y: -60, hp: hp, maxhp: hp, r: 46, phase: 1, atkCd: 2.6, burstCd: 4.0, flash: 0, wake: 1.2, ang: 0 };
    banner = { text: '⚠ BOSS 来袭！击败可获大量战利品', life: 2.4 };
  }
  function updateBoss(dt) {
    var b = boss;
    if (b.wake > 0) { b.wake -= dt; b.y += (H * 0.22 - b.y) * dt * 0.7; return; }
    if (b.flash > 0) b.flash -= dt;
    var dx = player.x - b.x, dy = player.y - b.y, d = Math.hypot(dx, dy) || 1;
    var mv = (d > 280 ? 1 : -0.5) * 52 * dt;
    b.x = clamp(b.x + (dx / d) * mv, 70, W - 70); b.y = clamp(b.y + (dy / d) * mv * 0.6, 70, H * 0.5);
    if (b.phase === 1 && b.hp <= b.maxhp * 0.55) { b.phase = 2; banner = { text: 'BOSS 狂暴！', life: 1.5 }; }
    if (b.phase === 2 && b.hp <= b.maxhp * 0.25) { b.phase = 3; banner = { text: 'BOSS 末路！弹幕倾泻', life: 1.5 }; }
    b.atkCd -= dt; var rate = b.phase === 3 ? 0.55 : (b.phase === 2 ? 0.75 : 1.2);
    if (b.atkCd <= 0) {
      var base = Math.atan2(player.y - b.y, player.x - b.x); var shots = b.phase >= 2 ? 3 : 1;
      for (var s = 0; s < shots; s++) { var off = (s - (shots - 1) / 2) * 0.16; fireBullet(b.x, b.y, base + off, 'enemy', 10 * tierDmgMul(), 200); }
      b.atkCd = rate;
    }
    b.burstCd -= dt;
    if (b.burstCd <= 0) {
      var n = b.phase === 3 ? 22 : (b.phase === 2 ? 18 : 12), spd = b.phase === 3 ? 175 : 145; b.ang += 0.35;
      for (var i = 0; i < n; i++) { var a = b.ang + (i / n) * 6.28; fireBullet(b.x, b.y, a, 'enemy', 9 * tierDmgMul(), spd); }
      b.burstCd = b.phase === 3 ? 2.2 : (b.phase === 2 ? 2.8 : 3.8);
    }
  }
  function killBoss() {
    run.killedBoss = true; if (!meta.bossCleared) meta.bossCleared = true; saveMeta();
    burst(boss.x, boss.y, '#ff5cf0', 18);
    var drops = ['purple', 'purple', 'orange', 'blue', 'blue', 'green'];
    for (var i = 0; i < drops.length; i++) dropLoot(boss.x + rand(-45, 45), boss.y + rand(-45, 45), drops[i]);
    floatText(boss.x, boss.y - 30, 'BOSS 击破！', '#ff5cf0');
    banner = { text: '★ BOSS 击破！搜刮战利品并撤离带出', life: 2.6 };
    boss = null;
  }

  // ---------- 结算 ----------
  function finishRun(outcome) {
    if (scene !== 'mission') return;
    showScene('result');
    var lootVal = run.loot.reduce(function (s, it) { return s + RARVAL[RAR.indexOf(it.rarity)]; }, 0);
    var killReward = run.kills * 5;
    var banked, lost, label;
    if (outcome === 'success') { banked = lootVal + killReward; lost = 0; label = '撤离成功'; }
    else if (outcome === 'abandon') { banked = Math.floor(lootVal * 0.3); lost = lootVal - banked; label = '主动弃局'; }
    else { banked = Math.floor(lootVal * 0.15); lost = lootVal - banked; label = '阵亡'; }
    meta.currency += banked; meta.runs += 1;
    if (run.kills > meta.bestKills) meta.bestKills = run.kills;
    // 通关上层 → 解锁下一层
    var unlockedNew = false;
    if (outcome === 'success' && run.killedBoss && run.tier === meta.maxTier && meta.maxTier < 3) { meta.maxTier++; unlockedNew = true; }
    if (!meta.unlocked.b && meta.currency >= AIRCRAFT.b.unlockCost) meta.unlocked.b = true;
    if (!meta.unlocked.c && meta.currency >= AIRCRAFT.c.unlockCost) meta.unlocked.c = true;
    saveMeta();
    showResult(outcome, lootVal, banked, lost, killReward, label, unlockedNew);
  }

  // ---------- 更新 ----------
  function update(dt) {
    gameTime += dt; run.time += dt;
    if (hintTimer > 0) hintTimer -= dt;
    if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }

    // 移动：加速 + 惯性 + 阻尼（有重量感）
    var dirx = 0, diry = 0, mag = 0;
    if (touchActive) {
      var tdx = touch.x - player.x, tdy = touch.y - player.y, tl = Math.hypot(tdx, tdy) || 1;
      dirx = tdx / tl; diry = tdy / tl; mag = Math.min(1, tl / 70);
    } else {
      var mx = 0, my = 0;
      if (keys['w'] || keys['arrowup']) my -= 1;
      if (keys['s'] || keys['arrowdown']) my += 1;
      if (keys['a'] || keys['arrowleft']) mx -= 1;
      if (keys['d'] || keys['arrowright']) mx += 1;
      if (mx || my) { var ml = Math.hypot(mx, my); dirx = mx / ml; diry = my / ml; mag = 1; }
    }
    var targetvx = dirx * player.speed * mag, targetvy = diry * player.speed * mag;
    var k = Math.min(1, 9 * dt); // 加速响应系数
    player.vx += (targetvx - player.vx) * k;
    player.vy += (targetvy - player.vy) * k;
    if (mag < 0.05) { player.vx *= Math.pow(0.02, dt); player.vy *= Math.pow(0.02, dt); } // 无输入快速止动
    if (player.dashCd > 0) player.dashCd -= dt;
    if ((keys['shift'] || (touchActive && touch.x < W * 0.22)) && player.dashCd <= 0) {
      player.vx *= 2.3; player.vy *= 2.3; player.iframe = 0.3; player.dashCd = 1.5;
    }
    player.x = clamp(player.x + player.vx * dt, 16, W - 16);
    player.y = clamp(player.y + player.vy * dt, 16, H - 16);
    if (player.iframe > 0) player.iframe -= dt;
    if (player.flash > 0) player.flash -= dt;

    // 瞄准 & 开火
    var aimx = (touchActive ? touch.x : mouse.x) - player.x, aimy = (touchActive ? touch.y : mouse.y) - player.y;
    player.ang = Math.atan2(aimy, aimx); player.fireCd -= dt;
    var firing = (touchActive ? true : mouse.down) || keys[' '];
    if (firing && player.fireCd <= 0) {
      var spread = 0.16;
      for (var s = 0; s < player.multishot; s++) { var off = player.multishot === 1 ? 0 : (s - (player.multishot - 1) / 2) * spread; fireBullet(player.x + Math.cos(player.ang) * 18, player.y + Math.sin(player.ang) * 18, player.ang + off, 'player', player.dmg, player.bulletSpeed, player.pierce); }
      player.fireCd = 1 / player.fireRate;
    }
    if (player.shield < player.maxshield) player.shield = Math.min(player.maxshield, player.shield + player.regen * dt);

    // 刷怪（更慢、更少）
    spawnTimer -= dt;
    var interval = clamp(3.4 - gameTime * 0.006, 1.6, 3.4) / (1 + (run.tier - 1) * 0.3);
    if (spawnTimer <= 0 && enemies.length < 22) { spawnEnemy(); spawnTimer = interval; }

    // 搜刮点
    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni]; nd.pulse += dt * 3;
      if (nd.collected) { nd.respawn -= dt; if (nd.respawn <= 0) relocateNode(nd); continue; }
      if (dist2(nd.x, nd.y, player.x, player.y) < (nd.r + player.pickR * 0.6) * (nd.r + player.pickR * 0.6)) collectNode(nd);
    }
    if (!extractUnlocked && run.picked > 0) unlockExtract();
    if (!bossSpawned && run.nodes >= 3 + run.tier) spawnBoss();

    // 撤离
    if (extractUnlocked && extractZone) {
      var inside = player.x > extractZone.x && player.x < extractZone.x + extractZone.w && player.y > extractZone.y && player.y < extractZone.y + extractZone.h;
      if (inside) extractZone.prog = Math.min(1, extractZone.prog + dt / 2.8); else extractZone.prog = Math.max(0, extractZone.prog - dt / 4);
      if (extractZone.prog >= 1) finishRun('success');
    }

    // 敌人
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i]; var dx = player.x - e.x, dy = player.y - e.y; var d = Math.hypot(dx, dy) || 1;
      if (e.wake > 0) { e.wake -= dt; continue; }
      var es = (e.elite ? 1.3 : 1);
      if (e.ram) { e.x += (dx / d) * (70 + e.tier * 8) * es * dt; e.y += (dy / d) * (70 + e.tier * 8) * es * dt; }
      else {
        var keep = 250;
        e.x += (dx / d) * (52 + e.tier * 6) * es * dt * (d > keep ? 1 : -0.6);
        e.y += (dy / d) * (52 + e.tier * 6) * es * dt * (d > keep ? 1 : -0.6);
        e.fireCd -= dt;
        if (e.fireCd <= 0 && d < 560) { fireBullet(e.x, e.y, Math.atan2(dy, dx), 'enemy', (7 + e.tier * 2) * e.dmgMul, 175); e.fireCd = rand(1.6, 3.0); }
      }
      if (e.flash > 0) e.flash -= dt;
    }
    if (boss) updateBoss(dt);

    // 子弹
    for (var b = bullets.length - 1; b >= 0; b--) {
      var bl = bullets[b]; bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
      if (bl.life <= 0 || bl.x < -20 || bl.x > W + 20 || bl.y < -20 || bl.y > H + 20) { bullets.splice(b, 1); continue; }
      if (bl.from === 'player') {
        var consumed = false;
        if (boss && boss.wake <= 0 && dist2(bl.x, bl.y, boss.x, boss.y) < (boss.r + bl.r) * (boss.r + bl.r)) {
          boss.hp -= bl.dmg; boss.flash = 0.08; if (boss.hp <= 0) killBoss();
          if (bl.pierce > 0) bl.pierce--; else { bullets.splice(b, 1); consumed = true; }
        }
        if (!consumed) {
          for (var ei = 0; ei < enemies.length; ei++) {
            var en = enemies[ei];
            if (dist2(bl.x, bl.y, en.x, en.y) < (en.r + bl.r) * (en.r + bl.r)) {
              en.hp -= bl.dmg; en.flash = 0.08;
              if (bl.pierce > 0) { bl.pierce--; } else { bullets.splice(b, 1); consumed = true; }
              if (en.hp <= 0) { burst(en.x, en.y, en.elite ? COL.elite : COL.enemy, en.elite ? 12 : 6); dropLoot(en.x, en.y, en.rarity); if (en.elite) dropLoot(en.x + 10, en.y, 'green'); enemies.splice(ei, 1); run.kills++; buffTimer++; if (buffTimer >= killForBuff) { buffTimer = 0; offerBuff(); } }
              if (bl.pierce <= 0) break;
            }
          }
        }
      } else {
        if (dist2(bl.x, bl.y, player.x, player.y) < (13 + bl.r) * (13 + bl.r)) { bullets.splice(b, 1); if (player.iframe <= 0) damagePlayer(bl.dmg); }
      }
    }

    // 接触
    for (var ci = 0; ci < enemies.length; ci++) {
      var ec = enemies[ci];
      if (dist2(ec.x, ec.y, player.x, player.y) < (ec.r + 13) * (ec.r + 13)) {
        if (player.iframe <= 0) damagePlayer((ec.ram ? 13 : 7) * ec.dmgMul);
        if (ec.ram) { burst(ec.x, ec.y, COL.enemy, 5); enemies.splice(ci, 1); }
      }
    }
    if (boss && boss.wake <= 0 && dist2(boss.x, boss.y, player.x, player.y) < (boss.r + 14) * (boss.r + 14)) { if (player.iframe <= 0) damagePlayer(16 * tierDmgMul()); }

    // 战利品
    for (var l = loot.length - 1; l >= 0; l--) {
      var it = loot[l]; it.life -= dt;
      if (player.magnet) { var mdx = player.x - it.x, mdy = player.y - it.y, md = Math.hypot(mdx, mdy) || 1; if (md < 300) { it.x += (mdx / md) * 220 * dt; it.y += (mdy / md) * 220 * dt; } }
      else { it.x += it.vx * dt; it.y += it.vy * dt; it.vx *= 0.9; it.vy *= 0.9; }
      if (it.life <= 0) { loot.splice(l, 1); continue; }
      if (dist2(it.x, it.y, player.x, player.y) < player.pickR * player.pickR) {
        if (run.loot.length < 16) { run.loot.push({ rarity: it.rarity }); run.picked++; var v = RARVAL[RAR.indexOf(it.rarity)]; floatText(it.x, it.y, '+' + v + ' ' + RARNAME[it.rarity], RARCOL[it.rarity]); }
        burst(it.x, it.y, RARCOL[it.rarity], 3); loot.splice(l, 1);
      }
    }
    for (var p = particles.length - 1; p >= 0; p--) { var pa = particles[p]; pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.vx *= 0.92; pa.vy *= 0.92; pa.life -= dt; if (pa.life <= 0) particles.splice(p, 1); }
    for (var f = floaters.length - 1; f >= 0; f--) { var fl = floaters[f]; fl.y -= 22 * dt; fl.life -= dt; if (fl.life <= 0) floaters.splice(f, 1); }
  }
  function collectNode(nd) {
    nd.collected = true; nd.respawn = 13; run.nodes++;
    run.loot.push({ rarity: nd.rarity }); run.picked++;
    var v = RARVAL[RAR.indexOf(nd.rarity)];
    floatText(nd.x, nd.y - 20, '搜刮 +' + v + ' ' + RARNAME[nd.rarity], COL.node);
    burst(nd.x, nd.y, COL.node, 8);
    var guards = run.nodes <= 3 ? 1 : randi(1, 2);
    for (var g = 0; g < guards; g++) { var ang = rand(0, 6.28), dd = rand(300, 430); var gx = clamp(nd.x + Math.cos(ang) * dd, 24, W - 24); var gy = clamp(nd.y + Math.sin(ang) * dd, 24, H - 24); var ge = spawnEnemy(gx, gy, nd.tier || 1); ge.wake = 1.0; ge.fireCd = rand(2.0, 3.4); }
    banner = { text: '⚠ 守卫从远处来袭（红圈预警）', life: 1.6 };
  }
  function relocateNode(nd) {
    var x, y, t = 0;
    do { x = rand(W * 0.08, W * 0.92); y = rand(H * 0.08, H * 0.6); t++; } while ((dist2(x, y, player.x, player.y) < 170 * 170 || nodes.some(function (o) { return o !== nd && dist2(x, y, o.x, o.y) < 120 * 120; })) && t < 40);
    nd.x = x; nd.y = y; nd.collected = false; nd.rarity = rollRarity(clamp(1 + Math.floor(gameTime / 28), 1, 4) + 1 + (run.tier - 1));
  }
  function damagePlayer(dmg) {
    player.flash = 0.13;
    if (player.shield > 0) { var ab = Math.min(player.shield, dmg); player.shield -= ab; dmg -= ab; }
    if (dmg > 0) player.hp -= dmg;
    if (player.hp <= 0) { player.hp = 0; burst(player.x, player.y, player.color, 16); finishRun('death'); }
  }

  // ---------- 渲染 ----------
  function drawGrid() {
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    for (var x = 0; x < W; x += 52) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (var y = 0; y < H; y += 52) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }
  function drawNodes() {
    for (var i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      if (nd.collected) { ctx.strokeStyle = 'rgba(255,194,75,0.2)'; ctx.setLineDash([4, 4]); ctx.strokeRect(nd.x - 14, nd.y - 14, 28, 28); ctx.setLineDash([]); continue; }
      var pulse = 1 + Math.sin(nd.pulse) * 0.1;
      ctx.save(); ctx.translate(nd.x, nd.y); ctx.scale(pulse, pulse); ctx.shadowColor = COL.node; ctx.shadowBlur = 12; ctx.fillStyle = COL.node;
      ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(13, 0); ctx.lineTo(0, 15); ctx.lineTo(-13, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a2a00'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('搜', 0, 1);
      ctx.restore(); ctx.shadowBlur = 0; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }
  function drawPlayer() {
    var bank = clamp(player.vx / 400, -0.5, 0.5);
    ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.ang + Math.PI / 2 + bank * 0.3);
    ctx.shadowColor = player.color; ctx.shadowBlur = 10; ctx.fillStyle = player.iframe > 0 ? '#fff' : player.color; ctx.strokeStyle = COL.playerEdge; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(11, 13); ctx.lineTo(0, 7); ctx.lineTo(-11, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore(); ctx.shadowBlur = 0;
    if (player.flash > 0) { ctx.fillStyle = 'rgba(255,59,92,0.3)'; ctx.beginPath(); ctx.arc(player.x, player.y, 20, 0, 7); ctx.fill(); }
  }
  function drawEnemies() {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.wake > 0) { var pr = 1 + Math.sin(gameTime * 12) * 0.15; ctx.globalAlpha = 0.8; ctx.strokeStyle = COL.enemy; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10 + pr * 4, 0, 7); ctx.stroke(); ctx.globalAlpha = 0.4; ctx.fillStyle = COL.enemy; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; continue; }
      ctx.save(); ctx.translate(e.x, e.y); ctx.shadowColor = e.elite ? COL.elite : COL.enemy; ctx.shadowBlur = e.elite ? 14 : 8;
      ctx.fillStyle = e.flash > 0 ? '#fff' : (e.elite ? COL.elite : COL.enemy); ctx.strokeStyle = e.elite ? '#5a4400' : COL.enemyEdge; ctx.lineWidth = 2;
      ctx.beginPath(); var n = 6; for (var k = 0; k < n; k++) { var a = (k / n) * 6.28; var rr = e.r * (k % 2 ? 0.7 : 1); var px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
      if (e.elite) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, 7); ctx.stroke(); }
      ctx.restore(); ctx.shadowBlur = 0;
      if (e.hp < e.maxhp) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - 16, e.y - e.r - 9, 32, 3); ctx.fillStyle = COL.enemy; ctx.fillRect(e.x - 16, e.y - e.r - 9, 32 * (e.hp / e.maxhp), 3); }
    }
  }
  function drawBoss() {
    var b = boss; ctx.save(); ctx.translate(b.x, b.y); ctx.shadowColor = b.phase === 3 ? COL.enemy : (b.phase === 2 ? '#ff5c7a' : '#b06bff'); ctx.shadowBlur = 16;
    ctx.fillStyle = b.flash > 0 ? '#fff' : (b.phase === 3 ? '#ff5c7a' : (b.phase === 2 ? '#ff7a99' : '#b06bff')); ctx.strokeStyle = '#2a0a2a'; ctx.lineWidth = 3;
    ctx.beginPath(); var n = 8; for (var k = 0; k < n; k++) { var a = (k / n) * 6.28 + gameTime * 0.3; var rr = b.r * (k % 2 ? 0.7 : 1.1); var px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore(); ctx.shadowBlur = 0;
    if (b.wake > 0) { ctx.globalAlpha = 0.7; ctx.strokeStyle = COL.enemy; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 16 + Math.sin(gameTime * 12) * 4, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  function drawBullets() { for (var i = 0; i < bullets.length; i++) { var b = bullets[i]; ctx.fillStyle = b.from === 'player' ? COL.bulletP : COL.bulletE; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 5; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); } ctx.shadowBlur = 0; }
  function drawLoot() { for (var i = 0; i < loot.length; i++) { var it = loot[i]; ctx.save(); ctx.translate(it.x, it.y); ctx.shadowColor = RARCOL[it.rarity]; ctx.shadowBlur = 8; ctx.fillStyle = RARCOL[it.rarity]; ctx.fillRect(-5, -5, 10, 10); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(-5, -5, 10, 10); ctx.restore(); ctx.shadowBlur = 0; } }
  function drawExtract() { if (!extractZone) return; var z = extractZone; ctx.fillStyle = 'rgba(60,255,160,' + (0.2 + 0.3 * z.prog) + ')'; ctx.fillRect(z.x, z.y, z.w, z.h); ctx.strokeStyle = COL.extract; ctx.lineWidth = 3; ctx.strokeRect(z.x, z.y, z.w, z.h); ctx.fillStyle = COL.extract; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('撤离 ' + Math.floor(z.prog * 100) + '%', z.x + z.w / 2, z.y - 8); ctx.textAlign = 'left'; }
  function drawParticles() {
    for (var i = 0; i < particles.length; i++) { var p = particles[i]; ctx.globalAlpha = clamp(p.life * 1.5, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (var f = 0; f < floaters.length; f++) { var fl = floaters[f]; ctx.globalAlpha = clamp(fl.life, 0, 1); ctx.fillStyle = fl.color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fl.text, fl.x, fl.y); }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  function drawMinimap() {
    var mw = 140, mh = Math.round(mw * H / W), mx = 14, my = H - mh - 14;
    ctx.fillStyle = 'rgba(8,14,28,0.7)'; ctx.fillRect(mx, my, mw, mh); ctx.strokeStyle = 'rgba(43,212,196,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(mx, my, mw, mh);
    var sx = mw / W, sy = mh / H;
    for (var i = 0; i < nodes.length; i++) { var nd = nodes[i]; if (nd.collected) continue; ctx.fillStyle = COL.node; ctx.fillRect(mx + nd.x * sx - 2, my + nd.y * sy - 2, 4, 4); }
    if (extractZone) { ctx.fillStyle = COL.extract; ctx.fillRect(mx + extractZone.x * sx, my + extractZone.y * sy, extractZone.w * sx, extractZone.h * sy); }
    if (boss) { ctx.fillStyle = '#ff5cf0'; ctx.beginPath(); ctx.arc(mx + boss.x * sx, my + boss.y * sy, 4, 0, 7); ctx.fill(); }
    ctx.fillStyle = COL.enemy; for (var e = 0; e < enemies.length; e++) ctx.fillRect(mx + enemies[e].x * sx - 1, my + enemies[e].y * sy - 1, 2, 2);
    ctx.fillStyle = COL.player; ctx.beginPath(); ctx.arc(mx + player.x * sx, my + player.y * sy, 3, 0, 7); ctx.fill();
  }
  function drawHUD() {
    var lootVal = run.loot.reduce(function (s, it) { return s + RARVAL[RAR.indexOf(it.rarity)]; }, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(12, 12, 230, 58);
    ctx.fillStyle = '#444'; ctx.fillRect(22, 22, 210, 12); ctx.fillStyle = COL.enemy; ctx.fillRect(22, 22, 210 * (player.hp / player.maxhp), 12);
    ctx.fillStyle = '#3aa0ff'; ctx.fillRect(22, 40, 210 * (player.shield / player.maxshield), 8);
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('HP ' + Math.ceil(player.hp) + '/' + player.maxhp + '  护盾 ' + Math.ceil(player.shield) + '  第' + run.tier + '层', 22, 66);
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif';
    ctx.fillText('击杀 ' + run.kills + '  战利品 ' + run.loot.length + '/16', W - 16, 28);
    ctx.fillStyle = COL.gold; ctx.fillText('战利品价值 ' + lootVal, W - 16, 48);
    ctx.fillStyle = '#cfe9e6'; ctx.font = '12px sans-serif'; ctx.fillText('强化: ' + (player.buffs.length ? player.buffs.join('·') : '无'), W - 16, 66);
    ctx.fillStyle = COL.purple; ctx.fillText('再击杀 ' + (killForBuff - buffTimer) + ' → 随机强化', W - 16, 84); ctx.textAlign = 'left';
    if (hintTimer > 0) { ctx.globalAlpha = clamp(hintTimer / 2, 0, 1); ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('飞向金色「搜」点捡战利品 → 搜够 ' + (3 + run.tier) + ' 个触发 BOSS → 进绿框撤离', W / 2, H - 22); ctx.textAlign = 'left'; ctx.globalAlpha = 1; }
    if (banner) { ctx.globalAlpha = clamp(banner.life, 0, 1); ctx.fillStyle = COL.gold; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(banner.text, W / 2, 120); ctx.textAlign = 'left'; ctx.globalAlpha = 1; }
    if (boss) { var bw = 320, bx = (W - bw) / 2, by = 14; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, bw, 14); ctx.fillStyle = boss.phase >= 3 ? COL.enemy : (boss.phase === 2 ? '#ff5c7a' : '#b06bff'); ctx.fillRect(bx, by, bw * (boss.hp / boss.maxhp), 14); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 14); ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BOSS · 阶段' + boss.phase, W / 2, by + 11); ctx.textAlign = 'left'; }
    drawMinimap();
  }
  function render() {
    if (scene === 'mission') { drawGrid(); drawNodes(); drawLoot(); drawExtract(); drawEnemies(); if (boss) drawBoss(); drawBullets(); drawParticles(); drawPlayer(); drawHUD(); }
    else drawGrid();
  }
  var last = performance.now();
  function loop(now) { var dt = Math.min(0.05, (now - last) / 1000); last = now; if (scene === 'mission' && !paused) update(dt); render(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  // ---------- 界面 ----------
  function hideAllOverlays() { ['title', 'base', 'buffOverlay', 'mergeOverlay', 'pauseOverlay', 'result', 'tutorial'].forEach(function (id) { document.getElementById(id).style.display = 'none'; }); }
  function showScene(name) {
    scene = name; hideAllOverlays();
    if (name === 'base') { document.getElementById('base').style.display = 'flex'; renderBase(); }
    else if (name === 'title') { document.getElementById('title').style.display = 'flex'; }
    else if (name === 'result') { document.getElementById('result').style.display = 'flex'; }
  }
  var selectedAircraft = 'a', selectedTier = 1;
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
    ['a', 'b', 'c'].forEach(function (id) {
      var a = AIRCRAFT[id]; var unlocked = meta.unlocked[id];
      var el = document.createElement('div'); el.className = 'card' + (selectedAircraft === id ? ' picked' : '') + (unlocked ? '' : ' locked');
      el.innerHTML = '<div class="atitle" style="color:' + a.color + '">' + a.name + '</div><div class="muted">' + a.desc + '</div><div class="stat">HP ' + a.hp + ' · 速度 ' + a.speed + '</div><div class="stat">射速 ' + a.fireRate + ' · 伤害 ' + a.dmg + '</div>' + (unlocked ? '' : '<div class="lock">需 ' + a.unlockCost + ' 灵玉解锁</div>');
      if (unlocked) el.onclick = function () { selectedAircraft = id; renderBase(); };
      box.appendChild(el);
    });
    var shop = document.getElementById('shopList'); shop.innerHTML = '';
    UPGRADES.forEach(function (u) {
      var lv = meta.up[u.key]; var maxed = lv >= u.max; var cost = u.cost(lv); var afford = meta.currency >= cost;
      var el = document.createElement('div'); el.className = 'shop' + (maxed ? ' maxed' : (afford ? ' canbuy' : ' cant'));
      el.innerHTML = '<div class="sname">' + u.name + '</div><div class="muted">' + u.desc + '</div><div class="slevel">Lv ' + lv + '/' + u.max + ' · ' + (maxed ? '已满级' : ('需 ' + cost + ' 灵玉')) + '</div>';
      if (!maxed && afford) el.onclick = function () { meta.currency -= cost; meta.up[u.key]++; saveMeta(); renderBase(); };
      shop.appendChild(el);
    });
    var goal = meta.maxTier >= 3 && meta.bossCleared ? '<span class="ok">✓ 已通关深渊层</span> · ' : '目标：逐层通关至第3层 · ';
    document.getElementById('metaInfo').innerHTML = goal + '灵玉：<b>' + meta.currency + '</b> · 出击 ' + meta.runs + ' 次 · 最佳击杀 ' + meta.bestKills + ' · 已解锁 ' + meta.maxTier + '/3 层';
  }
  function startMission() { newRun(selectedAircraft, selectedTier); showScene('mission'); }
  function showResult(outcome, lootVal, banked, lost, killReward, label, unlockedNew) {
    document.getElementById('resultTitle').textContent = outcome === 'success' ? '撤离成功！' : (outcome === 'abandon' ? '已弃局撤离' : '机体被击毁…');
    document.getElementById('resultTitle').style.color = outcome === 'success' ? COL.extract : (outcome === 'abandon' ? COL.gold : COL.enemy);
    var html = '';
    html += '<div class="row">结局：<b>' + label + '</b>（第 ' + run.tier + ' 层）</div>';
    html += '<div class="row">战利品价值：<b>' + lootVal + '</b> · 击杀奖励：<b>' + (outcome === 'success' ? killReward : 0) + '</b></div>';
    if (outcome === 'success') html += '<div class="row ok">100% 入账：+<b>' + banked + '</b> 灵玉</div>';
    else if (outcome === 'abandon') html += '<div class="row bad">弃局损失 70%，带回 30%：+<b>' + banked + '</b>（损失 ' + lost + '）</div>';
    else html += '<div class="row bad">阵亡损失 85%，仅保险返现：+<b>' + banked + '</b>（损失 ' + lost + '）</div>';
    if (run.killedBoss) html += '<div class="row ok">★ 本局击破 BOSS！</div>';
    if (unlockedNew) html += '<div class="row ok">🔓 解锁第 ' + meta.maxTier + ' 层「' + TIERNAME[meta.maxTier - 1] + '」！</div>';
    if (run.tier === 3 && outcome === 'success' && run.killedBoss) html += '<div class="row ok">🏆 全层通关！你已征服深渊。</div>';
    html += '<div class="row">当前总灵玉：<b>' + meta.currency + '</b></div>';
    html += '<div class="muted" style="margin-top:10px">回基地可永久强化或挑战更高层。高层敌人更强但战利品更好。</div>';
    document.getElementById('resultBody').innerHTML = html;
  }

  // ---------- 按钮 ----------
  document.getElementById('titleStart').onclick = function () { if (!meta.seenTutorial) { showScene('base'); document.getElementById('tutorial').style.display = 'flex'; } else showScene('base'); };
  document.getElementById('titleHelp').onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };
  document.getElementById('tutorialClose').onclick = function () { meta.seenTutorial = true; saveMeta(); document.getElementById('tutorial').style.display = 'none'; };
  document.getElementById('startBtn').onclick = startMission;
  document.getElementById('helpBtn').onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };
  document.getElementById('mergeClose').onclick = function () { document.getElementById('mergeOverlay').style.display = 'none'; paused = false; };
  document.getElementById('backBtn').onclick = function () { showScene('base'); };
  document.getElementById('pauseResume').onclick = closePause;
  document.getElementById('pauseQuit').onclick = function () { closePause(); finishRun('abandon'); };
  document.getElementById('pauseHelp').onclick = function () { document.getElementById('tutorial').style.display = 'flex'; };

  showScene('title');
})();
