# 霓虹山海 · 打击感与特效圣经（Visual Feel & VFX Bible）

> 项目：《空域撤离》　|　品类：打飞机 × 搜打撤 × 合成 × 肉鸽　|　平台：PC / 浏览器 Canvas 原型
> 关联：`art/bible/art-bible-v0.md`（继承配色/铁律）、`design/gdd/core-loop.md`、`prototype/game.js`
> 文档定位：**给技术主程在 `prototype/index.html` + `game.js` 里直接落地的可执行规格**，非美学空谈。
> 阅读方式：逐节是 checklist；§7 为可直接粘贴的 JS 骨架。

---

## 0. 与现有美术圣经的对齐说明（必读）

- **不另起炉灶**：下方所有 hex 均继承自 `art-bible-v0.md` §2 与 `game.js` 的 `COL` / `RARCOL`，未引入新的色相区间。
- **敌我冷暖铁律保留**：玩家永远偏冷/亮（妖青描边 + 自发光），敌人偏暖/暗（赤绯/紫/煞红）。**游医例外**：它是「治疗友军的敌方单位」，用灵玉绿十字光环表达「增益/治疗」语义，属于可控的语义色，不破坏铁律（绿=增益，非玩家阵营色，且带十字形状编码）。
- **克制 Bloom / 统一描边**：沿用 art-bible §8「克制 Bloom」原则——金光/高光发光，禁止糊成一片；所有实体沿用 2–3px 墨黑描边。
- **可访问性约束**：所有「危险」信号必须**形状/动效/文字三选二冗余**（见 `art/accessibility.md` §3），不得只靠颜色。Boss 弹幕除赤绯/紫红外，必须叠加**闪烁 + 预警线**。

---

## 1. 核心配色 Token 表（可直接抄进 `game.js` 的 `COL`）

> 优先级：先对齐你已有的 `COL` / `RARCOL`，再补「煞红/紫秘宝/玄铁/灵玉」等 lore/稀有度色。
> 含义约定：**青=玩家/友方，金=可带出/普通强化，红(赤绯)=敌人/将损失/危险，绿(灵玉)=成功/撤离/治疗，紫秘宝=史诗稀有，煞红=BOSS级威胁。**

### 1.1 阵营 / 功能 Token（继承 art-bible §2）

| Token 名 | HEX | 在游戏里代表什么 | 备注 |
|---|---|---|---|
| 妖青 `player` | `#2BD4C4` | 玩家机体、友方、安全区、UI 主描边 | 全游戏最「冷」色，永远给玩家 |
| 妖青深 `playerEdge` | `#062b29` | 玩家描边 | 沿用 |
| 霓金 `gold` | `#FFC24B` | 可带出资源、撤离点、普通强化、宝箱 | 「亮金=能带走」契约色 |
| 赤绯 `enemy` | `#FF3B5C` | 敌弹、将损失提示、普通敌人、Boss 威胁 | 「红=危险」主色 |
| 赤绯深 `enemyEdge` | `#51101d` | 敌人描边 | 沿用 |
| 灵玉绿 `extract` | `#3CFFA0` | 撤离点、搜打撤成功、灵玉货币、治疗/吸血 | 绿=「安全/收益/增益」 |
| 夜蓝 `bg` | `#0b1020` | 背景天空、网格底 | 沿用 COL.bg |
| 墨黑 `ink` | `#0E1424` | 统一描边、对比底 | 3px |
| 宣白 `paper` | `#F4EFE6` | 文字、高光、普通伤害飘字 | |

### 1.2 稀有度 / Lore Token（本次新增与明确）

