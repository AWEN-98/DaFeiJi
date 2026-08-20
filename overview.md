# 布局修复 · 回退重改（保留原始格局）

## 完成情况
按用户要求「退回去重改」，本次已：
1. **回退大改**：`git checkout 80c86bb` 撤销了 `74d2142` 的「动态布局引擎」重构（原布局是：左上·机体状态 / 右上·情报雷达 / 左下·机动走位 / 右下·战斗操作 / 底部居中·战术道具），恢复原始五区格局，元素位置完全不动。
2. **按原格局做最小化修复**（净增 ~9 行，非重构）：
   - 微信顶栏（✕/···）额外 inset 46px 并入 `SA.t` + `wechat-h5` 类，顶部触控键不再被遮挡（`updateSafeArea`）。
   - 拾取面板 `drawPickup,List` 宽度钳制为「视口 − 左右安全区」，窄屏不再溢出/压到左侧轮盘。
   - 机库装备名 `.hangar-slot-name` 加 `text-overflow: ellipsis`，防边框溢出。
   - 底部 `#base` 加 `safe-area-inset-bottom` padding，出击按钮不再被系统底栏截断。

## 验证
- `node --check prototype/game.js` → OK
- `stub_check.js`（桌面 1280×720）→ 0 error
- `stub_mobile.js`（390×844）→ 0 error
- 与回退基 `80c86bb` 的 diff 仅 9 行增 / 2 行删，确认是「保留原布局」而非「全改」。

## 交付 / 部署
- 提交：`48bf336` → 已 push 到 `git@github.com:AWEN-98/DaFeiJi.git` 的 `main`。
- 实时预览：`https://6ae4e56d81cb4c3baa7052adbdc5e8b7.app.workbuddy.link`
- 已清理我之前生成的冗余备份 `prototype/game.js.bak_layout`，并重新同步 `playtest/` 后重新部署。

## 需注意
- `prototype/` 下仍残留若干历史 `.bak` / `_verify_*` / `mockup_*` 文件（非本次生成，未改动），不影响预览；如需彻底清理请单独确认。
- 若后续仍有某机型/浏览器出现局部重叠，请直接截图给我，仍以「原格局 + 局部修」的方式处理，不再整体重构。

---

# 删新手教学（弹窗）· 2026-08-21

## 完成情况
按用户「删掉新手教学」+ 澄清范围「只删弹窗教学」，本次已移除：
1. **tutorial 弹层本体**：`index.html` 的 `<div id="tutorial">` 整块 + `.tut-step` CSS。
2. **自动弹出逻辑**：`maybeAutoTutorial()`（`game.js` 7836–7844）及 `showScene` 里的调用。
3. **入口按钮**：基地 `hall-bottom` 的「怎么玩」(`launch-help`)、暂停页「怎么玩」(`pauseHelp`)、`tutorialClose` 处理器，`helpBtns` 绑定块。
4. **桩引用**：`hideAllOverlays` / `cleanState` 桩数组移除 `tutorial`。

**保留**（未触碰）：游戏内情境提示 `showTip` / `updateInteractHints` / `hintTimer` / 结算页引导文案 / 竖屏旋转提示 — 这些是「辅助提示」而非「教学弹窗」。

## 验证
- `node --check` OK / `stub_check` 0 / `stub_mobile` 0 / grep 无残留引用。
- 修复了 `stub_mobile.js` #396 断言对 `pauseHelp` 的硬编码预期（否则 1 error）—— 删除 UI 元素必须同步测试断言。

## 交付 / 部署
- 提交 `e0354b1` → 已 push `main`；已重新 CloudStudio 部署（链接同上）。
- 若后续要连带删「新手期常驻操作提示 / 全部引导」，再走一轮「原格局 + 局部修」。

---

# 机库右栏最低宽度锁 350px · 2026-08-21

