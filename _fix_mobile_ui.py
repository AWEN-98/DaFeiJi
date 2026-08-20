import io, re
p = "prototype/game.js"
s = io.open(p, encoding="utf-8").read()

# A. Add WeChat detection after _isMobileUA (line 1531)
old_a = """  var _isMobileUA = /Mobi|Android|iPhone|iPad|iPod|Mobile|Tablet|PlayBook|Silk|MIUI|EMUI|HarmonyOS/i.test(navigator.userAgent);
  function _computeMobile() {"""
new_a = """  var _isMobileUA = /Mobi|Android|iPhone|iPad|iPod|Mobile|Tablet|PlayBook|Silk|MIUI|EMUI|HarmonyOS/i.test(navigator.userAgent);
  var isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  function _computeMobile() {"""
if old_a in s:
    s = s.replace(old_a, new_a, 1)
    print("A ok")
else:
    print("A FAIL")

# B. In checkOrientation, add wechat-h5 class + extra top offset handling
old_b = """  function checkOrientation() {
    if (!isMobile) { document.body.dataset.orient = 'desktop'; return; }
    var portrait = window.innerHeight > window.innerWidth;
    // 横屏/竖屏双支持：仅打标记，由 CSS + drawHUD 自适应，不再封锁竖屏
    document.body.dataset.orient = portrait ? 'portrait' : 'landscape';"""
new_b = """  function checkOrientation() {
    if (!isMobile) { document.body.dataset.orient = 'desktop'; return; }
    var portrait = window.innerHeight > window.innerWidth;
    // 横屏/竖屏双支持：仅打标记，由 CSS + drawHUD 自适应，不再封锁竖屏
    document.body.dataset.orient = portrait ? 'portrait' : 'landscape';
    // 微信 H5：给 body 挂标记，CSS 可为顶部系统栏追加额外偏移，避免暂停/左上 UI 被微信顶栏遮挡
    if (isWeChat) document.body.classList.add('wechat-h5');"""
if old_b in s:
    s = s.replace(old_b, new_b, 1)
    print("B ok")
else:
    print("B FAIL")

# C. drawBounty: mobile portrait move to left under HP/phase panels
old_c = """    if (isMobile) {
      by = 140 + SA.t; // 移动端无背包：小地图底≈126，留 14px 间隙
    } else {"""
new_c = """    if (isMobile) {
      // 移动端：放到左上状态面板下方，彻底避开右侧背包/冲刺/开火轮盘热区
      var _lpW = isMobile ? 164 : 200, _lpH = isMobile ? 78 : 92;
      bx = 16 + SA.l;
      by = (isMobile ? 46 : 16) + SA.t + _lpH + 6 + 34 + 8;
      // 如果右侧空间充裕（横屏/平板），仍放右侧小地图下方
      if (!P) { bx = W - 160 - SA.r; by = 140 + SA.t; }
    } else {"""
if old_c in s:
    s = s.replace(old_c, new_c, 1)
    print("C ok")
else:
    print("C FAIL")

# D. drawPickupList: narrower on mobile, clamp x to avoid right stick/buttons
old_d = """    var isM = isMobile;
    var pad = 10, rowH = isM ? 46 : 34, w = isM ? Math.min(360, W * 0.62) : 320, headerH = 34;"""
new_d = """    var isM = isMobile;
    var P = isM && window.innerHeight > window.innerWidth;
    // 移动端拾取面板收窄，避免盖住右侧轮盘/按钮；横屏可稍宽
    var pad = 10, rowH = isM ? 44 : 34, w = isM ? Math.min(P ? 210 : 260, W * 0.58) : 320, headerH = 32;"""
if old_d in s:
    s = s.replace(old_d, new_d, 1)
    print("D1 ok")
else:
    print("D1 FAIL")