| Token 名 | HEX | 代表什么 | 用法 |
|---|---|---|---|
| 白·普通 `rar_white` | `#e8e8e8` | 普通战利品 | 合成 tier0 |
| 绿·精良 `rar_green` | `#4caf50` | 精良 | 合成 tier1 |
| 蓝·稀有 `rar_blue` | `#3aa0ff` | 稀有 | 合成 tier2 |
| 紫·紫秘宝 `rar_purple` | `#b06bff` | 史诗 / 紫秘宝箱 / 精英 | 合成 tier3；宝箱最高级 |
| 橙·传说 `rar_orange` | `#ff9d2e` | 传说（满级） | 合成 tier4；Boss 必掉 |
| 玄铁 `iron` | `#7A8794` | 低阶材料资源（玄铁/梼杌鳞等普通掉落命名） | 仅在掉落命名/图标用，非玩家色 |
| 灵玉 `jade` | `#3CFFA0` | 货币「灵玉」、撤离收益高亮 | 与 `extract` 同值，统一为「收益绿」 |
| 煞红 `sha` | `#D11A2A` | **BOSS 级威胁**（比赤绯更深更暗的猩红） | Boss 本体/阶段3/穷奇主色；与赤绯拉开明度差 |
| 精英金 `elite` | `#FFD24B` | 精英敌人 | 沿用 COL.elite |
| 符·火 `rune_fire` | `#FF6A3D` | 火系符文 | 三选一反馈色 |
| 符·水 `rune_water` | `#3aa0ff` | 水系符文 | |
| 符·雷 `rune_thunder` | `#FFE14B` | 雷系符文 | |
| 符·风 `rune_wind` | `#2BD4C4` | 风系符文 | |
| 符·煞 `rune_sha` | `#D11A2A` | 煞系符文 | |

> **更替建议**：把现有 `COL` 补成下列对象即可（其余沿用）：
> ```js
> var COL = {
>   bg:'#0b1020', grid:'rgba(43,212,196,0.06)', player:'#2BD4C4', playerEdge:'#062b29',
>   bulletP:'#9fefff', enemy:'#FF3B5C', enemyEdge:'#51101d', bulletE:'#ff8a5b',
>   extract:'#3CFFA0', gold:'#FFC24B', node:'#FFC24B', elite:'#FFD24B',
>   ink:'#0E1424', paper:'#F4EFE6', jade:'#3CFFA0', iron:'#7A8794', sha:'#D11A2A'
> };
> // 子弹配色（玩家弹=亮青，敌弹=橙红，Boss弹=紫红）
> var BULLET_COL = { player:'#9fefff', enemy:'#ff8a5b', boss:'#ff5c7a', buff:'#FFE9A8' };
> ```

---

## 2. 打击感三件套规格（Screen Shake / Hitstop / 拖尾火花）

> 现状：`game.js` **完全没有** screen shake 与 hitstop。下方为新增实现规格。所有时长单位为毫秒(ms)，幅度单位为像素(px)。

### 2.1 屏幕抖动 Screen Shake

- **实现方式**：维护 `shake = {mag, t, dur}`。每帧计算 `k = mag * exp(-t/τ)`（指数衰减），对**世界层**（grid/nodes/loot/enemies/bullets/particles/player，**不含 HUD**）做 `ctx.save(); ctx.translate(rand(-k,k), rand(-k,k));`，世界绘制完后 `ctx.restore()`。
- **衰减曲线**：统一用指数 `k(t)=A·exp(-t/τ)`；`t=dur–剩余`，`τ` 见下表。终值夹取 `|offset|≤14px`。
- **触发表**：

| 触发时机 | 幅度 A(px) | 持续 dur(ms) | 衰减 τ(ms) | 备注 |
|---|---|---|---|---|
| 玩家开火（每发） | 1.2 | 50 | 22 | multishot 多管时幅度不叠加，取单发上限 |
| 玩家命中敌人（普通） | 2.0 | 70 | 30 | 与开火叠加 |
| 暴击命中 | 3.2 | 100 | 40 | 额外金白闪（见 §3） |
| 玩家受击 | 4.5 | 130 | 55 | 同时红屏闪 + 顿帧（§2.2） |
| 敌人死亡爆裂（小怪） | 5.0 | 160 | 70 | — |
| 精英死亡 | 7.0 | 200 | 90 | — |
| 宝箱开启 | 2.5 | 90 | 40 | 金脉冲 |
| **Boss 出场** | 9.0 | 500 | 180 | 末段衰减；同时暗角 + 煞红闪（§3） |
| **Boss 阶段切换** | 7.0 | 260 | 120 | + 白闪 + 慢镜顿帧 120ms |
| **Boss 死亡** | 13.0 | 450 | 200 | 全屏白闪 120ms |

