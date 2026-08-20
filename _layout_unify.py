# -*- coding: utf-8 -*-
"""统一布局引擎：computeLayout 用固定人体工学尺寸 + 屏幕分区，所有 Canvas HUD 改读 LAYOUT 单一真相。
避免跨设备/跨浏览器堆叠。每次替换都做 count 断言，失败立即中止。"""
import io, sys, os, shutil

PATH = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\game.js"
BAK = PATH + ".bak_layout"

def replace_once(src, old, new, label):
    cnt = src.count(old)
    if cnt != 1:
        raise SystemExit("[FAIL] %s : expected 1 occurrence, got %d\n--- anchor head ---\n%s" % (label, cnt, old[:200]))
    print("[OK]   %s" % label)
    return src.replace(old, new)

with io.open(PATH, "r", encoding="utf-8") as f:
    s = f.read()

# 万一已备份，先留一份原始（仅首次）
if not os.path.exists(BAK):
    shutil.copyfile(PATH, BAK)

# ---------- 1) 重写 computeLayout（固定尺寸 + 屏幕分区，移除 s 缩放）----------
OLD_CL = '''  function computeLayout() {
    var tIns = SA.t + (isWeChat ? 44 : 0);   // 顶部内缩：微信 H5 顶栏常驻，额外 +44 防遮挡
    var bIns = SA.b, lIns = SA.l, rIns = SA.r;
    var pad = Math.max(8, Math.round(Math.min(W, H) * 0.014));
    var s = Math.min(W, H) / 760;            // 全局缩放因子（小屏/大屏自适应）
    LAYOUT = { t: tIns, b: bIns, l: lIns, r: rIns, pad: pad, s: s, W: W, H: H, canvas: !isMobile };
    // ---- Canvas HUD ----
    var lpW = Math.round((isMobile ? 150 : 210) * s), lpH = Math.round((isMobile ? 74 : 92) * s);
    LAYOUT.hp = { x: lIns + pad, y: tIns + pad, w: lpW, h: lpH };
    var mmw = Math.round((isMobile ? 78 : 150) * s), mmh = Math.round(mmw * WORLD_H / WORLD_W);
    LAYOUT.minimap = { x: W - rIns - pad - mmw, y: tIns + pad, w: mmw, h: mmh };
    // 悬赏 / 拾取：移动端一律放左侧列（HP 面板下方），永不与右侧轮盘/按钮冲突
    if (isMobile) {
      LAYOUT.bounty = { x: lIns + pad, y: LAYOUT.hp.y + lpH + 8, w: Math.min(W * 0.5, Math.round(216 * s)), h: Math.round(46 * s) };
      LAYOUT.pickup = { x: lIns + pad, y: LAYOUT.bounty.y + LAYOUT.bounty.h + 8, w: Math.min(W * 0.54, Math.round(236 * s)), headerH: Math.round(30 * s), rowH: Math.round(44 * s) };
    } else {
      LAYOUT.bounty = { x: W - rIns - pad - 220, y: LAYOUT.minimap.y + mmh + 10, w: 220, h: 46 };
      LAYOUT.pickup = { x: W - rIns - pad - 320, y: LAYOUT.bounty.y + 56, w: 320, headerH: 32, rowH: 34 };
    }
    // 道具槽（底部居中，避开底部安全区）
    var cSize = Math.round((isMobile ? 38 : 42) * s), cGap = Math.round((isMobile ? 8 : 11) * s), cN = 3;
    var cTot = cN * cSize + (cN - 1) * cGap;
    LAYOUT.consSlots = { x: (W - cTot) / 2, y: H - cSize - (bIns + Math.round(28 * s)), size: cSize, gap: cGap };
    // ---- DOM 触控键 ----
    var fsSize = Math.round(116 * s);
    LAYOUT.fire = { size: fsSize, x: W - rIns - pad - fsSize, y: H - bIns - pad - fsSize };
    // 右侧战术竖栈：放在开火轮盘「左侧」，竖向堆叠，结构上不可能压到轮盘
    var btn = Math.round((isMobile ? 46 : 50) * s), bgap = Math.round(12 * s);
    var order = ['ult', 'dash', 'bp', 'phase', 'pick'];
    var stackH = order.length * btn + (order.length - 1) * bgap;
    var colX = LAYOUT.fire.x - Math.round(16 * s) - btn;       // 轮盘左侧留 16px 间隙
    var topLimit = LAYOUT.minimap.y + LAYOUT.minimap.h + 12;    // 栈顶不高于小地图底
    var botLimit = LAYOUT.fire.y - bgap;                        // 栈底不高于轮盘顶
    var startY = botLimit - stackH;
    if (startY < topLimit) {                                    // 空间不足：先压间隙，再缩按钮
      var avail = botLimit - topLimit;
      bgap = Math.max(4, Math.floor((avail - order.length * btn) / (order.length - 1)));
      stackH = order.length * btn + (order.length - 1) * bgap;
      startY = botLimit - stackH;
      if (startY < topLimit) {
        btn = Math.max(30, Math.floor(btn * (avail / (order.length * btn + (order.length - 1) * Math.max(4, bgap)))));
        bgap = Math.max(4, Math.floor((avail - order.length * btn) / (order.length - 1)));
        stackH = order.length * btn + (order.length - 1) * bgap;
        startY = botLimit - stackH;
      }
    }
    LAYOUT.btns = {};
    for (var _li = 0; _li < order.length; _li++) LAYOUT.btns[order[_li]] = { x: colX, y: startY + _li * (btn + bgap), size: btn };
    // 丹药 + 暂停：左下角独立区（远离右下战斗簇，且避开微信顶栏）
    LAYOUT.consBtn = { x: lIns + pad, y: H - bIns - pad - Math.round(46 * s), size: Math.round(46 * s) };
    LAYOUT.pause = { x: lIns + pad, y: LAYOUT.consBtn.y - Math.round(12 * s) - Math.round(40 * s), size: Math.round(40 * s) };
    window.__LAYOUT = LAYOUT;
  }'''

