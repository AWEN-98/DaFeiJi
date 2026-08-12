# 测试框架方案 Framework Scaffold

> 角色：engineering-lead ｜ 关联：qa-checklist.md（验收基线）、main-architecture.md §2/§3、ADR-002/005
> 目标：定义单元测试 + 烟雾测试框架，并**明确与 quality-lead 的接口契约（事件/状态钩子）**，使自动化断言可对接。

---

## 1. 框架选型

| 层 | 框架 | 用途 | 运行环境 |
|----|------|------|---------|
| 单元测试 | **Unity Test Framework (EditMode)** | 纯逻辑：仿真/存档/合成/强化/结算，无场景 | CI（无渲染） |
| 烟雾测试 | **Unity Test Framework (PlayMode)** + 注入 | 全链路核心闭环（QA C1） | CI / 本地 |
| 输入注入 | `IInputProvider` + `FakeInputProvider`（ADR-005） | 合成键鼠序列驱动 PlayMode | CI |
| 断言钩子 | **EventBus 订阅** + 状态快照读取 | 见 §3 契约 | 两者 |
| CI | GitHub Actions / Unity Cloud Build | 每 PR 跑 EditMode + 每日 PlayMode 冒烟 | — |

> 仿真层（ADR-002）为纯 C#、不依赖 MonoBehaviour → 多数逻辑可在 **EditMode 无头**跑，快且稳。

---

## 2. 测试分层与覆盖映射

| 测试类型 | 覆盖 Epic/Story | 对应 QA 用例 | 准入准出 |
|---------|---------------|------------|---------|
| 单元 | E1.1 MetaState 序列化/越界 | G3/G6 | 必过 |
| 单元 | E3.1 弹幕碰撞/池边界 | B1/B6 | 必过 |
| 单元 | E4.1 buff 权重/叠加/越界 | R3/R4/R5 | 必过 |
| 单元 | E5.1 合成配方/空引用 | M1/M3/M4 | 必过 |
| 单元 | E6.2 损失比例计算（85%/70%） | E3 | 必过 |
| 烟雾 | E6.3 全链路 C1 | C1/C2/X7 | **任一 Blocker 不过 = 不可准出** |
| 烟雾 | 崩溃恢复（强杀→重进） | C2/X4 | Blocker |
| 性能 | 弹幕峰值帧率/加载 | F1/F2 | Major |

---

## 3. 与 quality-lead 的接口契约（事件 / 状态钩子）

> 此表为**自动化断言的唯一对接点**。QA 的 `smoke-test-plan.md` §3 应消费下列钩子；本架构保证这些事件在对应状态迁移时**必然发出**（经 EventBus），且状态字段可读取。

### 3.1 事件钩子（EventBus 事件名 → 载荷）

| 事件名 | 触发时机 | 载荷（关键字段） | QA 断言示例 |
|--------|---------|----------------|------------|
| `OnEnterBase` | 进入基地 | — | 基地 UI 可见 |
| `OnAircraftLocked` | 选机体确认 | `aircraftId` | 锁定 1 机 |
| `OnLoadoutConfirmed` | 带入确认 | `loadout[]`（含 `LoadoutItem.state=AT_RISK`） | 带入清单与库存一致（E1） |
| `OnMapSelected` | 选图 | `seed:uint`, `riskTier` | 种子已记录（P5） |
| `OnMissionStart` | 进图 | `missionId` | 地图加载无卡死（P1） |
| `OnPickup` | 拾取 | `itemId`, `lootSlot` | 入战利品栏非库存（C5） |
| `OnCombatTick` | 战斗帧 | `bulletCount`, `enemyCount` | 峰值弹数（F1/B2） |
| `OnBuffApplied` | 强化生效 | `buffId`, `rarity` | 来自合法池（R3） |
| `OnMergeCompleted` | 合成完成 | `resultItemId`, `recipeValid` | 产出合法非 null（M1/M4） |
| `OnExfilTriggered` | 抵达撤离点 | `exfilPointId` | 满足条件可撤离（E4） |
| **`OnExfilResult`** | 结算判定 | `Exfil.result ∈ {SUCCESS,DEATH,TIMEOUT}` | 分支结算（E2/E3） |
| **`OnMetaSettled`** | 元进度写盘 | `MetaDelta`（货币Δ/解锁Δ/损失比例） | 入账正确（G1/E2/E3） |
| `OnSaveWritten` | 存档写盘 | `file=meta|run`, `schemaVersion` | 签名/备份（G3/X4） |

### 3.2 可读取状态字段（供断言）
- `Mission.state ∈ {SCRAVENGE, COMBAT, BUFF, MERGE, EXFIL, RESOLVED}`
- `LoadoutItem.state ∈ {IDLE, AT_RISK, LOST, RETURNED}`
- `Exfil.result ∈ {SUCCESS, DEATH, TIMEOUT}`
- `MetaState`：货币、库存、解锁节点、图鉴（只读快照）

### 3.3 测试辅助 API（供 QA 脚本调用）
```
TestHooks.StartMission(seed, riskTier)        // 直接进图，跳过手动选单
TestHooks.InjectInput(FakeInputProvider seq)   // 注入按键序列
TestHooks.ForceExfil(result)                   // 强制结算分支
TestHooks.GetMetaSnapshot()                    // 读 MetaState 快照
TestHooks.CrashAndResume()                     // 模拟强杀→重进，验 C2/X4
```

---

## 4. 冒烟测试最小路径（对齐 qa-checklist §0.1）

```
[Base] StartMission(seed)
  → OnLoadoutConfirmed(1 件带入)
  → OnMissionStart → 击杀杂兵 → OnPickup
  → 触发强化 → OnBuffApplied
  → 合成 → OnMergeCompleted
  → ForceExfil(SUCCESS) → OnExfilResult(SUCCESS) → OnMetaSettled(Δ)
断言：货币增加=拾取+带入；LoadoutItem.state=RETURNED；无重复结算（OnMetaSettled 仅 1 次）
```

---

## 5. 质量门（Quality Gate）
- **Blocker 用例**（C1/C2/E1/E2/E3/E7/G1/G3/G5/M1/M4/X4/X7 等）→ 任一不过，**冲刺不可准出**。
- EditMode 单测 100% 通过方可合并；PlayMode 冒烟每日跑，失败阻断发版。
- 性能基线（F1/F2）回归超阈值 → Major 告警，需主理人裁决。

---

## 6. 未决项（需 quality-lead 对齐）
- `smoke-test-plan.md` 文件名：本架构以 `framework-scaffold.md` 为工程侧入口，QA 侧 `smoke-test-plan.md` §3 应直接消费 §3 钩子表（建议二合一或互相引用）。
- Q4（目标帧率/最低配置）未定 → 性能断言阈值暂用 main-architecture §3 建议值，待确认后固化。
- 是否启用 Steam 云存档（Q5）→ 影响 `OnSaveWritten` 云同步断言范围。