- **叠加规则**：新抖动取 `mag=max(当前mag, 请求A)`、`dur=max(当前dur, 请求dur)`，**不累加**（避免越打越晕）。

### 2.2 命中顿帧 Hitstop（时间冻结）

- **实现方式**：维护全局 `freeze`（秒）。`loop()` 中：若 `freeze>0` 则 `freeze -= realDt` 且**本帧不调用 `update(dt)`（dt 视为 0）**，仅 `render()`；否则正常 `update`。
- **叠加规则**：`freeze = min( max(freeze, 请求秒数), 0.22 )`（硬上限 220ms，防卡死）。
- **触发表**：

| 触发时机 | 冻结(ms) | 恢复方式 | 备注 |
|---|---|---|---|
| 普通命中 | 35 | 到点自动恢复 | — |
| 暴击命中 | 70 | 同上 | 配合金闪 |
| Boss 受击 | 50 | 同上 | Boss 体量更大，略长 |
| 敌人死亡 | 90 | 同上 | 击杀要「砸」下去 |
| 宝箱开启 | 40 | 同上 | 轻顿 |
| Boss 阶段切换 | 120 | 同上 | 慢镜感（先闪后动） |
| Boss 死亡 | 220 | 同上 | 全屏白闪 + 长顿 |

> 注意：`freeze` 期间粒子/飘字也应冻结（因为它们在 `update` 里推进），保证「全世界定格」的顿帧质感。HUD 文字（banner）可照常走，或一并冻结——建议**一并冻结**更干净。

### 2.3 霓虹拖尾与火花粒子

> 粒子系统现状：`game.js` 用 `particles.push(...)` / `splice`，**无固定上限、每帧分配对象**（见 §6 性能约束，需改成对象池）。
> 以下规格中的「寿命」单位秒(s)，「速度」单位 px/s。

**弹道霓虹拖尾（Trail）**
| 弹种 | 颜色 | 寿命 | 宽度 | 画法 |
|---|---|---|---|---|
| 玩家弹 | `#9fefff` | 0.12s | 2px | 每帧在弹尾生成 1 个短命粒子，**或**直接画 `(lastX,lastY)→(x,y)` 线段（更省） |
| 敌弹 | `#ff8a5b` | 0.12s | 2px | 同上；边缘 1px 白描边提可读性（accessibility §3） |
| Boss 弹 | `#ff5c7a` | 0.18s | 3px | 同上，强红雾感 |
| 强化/符文弹 | `#FFE9A8` | 0.14s | 2px | 金粉感 |

**命中火花（Hit Spark）**
| 类型 | 粒子数 | 颜色 | 速度 | 寿命 | 尺寸 | 阻力 |
|---|---|---|---|---|---|---|
| 普通命中 | 4–6 | 核心白 `#FFFFFF` + 边缘敌色 `#FF3B5C` | 60–200 径向 | 0.18–0.32s | 1–2.5 | ×0.9/帧 |
| 暴击 | 8–12 | 金白 `#FFE9A8`/`#FFFFFF` | 90–260 | 0.25–0.40s | 1.5–3 | ×0.9 |
| 玩家受击 | 5 | 红 `#FF3B5C` 向外 | 50–160 | 0.2–0.35s | 1.5–3 | ×0.9 |
| Boss 命中 | 6–8 | 紫红 `#ff5c7a` | 80–240 | 0.2–0.35s | 1.5–3 | ×0.9 |