NEW_CL = '''  function computeLayout() {
    // 单一真相：触控键用「固定人体工学尺寸」（不随屏缩放，避免小屏缩成蚂蚁、大屏撑爆）；
    // 所有 HUD / 触控键位置由 屏幕尺寸 + 安全区 + 微信顶栏 推出，按「屏幕分区」分配，结构上杜绝跨设备堆叠。
    var tIns = SA.t + (isWeChat ? 40 : 0);   // 顶部内缩：微信 H5 顶栏常驻，额外 +40 防遮挡
    var bIns = SA.b, lIns = SA.l, rIns = SA.r;
    var pad = 10;                            // 通用间距（固定）
    LAYOUT = { t: tIns, b: bIns, l: lIns, r: rIns, pad: pad, W: W, H: H, canvas: !isMobile };

    if (isMobile) {
      var fsSize = 112, btn = 46, consBtnSize = 46, pauseSize = 40, slotSize = 40, slotGap = 8;
      // 左列信息面板（先算，供右侧战术栈避让）
      var lpW = 158, lpH = 88;
      LAYOUT.hp = { x: lIns + pad, y: tIns + pad, w: lpW, h: lpH };
      var mmw = 84, mmh = Math.round(mmw * WORLD_H / WORLD_W);
      LAYOUT.minimap = { x: W - rIns - pad - mmw, y: tIns + pad, w: mmw, h: mmh };
      // 开火轮盘（右下，贴安全区）
      LAYOUT.fire = { size: fsSize, x: W - rIns - pad - fsSize, y: H - bIns - pad - fsSize };
      // 战术竖栈：开火轮盘「左侧」竖向排列——结构上绝不压到轮盘
      var order = ['ult', 'dash', 'bp', 'phase', 'pick'];
      var bgap = 12;
      var stackH = order.length * btn + (order.length - 1) * bgap;
      var colX = LAYOUT.fire.x - 14 - btn;
      var botLimit = LAYOUT.fire.y - bgap;                  // 栈底不高于轮盘顶
      var topLimit = tIns + 8;                              // 栈顶不侵入顶栏
      var startY = botLimit - stackH;
      if (startY < topLimit) {                              // 竖直空间不足：先压间隙，再缩按钮
        var avail = botLimit - topLimit;
        bgap = Math.max(4, Math.floor((avail - order.length * btn) / (order.length - 1)));
        stackH = order.length * btn + (order.length - 1) * bgap;
        startY = botLimit - stackH;
        if (startY < topLimit) {
          btn = Math.max(34, Math.floor(btn * (avail / (order.length * btn + (order.length - 1) * Math.max(4, bgap)))));
          bgap = Math.max(4, Math.floor((avail - order.length * btn) / (order.length - 1)));
          stackH = order.length * btn + (order.length - 1) * bgap;
          startY = botLimit - stackH;
        }
      }
      colX = Math.max(colX, LAYOUT.hp.x + LAYOUT.hp.w + 8);   // 不与左侧信息列打架
      LAYOUT.btns = {};
      for (var _li = 0; _li < order.length; _li++) LAYOUT.btns[order[_li]] = { x: colX, y: startY + _li * (btn + bgap), size: btn };
      // 左下：丹药 + 暂停（远离右下战斗簇）
      LAYOUT.consBtn = { x: lIns + pad, y: H - bIns - pad - consBtnSize, size: consBtnSize };
      LAYOUT.pause = { x: lIns + pad, y: LAYOUT.consBtn.y - 10 - pauseSize, size: pauseSize };
      // 底部居中：丹药槽（避开底部安全区，不压轮盘/按钮）
      var cN = 3, cTot = cN * slotSize + (cN - 1) * slotGap;
      LAYOUT.consSlots = { x: (W - cTot) / 2, y: H - slotSize - (bIns + 34), size: slotSize, gap: slotGap };
      // 左列续：相位 → 悬赏 → 拾取（自上而下堆叠，互不重叠）
      var phaseH = 34, gap = 6;
      LAYOUT.phase = { x: lIns + pad, y: LAYOUT.hp.y + lpH + gap, w: 150, h: phaseH };
      var bountyH = 42;
      LAYOUT.bounty = { x: lIns + pad, y: LAYOUT.phase.y + phaseH + gap, w: Math.min(W * 0.5, 210), h: bountyH };
      // 拾取面板底部截断：不得压到 丹药槽 / 丹药键 / 暂停键 之上沿，杜绝与左下控件重叠
      var pickTop = LAYOUT.bounty.y + bountyH + gap;
      var pickBottom = Math.min(LAYOUT.consSlots.y - 8, LAYOUT.consBtn.y - 8, LAYOUT.pause.y - 8);
      LAYOUT.pickup = { x: lIns + pad, y: pickTop, w: Math.min(W * 0.54, 230), headerH: 30, rowH: 42, maxBottom: pickBottom };
    } else {
      LAYOUT.fire = null; LAYOUT.btns = {}; LAYOUT.consBtn = null; LAYOUT.pause = null;
      var lpW2 = 210, lpH2 = 92;
      LAYOUT.hp = { x: lIns + 16, y: tIns + 16, w: lpW2, h: lpH2 };
      var mmw2 = 150, mmh2 = Math.round(mmw2 * WORLD_H / WORLD_W);
      LAYOUT.minimap = { x: W - rIns - 10 - mmw2, y: tIns + 10, w: mmw2, h: mmh2 };
      LAYOUT.phase = { x: lIns + 16, y: LAYOUT.hp.y + lpH2 + 6, w: 184, h: 58 };
      LAYOUT.bounty = { x: W - rIns - 10 - 220, y: LAYOUT.minimap.y + mmh2 + 10, w: 220, h: 46 };
      LAYOUT.pickup = { x: W - rIns - 10 - 320, y: LAYOUT.bounty.y + 56, w: 320, headerH: 32, rowH: 34, maxBottom: H - 20 };
      var slotSize2 = 42, slotGap2 = 11, cTot2 = 3 * slotSize2 + 2 * slotGap2;
      LAYOUT.consSlots = { x: (W - cTot2) / 2, y: H - slotSize2 - 20, size: slotSize2, gap: slotGap2 };
    }
    window.__LAYOUT = LAYOUT;
  }'''

