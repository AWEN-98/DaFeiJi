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