**死亡爆裂（Death Burst）** —— 在火花基础上叠加**冲击波环**
| 类型 | 爆裂粒子 | 颜色 | 速度 | 寿命 | 冲击波环 |
|---|---|---|---|---|---|
| 小怪 | 10–16 | 敌色 `#FF3B5C` | 80–260 | 0.3–0.7s | 线宽 3→0，半径 8→46，0.3s |
| 精英 | ×1.6 | 精英金 `#FFD24B` | 100–300 | 0.4–0.8s | 双环 |
| Boss | 24–36 | 紫红 `#ff5c7a`→`#D11A2A` | 120–340 | 0.5–1.0s | 双环 + 长拖尾 |

---

## 3. 战斗特效清单（逐项 spawn 规格）

> 每个特效给「触发点 + 视觉构成 + 颜色 + 时长」，可直接映射成 `spawnXxx()` 函数。

| # | 特效 | 触发点 | 视觉构成 | 颜色 / 时长 | 实现提示 |
|---|---|---|---|---|---|
| 1 | **枪口闪光** Muzzle | `fireBullet` 玩家弹生成处 | 朝瞄准方向的短三角/星芒，additive | `#cffcff`，scale 8–14px，50ms | 用预渲染辉光精灵 drawImage，禁用逐发 shadowBlur |
| 2 | **弹道霓虹拖尾** | 每帧弹体 | 见 §2.3 | 见 §2.3 | 线段画法最优 |
| 3 | **命中火花** | 子弹命中敌人/Boss 瞬间 | 见 §2.3 | 见 §2.3 | 配合 35–50ms 顿帧 |
| 4 | **暴击特效** | 暴击命中 | 金白大火花(×1.6) + 瞬时白环(半径6→22,0.12s) + 屏幕微白闪(α0.12,60ms) + 暴击飘字(§5) | 金 `#FFE9A8` / 白；顿帧70ms | 白环用 `stroke` 圆，线宽随寿命减 |
| 5 | **吸血特效** | 吸血符文命中 | 敌→玩家的红转青光束 + 绿色治疗飘字「+N」 | 束 `#FF3B5C`→`#3CFFA0`；飘字绿 | 画一条从敌到玩家的渐变线，0.2s 淡出 |
| 6 | **召唤特效** | 召唤炮台/分身符文 | 召唤点出现收敛青光环 + 粒子向心汇聚 + 符箓字形闪 | `#2BD4C4`；环半径40→8,0.4s | 粒子 `vx,vy` 指向中心 |
| 7 | **敌人死亡爆裂** | 敌人 hp≤0 | 见 §2.3 死亡爆裂 | 见 §2.3 | 精英/Boss 加环 |
| 8 | **Boss 出场** | `spawnBoss()` | 全屏暗角(Vignette)由外向内合拢→煞红全屏闪(α0.25,150ms)→警告横幅→屏幕抖动9px/500ms→Boss 旋转警报环 | 暗角黑+`#D11A2A`；环 `sin` 脉冲 | 暗角用 4 个渐变矩形或径向遮罩 |
| 9 | **Boss 阶段切换** | `b.phase` 变化 | 白闪(α0.3,120ms) + 色调偏移(全屏叠一层当前阶段色,0.3s 淡出) + 慢镜顿帧120ms + 抖动7px + 弱点核心高亮闪1s(无敌窗口) | 阶段色见 §4 | 弱点窗口用 `boss.flash` 已有时序 |
| 10 | **Boss 死亡** | `killBoss()` | 白闪(α0.4,120ms) + 大爆裂(24–36) + 双冲击波 + 长抖动13px/450ms + 顿帧220ms | 紫红→煞红 | 复用死亡爆裂规格 |

---

## 4. 敌人 / Boss 视觉识别（CSS 颜色 + 几何 silhouette）

> 目的：让 `game.js` 的 `drawEnemies()` / `drawBoss()` 能用**纯几何 + 颜色**画出可辨识的轮廓，无需贴图。
> 每个给：轮廓形状（Canvas 画法）、主色、识别特征（含形状编码，满足 accessibility §3）。