## 完成情况
按用户截图反馈「屏幕宽度过低时右侧面板被压缩」，仅改 3 处 CSS（`prototype/index.html`），不动原布局：
1. `#tab-hangar .right-col`：`min-width` 从 `0` 改为 `350px`。
2. `#tab-hangar .main` 默认 grid：`grid-template-columns` 改为 `1.27fr minmax(350px,1fr)`。
3. `@media (max-width: 1180px)` 内 `.main`：同步改为 `1.25fr minmax(350px,1fr)`。
4. `@media (max-width: 980px)` 以下仍维持单列响应格局，不做改动。

## 验证
- `node --check prototype/game.js` → OK
- `stub_check.js`（桌面 1280×720）→ 0 error
- `stub_mobile.js`（390×844）→ 0 error

## 交付 / 部署
- 提交 `f41dead` → 已 push `main`；已重新 CloudStudio 部署（链接同上）。

---

# 机库右栏横屏防压缩 + 资产缩小 · 2026-08-21

## 完成情况
用户反馈「强化的字完全被资产遮挡」，定位到横屏 breakpoint 把右栏 grid 列又改回了 `1fr`，`min-width:350px` 没真正守住。本次仅改 `prototype/index.html` CSS：
1. **补上 350px 下限**：
   - 通用横屏 `@media(orientation: landscape)` `.main`：`1.3fr 1fr` → `1.3fr minmax(350px, 1fr)`。
   - 窄横屏 `@media(max-width:980px + landscape)` `.main`：`1.4fr 1fr` → `1.4fr minmax(350px, 1fr)`。
2. **缩小右栏资产**：
   - strict-symmetry 区 `shop-card` 50px → 46px，`eq-slot` 56px → 50px。
   - `@media(max-width:520px)` `shop-card` 44px → 40px，`eq-slot` 48px → 44px。
3. **标签防遮挡**：横屏 + 竖屏 `.slot-label` / `.hangar-slot-name` 加 `margin-top:3px`，字号略降（11→10 / 10→9），让文字与资产框之间留间隙。

## 验证
- `node --check prototype/game.js` → OK
- `stub_check.js`（桌面 1280×720）→ 0 error
- `stub_mobile.js`（390×844）→ 0 error

## 交付 / 部署
- 提交 `d32b1a0` → 已 push `main`；已重新 CloudStudio 部署（链接同上）。

---

# 机库右栏防堆叠（纵向可滚 + 横滑）· 2026-08-21

## 完成情况
用户二度反馈"还是会堆叠"，定位真因：**不是宽度（350px 下限已生效），而是矮横屏下右栏 4 个区块在有限高度内纵向互相挤压，叠加 `.r-area{overflow:hidden}` 裁切，导致强化卡片文字与资产重叠**。

仅改 `prototype/index.html` CSS（保持右栏在右侧格局）：
1. **纵向防堆叠**：横屏断点给 `.right-col` 加 `overflow-y:auto`（内容多可纵向滚动，不裁切）；`.r-area` 的 `overflow:hidden` 改为 `visible`（纵向不裁，由 right-col 滚动管理）。
2. **内部横滑**：窄横屏 `.shop-grid`/`.loadout-row` 加 `overflow-x:auto`（极窄不再压扁标签，改为横向滑动）。
3. **资产再缩一档**：strict-symmetry 区 `shop-card` 46→42px、`eq-slot` 50→46px；窄横屏 `eq-slot` 48→44px（与强化卡 40px 协调）。
4. 保留 350px 宽度下限与 `.main` 的 `minmax(350px,1fr)` 不变。

## 验证
- `node --check prototype/game.js` → OK
- `stub_check.js`（桌面 1280×720）→ 0 error
- `stub_mobile.js`（390×844）→ 0 error
- 浏览器视觉验收（812×375 / 667×375 / 896×414 横屏）需用户在真机/浏览器确认：右栏 ≥350px、4 区块可读不重叠（可纵滚）、强化/法器标签在资产下方可见。

## 交付 / 部署
- 提交 `a11ef11` → 已 push `main`；已重新 CloudStudio 部署（链接同上）。
- 教训：机库"堆叠"主因是矮视口纵向挤压 + overflow 裁切，不能只锁宽度；需让右栏可纵滚 + 内部网格可横滑。

---