s = replace_once(s, OLD_CL, NEW_CL, "computeLayout rewrite")

# ---------- 2) drawHUD：移动端 HP/相位 坐标改读 LAYOUT ----------
OLD_HP = '''    var lpW = isMobile ? 164 : 200, lpH = isMobile ? 78 : 92;
    var lpX = 16 + SA.l;
    var lpY = (isMobile ? 48 : 16) + SA.t; // 移动端让出最左上角暂停微按钮的 6~38px 区 + 微信顶栏缓冲'''
NEW_HP = '''    var lpX = isMobile ? LAYOUT.hp.x : (16 + SA.l);
    var lpY = isMobile ? LAYOUT.hp.y : (16 + SA.t);
    var lpW = isMobile ? LAYOUT.hp.w : 200;
    var lpH = isMobile ? LAYOUT.hp.h : 92;'''
s = replace_once(s, OLD_HP, NEW_HP, "drawHUD mobile hp coords -> LAYOUT")

# ---------- 3) drawHUD：幕章标识改顶部居中（移动端原在 HP 右侧，会与右侧战术栈重叠）----------
OLD_AX = '''      var _ax = isMobile ? (lpX + lpW + 8) : (W / 2 - _aw / 2);'''
NEW_AX = '''      var _ax = W / 2 - _aw / 2;'''
s = replace_once(s, OLD_AX, NEW_AX, "act chapter -> top center")