### 4.1 普通敌人（tier 进度解锁的新增三类，教程 step6 已定义）

**① 炮艇 Gunship（高血·慢速）**
- **轮廓**：横向长舰体——`roundRect` 长条（宽 56 高 26）+ 前端 3 个炮口圆点（小黑圆）+ 顶部装甲板矩形。
- **主色**：`#FF3B5C`（赤绯），描边 `#51101d`。
- **识别特征**：**宽而扁、几乎不转向**，缓慢直线碾压；血条极长（高血量语义）。移动慢（speed≈40–55）。
- 体型 `r≈30`（比普通敌 17 大近一倍），靠「体量差」一眼认出。

**② 游医 Healer（治疗友军）**
- **轮廓**：圆润菱形/灯笼体（4 点星形）+ **悬浮绿色十字光环**（横竖两道发光线，绕体旋转）。
- **主色**：本体 `#3CFFA0`（灵玉绿），描边 `#0E1424`；十字光环 `#3CFFA0` 高亮。
- **识别特征**：**绿色十字光环** + 周期性向受伤友军发射绿色治疗光束（可见的绿线）。语义色绿=增益，不混淆玩家阵营（玩家是妖青+三角形）。
- 体型 `r≈20`，移动中等，优先避让玩家、贴近伤员。

**③ 分裂体 Splitter（死亡分裂）**
- **轮廓**：带凹口的八边形/细胞状（外圈 8 尖，内圈可见分割线「十字」暗示两半）。
- **主色**：`#b06bff`（紫秘宝紫），描边 `#2a0a2a`；核心有脉动亮点。
- **识别特征**：**体内十字分割线**暗示「会裂开」；死亡时 `burst` 同位置生成 2–3 个 `r≈一半` 的小分裂体（递归最多 1 代，防无限分裂）。小体用同色但更亮。
- 体型 `r≈22`，中速。

### 4.2 Boss

**④ 梼杌·封印体（Boss · tier 1–2）**
- **轮廓**：大号不规则八边形（8 尖，旋转 `gameTime*0.3`）+ 顶部「封印冠」尖刺环；中央有**弱点核心**（阶段切换时高亮闪烁，1s 无敌窗口）。
- **主色（按阶段）**：
  - P1（100–66%）：`#b06bff`（紫秘宝）
  - P2（66–33%）：`#ff7a99`（转赤）
  - P3（33–0%）：`#D11A2A`（煞红，最深）
  - 描边 `#2a0a2a`；`flash>0` 时填白。
- **识别特征**：巨体 `r≈46` + 旋转尖刺 + 阶段色递进（紫→赤→煞红=「越来越危险」可读信号）+ 弱点核心闪。出场警报环 `sin` 脉冲（沿用现有 `drawBoss` wake 环）。
- 弹幕：P1 放射+追踪；P2 加地刺风险区；P3 全屏弹幕（沿用 `updateBoss` 数值，仅补特效）。

**⑤ 穷奇·掠食（Boss · tier 3，突进+召唤）**
- **轮廓**：**前倾的捕食箭头/双翼刃**——一个朝玩家方向的尖锐三角翼（翼展宽、前端尖），整体「扑击」姿态；身后拖紫红残影。
- **主色**：`#D11A2A`（煞红）主体 + `#b06bff` 紫纹饰；描边 `#2a0a2a`。
- **识别特征（强预告，满足 accessibility）**：
  - **突进预告**：冲刺前 0.4s 画一条**红色瞄准箭头/线**从穷奇指向玩家（与 Boss 弹幕预警线同源信号）。
  - **召唤预告**：召唤小怪时地面出现 **紫色召唤法阵环**（旋转 + 收束），0.6s 后生成 adds。
  - 体量 `r≈50`，比梼杌更大更「尖锐」。
- 弹幕：高速定向齐射 + 召喚（复用 `spawnEnemy` 但带 `wake` 与法阵特效）。