old_d2 = """    // 贴靠右上视野开阔区（小地图正下方），半透明轻量面板——不压暗全屏，杜绝遮挡中央战斗与触控轮盘
    var mw = isM ? 80 : 150, mh = Math.round(mw * WORLD_H / WORLD_W);
    var my0 = isM ? (78 + SA.t) : 140;
    var x = W - w - 14 - SA.r;
    var y0 = my0 + mh + 8;"""
new_d2 = """    // 贴靠右上视野开阔区（小地图正下方），半透明轻量面板——不压暗全屏，杜绝遮挡中央战斗与触控轮盘
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
    var y0 = my0 + mh + 8;"""
if old_d2 in s:
    s = s.replace(old_d2, new_d2, 1)
    print("D2 ok")
else:
    print("D2 FAIL")

# E. drawHUD: reduce mobile blood panel size
old_e = """    var lpW = isMobile ? 176 : 200, lpH = 92;
    var lpX = 16 + SA.l;
    var lpY = (isMobile ? 46 : 16) + SA.t; // 移动端让出最左上角暂停微按钮的 6~38px 区"""
new_e = """    var lpW = isMobile ? 164 : 200, lpH = isMobile ? 78 : 92;
    var lpX = 16 + SA.l;
    var lpY = (isMobile ? 48 : 16) + SA.t; // 移动端让出最左上角暂停微按钮的 6~38px 区 + 微信顶栏缓冲"""
if old_e in s:
    s = s.replace(old_e, new_e, 1)
    print("E ok")
else:
    print("E FAIL")

# F. drawConsumables: bigger slots, higher position, aligned with wheels
old_f = """  function drawConsumables() {
    var n = 3, size = isMobile ? 30 : 38, gap = isMobile ? 6 : 10, totalW = n * size + (n - 1) * gap;
    // 5锚点之「底部居中·战术道具区」：水平居中浮动，避开底部系统小白条/手势条
    var bx = (W - totalW) / 2;                              // 水平居中
    var by = H - size - (isMobile ? 24 + SA.b : 16);        // 避开底部安全区"""
new_f = """  function drawConsumables() {
    var n = 3, size = isMobile ? 38 : 42, gap = isMobile ? 8 : 10, totalW = n * size + (n - 1) * gap;
    // 5锚点之「底部居中·战术道具区」：水平居中浮动，避开底部系统小白条/手势条
    var bx = (W - totalW) / 2;                              // 水平居中
    var by = H - size - (isMobile ? 32 + SA.b : 20);        // 抬高 + 避开底部安全区，与两侧轮盘视觉更对齐"""
if old_f in s:
    s = s.replace(old_f, new_f, 1)
    print("F ok")
else:
    print("F FAIL")

# G. renderHangarEquip: wrap name to allow ellipsis truncation
old_g = """        slots += '<div class="eq-slot" data-type="' + slot + '" data-state="' + state + '">' +
          '<div class="box"><img class="bg" src="assets/v3/ui/cropped/slot_' + slot + '_' + state + '.png" alt="">' + iconHtml + '</div>' +
          '<div class="en hangar-slot-name slot-label">' + badgeHtml + (eq ? eq.name : SLOTNAME[slot]) + '</div>' +
        '</div>';"""
new_g = """        var _name = eq ? eq.name : SLOTNAME[slot];
        slots += '<div class="eq-slot" data-type="' + slot + '" data-state="' + state + '">' +
          '<div class="box"><img class="bg" src="assets/v3/ui/cropped/slot_' + slot + '_' + state + '.png" alt="">' + iconHtml + '</div>' +
          '<div class="en hangar-slot-name slot-label" title="' + _name + '">' + badgeHtml + '<span class="hn-txt">' + _name + '</span></div>' +
        '</div>';"""
if old_g in s:
    s = s.replace(old_g, new_g, 1)
    print("G ok")
else:
    print("G FAIL")

io.open(p, "w", encoding="utf-8").write(s)
print("game.js edits done")
