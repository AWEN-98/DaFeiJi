# 《空域撤离》原型 · 全局排查与平衡审计报告

> 审计对象：`prototype/game.js`（6621 行）+ `prototype/index.html`（1666 行）
> 审计性质：**只读走查，未修改任何代码**（`node --check` 语法验证通过）
> 审计日期：2026-08-17 · 审计人：主理人（AI）

---

## 一、严重 Bug（Critical）— 建议全部修复

### C1. 玩家受击后没有无敌帧，贴身敌人伤害每帧结算 ⚠️ 最高优先级
- **位置**：`damagePlayer()`（约 4114 行）与接触伤害判定（约 3752-3762 行）
- **现状**：`damagePlayer()` 全程不设置 `player.iframe`。全文检索 `player.iframe` 共 16 处赋值，全部来自冲刺(0.5s)/风系(0.1s)/护盾丹药(1.5s)/裂隙复活(2s)，无一处在受击时授予。
- **后果**：普通敌接触伤害 `(7 或 13) × dmgMul` **每帧结算**，60fps 下贴身 1 秒 = 420~780 点伤害；Boss 贴身 `16 × tierDmgMul()` 每帧。玩家血量 72~165（不含装备），**亚秒蒸发**，"搜刮-撤离"节奏被迫变成碰瓷即死。
- **建议修复**：
  - 方案一（最小改动）：`damagePlayer()` 末尾加 `player.iframe = Math.max(player.iframe, 0.6);`
  - 方案二（更精细）：区分伤害来源——接触伤害给 0.6s 无敌帧，子弹/毒光/DOT 类给 0.3s，避免叠加判定位掩码被滥用。
  - 同时确认接触判定处 `if (player.iframe <= 0)` 门控（已有）与之配合即可。

### C2. 三处直推 `run.loot.push()` 绕过背包上限与拾取筛选
- **位置**：
  1. `collectNode()`（约 3815 行）——开宝箱直接 push；
  2. `exitRift()`（约 4097 行）——裂隙战利品并包直接 push；
  3. `dieInRift()`（约 4108 行）——同上。
- **现状**：正规入包走 `pushToLoot()`（上限 `invMax=8`，满则弃最低价值件并在地面掉落），且自动拾取受 #197 `run.pickupFilter` 筛选；但这三处全部绕过。
- **后果**：
  1. 背包可超载至 12/8（裂隙 2 件 + 宝库传说武器 + 宝箱连开），HUD「战利品 X/8」破版；
  2. 被玩家**主动过滤掉**的稀有度（#197 筛选功能）仍从宝箱直入背包，筛选功能被架空；
  3. `drawBackpack`（#198 背包 UI）只画 `invMax` 个格子，超载件**不可见也不可整理**，成为幽灵物品；
  4. 宝库房 `pushToLoot(riftLoot, ...)` 只按 riftLoot 自身长度判满，未与 `run.loot` 合并计数——主图背包已满 8 件时进宝库仍能再塞 2~3 件，出裂隙后总重 10~11/8。
- **建议修复**：三处统一改为 `pushToLoot(run.loot, ...)`；宝库房判满改为 `run.loot.length + riftLoot.length < invMax` 的合并口径；被丢弃件在裂隙内落到地面（已有 pushToLoot 掉地逻辑，可直接复用）。

---

## 二、数值平衡（Balance）— 现有公式 vs 建议公式

### B1. Boss 基础血量随真实时间线性膨胀，惩罚搜刮流
- **现有公式**：`hp = (620 + floor(gameTime) × 5) × (1 + (tier-1) × 0.7) × hpMul[kind]`
- **问题**：搜刮型玩法（本项目核心循环）300 秒才开 Boss 时基血已达 2120（≈3.4 倍初值），"搜得越久越打不动"，与"搜刮→撤离"激励方向相反。DPS 成长主要靠 `run.nodes` 收集数与装备，与时间并不强相关。
- **建议公式**：`hp = (620 + (run.nodes - need) × 60) × (1 + (tier-1) × 0.7) × hpMul[kind]`，上限截断 `(run.nodes - need)` 于 0~6——按**进度**而非**时间**计价；或保留时间项但系数降为 2 并加软上限：`620 + min(gameTime, 240) × 2`。

### B2. 转幕（zhuan）猎杀全量回血 + 永久倍率，体验断层
- **现有公式**：进入 zhuan 时存量敌人 `e.maxhp ×1.3; e.hp = e.maxhp`（清空玩家已造伤害），`dmgMul ×1.4` 永续；新刷敌人同样带 buff。
- **问题**：玩家辛苦打掉的血一夜清零，且在"承"幕后期被围攻时瞬间全体回满+变强，挫败感强、无预警缓冲。全量回血+永久增伤双叠加过狠。
- **建议公式**：保留伤害比例——`e.hp = round(e.hp × HUNT_HP)`（同乘 1.3 相当于等比放大、不掉已造伤害）；`HUNT_DMG 1.4 → 1.25`，或改为持续时间型（60s 猎杀窗口，窗口外回落），避免"转幕即永夜"。

### B3. `rollRarity` 参数语义不一致
- **现状**：`spawnEnemy` 掉落用 `etier`（1-4，随 gameTime 升阶），而宝箱/宝库路径传 `run.tier`（1-3，地图层级）。同为"难度档"两套口径，玩家感知混乱且 tier3 图 + 前期时间段的掉落反而可能比 tier1 图后期更低。
- **建议**：统一传入 `Math.max(run.tier, etier>` 映射后的综合难度值 `diffTier = run.tier + floor(gameTime/90)`，所有掉落/精英判定共用一个 diffTier。