# ---------- 4) drawConsumables：移动端改读 LAYOUT.consSlots ----------
OLD_C = '''    var n = 3, size = isMobile ? 38 : 42, gap = isMobile ? 8 : 10, totalW = n * size + (n - 1) * gap;
    // 5锚点之「底部居中·战术道具区」：水平居中浮动，避开底部系统小白条/手势条
    var bx = (W - totalW) / 2;                              // 水平居中
    var by = H - size - (isMobile ? 32 + SA.b : 20);        // 抬高 + 避开底部安全区，与两侧轮盘视觉更对齐'''
NEW_C = '''    var n = 3;
    var size = isMobile ? LAYOUT.consSlots.size : 42, gap = isMobile ? LAYOUT.consSlots.gap : 10, totalW = n * size + (n - 1) * gap;
    var bx = isMobile ? LAYOUT.consSlots.x : (W - totalW) / 2;
    var by = isMobile ? LAYOUT.consSlots.y : (H - size - 20);'''
s = replace_once(s, OLD_C, NEW_C, "drawConsumables -> LAYOUT.consSlots")

# ---------- 5) drawBounty：位置/尺寸改读 LAYOUT（移除右/左分支与 P 判定）----------
OLD_BO = '''  function drawBounty() {
    if (!bounty) return;
    var P = isMobile && window.innerHeight > window.innerWidth;
    var bw = 150, bh = 42;
    var bx = W - 160 - SA.r;
    var by;
    if (isMobile) {
      // 移动端：放到左上状态面板下方，彻底避开右侧背包/冲刺/开火轮盘热区
      var _lpH = P ? 78 : 92;
      bx = 16 + SA.l;
      by = (P ? 48 : 16) + SA.t + _lpH + 6 + 34 + 8;
      // 如果右侧空间充裕（横屏/平板），仍放右侧小地图下方
      if (!P) { bx = W - 160 - SA.r; by = 140 + SA.t; }
    } else {
      // 桌面：背包整块下方（镜像 drawBackpack 公式：cols=4,s=26,g=5；2 行 × (s+g) = 62；勿硬编码）
      var _mmw = 150, _mmh = Math.round(_mmw * WORLD_H / WORLD_W);
      var _bpTop = (78 + SA.t) + _mmh + 8;
      var _bpH = 2 * (26 + 5);
      by = _bpTop + _bpH + 8;
    }
    ctx.textAlign = 'left';'''
NEW_BO = '''  function drawBounty() {
    if (!bounty) return;
    // 严格追随 LAYOUT 单一真相（移动端=左侧信息列 / 桌面=背包整块下方），杜绝与触控键热区冲突
    var bw = LAYOUT.bounty.w, bh = LAYOUT.bounty.h;
    var bx = LAYOUT.bounty.x, by = LAYOUT.bounty.y;
    ctx.textAlign = 'left';'''
