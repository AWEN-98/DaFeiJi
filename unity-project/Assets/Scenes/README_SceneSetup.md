# 场景装配说明 Scene Setup

> 角色：engineering-lead ｜ 关联：unity-project/README.md、main-architecture §2
> 本文件说明如何在 Unity 6000 LTS + URP 2D 里从零搭出 P0 闭环最小可玩 `Bootstrap.unity` 场景。

---

## 1. 创建场景

1. `File → New Scene → 2D (URP)`，命名 `Bootstrap.unity`，保存到 `Assets/Scenes/Bootstrap.unity`。
2. 删除默认 Main Camera 之外的多余对象，保留 `Main Camera`（设为 Orthographic，Size=10）。

## 2. 创建配置资产（ScriptableObject）

1. `Assets → Create → AirspaceEvac → Aircraft Config`，命名 `Aircraft_Qingzhui.asset`：
   - AircraftId=`qingzhui`，DisplayName=`青隼`，其余按 `AircraftConfig.cs` 默认。
2. `Assets → Create → AirspaceEvac → Rune Pool Config`，命名 `RunePool_v1.asset`：
   - 右键 `Reset` 生成 24 个占位符文。
3. `Assets → Create → AirspaceEvac → Merge Recipe Config`，命名 `MergeRecipes_v1.asset`：
   - 右键 `Reset` 生成 2 个示例配方。

## 3. 挂载 Bootstrap 根节点

1. 新建空 GameObject，命名 `Bootstrap`。
2. 添加组件：
   - `GameFlowBootstrap`：拖入上面的 3 个配置资产；场景引用暂留空（下一步填）。
   - `TestHooks`：拖入 Bootstrap 自身的 `GameFlowBootstrap` 引用。
   - `AudioEventStub`。

## 4. 挂载仿真驱动

1. 新建空 GameObject，命名 `Simulation`，作为 `Bootstrap` 子物体。
2. 添加组件：
   - `SimulationDriver`：Fixed Step=1/60，Max Steps/Frame=3。
   - `BulletRenderer`：由 `SimulationDriver.Awake` 自动 Init，无需手动配置。

## 5. 放置玩家

1. 新建空 GameObject，命名 `Player`，位置 (0,0,0)。
2. 添加组件：
   - `Rigidbody2D`：Gravity Scale=0，Body Type=Dynamic，Collision Detection=Continuous。
   - `CircleCollider2D`：Radius=0.35（玩家命中体积）。
   - `PlayerAircraft`：拖入 `Aircraft_Qingzhui.asset`，Hit Radius=0.35。
3. 把 `Player` 拖到 `SimulationDriver.Player` 与 `GameFlowBootstrap.Player` 字段。

## 6. 放置敌人生成器

1. 新建空 GameObject，命名 `EnemySpawner`。
2. 添加组件 `EnemySpawner`：
   - Enemy Prefab：先建 `Enemy` 预制体（见下）。
   - Player：拖入 `Player`。
   - Spawn Interval=2.5，Max Concurrent=12，Spawn Radius=18。
3. `Enemy` 预制体制作：
   - 新建空 GameObject，命名 `Enemy`，加 `Rigidbody2D`（Gravity=0）+ `CircleCollider2D`（Radius=0.4）+ `Enemy` 脚本。
   - 拖到 `Assets/Scenes/` 或 `Assets/Prefabs/` 做成预制体。
4. 把 `EnemySpawner` 拖到 `SimulationDriver.EnemySpawner` 与 `GameFlowBootstrap.EnemySpawner`。

## 7. 放置撤离点

1. 新建空 GameObject，命名 `ExtractionZone`，位置 (15, 0, 0)。
2. 添加组件：
   - `BoxCollider2D`：Size=(3,3)，Is Trigger=true。
   - `ExtractionZone`：Channel Duration=3，Guarantee Window Delay=600。
3. 拖到 `GameFlowBootstrap.ExtractionZone` 与 `HUDBootstrap.ExfilZone`。

## 8. 挂载输入

1. 在 `Player` 或 `Bootstrap` 上添加 `UnityInputProvider` 组件。
2. 拖到 `GameFlowBootstrap.UnityInput`。
3. **Player Settings → Player → Active Input Handling** 必须设为 `Input System Package (New)` 或 `Both`。

## 9. 挂载 HUD

1. `Bootstrap` 上添加 `HUDBootstrap` 组件，拖入 `Player` 与 `ExtractionZone`。
2. 运行时会自动生成 Canvas + Text 占位（无需手动建 UI）。

## 10. 运行验证

1. 按 Play。预期：
   - Console 输出 `[Audio] OnEnterBase` 相关日志（EventBus 已通）。
   - HUD 左上显示 HP/Shield/Dash/Ammo，右上显示 EXFIL 状态与小地图阶段。
   - WASD 移动 `Player`，鼠标按住开火（蓝色子弹）。
   - `EnemySpawner` 每 2.5s 生成红色杂兵朝玩家移动并开火（红色子弹）。
   - 玩家被命中扣血/护盾；血量为 0 触发 `OnExfilResult(Death)`。
   - 移动到 `ExtractionZone` 内读条 3s 完成 → `OnExfilResult(Success)` → `OnMetaSettled`。
2. 烟雾测试：调用 `TestHooks.Instance.StartMission(0x1234, 1)` 直接进图；`TestHooks.Instance.ForceExfil(ExfilResult.Abandon)` 强制结算。

## 11. 已知占位与风险

- **URP 2D 渲染**：`BulletRenderer` 用 `Graphics.DrawMeshInstanced` + `Unlit/Color` Shader，在 URP 下需确认 Shader 可用；若丢失，子弹不可见但仿真正常。备选：换成 `SpriteRenderer` 池（性能略降）。
- **无 PCG 地图**：P0 用空场景 + 边缘生成敌人；E2 接入后替换为节点图。
- **无 Boss 场景**：`BossStub` 需另建竞技场场景或手动放置；调用 `BossStub.Init(player, pool)` 绑定。
- **Input System**：若 Editor 仍 Legacy，`UnityInputProvider` 编译失败 → 切 Active Input Handling 后重启。
- **Audio**：仅 `Debug.Log`，无实际声音。
