# 基地UI精灵表接入完成

## 本次完成

### 1. 通用功能图标精灵表
- 来源：用户提供的 4×4 功能图标精灵表（灵玉/仓库/进度/锁定/装载/卸下/熔解/2合1/3合1/信息/攻击/机动/防御/射速/帮助/目标）。
- 处理：JPG 带浅灰棋盘底 → Pillow 亮度+饱和度阈值去底 → 透明 PNG。
- 文件：`prototype/assets/v4/ui/icons/base_icons_sheet.png`
- 接入：新增 `.icon-sprite` CSS 类 + 16 个定位类；资源条、帮助按钮、装备槽标题等使用对应图标。

### 2. 装备槽精灵表
- 来源：用户提供的 4×3 装备槽精灵表（武器/护甲/核心/弹药 × 常态/悬停/已装备）。
- 处理：同上，去底转透明 PNG。
- 文件：`prototype/assets/v4/ui/slots/equip_slots_sheet.png`
- 接入：`.eq-slot` 使用 sprite 背景；按 `data-slot` 属性定位列；`.on` 对应第三行高亮；移动端压缩到 84px 高。

### 3. 稀有度装饰精灵表
- 来源：用户提供的 5×3 稀有度装饰精灵表（白/绿/蓝/紫/橙 × 图标外圈/卡片右上角/名称徽章）。
- 处理：同上，去底转透明 PNG。
- 文件：`prototype/assets/v4/ui/rarity/rarity_trim_sheet.png`
- 接入：`.rarity-sprite` + `.rarity-{white|green|blue|purple|orange}` + `.rarity-{ring|corner|badge}`；装备列表行左侧显示稀有度徽章。

### 4. 代码改动
- `index.html`：新增约 70 行 sprite CSS；资源条加图标；帮助按钮加图标；移动端适配。
- `game.js`：`renderArsenal()` 中装备槽加 `data-slot`、标题用精灵图标、列表行加稀有度徽章、队列头部加图标。
- 缓存版本：`v=1014b → v=1014c`。

## 验证
- `node --check game.js` 通过。
- 本地服务器 `localhost:8134` 运行，三张精灵表 HTTP 200。
- 浏览器预览已打开（基地界面可验证）。

## Git
- 已提交：`3df289e` feat: 接入基地图标/装备槽/稀有度装饰精灵表（5 files changed, 72 insertions, 16 deletions）
- Push 状态：失败，Git 凭证未缓存（HTTPS 需要重新认证），需用户手动执行 `git push origin main`。

## 后续建议
- 继续等待用户提供剩余基地 UI 背景/框架/按钮资产。
- Push 后如需线上预览，可重新部署到 CloudStudio/EdgeOne Pages。

---

# 基地特殊图用法修正

## 问题
Boss 反馈前一次接入的 3 张特殊图"没一个用对的"：
- 基地主边框只套在研究院/图鉴上，其他 tab 没用。
- 研究院卷轴被当成普通背景图，上面随便盖了一层浮层，6 个圆形槽位没派上用场。
- 图鉴书页同样被浮层覆盖，分类和详情没有对齐书页上的框。

## 本次修正
- `prototype/index.html`：
  - **基地主边框** `ui_base_frame.png` 移到 `.base-body` 背景，5 个基地 tab 共用外框。
  - **研究院卷轴** `ui_lab_scroll.png` 作为 `#tab-lab` 的 `.lab-scene` 背景；`#researchList` 里的 6 个 `.shop` 用 `nth-child` 绝对定位，分别对齐卷轴的 6 个圆形槽+标签位置；隐藏旧的 `#shopList`。
  - **图鉴书页** `ui_codex_book.png` 作为 `#tab-codex` 的 `.codex-scene` 背景；`#codexCats` 用 2×3 grid 对齐左页 6 格；`#codexBox` 对齐右页大详情框。
  - 帮助/出击按钮移到场景容器外部右下角，避免遮挡主体。
- 保留全部 JS 容器 id，`game.js` 无需改动。
- 缓存戳：`?v=1019b`。

## 验证
- HTML 解析通过；本地服务器 8931 运行中，index.html 与三张特殊图均返回 200。
- 刷新 `http://127.0.0.1:8931/index.html` 查看研究院/图鉴效果。
