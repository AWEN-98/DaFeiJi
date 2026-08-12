# 《空域撤离》开发总交付汇编（主理人 · 游承峰）

> 品类融合：**打飞机(shmup弹幕) + 肉鸽(随机强化) + 合成(merge) + 搜打撤(extraction)**
> 平台：PC / Steam 首发 ｜ 美术：卡通渲染（霓虹山海）｜ 引擎：**Unity 6000.x LTS + URP 2D**
> 评审强度：精简 lean ｜ 汇编时间：2026-08-12 ｜ 状态：P1–P4 规划铺开完成，待进入垂直切片

---

## 一、七阶段开发路线图（主理人产出）

| 阶段 | 目标 | 关键交付物 | 当前状态 |
|---|---|---|---|
| P1 概念孵化 | 支柱/MDA/主题/范围 | `design/concept/concept-doc.md` | ✅ |
| P2 系统设计 | 核心循环 + 9 系统 GDD + 剧情 + UX | `design/gdd/*`、`core-loop.md`、`narrative.md`、`ux-spec.md` | ✅ |
| P3 技术搭建 | 引擎决策 + 主架构 + 4 条 ADR + 可访问性 | `docs/architecture/*`、`art/accessibility.md` | ✅ |
| P4 预制作 | 美术圣经 + 首套资产 + Epic/Story + 测试脚手架 + 运营规划 | `art/bible/*`、`art/assets/*`、`production/epics.md`、`tests/*`、`docs/release/*` | ✅ |
| P5 制作 | 垂直切片为首冲刺，按冲刺循环实现/测试/评审 | `production/vertical-slice-plan.md` | ⏳ 下一程 |
| P6 打磨 | ≥3 轮 Playtest + 性能优化 + 资产审计 + 音频打磨 | — | 待 P5 |
| P7 发布 | Demo 节奏 + 补丁说明 + 本地化 + 最终 QA 签字 | `docs/release/*` | 待 P5 |

**质量门**：P2 末设计评审 / P3 末架构评审 / P5 每冲刺烟雾测试 / P7 最终 QA 签字。

---

## 二、Boss 已拍板的决策（D1–D8，已写入项目记忆）

| 决策 | 结论 | 影响域 |
|---|---|---|
| **D1 主题/IP** | 中式志怪 × 都市奇幻，**架空化改编**（原创妖物，不碰具体 IP 授权） | 美术/叙事/法务 |
| **D2 商业化** | 坚持**不卖数值，仅皮肤装饰** | 经济系统 |
| **D3 首发范围** | **纯单机**（异步排行满足竞争；双人/异步入侵列远期） | 范围/QA/网络 |
| D4 PC 规格 | 60fps 基线、内存 ≤1.2GB（建议值） | 技术性能目标 |
| D5 云存档 | Steam 云存档首发即上 | 存档 ADR |
| D6 失败损失 | 阵亡损失 85% 带入 / 主动弃局 70% / 成功 100% 带回 | 搜打撤/经济 |
| D7 低配降级 | 接受"扁平+描边"降级档 | 美术管线 |
| D8 撤离失败 | 二态，无"部分损失"中间态 | 音频/结算 |

---

## 三、完整交付物清单（33 份，已落盘）

**策划 / 叙事（design-strategist）**
- `design/concept/concept-doc.md` — 支柱/MDA/Bartle/范围/主题
- `design/gdd/core-loop.md` — 核心循环状态机 + 失败模型
- `design/gdd/{aircraft,equipment,merge,extraction,roguelike,map,boss,metaprogression,economy}.md` — 9 系统 GDD（八节）
- `design/gdd/narrative.md` — 世界观/阵营/叙事载体
- `production/ux-spec.md` — UX 流程与战斗 HUD

**技术 / 主程序（engineering-lead）**
- `docs/architecture/engine-decision.md` — **Unity 决策 + 理由（ADR-001）**
- `docs/architecture/adr/{ADR-002~005}.md` — 分层/存档/程序化地图/输入
- `docs/architecture/main-architecture.md` — 模块/状态机映射/性能目标
- `production/epics.md` — 7 Epic 拆分 + QA 用例映射
- `tests/framework-scaffold.md` — 测试框架 + 13 事件钩子契约
- `production/vertical-slice-plan.md` — 垂直切片范围/里程碑(~9周)/风险

