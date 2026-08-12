# 烟雾测试计划（P4-QA）

> 角色：quality-lead（测试策略专家）｜目标：每冲刺可玩性准入/准出 + 核心循环最小路径冒烟 + 工程接口约定
> 配套文档：`qa-checklist.md`（功能验收基线）

---

## 1. 每冲刺准入 / 准出标准

### 1.1 冲刺准入（Entry / "可开测"）

| 条件 | 说明 | 阻塞? |
|---|---|---|
| 构建可启动 | 当冲刺版本能进入主菜单、无启动崩溃 | 是 |
| 冒烟脚本可跑 | 自动化钩子（§3）已注入且可连 | 是 |
| 本期需求冻结 | 本冲刺改动范围明确，避免冒烟范围漂移 | 否 |
| 已知 Blocker 清单 | 上一冲刺遗留 Blocker 已登记并指派 | 否 |

### 1.2 冲刺准出（Exit / "可发布下一环"）

| 准出项 | 通过标准 | 不通过处置 |
|---|---|---|
| 核心循环冒烟通过 | §2 脚本 100% 步骤可自动断言通过 | Blocker：回退修复 |
| Blocker 归零 | `qa-checklist.md` 全部 Blocker 项通过 | 不可准出 |
| 崩溃率达标 | 单局/单冲刺冒烟 0 崩溃（或已知并豁免） | Major：记录跟踪 |
| 性能基线不退化 | §2 性能探针帧率/加载不劣于上冲刺 | Major |
| 结算防重校验通过 | 撤离/元进度结算无重复发放（E7/G5/X7） | Blocker |

> **关键准出一句话**：核心循环冒烟绿 + 0 Blocker + 结算防重通过 = 可准出。

---

## 2. 核心循环冒烟脚本（最小路径可玩性验证）

> 目标：30 分钟内（或自动化 < 5 分钟）验证"游戏能从头玩到带出"。
> 适用：垂直切片起每个冲刺必跑。步骤含人工/自动双标注。

| 步骤 | 操作 | 断言（预期） | 钩子/观测 | 严重级 |
|---|---|---|---|---|
| 1 | 启动构建进入主菜单 | 主菜单可达，无崩溃 | `onBootReady` | Blocker |
| 2 | 从基地起局 → 选机体 | 锁定1机体，进入带入界面 | `onMechSelected` | Blocker |
| 3 | 勾选1件装备带入 → 进图 | 带入清单=勾选项，地图加载完成 | `onLoadoutConfirmed`, `onMapLoaded` | Blocker |
| 4 | 移动并拾取1个资源 | 背包+1，资源计数正确 | `onPickup(collectibleId)` | Major |
| 5 | 击杀1个杂兵 | 掉落触发，弹幕命中扣敌血生效 | `onEnemyKilled` | Major |
| 6 | 触发1次随机强化三选一 → 选择 | 属性/技能生效 | `onUpgradeApplied(upgradeId)` | Major |
| 7 | 拾取2件同类 → 合成 | 产出高一级物品，背包正确 | `onMerge(resultId)` | Major |
| 8 | 抵达撤离点 → 撤离成功 | 进入结算，状态=`extracting→settled` | `onExtractSuccess` | Blocker |
| 9 | 结算完成 | 局内拾取+带入装备全部入账 | `onMetaSettled(delta)` | Blocker |
| 10 | 返回基地核对仓库 | 仓库总额与结算一致，元进度+1 | `getMetaState()` | Blocker |
| 11 | **反向用例**：重开一局 → 阵亡不撤离 | 仅损失大部分带入（按 Q1 比例） | `onRunFailed(lossRatio)` | Blocker |

### 2.1 性能探针（随冒烟附带）

| 探针 | 采集点 | 基线 |
|---|---|---|
| 帧率 FPS | 步骤5 弹幕峰值 | ≥ 目标（Q4） |
| 地图加载耗时 | 步骤3 | ≤ 阈值（如 3s） |
| 结算耗时 | 步骤9 | < 设计阈值 |

