# ADR-005 输入映射与可重映射（Input & Rebindable Mapping）

> 状态：**已决策** ｜ 关联：ADR-001（Unity）、ADR-002（仿真/表现解耦）、framework-scaffold.md（注入假输入）

---

## 结论（Conclusion First）

- 使用 **Unity 新 Input System**（非 Legacy），以 **Action Map** 组织输入。
- 输入经 **`IInputProvider` 接口**进入仿真/表现层 → **可注入合成输入**，直接支撑自动化烟雾测试。
- **键位可重映射**，持久化到 `settings.input.v1`（Steam 云同步）。
- 主输入 **键鼠（KBM）**，次输入 **手柄**（自动检测，可选）。

---

## Action Map 定义

| Action | 默认键（KBM） | 用途 | 状态机阶段 |
|--------|--------------|------|-----------|
| `Move` | WASD / 方向键 | 机体移动 | IN-MISSION |
| `Fire` | 鼠标左键（按住）/ 空格 | 主火力 | COMBAT |
| `Aim` | 鼠标位置 | 瞄准方向 | COMBAT |
| `Dash` | Shift / 空格(无锁) | 闪避/冲刺 | COMBAT |
| `Interact` | E | 搜刮/撤离触发 | SCAVENGE / EXFIL |
| `Merge` | F | 局内合成 | MERGE |
| `Map` | Tab / M | 地图/暂停小地图 | IN-MISSION |
| `Pause` | Esc | 暂停/菜单 | 全局 |
| `MenuNav` | 方向/WASD + 确认 | UI 导航 | BASE / 菜单 |

---

## 架构要点
- 表现层（MonoBehaviour）绑定 Input System → 每帧写入 `IInputProvider` 的当前输入快照。
- 仿真/状态机只读 `IInputProvider`，**不直连 Input System** → 测试中用 `FakeInputProvider` 注入（如"按住 Fire 30 帧""按 Merge"），断言状态迁移（见 framework-scaffold.md）。
- 重映射 UI 写回 `settings.input.v1`；冲突键校验（同 Action 不可重复绑定）。

---

## 后果
- 可测试性提升（输入可注入）→ 烟雾测试覆盖核心闭环（QA C1）。
- 手柄/键鼠无缝切换，降低上手门槛。
- 负面：需维护重映射 UI 与冲突校验；缓解：用 Input System 自带 Rebinding 组件。
- 未决：手柄是否为首发必做 → 默认 KBM 首发，手柄随 1.0；不影响架构。