### B4. `pickRarityWeighted` 在 floor≥1 时白装权重归零
- **现状**：wood 箱 `floor=1`，权重表中 white=0 → 一级木箱永不掉白装。
- **问题**：白装是熔炼台"三合赌跳阶"的燃料与新手期词条来源，归零后前期合成经济断粮。
- **建议**：floor≥1 时 white 权重改为 `max(0, 20 - floor×10)`（floor1=10、floor2=0），保留基础燃料供给。

### B5. 猎杀预警精英的 `elite` 标志在 `spawnEnemy` 之后设置
- **现状**（约 2960-2980 行）：先 `spawnEnemy(...)` 再手动 `en.elite=true; en.maxhp=round(×1.5); en.dmgMul×1.2`。`spawnEnemy` 内部的精英 3×HP、稀有度与掉落加成全部未生效。
- **后果**：猎杀预警精英实际强度 = 1.5×血（远低于正规精英 3×），但外观与正规精英一致——看起来吓人实则偏弱；掉落也未按精英表。
- **建议**：给 `spawnEnemy` 增加 `opts.elite` 入参，在函数体内统一走精英分支（3×HP + 精英掉落），预警精英只需 `dmgMul ×1.2` 附加。

### B6. 暴击倍率无独立上限
- **现状**：`DMG_CAP_BONUS=3.0` 软上限护栏只作用于总加成区，`critMult` 可经装备词条+子类型+符文叠加无上限；`critChance` 有 0.8 上限但 `critMult` 没有。
- **建议**：`critMult = Math.min(critMult, 3.0)`，与元素羁绊 `dmgMul ≤ 1.05×1.18/系` 的克制力度对齐，防止后期"刀刀烈火"秒 Boss 使三阶段血线设计失效。

### B7.（轻）竞技房末波统领血量双乘基数
- **现状**：`spawnEnemy` 后 `maxhp ×6`，若 B5 修复（统一精英 3×）则统领实际血量会从 6× 变 18×，需同步回调系数。
- **建议**：B5 修复时统领改 `×2.5`（3× 精英基数 × 2.5 = 7.5× 总量），保持与现版本 6× 接近。

---

## 三、体验优化（Minor）— 建议顺手修

| # | 问题 | 位置 | 建议 |
|---|------|------|------|
| M1 | Boss 血条名字映射只正确处理 qiongqi，taotie/hundun 错显「梼杌·封印体」 | 约 5455 行 | 补全四 kind 名字映射表 |
| M2 | `killBoss` 连续赋值两个 banner，第一个被覆盖看不见 | 2846/2849 行 | 合并为一条文案或用 banner 队列 |
| M3 | split 敌死亡时 `spawnEnemy` 随机原型后再覆盖为 split，副作用未抑制——若随机到 swarm 会额外多刷 2-4 只蜂群（单次分裂死亡最多多生 5 敌），looter 会弹警告横幅，hunt 期新敌还带 buff | 约 2900 行 | `spawnEnemy` 增加直建 split 的 opts 分支 |
| M4 | 新手提示文案位 `(14,148)` 与 banner 区（y≈144-182）左侧可能重叠 | drawHUD | 提示下移或与 banner 互斥显示 |
| M5 | `xpNeedForLevel` 线性增长 vs 敌人 XP 掉落近常量，后期升级显著变慢（有 LEVEL_CAP=30 兜底，影响有限） | 成长公式 | 可接受；如调整建议后期精英/裂隙敌人 XP ×1.5 |
| M6 | `mergeOverlay`（M 键合成台）无法用 Esc 关闭——Escape 分支只处理背包/筛选浮层，通用暂停又被 `overlaysOpen()` 拦截 | 1192-1196 行 | Escape 分支补 `mergeOverlay` 判定 |
| M7 | 背包超载时（C2 后果）`drawBackpack` 只画 8 格，第 9+ 件不可见不可整理 | 5012-5033 行 | C2 修复后自然消失，可不做 |

---

## 四、确认无问题的方面（正面清单）

- **性能**：粒子池 512 / 飘字池 96 预分配复用，主循环无每帧大对象创建；`loop` dt clamp 0.05s；try-catch 包裹 update/render 防断 rAF。
- **裂隙快照**：`snapshotWorld/restoreWorld` 深拷贝正确还原 boss/bossSpawned/gameTime/run.time，防止"进裂隙刷时间降 Boss 血"漏洞；竞技房波次推进与末波统领逻辑正确；机关房毒光 0.5s 周期伤害节律合理。
- **移动端**：八按钮 touchstart/touchend/click 三通路均 preventDefault+stopPropagation，无冒泡穿透；摇杆左 45% 屏区域划分清晰。
- **浮层防重入**：`overlaysOpen()` 四浮层门控齐全，buff 选择期间按键被正确拦截。
- **重置**：`newRun` 对 runPhase/huntActive/rifts/phase/队列等重置较彻底，未见跨局残留。
- **键盘**：riftPrompt/vaultPrompt 打开时 1/2/Esc 优先应答并 return，不会被底层快捷键误触。

---

## 五、修复优先级建议（待 Boss 确认后执行）

1. **P0**：C1（无敌帧）+ C2（背包绕过）——直接影响可玩性与核心循环
2. **P1**：B1（Boss 血量公式）、B2（猎杀回血）、B5+B7（精英标志统一）
3. **P2**：M1/M2/M3/M6 + B3/B4/B6 参数微调

*本轮审计未修改任何代码文件；以上全部改动待确认后统一执行。*
