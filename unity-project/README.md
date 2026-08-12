# 空域撤离 AirspaceEvacuation — Unity 工程（P0 闭环骨架）

> 角色：engineering-lead ｜ Sprint：P5 Sprint 1 ｜ 引擎：Unity 6000.x LTS + URP 2D ｜ 输入：Unity New Input System

本目录是 P0 闭环最小可玩骨架的源码工程。**不含二进制资源**，所有视觉用代码生成 Primitive 占位（方块/圆/三角区分敌我弹）。

---

## 1. 打开步骤

1. **安装 Unity 6000.x LTS**（建议 6000.0.x），安装时勾选 **Universal 2D Renderer / URP 2D** 模块。
2. Unity Hub → Open → Add project from disk → 选择本 `unity-project/` 目录。
   - 本目录已含 `ProjectSettings/ProjectVersion.txt` 与 `Packages/manifest.json`（声明 `com.unity.inputsystem` 依赖），Unity Hub 可直接识别。
   - 首次打开会下载依赖包并生成 `Library/` 等缓存目录（已在 `.gitignore` 中忽略）。
3. **Input System**：`manifest.json` 已声明依赖，打开后自动安装。若弹出"激活新输入系统"对话框，选 **Both** 或 **New Input System Only**，重启 Editor。
4. 等待编译完成（首次会编译 `AirspaceEvacuation.asmdef` 程序集）。

> 若 Unity Hub 不识别目录（版本不匹配），可手动新建一个 Unity 6000 LTS URP 2D 工程，然后把本目录的 `Assets/` 与 `Packages/manifest.json` 合并进去。

## 2. 场景装配

详见 `Assets/Scenes/README_SceneSetup.md`。最小可玩场景 = `Bootstrap.unity`，挂载 `GameFlow` + `SimulationDriver` + `UnityInputProvider` + `HUDBootstrap` + `AudioEventStub`，放置 `PlayerAircraft` / `EnemySpawner` / `ExtractionZone` 占位 Primitive。

## 3. 目录结构

```
Assets/
├── AirspaceEvacuation.asmdef      # 程序集定义（引用 Unity.InputSystem）
├── Scenes/
│   └── README_SceneSetup.md       # 场景装配说明
└── Scripts/Runtime/
    ├── Core/                      # EventBus / GameFlow / Input / RNG / ServiceLocator / TestHooks
    ├── Gameplay/                  # Entity / Bullet / Pool / Player / Enemy / Boss / Pickup / Merge / Exfil / Resolver
    ├── Meta/                      # MetaState / RunState
    │   └── Config/                # AircraftConfig / RunePoolConfig / MergeRecipeConfig (ScriptableObject)
    ├── Save/                      # SaveSystem / ICloudSync
    ├── Input/                     # FakeInputProvider（测试注入）
    ├── UI/                        # HUDBootstrap
    └── AudioStub/                 # AudioEventStub
```

## 4. P0 闭环打通情况

闭环路径：`Boot → Base → Loadout → Mission(Scavenge→Combat→Merge→Exfil) → Result → Meta → Base`

| 环节 | 实现 | 占位/TODO |
|------|------|----------|
| 元进度 MetaState | 灵玉/声望/库存/解锁树/统计，纯 C# | 解锁树仅 1 节点示例 |
| 存档 SaveSystem | 本地 JSON + 版本信封 + HMAC 签名桩 + `.bak` | MessagePack 待换；Steam Cloud 仅 `ICloudSync` 接口 |
| 状态机 GameFlow | Boot/Base/Loadout/Mission/Result/Meta + Mission 子状态 | — |
| 输入 IInputProvider | Move/Fire/Aim/Dash/Interact/Merge/Map/Pause，可注入假输入 | 重映射 UI 待做 |
| 弹幕 BulletPool | SoA 数组池，容量 3000，`Graphics.DrawMeshInstanced` 合批 | Job/Burst 后端预留 `ISimulationBackend` |
| 玩家 PlayerAircraft | 移动+射击+闪避 i-frame≤0.3s | — |
| 敌人 Enemy + Spawner | 1 类杂兵 + 简单追击 AI | — |
| Boss Stub | 三阶段切换钩子（血量阈值） | 弹幕模式仅占位 |
| 肉鸽 RoguelikePickup | 三选一限时 8s，5 稀有度权重抽取，灵能槽限制 | 24 符文占位 |
| 合成 MergeSystem | 局内 2合1，仅非战斗时可合 | 3合1/跨系合待做 |
| 撤离 ExtractionZone | 读条 2-4s 可被打断 + 保底窗口 | — |
| 结算 RunResultResolver | 成功100%/阵亡85%/弃局70% + 保险槽例外 | — |
| HUD | 血盾/武器冷却/闪避/小地图/撤离提示 占位 | 美术待替换 |
| 音频 | 事件 ID 桩，按 sound-plan 调用 | Wwise/Unity Audio 接口待接 |

## 5. 已知占位与 TODO

- **无二进制美术**：所有 Sprite 用代码生成的纯色 Quad/Circle。
- **MessagePack 未引入**：SaveSystem 暂用 `JsonUtility`，签名用 HMAC-SHA256 桩（密钥编译期注入占位）。Story E1.2。
- **Steam Cloud**：仅 `ICloudSync` 接口，无 Steamworks 引用。Q5 未决。
- **重映射 UI**：Input System Action Map 已建，Binding UI 待做。Story ADR-005。
- **Job/Burst 后端**：`ISimulationBackend` 接口预留，当前用 MainThread 数组池。R1 风险缓解。
- **地图 PCG**：本 Sprint 仅 `ExtractionZone` 占位 + `EnemySpawner`，混合 PCG 单图留待 E2。
- **测试**：`TestHooks` 已就绪，EditMode/PlayMode 测试用例由 QA 在 `tests/` 下补。

## 6. 风险

- **R1 性能**：`DrawMeshInstanced` 在 3000 弹 + URP 2D 下需 profiling；若不达标切 `ISimulationBackend` 的 Burst 后端。
- **R5 竞态**：GameFlow 已串行化状态迁移，但 `MergeSystem` 与 `ExtractionZone` 同帧触发需测试覆盖（X7）。
- **Input System 激活**：若 Editor 仍用 Legacy，`UnityInputProvider` 会编译失败 → 需在 Player Settings 切到 New。
