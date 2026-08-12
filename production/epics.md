# Epic / Story 拆分（垂直切片导向）

> 角色：engineering-lead ｜ 关联：main-architecture.md、core-loop.md、qa-checklist.md
> 原则：lean，**仅拆垂直切片所需最小可玩核心循环**；每条 Story 含验收标准（Given/When/Then 或清单）。
> 优先级：P0=阻塞闭环，P1=闭环可玩，P2=体验完整。

---

## Epic 总览

| Epic | 目标 | 覆盖核心循环 | 关键 QA |
|------|------|------------|--------|
| **E1 元进度与基地骨架** | 基地 UI + 存档读写 + 解锁/库存/经济数据结构 | BASE→选机→带入 | G1–G5, C4 |
| **E2 进图与地图生成** | 进图加载 + 混合 PCG 单图 + 出生/撤离点 | 进图→搜 | P1–P6, F2 |
| **E3 弹幕战斗与实体仿真** | 对象池仿真 + 碰撞 + 基础敌人 + Boss 雏形 | 战 COMBAT | B1–B7, S1–S6 |
| **E4 肉鸽随机强化** | 三选一 buff 池 + 权重 + 临时生效 | BUFF | R1–R7 |
| **E5 局内合成** | 同类 2合1 + 配方表 + 背包 | MERGE | M1–M6 |
| **E6 搜打撤结算闭环** | 带入登记 + 撤离 + 损失/带出 + 元进度回填 | EXFIL→RESOLVE→BASE | E1–E8, C1–C6 |
| **E7 测试脚手架与质量门** | 单元+烟雾测试 + 事件钩子 | 全链路 | 见 framework-scaffold.md |

---

## E1 元进度与基地骨架（P0）

### Story E1.1 MetaState 数据模型
- **验收**：Given 纯 C# `MetaState`（货币/解锁树/库存/图鉴/统计）；When 序列化→反序列化；Then 字段无损、枚举合法、满级封顶非负（G6）。
- 关联 ADR-003、main-architecture §1。

### Story E1.2 存档读写与云同步
- **验收清单**：
  - [ ] `meta.save` 用 MessagePack+签名写盘，加载校验 magic/schemaVersion（G3）
  - [ ] 签名不符→回退 `.bak` 并标记 tampered（G1/防作弊）
  - [ ] 启用 Steam Cloud 时自动同步（默认开，Q5）
  - [ ] 强杀进程后 `meta.save` 不损坏（X4 Blocker）

### Story E1.3 基地菜单 + 选机体/带入
- **验收**：Given 解锁树；When 玩家选机体+勾选 1 件装备带入；Then 仅解锁项可选、未拥有/损坏项不可勾（C4）；`LoadoutItem.state=AT_RISK` 暂存（E1）。

---

## E2 进图与地图生成（P0/P1）

### Story E2.1 混合 PCG 单图生成
- **验收清单**：
  - [ ] 节点图含 SPAWN/LOOT/COMBAT/BOSS/EXFIL（ADR-004）
  - [ ] EXFIL 与 BOSS 为手工 set-piece（P2 可达性）
  - [ ] BFS 校验 SPAWN→EXFIL 可达，不可达重抽（P2 Blocker）
  - [ ] 同 seed 同参数生成一致（P5）
  - [ ] 进图加载 ≤ 3s（F2）

### Story E2.2 搜刮与拾取
- **验收**：Given 地图含 LOOT 点；When 玩家 Interact；Then 资源入"战利品栏"（不入库存），未撤离前不影响基地仓库（C5）。

---

## E3 弹幕战斗与实体仿真（P0）

### Story E3.1 弹幕对象池仿真+碰撞
- **验收**：Given 仿真层 SoA 池；When 敌人开火；Then 子弹命中框按设计判定、命中扣血/护盾正确（B1 Blocker）；空池/超大数组不溢出不 GC 卡顿（B6）。

### Story E3.2 基础敌人与玩家操控
- **验收清单**：
  - [ ] WASD 移动 + 鼠标瞄准 + 按住开火（ADR-005）
  - [ ] 受击 i-frame 合规（B3）
  - [ ] 玩家子弹不误伤自身（B4）
  - [ ] 设计峰值弹数下 ≥ 目标帧率（F1, Q4 待定）

### Story E3.3 Boss 雏形
- **验收**：Given Boss 竞技场；When 进入；Then 按血量进阶段、释放弹幕（S1 Blocker）；退场清残留弹幕不误伤（S6）。

---

## E4 肉鸽随机强化（P1）

### Story E4.1 三选一 buff
- **验收**：Given 击杀/节点触发；When 弹出三选一；Then 候选来自合法池、权重合规、不出现未解锁项（R3）；选择后即时生效（R2）；数值不溢出/负/除零（R5 Blocker）。

### Story E4.2 buff 不持久化
- **验收**：Given 阵亡未撤离；When 离局；Then 临时 buff 不写入 meta（R6）；互斥 buff 不并存（R4）。

---

## E5 局内合成（P1）

### Story E5.1 同类 2合1
- **验收**：Given 两件同类同级；When 按 Merge；Then 生成高一级物品、属性按配方表生效（M1 Blocker）；UI 配方与实际一致（M3）；不产出空引用（M4 Blocker）。

### Story E5.2 合成边界
- **验收清单**：
  - [ ] 不同类/不同级拒绝并提示（M2）
  - [ ] 满格背包合成提示/排队不吞物品（M5）
  - [ ] 未撤离的局内合成不带入 meta（M6）

---

## E6 搜打撤结算闭环（P0）

### Story E6.1 带入登记与撤离
- **验收**：Given 进图前带入清单；When 抵达 EXFIL 且 result=SUCCESS；Then 带入+拾取全部带出正确入账（E2 Blocker）；一次撤离只结算一次（E7 Blocker）。

### Story E6.2 失败/损失结算
- **验收**：Given 阵亡/超时；When Resolve；Then 损失 85% 带入、战利品清空（E3 Blocker，core-loop §3）；主动弃局损失 70%（C3）；统计/图鉴仍写（不受惩罚）。

### Story E6.3 状态机贯通与恢复
- **验收清单**：
  - [ ] 全链路 BASE→…→RESOLVE→BASE 无阻断（C1 Blocker）
  - [ ] 任意节点崩溃重进可恢复/回退安全节点，不重复发放（C2 Blocker）
  - [ ] 同帧并发（合成+撤离）状态机串行，不竞态丢物品（X7 Blocker）

---

## E7 测试脚手架与质量门（P0，跨 Epic）

- 见 `tests/framework-scaffold.md`：单元测试覆盖 E1.1/E3.1/E4.1/E5.1；烟雾测试覆盖 C1 全链路；事件钩子 `OnExfilResult`/`OnMetaSettled` 等供 QA 断言。

---

## 依赖与顺序（建议）
```
E1(数据/存档) ─┬─▶ E2(进图) ─▶ E3(战斗) ─┬─▶ E6(结算闭环, P0 必交付)
               │                          ├─▶ E4(强化)
               │                          └─▶ E5(合成)
               └─▶ E7(测试) 贯穿各 Epic
```
- **P0 最小可交付**：E1 + E2 + E3(基础敌人+碰撞) + E6 + E7 → 打通"进图→搜→战→撤离→带出/损失→元进度"。
- Boss/强化/合成（E3.3/E4/E5）为 P1，使闭环"可玩且有趣"。