### 2.2 冒烟结果判读

- 步骤 1/2/3/8/9/10/11 任一失败 → **冲刺阻断**，立即回退。
- 步骤 4/5/6/7 失败 → 记 Major，不影响准出但需当冲刺内修复或豁免。

---

## 3. 与工程测试框架脚手架的接口约定

> 目的：让冒烟脚本可自动化断言，无需依赖肉眼/截图。工程需在 GameState 层暴露以下**状态查询**与**事件钩子**。

### 3.1 需暴露的状态查询（State API）

| 接口 | 返回 | 用途 |
|---|---|---|
| `getGamePhase()` | `Base / Loadout / InMap / Extracting / Settled / Failed` | 步骤状态机断言 |
| `getLoadout()` | 带入装备清单 | 步骤3 对账 |
| `getInventory()` | 局内背包（id,count） | 步骤4/7 对账 |
| `getMetaState()` | `{currency, unlocks[], progression}` | 步骤10 对账 |
| `getRunResult()` | `{extracted, lossRatio, gained[]}` | 步骤9/11 对账 |
| `getPerfSnapshot()` | `{fps, loadMs, settleMs}` | 2.1 探针 |

### 3.2 需暴露的事件钩子（Event Hooks）

| 事件 | 触发时机 | 载荷 |
|---|---|---|
| `onBootReady` | 启动完成进入菜单 | — |
| `onMechSelected(mechId)` | 选机体确认 | mechId |
| `onLoadoutConfirmed(loadout)` | 带入确认进图 | loadout |
| `onMapLoaded(mapId, seed)` | 地图加载完成 | mapId, seed |
| `onPickup(collectibleId, count)` | 拾取资源 | id, count |
| `onEnemyKilled(enemyId)` | 杂兵死亡 | enemyId |
| `onUpgradeApplied(upgradeId)` | 强化生效 | upgradeId |
| `onMerge(resultId)` | 合成完成 | resultId |
| `onExtractSuccess()` | 撤离成功 | — |
| `onMetaSettled(delta)` | 元进度结算写入 | delta |
| `onRunFailed(lossRatio)` | 阵亡/未撤离结算 | lossRatio |
| `onCrash(stack)` | 崩溃捕获 | stack（用于崩溃率统计） |

### 3.3 工程侧约定（握手协议）

| 约定 | 内容 |
|---|---|
| 注入方式 | 调试构建暴露 `window.__QA` 或等效 C++/C# 反射接口；发布构建默认关闭 |
| 确定性 | 支持 `--seed=<n>` 启动参数，保证冒烟可复现（对应 P5 复现） |
| 日志 | 钩子同时落结构化日志（JSON），便于 CI 解析 |
| 超时 | 每步骤断言超时（默认 30s），超时计为失败而非挂起 |
| 隔离 | 冒烟使用独立测试存档，不污染玩家存档 |

### 3.4 自动化脚手架最小契约（伪代码）

```text
for step in smokeSteps:
    act(step)
    assert hook_fired(step.expectEvent) within timeout
    assert state_matches(step.expectState)
report(blockers, majors, perf)
```

---

## 4. 未决项（需工程/主理人确认）

| ID | 待定项 | 影响 | blocking? |
|---|---|---|---|
| Q1 | 失败损失比例精确值 | §2 步骤11 断言 | Blocker |
| Q4 | PC 目标帧率/最低配置 | §2.1 探针基线 | Major |
| Q8 | 钩子注入机制（反射/消息总线） | §3.3 | Major |
| Q9 | 测试存档隔离路径 | §3.3 | Minor |

---

## 5. 关键准出一句话回顾

**核心循环冒烟全绿 + 0 Blocker + 撤离/元进度结算防重通过（E7/G5/X7）+ 性能不退化 = 冲刺可准出。**
