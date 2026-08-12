# 总体架构 Main Architecture

> 角色：engineering-lead ｜ 关联：ADR-001~005、core-loop.md、qa-checklist.md
> 平台：PC/Steam ｜ 引擎：Unity 6000.x LTS（URP 2D）

---

## 1. 模块划分与依赖（Modules & Dependencies）

依赖方向：**上层依赖下层，下层不反向依赖**。虚线 = 运行时事件（经事件总线）。

```
┌──────────────────────────────────────────────────────────────┐
│  UI / HUD (MonoBehaviour, UI Toolkit)                         │
│  基地菜单 · 局内 HUD · 合成/强化弹窗 · 结算/撤离界面            │
└───────┬──────────────────────────────────┬───────────────────┘
        │ 读状态/发指令                       │ 订阅事件
        ▼                                    ▼
┌───────────────┐  驱动  ┌──────────────────────────────────────┐
│  GameFlow /    │──────▶│  Simulation 层 (ADR-002)              │
│  StateMachine  │       │  BulletSys · EnemySys · PickupSys     │
│  (核心循环状态机)│       │  MergeSys · BuffSys(肉鸽) · Collision │
└───────┬───────┘       └──────────────┬───────────────────────┘
        │ 进局/结算                     │ 读种子/写战利品
        ▼                              ▼
┌───────────────┐  读   ┌──────────────────────┐  写  ┌──────────────────┐
│  Meta/Progression│◀───│  SaveSystem (ADR-003) │◀───│  Resolve/结算逻辑  │
│  解锁树·库存·经济 │    │  meta.save / run.save │    └──────────────────┘
└───────┬───────┘       └──────────┬───────────┘
        │                           │ 云同步
        ▼                           ▼
┌───────────────┐          ┌──────────────────┐
│  Config/静态表 │          │  Steamworks 集成   │
│  (ScriptableObject)│      │  云存档/成就/排行  │
└───────────────┘          └──────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  横切模块（被上述复用，不被反向依赖）                            │
│  · MapGen（ADR-004）  · EventBus  · Rng(确定性)  · Input(IInputProvider, ADR-005)│
│  · Audio(接口层)  · Addressables(资产加载)  · Profiler/遥测      │
└──────────────────────────────────────────────────────────────┘
```

| 模块 | 职责 | 依赖 | 备注 |
|------|------|------|------|
| GameFlow/StateMachine | 驱动核心循环状态迁移 | Simulation, Meta, Save, MapGen | 状态枚举见 §2 |
| Simulation（Bullet/Enemy/Pickup/Merge/Buff/Collision） | 局内确定性仿真 | Rng, Config, EventBus | 对象池+合批（ADR-002） |
| Meta/Progression | 解锁树/库存/经济/图鉴 | Config, Save, Steamworks | 纯 C# 数据 |
| SaveSystem | 读写 meta/run 存档 | Config | ADR-003 |
| MapGen | 混合 PCG 地图 | Rng, Config | ADR-004 |
| UI/HUD | 菜单/局内界面/结算 | GameFlow, EventBus | 薄表现层 |
| Audio | 音效/音乐接口 | EventBus | 仅订阅事件，见 audio/sound-plan.md |
| Steamworks | 云存档/成就/统计/排行 | SaveSystem, Meta | ADR-003 |
| EventBus | 解耦事件分发 | — | 自动化测试钩子载体（§3） |
| Input | IInputProvider | — | ADR-005，可注入 |

---

## 2. 核心循环技术状态机映射（Core Loop State Machine）

严格对齐 `design/gdd/core-loop.md`，状态枚举作为代码常量：