> 所有敌人/Boss 在 `wake`（出场预警）期间沿用现有红色脉冲环 `sin(gameTime*12)` 信号，保证「未现身先预警」。

---

## 5. UI / 反馈视觉

### 5.1 撤离点脉冲光环（Exfil Pulse）
- 绿框 `#3CFFA0`（沿用 `drawExtract`）基础上，**叠加向外扩散的脉冲环**：环半径 `r = (progressPct*… )` 或固定 `baseR + (t%1.2)/1.2 * 60`，线宽 `3→0`，α `0.5→0`，周期 1.2s。
- 玩家**在框内**时：光环频率×2、框内填充 α 从 `0.2+0.3*prog` 提升到 `0.35+0.4*prog`，并加金色方向箭头（沿用 art-bible §5「撤离提示：边缘金渐显+方向箭头」）。

### 5.2 伤害飘字（三种样式）

| 类型 | 颜色 | 字号/样式 | 动效 | 文案示例 |
|---|---|---|---|---|
| 普通 | `#F4EFE6`（宣白） | 14px 常规 | 上飘 22px/s，life 1.1s，α 淡出 | `-23` |
| 暴击 | `#FFC24B`（金）+ 白描边 | 20px 加粗 + 入场 scale 1.3→1.0 弹动 | 上飘 + 微抖；顿帧后弹出 | `暴击 -58` |
| 吸血 | `#3CFFA0`（灵玉绿） | 14px 加粗 | 上飘，带「+」前缀 | `+12`（绿，表示回血） |

> 飘字系统复用现有 `floaters` 数组，补充 `style` 字段区分三类即可；暴击的 scale 弹动在 `drawParticles` 里按 `life` 算。

### 5.3 符文三选一拾取反馈（Rune 3-pick）
- 选定瞬间：对应卡片按**系别色**发光（`rune_fire/wind/...` 见 §1.2），玩家位置爆出该系颜色 `burst(8)` + 横幅 `获得强化：<名>`（沿用 `banner`）。
- 系别色映射：火 `#FF6A3D` / 水 `#3aa0ff` / 雷 `#FFE14B` / 风 `#2BD4C4` / 煞 `#D11A2A` —— 与符文系统（火/水/雷/风/煞 5 系）一一对应，便于玩家「看色识系」。

### 5.4 保险返现提示的视觉语气（Insurance Return）
- 语义：core-loop §3.2「保险槽必返还」是**安抚性**信号，视觉语气要「安心」而非「惩罚」。
- 配色：**妖青 `#2BD4C4` + 灵玉绿 `#3CFFA0`**（非赤绯），加柔和辉光 + 盾形/返还图标；文案「保险槽已返还：+N 灵玉」，与「阵亡损失 85%」的赤绯红形成**冷暖对比**。
- 结算页（`showResult`）建议：损失项用赤绯红（ punishing），保险返还项用妖青绿（reassuring），让玩家一眼区分「必丢」与「保底回」。

---

## 6. 性能约束（60fps 硬指标）

> 现状痛点：`game.js` 粒子用 `push/splice`、无固定上限、`shadowBlur` 逐粒子调用——在大量命中/死亡时会掉帧。下方为落地约束。

### 6.1 粒子上限与预算
- **同屏粒子硬上限 `POOL = 512`**（建议值；按目标机型可下调到 384）。任何 spawn 超出即从**最老活跃粒子**回收（环形缓冲，见 §7）。
- 事件预算（单次 spawn 粒子数上限）：

| 事件 | 单次粒子数 | 并发上限估算 |
|---|---|---|
| 弹道拖尾/帧 | 1/弹/帧（线段画法可省） | 受弹数上限约束（建议 ≤120 弹同屏） |
| 命中火花 | 4–6（暴击 8–12） | 同屏命中并发 ≤30 → ≤360 |
| 死亡爆裂 | 10–16（Boss ≤36） | 同屏死亡 ≤10 → ≤360 |
| 总池 | **512** | 超限回收最老，绝不分配新对象 |

