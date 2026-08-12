# ADR-003 存档与元进度数据方案（Save & Meta-Progression）

> 状态：**已决策** ｜ 关联：ADR-002（分层）、core-loop.md §2/§3、qa-checklist §8/§9

---

## 结论（Conclusion First）

- **双文件分离**：`meta.save`（持久元进度，Steam 云同步）+ `run.save`（当前局内状态，仅本地，用于崩溃恢复）。
- **序列化**：`meta.save` 用 **MessagePack + 版本信封 + HMAC 签名**；`run.save` 用 **MessagePack（调试期可用 JSON）**。
- **防作弊/回滚**：离线单机无法杜绝作弊 → 策略为**完整性校验（签名）+ 局/库分离 + 多备份软回滚 + 版本迁移链**；异步排行等需可信数据项留待服务端校验（远期）。
- **崩溃恢复**：`run.save` 在"安全检查点"自动写盘（进新区、结算后）；强杀进程后仅回退到最近检查点，绝不损坏 `meta.save`。

---

## 文件与路径

| 文件 | 内容 | 位置 | 同步 | 风险级 |
|------|------|------|------|--------|
| `meta.save` | 货币、解锁树、库存、图鉴、统计、设置 | `LocalLow/<Studio>/<Game>/saves/` | **Steam Cloud**（启用时） | Blocker（G3/G5） |
| `run.save` | 当前局状态、种子、战利品栏、LoadoutItem.state | 同上（本地） | 否 | Major（C2） |
| `meta.save.bak` ×N | 最近 N 份历史 | 同上 | 否 | 防回滚 |
| `settings.input.v1` | 键位重映射、画质、音量 | 同上 | Steam Cloud | Minor |

---

## 序列化结构（meta.save 信封）

```
SaveEnvelope {
  magic:      "SHNH";
  schemaVersion: uint16;      // 迁移链 key
  payload:    bytes;           // MessagePack(MetaState)
  signature:  bytes;           // HMAC-SHA256(payload, buildKey)
  timestamp:  int64;
}
```

- `MetaState` 纯数据（对应 ADR-002 Meta 层），不含任何 Unity 类型。
- 签名密钥编译期注入（非源码明文）；**仅用于完整性校验，不宣称防作弊**。

---

## 防作弊 / 回滚策略

| 威胁 | 策略 | 对应 QA |
|------|------|--------|
| 存档损坏（断电/强杀） | 写盘前写 `.tmp`→原子 rename；加载失败回退 `.bak` | X4, G3 |
| 重复结算（同一局写两次元进度） | 结算幂等：`run.save` 标记 `settled=true` 后删除，二次写被拒 | G5, E7 |
| 局内状态污染元仓库 | 局/库严格分离；仅 `Resolve` 成功才合并 `run.save`→`meta.save` | C5, M6, R6 |
| 篡改数值刷资源 | 签名不符→标记 `tampered`，禁用云排行/成就（不封号，单机公平优先） | G1 |
| 跨版本不兼容 | `schemaVersion` + 迁移链；无链则安全重置并备份旧档 | G4 |
| 极端数值溢出 | 加载时值域校验（满级封顶、非负、枚举合法） | G6, R5, X2 |

> 离线产品无法真防作弊，本方案目标是**数据安全与可恢复**，可信排行留待服务端（远期 ADR）。

---

## 迁移与回滚流程
```
加载 → 解析信封 → 校验 magic/schemaVersion
  ├─ 签名失败 → 标记 tampered，载入 last-good .bak
  ├─ schemaVersion < 当前 → 依次跑 Migration[current-1 → current]
  ├─ 仍失败 → 回退 .bak；.bak 也失败 → 安全新档（保留旧档为 .corrupt）
```

---

## 后果
- 元进度可云同步、可迁移、可恢复；崩溃安全（X4 Blocker 可解）。
- 负面：需维护迁移链与备份；缓解：早期 schema 稳定，自动化测试覆盖迁移（见 framework-scaffold.md）。
- 未决：Steam 云存档是否启用（Q5）→ 默认启用，待主理人确认带宽/冲突策略。