| 阶段（策划） | 技术状态（枚举） | 引擎行为 | 触发事件（EventBus） |
|------------|----------------|---------|---------------------|
| 基地 BASE | `STATE_BASE` | 加载 Meta UI、解锁树 | `OnEnterBase` |
| 选机体 | `STATE_SELECT_AIRCRAFT` | 读解锁树过滤可选 | `OnAircraftLocked` |
| 选装备（带入） | `STATE_LOADOUT` | 勾选→`LoadoutItem.state=AT_RISK` 暂存 | `OnLoadoutConfirmed` |
| 选地图 | `STATE_SELECT_MAP` | 预览风险/撤离点；生成 seed | `OnMapSelected(seed)` |
| 进图 IN-MISSION | 子状态机 ↓ | 启动 Simulation + MapGen 实例化 | `OnMissionStart` |
| ├ 搜 SCAVENGE | `MISSION_SCAVENGE` | 拾取→战利品栏（不入库存） | `OnPickup` |
| ├ 战 COMBAT | `MISSION_COMBAT` | 弹幕/敌人/Boss 仿真 | `OnCombatTick` |
| ├ 随机强化 BUFF | `MISSION_BUFF` | 三选一→`BuffSys` 临时生效 | `OnBuffApplied` |
| ├ 合成 MERGE | `MISSION_MERGE` | 同类合并→配方表 | `OnMergeCompleted` |
| ├ 撤离 EXFIL | `MISSION_EXFIL` | 抵达 EXFIL 点触发结算判定 | `OnExfilTriggered` |
| 结算 RESOLVE | `STATE_RESOLVE` | 依 `Exfil.result` 合并 run→meta | `OnExfilResult`, `OnMetaSettled` |
| └ 回基地 | → `STATE_BASE` | 写 meta.save（云同步） | — |

**状态字段约定（与 core-loop.md 一致）**
- `Mission.state ∈ {SCRAVENGE, COMBAT, BUFF, MERGE, EXFIL, RESOLVED}`
- `LoadoutItem.state ∈ {IDLE, AT_RISK, LOST, RETURNED}`
- `Exfil.result ∈ {SUCCESS, DEATH, TIMEOUT}`

**结算规则映射（core-loop §3）**：SUCCESS→100% 带回；DEATH/TIMEOUT→损失 85%；主动弃局→损失 70%（保底/保险槽例外由 Meta/Resolve 实现）。

---

## 3. 性能目标（Performance Targets）

> 注：Q4（QA）未决项"PC 目标帧率与最低配置"→ 以下为**本架构建议基线**，待主理人/经济确认。

| 指标 | 目标（建议） | 最低配置（建议） | 对应 QA |
|------|------------|----------------|--------|
| 目标帧率 | **60 fps**（固定步长仿真 60Hz） | 30 fps 不崩 | F1 |
| 同屏弹幕上限 | 1,500（切片）→ 设计峰值 3,000 | 降级策略生效不崩 | F1, F3 |
| Draw call 预算（玩法层） | < 50（SpriteAtlas 合批） | < 80 | F3 |
| 进图加载时间 | ≤ 3s | ≤ 5s（无超时黑屏） | F2 |
| 内存基线（单局） | ≤ 1.2 GB | ≤ 1.6 GB 稳定不增 | F4, X5 |
| 结算瞬时阻塞 | < 100 ms（无长卡顿） | < 200 ms | F5 |

**降级策略**：弹幕超上限 → 远处弹幕降刷新/合并渲染批次；实体超上限 → 远裁剪 + 池回收。

---

## 4. 数据流向（Data Flow）

### 4.1 局内拾取 → 结算 → 元进度
```
[敌人死亡] --Drop--> PickupSys 生成掉落
   --> 玩家 Interact --> 战利品栏(临时, run.save)
        --> 抵达 EXFIL 且 result=SUCCESS
             --> Resolve 合并 run.save.loot → meta.save.inventory
                  --> SaveSystem 写盘 + Steam Cloud 同步
                       --> Meta/Progression 更新解锁树/货币
                            --> UI 刷新基地
```

### 4.2 失败/阵亡
```
[HP=0] --> Mission.state=RESOLVED, Exfil.result=DEATH
   --> Resolve: LoadoutItem AT_RISK → LOST (损失 85%, 保底例外)
   --> 战利品栏清空（不入库）
   --> 仅统计/图鉴写 meta（不受惩罚, core-loop §2）
   --> 回 BASE
```

### 4.3 确定性/可复现
```
seed(run.save) --+--> MapGen (拓扑/拼接/填充，全确定)
                 +--> Simulation.Rng (敌人/掉落/buff 权重)
=> 同 seed + 同参数 = 同局（QA P5 复现 Bug）
```

---

## 5. 跨模块契约要点（供其他角色）
- **Audio（audio/sound-plan.md）**：仅通过 EventBus 订阅（如 `OnCombatTick`/`OnBuffApplied`/`OnExfilResult`），不反向依赖仿真。
- **QA（qa-checklist.md）**：自动化断言点 = §2 事件 + §3 状态字段；详见 framework-scaffold.md §3 钩子表。
- **美术（art/）**：资产经 Addressables，格式见 vertical-slice-plan.md 未决项（假设 .png/.tiff + SpriteAtlas）。
