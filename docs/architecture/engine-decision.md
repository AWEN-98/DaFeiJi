# ADR-001 引擎决策（Engine Decision）

> 角色：engineering-lead ｜ 状态：**已决策（Decision Made）** ｜ 关联：concept-doc.md、core-loop.md
> 平台：PC / Steam 首发 ｜ 美术：卡通渲染 2D ｜ 品类：弹幕 shmup + 肉鸽 + 合成 + 搜打撤

---

## 结论（Conclusion First）

**选用 Unity 6000.x LTS（Unity 6）+ URP 2D 渲染管线。**

Godot 4 为被否决的备选方案。本决策在"PC/Steam 卡通 2D 弹幕 + 肉鸽 + 搜打撤 + 内容量极大 + 小团队 lean"约束下做出，核心理由是：**Steamworks 生态成熟度 + 资产商店杠杆 + 2D 卡通管线 + C# 生产力**，能够以最小人力交付可商业化、可联机的 Steam 产品；弹幕性能风险通过"对象池 + 合批渲染（可选 Job/Burst 后端）"的确定路径解决，不依赖完整 DOTS。

---

## 备选评估（Alternatives Considered）

| 维度 | **Unity 6000.x LTS** ✅ | Godot 4（否决） |
|------|------------------------|----------------|
| PC/Steam 卡通 2D 适配 | URP 2D Renderer + SpriteAtlas + 2D Lights/Shadow，原生卡通渲染完善 | CanvasItem + 自写 shader，2D 卡通可行但 2D 光照/法线生态较弱 |
| 小团队 / lean 交付 | 资产商店（2D 工具、存档、UI、Shader Graph）+ 大量现成方案，省人力 | 开源免费、体积小，但现成商业化方案少，需自研更多 |
| 资产管线 | 统一 Importer、SpriteAtlas、Addressables 分包、Timeline/Animator 成熟 | Import 流程可用，但分包/热更/资源管理需更多自搭 |
| 性能（弹幕同屏实体量） | 对象池 + SpriteAtlas 合批可达数千弹幕；Job/Burst/SoA 后端可上万；路径明确 | RenderingServer 直接绘制 MultiMesh 也可达数千，但需绕过场景树手写 |
| 社区 / 分发 | 最大社区、教程、问答、招聘池最广 | 社区增长快但商业 2D 弹幕案例与人才较少 |
| 成本 / 授权 | Personal 免费（年营收 < $200k）；Runtime Fee 已对大多数小团队撤回；**锁版本可规避政策风险** | MIT 完全免费，授权零风险（最大优势） |
| 学习曲线 | C# 主流、团队易补人；工具链一致 | GDScript 易上手，C# 支持可用但生态小 |
| 生态（Steamworks 集成） | **Steamworks.NET / Facepunch.Steamworks 生产级**，云存档/成就/统计/排行开箱即用 | 需 godot-steam 第三方绑定，成熟度与文档弱于 Unity 方案 |

---

## 决策理由（Rationale，按权重排序）

1. **Steamworks 集成成熟度（决定性）**：本作是 Steam 首发，强依赖云存档、成就、统计、异步排行（concept-doc Bartle=Killer 用异步竞争）。Unity 侧 `Steamworks.NET`/`Facepunch.Steamworks` 经大量商业产品验证，可显著缩短联机/平台功能工期——对小团队是"能不能按期上架"的问题。
2. **内容量极大 → 资产商店杠杆**：肉鸽符文池、合成、程序化地图、搜打撤、元进度，全部要自研；资产商店的 2D 工具链/存档框架/UI 套件能省下大量重复造轮子的人力，符合 lean 原则。
3. **2D 卡通渲染管线**：URP 2D 的 SpriteAtlas、2D Lights、Shadow、Pixel-Perfect Camera 直接支撑"卡通渲染"美术目标。
4. **人才与可补位**：C# + Unity 招聘/外包池最广，降低单人瓶颈风险。
5. **弹幕性能有确定解法**：不依赖完整 DOTS。先用"对象池 + 共享材质合批 + 固定步长确定性更新"满足垂直切片（目标数千弹幕）；若 profiling 显示瓶颈，再在同一接口后接入 Job System + Burst 的 SoA 后端（见 ADR-002）。Godot 在性能上并不更优，且以"免费"换来了 Steamworks 与生态短板，对商业化产品不划算。
6. **授权风险可控**：锁定一个 LTS 版本（如 Unity 6000.0.x），不升级即可规避后续可能的授权政策变动；Personal 档满足早期营收阈值。

---

## 后果与权衡（Consequences）

**正面**
- 平台功能（云存档/成就/排行）快速落地；内容开发生态完善；团队易扩编。
- 性能路径明确，垂直切片即可达 60fps 基线。

**负面 / 风险（含缓解）**
- 授权政策不确定性 → 锁定 LTS 版本、监控政策、保留 Godot 迁移评估（不投入迁移成本，仅保持架构可移植，见 ADR-002 边界）。
- 引擎体积/构建包体较大 → 用 Addressables 分包、IL2CPP + 裁剪。
- 完整 DOTS 学习成本高 → 本架构**不采用完整 DOTS**，仅按需在仿真层用 Job/Burst（ADR-002）。

---

## 未决项（Open）
- **Q4（QA）**：PC 目标帧率与最低配置基线 → 本架构建议 60fps 基线 / 30fps 最低配置（详见 vertical-slice-plan.md 风险表），待主理人/经济系统确认。
- 是否启用 Steam 云存档（影响 ADR-003 方案）→ 默认启用，待 Q5 确认。