### 6.2 禁止每帧分配对象
- **对象池**：预分配定长 `particles` 数组（§7），用 `alive` 标记 + 环形游标，**杜绝 `push/splice/new`**。
- `floaters`、bullet trail 同理走池或线段画法。
- 避免在 `update` 循环里创建临时对象/数组/`Object.assign`。

### 6.3 渲染成本控制
- **禁用逐粒子 `shadowBlur`**：Canvas2D 的 `shadowBlur` 是性能杀手。改为**预渲染一张径向渐变辉光精灵**（offscreen canvas，`makeGlow(color)` 一次），用 `drawImage` 缩放绘制发光——速度提升一个数量级。
- `shadowBlur` **仅保留**给玩家/Boss/子弹等少数关键实体（每帧数量少）。
- **批量绘制**：同色粒子分批，`beginPath` 一次画多圆；减少 `fillStyle`/`globalAlpha` 状态切换。
- **dt 夹取**：`dt = min(0.05, realDt)` 沿用现有，防卡顿后大跳。
- **可访问性开关联动**：`accessibility.md` 的「动态模糊/Bloom 开关」需能**一键关闭所有辉光精灵与拖尾**（§2.3 拖尾、§3 枪口闪、§4 光环），关闭后仅靠形状/动效传达信息。

---

## 7. 实现落地附录（可直接粘贴的 JS 骨架）

> 以下代码对接现有 `game.js` 变量名（`player/enemies/bullets/boss/particles/floaters/COL`）。替换现有 `burst()`，新增 `shake`/`freeze`/池，并在 `loop()` 与 `render()` 接入。