# 机库右栏堆叠 · 根除（root-cause 级）· 2026-08-21

## 真因（前三轮都没打到）
用户三度反馈"还是会堆叠/被资产遮挡"。最终定位到 **`prototype/index.html` 1959 行那块全局"严格对称"CSS** 才是元凶：它对 `.shop-grid` / `.loadout-row` 强行写了
`display:flex !important; flex-wrap:nowrap !important; justify-content:space-between !important; overflow:visible !important;`
（带 `!important`，出现在所有断点规则**之后**）。它盖过了各断点里 `overflow-x:auto` 的设定，导致窄右栏（350px）内 6 张强化卡排不下时，`overflow:visible` 让它们直接画到相邻的"法器/难度/出击"区块上 —— 即"强化的字被资产遮挡 / 堆叠"。前面几轮的 `overflow-y:auto`、`minmax(350px)` 都只治标，这块 `overflow:visible` 始终是漏网之鱼。

## 本次改法（用户授权"可以大胆调整"，一次性根除）
仅改 `prototype/index.html`，不动 DOM 结构、不动桌面双栏格局：
1. **全局对称块**：`.shop-grid`/`.loadout-row` 的 `justify-content:space-between!important` → `flex-start!important`；`overflow:visible!important` → `overflow-x:auto!important; overflow-y:hidden!important`（单行横滑，绝不横向溢出压邻区）。
2. **基础 `.right-col`**：`justify-content:space-between` → `flex-start`，并加 `overflow-y:auto; overflow-x:hidden`（内容多纵向滚动，不再裁切）。
3. **基础 `.r-area`**：`flex:1 1 0` → `flex:0 0 auto`（自然高度不压扁）、`overflow:hidden` → `visible`（裁切交给右栏滚动）。
4. **三个区块 flex**：`.shop-area/.loadout-area/.tier-area` 各自的 `flex:0.9/1.5/1` → `0 0 auto`（防止桌面双栏高度受限时把区块压扁后内容溢出画到下一块）。
5. **竖屏 `.right-col`**：加 `min-width:0`（避免 320px 等极窄机横向溢出整页）。
6. 保留 350px 设计下限与桌面双栏格局。

## 验证
- `node --check prototype/game.js` → OK
- `stub_check.js`（桌面 1280×720）→ 0 error
- `stub_mobile.js`（390×844）→ 0 error

## 交付 / 部署
- 提交 `a623e72` → 已 push `main`；已重新 CloudStudio 部署（链接同上）。
- 这次是结构性根除，不是补丁叠加；若真机/浏览器横屏仍见局部重叠，请发截图 + 大致屏幕宽高，我针对性收紧对应断点。

---

# 机库右栏 · 终版自适应网格（左右对齐/不裁剪/等比）· 2026-08-21

## 用户四度反馈 + 新约束
- "还是会堆叠，说明还不够" → 前几轮只打补丁，根因未除。
- 新明确约束：
  1. **不需要严格对称，但需要左右对齐**（旧 flex-start 把 6 卡/4 槽全挤左边单行 = "贴左"）。
  2. **不能让文字被美术资产挡住**（标签必须在资产下方、不被遮）。
  3. **不能裁剪掉美术资产，全部必须展示**；可调整大小，但**资产等比缩放、不能拉伸**。
  4. **基地图标不要 emoji，可用线性图标**。

## 本次改法（彻底换思路：单行 nowrap 横滑 → 自适应网格换行）
仅改 `prototype/index.html`（CSS）+ `prototype/game.js`（翻页箭头），不动 DOM、不动桌面双栏格局：
1. **根除旧全局"严格对称"块**（原 1959 行）：删掉 `flex nowrap + flex-start + overflow-x:auto` 这一整套"贴左+横滑裁剪"机制。
2. **强化/法器网格改 `repeat(auto-fit, minmax(46px,1fr))`**：
   - `auto-fit` 折叠空轨道 → 资产自动铺满整宽（**左右对齐**，非 rigid 对称）；
   - 空间不足自动**换行**，绝不横向溢出/裁切；
   - 各断点里残留的 `display:flex!important` / `overflow-x:auto` 被本块（更靠后 + `!important`）统一压制。