**美术方向（art-director）**
- `art/bible/art-bible-v0.md` — 视觉身份九节（霓虹山海）
- `art/accessibility.md` — 可访问性三级矩阵
- `art/assets/core-asset-spec.md` — 首套核心资产规格

**音频方向（audio-director）**
- `audio/sound-plan.md` — 战斗节奏音效 + 5 层动态音乐 + Wwise 推荐

**测试策略（quality-lead）**
- `tests/qa-checklist.md` — 10 模块 ~64 条用例
- `tests/smoke-test-plan.md` — 11 步核心循环冒烟 + 接口契约

**发布 / 运营（release-ops-lead）**
- `docs/release/demo-plan.md` — 四阶段时间盒 + Demo 红线 + Steam 策略
- `docs/release/feedback-channels.md` — 四渠道闭环 + SLA
- `docs/release/release-checklist.md` — 发布 Gate / Changelog / 回滚 / 本地化

---

## 四、跨成员一致性检查

**已对齐（无需改动）**
- 引擎：技术定 Unity → 美术假设 Unity(ASTC) ✅；音频 Wwise 假设 Unity/Unreal，Unity 成立 ✅
- 失败模型：设计 85%/70% ↔ 技术 100/85/70 结算规则 ✅
- 主题：设计"中式志怪×都市奇幻" ↔ 美术"霓虹山海" ↔ 音频"民乐+工业噪" ↔ 运营"山海经系 Boss" ✅
- 商业化/多人：设计不卖数值+纯单机 ↔ D2/D3 ✅
- 测试接口：技术 `framework-scaffold` 与 QA `smoke-test-plan` 共用同一钩子表 ✅

**待对齐项 → 主理人裁定（已解决，P5 首冲刺前由各成员回填到各自文档）**
1. **钩子数量不一致**（工程 13 vs QA 12）→ **裁定：以工程 `framework-scaffold §3` 的 13 钩子为准**，QA `smoke-test-plan` 同步修订。
2. **肉鸽稀有度档位**（设计 5 档 vs 音频假设 3 档）→ **裁定：统一 5 档**（白绿蓝紫橙），音频 `sound-plan` 的 SFX 尾音按 5 档实现。
3. **保险槽保费来源**（货币 vs 冷却）→ **裁定：货币投保**（更可控风险博弈，衔接 economy 投保费/回收机制）。

---

## 五、已知风险与缓解

| 风险 | 等级 | 缓解（责任域） |
|---|---|---|
| 数值/风险博弈失衡（最大设计风险） | 高 | 从垂直切片起边做边测，靠 QA 撤回率/死亡分布信号调参（设计+QA） |
| 弹幕性能（峰值 3000 同屏） | 高 | 对象池+合批+固定步长，垂直切片尽早压测（技术） |
| Demo 内容过早透支 | 中 | 运营设内容红线 + 每阶段 Exit Gate 主理人签字（运营） |
| IP 授权边界 | 中 | D1 已定架空化改编；正式美术产出前建议法务/你再确认（主理人） |
| 钩子/档位文档漂移 | 低 | 开工前 1 次对齐会收敛（主理人） |
| 引擎授权/版本 | 低 | 锁 Unity LTS，规避大版本跳跃（技术） |

---

## 六、下一步入口（进入 P5 制作）

1. **开工对象**：`production/vertical-slice-plan.md`（范围：1 机体 + 1 图 + 基础敌 + Boss 雏形 + 符文池 v1 + 2合1 合成 + 1 撤离点；~9 相对周）。
2. **对齐会**：解决上述 3 项待对齐（钩子/档位/保险槽）。
3. **首冲刺**：按 `production/epics.md` 的 P0 闭环（E1+E2+E3基础+E6+E7）打通，配 `tests/smoke-test-plan.md` 冒烟准出。
4. **决策回流**：本汇编的 D1–D8 已回填各文档"开放问题"；后续重大决策走同一流程。

> 主理人保留对范围蔓延与质量门的一票否决；高影响动作（提交/发布/对外）需你审批。
