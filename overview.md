# 移动端 / 微信 H5 布局重构（单一动态布局引擎）

## 做了什么
针对「布局在不同手机、不同浏览器出现堆叠/重叠」的根因，把原本散落在各处的硬编码像素坐标，统一收口到一个 **运行时布局引擎 `computeLayout()` + `applyDOMLayout()`**：
- 所有触控键（开火/绝技/冲刺/背包/相位/拾取/丹药/暂停）位置由 `computeLayout` 依据 `屏幕尺寸 + 安全区(JS bridge/Safe Area) + 微信顶栏 inset` 实时推算；
- Canvas HUD（血条/相位面板/悬赏/拾取/丹药槽/小地图）全部改读 `LAYOUT`，移动端与桌面端分区不同、互不打架；
- 移动端右侧战术键改为「开火轮盘左侧竖向栈」，结构上不可能压到轮盘或左侧信息列；拾取面板移到左列信息流、底部按 `consSlots/consBtn/pause` 上沿截断，杜绝越界重叠；
- 微信 H5 顶栏（`MicroMessenger`）额外内缩 40px，避免被微信 ✕/··· 遮挡；
- 小地图 `drawMinimap` 对齐 `LAYOUT.minimap`，消除跨设备顶部漂移。

## 关键决策
- 触控键用「固定人体工学尺寸」（不随屏缩放），避免小屏缩成蚂蚁、大屏撑爆；位置按「屏幕分区」分配，从结构上杜绝跨设备堆叠。
- 「single source of truth」：`LAYOUT` 是唯一布局真相，DOM 与 Canvas 都读它。

## 校验
- `node --check` 通过；桌面桩 `stub_check.js` 0 错误；移动桩 `stub_mobile.js` 0 错误。

## 产物
- `prototype/game.js`、`prototype/index.html` —— 布局引擎落地。
- 线上预览（已部署）：https://6ae4e56d81cb4c3baa7052adbdc5e8b7.app.workbuddy.link
- 辅助脚本：`_fix_mobile_ui.py`、`_layout_unify.py`、`_real_smoke.js`（几何体断言，待装 puppeteer-core 后可用）。

## 后续
- 真机/真浏览器多视口几何断言（`_real_smoke.js`）需在隔离 Node 工作区装 `puppeteer-core` 后跑，当前未执行（上次安装被中断）。
- 若仍有个别机型边缘问题，优先在 `computeLayout()` 调参，不要在各自函数再加硬编码。