```js
/* ===== 7.1 配色（并入 COL，见 §1） ===== */
var BULLET_COL = { player:'#9fefff', enemy:'#ff8a5b', boss:'#ff5c7a', buff:'#FFE9A8' };

/* ===== 7.2 对象池（替换 particles.push/splice） ===== */
var POOL = 512;
var particles = new Array(POOL);
for (var i=0;i<POOL;i++) particles[i]={alive:false,x:0,y:0,vx:0,vy:0,life:0,maxLife:0,color:'#fff',r:2,ring:false,rmax:0};
var pCur = 0;
function spawnParticle(o){
  var p = particles[pCur]; pCur = (pCur+1)%POOL;        // 环形回收最老
  p.alive=true; p.x=o.x; p.y=o.y; p.vx=o.vx||0; p.vy=o.vy||0;
  p.life=o.life; p.maxLife=o.life; p.color=o.color; p.r=o.r||2;
  p.ring=!!o.ring; p.rmax=o.rmax||0;
}
// 火花 / 爆裂统一入口
function burst(x,y,color,n,opt){ opt=opt||{};
  for(var i=0;i<n;i++){ var a=rand(0,6.28), s=rand(opt.smin||60,opt.smax||220);
    spawnParticle({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(opt.lmin||0.25,opt.lmax||0.6),color:color,r:rand(opt.rmin||1.3,opt.rmax||3)});
  }
  if(opt.ring) spawnParticle({x:x,y:y,vx:0,vy:0,life:0.3,color:color,r:3,ring:true,rmax:opt.ringR||46});
}
// 拖尾（线段画法，零分配）：在 drawBullets 里画 last->cur，见 §2.3

/* ===== 7.3 屏幕抖动 + 顿帧 ===== */
var shake={mag:0,t:0,dur:0,tau:30};
function addShake(mag,dur,tau){ shake.mag=Math.max(shake.mag,mag); shake.dur=Math.max(shake.dur,dur/1000); shake.tau=tau/1000; shake.t=shake.dur; }
var freeze=0;
function addFreeze(ms){ freeze=Math.min(Math.max(freeze,ms/1000),0.22); }

/* ===== 7.4 接入 loop ===== */
var last=performance.now();
function loop(now){
  var realDt=Math.min(0.05,(now-last)/1000); last=now;
  if(scene==='mission' && !paused){
    if(freeze>0){ freeze-=realDt; }                 // 顿帧：冻结世界
    else update(realDt);
    if(shake.t>0) shake.t-=realDt;
  }
  render();
  requestAnimationFrame(loop);
}
// render() 内：世界层前后包 shake translate
function render(){
  if(scene!=='mission'){ drawGrid(); return; }
  var k = shake.t>0 ? shake.mag*Math.exp(-(shake.dur-shake.t)/shake.tau) : 0;
  k=Math.min(k,14);
  ctx.save();
  if(k>0) ctx.translate(rand(-k,k),rand(-k,k));      // ← 抖动只作用于世界层
  drawGrid(); drawNodes(); drawLoot(); drawExtract(); drawEnemies();
  if(boss) drawBoss(); drawBullets(); drawParticles(); drawPlayer();
  ctx.restore();
  drawHUD();                                         // HUD 不受抖动影响
}

/* ===== 7.5 触发点示例（替换/补充现有调用） ===== */
// 开火：fireBullet 后 addShake(1.2,50,22); 画枪口闪（预渲染辉光 drawImage）
// 命中：en.flash=0.08; burst(en.x,en.y, COL.enemy, 5); addFreeze(35);  (暴击 addFreeze(70)+金环)
// 受击：damagePlayer 内 addShake(4.5,130,55); addFreeze(35); 红屏闪
// 死亡：burst(x,y,color,en.elite?14:10,{ring:true,ringR:46}); addShake(5,160,70); addFreeze(90)
// Boss出场：addShake(9,500,180); 暗角+煞红闪；Boss阶段：addShake(7,260,120); addFreeze(120); 白闪
// Boss死：burst(boss.x,boss.y,'#ff5cf0',30,{ring:true,ringR:90}); addShake(13,450,200); addFreeze(220)

/* ===== 7.6 预渲染辉光精灵（替代逐粒子 shadowBlur） ===== */
function makeGlow(color){
  var c=document.createElement('canvas'); c.width=c.height=64; var g=c.getContext('2d');
  var grd=g.createRadialGradient(32,32,0,32,32,32);
  grd.addColorStop(0,color); grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd; g.beginPath(); g.arc(32,32,32,0,7); g.fill(); return c;
}
// 用法：ctx.drawImage(makeGlow('#9fefff'), x-16, y-16, 32, 32);  // 比 shadowBlur 快得多
```

---

## 8. 验收 Checklist（美术交付前）

- [ ] 开火/命中/受击/Boss出场/死亡 均有对应 screen shake，幅度与 §2.1 表一致
- [ ] 顿帧在三档（普通35/暴击70/Boss死220ms）生效，且世界与粒子同时冻结
- [ ] 玩家弹=青拖尾、敌弹=橙红拖尾、Boss弹=紫红拖尾，且色盲模式下敌弹仍为可辨形状
- [ ] 暴击有金白爆 + 白环 + 微白闪；吸血有红→绿束 + 绿飘字
- [ ] 炮艇(扁)/游医(绿十字)/分裂体(紫+十字分割)/梼杌(紫→赤→煞红阶段色)/穷奇(前倾箭头+突进红线+召唤紫阵) 轮廓可辨识
- [ ] 撤离点有绿脉冲环；伤害飘字三样式（白/金暴击/绿吸血）正确
- [ ] 符文三选一按系别色反馈；保险返还在结算页用妖青绿（非赤绯）语气
- [ ] 同屏粒子 ≤512，无 `push/splice/new` 每帧分配；辉光用预渲染精灵而非 shadowBlur
- [ ] 关闭 Bloom/动态模糊开关后，所有危险信号仍靠形状/动效可读（accessibility §3）

---

*文档结束。本圣经为 `art-bible-v0.md` 的「打击感与特效」子文档，所有配色/铁律继承自主美术圣经，未另立视觉体系。*
