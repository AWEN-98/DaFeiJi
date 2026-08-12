# ADR-002 架构分层（Architecture Layering）

> 状态：**已决策** ｜ 关联：ADR-001（Unity）、main-architecture.md、core-loop.md

---

## 结论（Conclusion First）

采用**三层清晰边界架构**：

1. **Meta 层（持久 / 局外）**：纯 C# 数据 + ScriptableObject 静态配置 + 存档系统，不依赖 MonoBehaviour 运行逻辑。
2. **Simulation 层（确定性 / 局内）**：战斗实体（弹幕、敌人、拾取、 Hazard）走**数据导向（data-oriented）**仿真；以"对象池 + 合批渲染 + 固定步长确定性更新"起步，**预留 Job/Burst 的 SoA 后端接口**，按需演进。
3. **Presentation 层（表现 / MonoBehaviour）**：薄适配层，读仿真状态做渲染/UI/输入，不含游戏逻辑。

**不采用完整 Unity DOTS/ECS**（学习曲线陡峭、2D 工具链不成熟，与 lean 冲突）；也不采用"全 MonoBehaviour"（数千弹幕会崩性能）。取两者折中。

---

## 上下文（Context）
- 弹幕同屏实体量高（目标数千，峰值可上万）→ 朴素 GameObject 每实体一个不可行。
- 小团队需高生产力（流程/UI/元进度用 MonoBehaviour 最快）。
- 需确定性 + 可复现（core-loop：种子驱动、QA P5 复现 Bug）。
- 需可测试（仿真层与表现层解耦 → 可单测、可注入假输入）。

---

## 分层与职责

| 层 | 技术载体 | 职责 | 禁止 |
|----|---------|------|------|
| **Meta 层** | 纯 C# 类 + ScriptableObject（定义表）+ SaveSystem | 元进度、解锁树、库存、经济、配置表、存档读写 | 禁止持有 MonoBehaviour 引用；禁止直接改局内状态 |
| **Simulation 层** | 自研轻量仿真（SoA 池 + System 循环）；接口 `ISimulationBackend` | 弹幕/敌人/拾取/Hazard 的更新、碰撞、掉落、合成判定、Roguelike buff 结算 | 禁止直接操作 GameObject/Transform；禁止读存档 |
| **Presentation 层** | MonoBehaviour（View/UI/Input/相机） | 渲染仿真状态、播放反馈、接收输入、状态机驱动（Base→…→Resolve） | 禁止在 MonoBehaviour 里写游戏规则；仅读仿真、发指令 |

---

## 仿真层性能路径（关键）

| 阶段 | 方案 | 同屏弹幕能力 | 备注 |
|------|------|------------|------|
| **垂直切片（起步）** | 对象池 + SpriteAtlas 共享材质合批 + 固定步长（60Hz）确定性更新 | ~1,500–3,000 | MonoBehaviour 仅做"渲染代理"，仿真写矩阵/位置数组 |
| **演进（按需）** | 同接口换 `JobSystem+Burst` 的 SoA 后端 | 10,000+ | 仅替换 `ISimulationBackend` 实现，表现/逻辑不动 |

> 决策要点：**接口先行、后端可替换**。垂直切片绝不引入 Job/Burst 复杂度；profiling 证明瓶颈后再切，避免过早优化。

---

## 确定性约定
- 仿真使用独立 `IRng`（PCG32 / xoshiro），种子来自 `run.save`（core-loop §2）。
- 固定步长累加器更新，渲染插值；保证同种子同结果（QA P5）。

---

## 后果
- 仿真层可独立单测（无 Unity 依赖）→ 直接支撑 framework-scaffold.md 的单元测试。
- 表现层崩溃不影响仿真数据完整性（利于崩溃恢复 ADR-003）。
- 负面：自建轻量仿真有前期成本；缓解：先池化合批，Job/Burst 仅作可选后端。