s = replace_once(s, OLD_BO, NEW_BO, "drawBounty -> LAYOUT")

# ---------- 6) drawPickupList：位置/尺寸改读 LAYOUT.pickup + 受 maxBottom 截断 ----------
OLD_PK = '''  function drawPickupList() {
    pickupRects = [];
    // 离开范围自动收起：无附近可拾取物时关闭列表（杜绝常驻遮挡战斗视野）
    if (pickupOpen && getNearLoot().length === 0) pickupOpen = false;
    if (!pickupOpen || scene !== 'mission') return;
    var isM = isMobile;
    var P = isM && window.innerHeight > window.innerWidth;
    // 移动端拾取面板收窄，避免盖住右侧轮盘/按钮；横屏可稍宽
    var pad = 10, rowH = isM ? 44 : 34, w = isM ? Math.min(P ? 210 : 260, W * 0.58) : 320, headerH = 32;
    var near = getNearLoot();
    var bodyH = near.length ? near.length * rowH : 48;
    var h = headerH + bodyH + pad * 2;
    // 贴靠右上视野开阔区（小地图正下方），半透明轻量面板——不压暗全屏，杜绝遮挡中央战斗与触控轮盘
    var mw = isM ? 80 : 150, mh = Math.round(mw * WORLD_H / WORLD_W);
    var my0 = isM ? (38 + SA.t) : 140;
    var x = W - w - 14 - SA.r;
    // 竖屏：确保面板不侵入右侧开火轮盘/按钮热区（右轮盘直径 120，距右 18）
    if (P) {
      var _rightStickLeft = W - 18 - 120 - 8; // 轮盘左边界再留 8px 间隙
      if (x + w > _rightStickLeft) x = Math.max(10 + SA.l, _rightStickLeft - w);
      // 极窄屏时优先放左侧（避免压到轮盘）
      if (x < 20 + SA.l) { x = 10 + SA.l; }
    }
    var y0 = my0 + mh + 8;'''
NEW_PK = '''  function drawPickupList() {
    pickupRects = [];
    if (pickupOpen && getNearLoot().length === 0) pickupOpen = false;
    if (!pickupOpen || scene !== 'mission') return;
    var isM = isMobile;
    // 严格追随 LAYOUT.pickup（移动端=左侧信息列、桌面=右上），面板高度受 maxBottom 截断，
    // 永不下探压到左下 丹药/暂停 键或底部道具槽，也绝不侵入右侧轮盘/按钮热区。
    var headerH = LAYOUT.pickup.headerH, rowH = LAYOUT.pickup.rowH, w = LAYOUT.pickup.w, pad = 10;
    var near = getNearLoot();
    var maxBody = Math.max(rowH, (LAYOUT.pickup.maxBottom - LAYOUT.pickup.y - headerH - pad * 2));
    var maxRows = Math.max(0, Math.floor(maxBody / rowH));
    var visible = Math.min(near.length, maxRows);
    var bodyH = visible ? visible * rowH : 48;
    var h = headerH + bodyH + pad * 2;
    var x = LAYOUT.pickup.x, y0 = LAYOUT.pickup.y;'''
s = replace_once(s, OLD_PK, NEW_PK, "drawPickupList -> LAYOUT.pickup + clamp")

# ---------- 7) drawPickupList 绘制循环：near.length -> visible ----------
OLD_LOOP = '''    for (var i = 0; i < near.length; i++) {
      var it = near[i].it, ry = y0 + headerH + pad + i * rowH;'''
NEW_LOOP = '''    for (var i = 0; i < visible; i++) {
      var it = near[i].it, ry = y0 + headerH + pad + i * rowH;'''
s = replace_once(s, OLD_LOOP, NEW_LOOP, "drawPickupList loop -> visible")

with io.open(PATH, "w", encoding="utf-8") as f:
    f.write(s)
print("\n[WRITE] game.js updated. Backup at", BAK)