3. **资产盒等比不裁剪**：`.box` 锁 `aspect-ratio:1/1` + img `object-fit:contain`（等比、不拉伸）；`.box` 与卡片 `overflow:visible`（完整展示，不裁切）。
4. **撤掉裁切约束**：`.shop-area/.loadout-area/.tier-area` 的 `max-height` / `overflow:hidden` 全部撤销（`max-height:none!important; overflow:visible!important`）；难度区不再被裁。
5. **文字永不被遮**：`.name/.lv/.en/.hangar-slot-name` 统一 `margin-top:4px`，居资产下方。
6. **基地图标去 emoji**：难度翻页 `◀▶`、机体翻页 `‹›` 三角字形 → **SVG 线性箭头**（`currentColor` 鎏金，禁用态随 `opacity` 淡出）；资源/装备/标签图标本就为 PNG 线性切图，未改动。

## 验证
- `node --check prototype/game.js` → OK
- `stub_check.js`（桌面）→ 0 error
- `stub_mobile.js`（390×844）→ 0 error
- grep 确认 `◀▶‹›` 实际字形已从按钮/标记移除（仅注释残留描述词）。

## 交付 / 部署
- 提交 `2c0afd5` → 已 push `main`；已重新 CloudStudio 部署（链接同上）。
- 用户可在真机/浏览器横屏（812×375 / 896×414）与窄竖屏验收：强化/法器铺满整宽、资产完整等比、标签在下方、难度区不裁。若仍有局部机型重叠，发截图 + 屏幕宽高即可定点修。

---

# UI 最高优先级铁律：功能按钮完整展示、不拉伸 · 2026-08-21

## 用户铁律
「UI最大优先级就是让功能按钮完全展示，不拉伸。」—— 此指令覆盖上一轮 `auto-fit` 方案（其中 `1fr` 仍会拉伸卡片），确立为全局最高优先级。

## 本次改法（仅 `prototype/index.html`，CSS）
1. **机库网格去拉伸源**：`repeat(auto-fit, minmax(46px, 1fr))` 的 `1fr` → `display:flex + flex-wrap:wrap + justify-content:space-between + 卡片 flex:0 0 auto 定宽 46px`。
   - 卡片/资产盒锁死 46px、`.box` 用 `aspect-ratio:1/1`（等比、不拉伸）；
   - 空间不足**自动换行**（不裁切），不退回 nowrap 横滑；首末项贴边 = **左右对齐**。
2. **竖屏断点复拉伸点修复**：原 `.loadout-row .eq-slot { flex:1 1 0; box width/height:100% }`（特异性更高会盖过全局）→ 改为定宽 46px，杜绝复拉伸。
3. **顶部导航 tab 不压缩裁切**：`.tab { flex-shrink:1→0 }`；`.hall-nav` 加 `overflow-x:auto + justify-content:safe center`（溢出横向滚动，而非裁切文字）；移动端 tab `flex:1 1 0→0 0 auto` + 横滑。
4. **窄屏**：卡片 46→40px（仍定宽不拉伸）。
5. 保留 350px 右栏下限与桌面双栏格局。

## 铁律沉淀（后续一律遵守）
凡功能按钮/资产卡：**`flex:0 0 auto` + 定宽 + `object-fit:contain`**；禁止 `1fr` / `flex:1 1 0` / `width:100%` 拉伸；空间不足用**换行或横向滚动**，绝不允许裁切。

## 验证
- `node --check prototype/game.js` → OK
- `stub_check.js`（桌面）→ 0 error
- `stub_mobile.js`（390×844）→ 0 error（暂停按钮等宽断言也通过）

## 交付 / 部署
- 提交 `2ab31d4` → 已 push `main`；已重新 CloudStudio 部署（链接同上）。
- 用户可刷新在横屏 / 窄竖屏验收：强化/法器卡片定宽不拉伸、完整展示、左右贴边对齐、标签居下；顶部导航 tab 在窄屏横向滚动而非压扁裁切。
